-- "Lo que entró" — lo que el sistema de Ingresos confirma que llegó de cada orden de compra.
--
-- # Qué hueco tapa
--
-- El monitor sabe **lo que se pidió** (la sección `ingresos`: las importaciones proyectadas, en el
-- KV de bdi-catalogo) y sabe **lo que se vendió** (el espejo de GN). Entre las dos no hay nada: qué
-- llegó de verdad, cuánto se contó contra lo pedido y de qué proveedor. Eso vive hoy en el sistema
-- de Ingresos, que es otra app, en otro servidor, y cada vez que alguien quiere saberlo tiene que
-- ir a preguntarle a esa app.
--
-- Estas tres tablas son la copia del monitor. Lo importante no es guardar el evento: es que **el
-- cruce y los agregados se calculen acá**, con el espejo de GN al lado, sin volver a llamar a
-- nadie.
--
-- # Las tres tablas y por qué son tres
--
--   `recepcion_evento`  el webhook crudo, uno por POST aceptado. Es lo que hace idempotente al
--                       reintento (`webhook_id` es la clave) y **la única copia del cuerpo**: con
--                       ella se puede volver a procesar un evento sin pedirle al otro sistema que
--                       lo reenvíe. Si el procesamiento cambia, se re-corre sobre esto.
--   `recepcion_oc`      la orden ya masticada: totales, diferencias y lo que derivamos nosotros.
--                       Su clave es `(store, oc_id)` y NO el evento: una OC que se vuelve a
--                       confirmar tiene que **pisar** su fila, no sumar una segunda.
--   `recepcion_linea`   un renglón por SKU. Se reemplazan enteros en cada evento de esa OC, por lo
--                       mismo: son la foto del último conteo, no un historial.
--
-- # Vive en UNA sola base (BDI), con columna `store`
--
-- Al revés que `pedidos_clientes` y como el buzón. Dos razones, y la segunda es la que manda:
--
--  1. Lo que se pregunta acá cruza las marcas: «este proveedor, ¿entrega completo?» no es una
--     pregunta de BDI ni de Zattia, es del proveedor.
--  2. 🔴 **Un webhook no puede elegir base.** Si el evento llega para una marca cuya credencial no
--     está cargada, el POST contesta 500, el emisor reintenta 17 horas y después marca fallido:
--     **el evento se pierde y no hay quién lo vuelva a mandar**. Con una sola base, la única
--     credencial que tiene que estar es una.
--
-- El espejo de GN sí se lee de la base de CADA marca, pero eso pasa después de guardar y su falla
-- no se lleva puesto el evento (ver `espejo_consultado`).
--
-- Correr con `node scripts/apply-recepciones.mjs`. Idempotente.

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · El evento crudo
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists recepcion_evento (
  -- El `webhook-id` del emisor. 🔑 Es la clave primaria y ahí está toda la idempotencia: un
  -- reintento trae el MISMO id, así que el insert falla y el handler contesta 200 sin reprocesar.
  -- Que sea `primary key` y no un índice único es a propósito: no hay un id nuestro que valga más.
  webhook_id  text primary key,
  tipo        text not null,                       -- 'oc.confirmada' — hoy el único
  store       text,                                -- 'bdi' | 'zattia' — sale del payload, puede faltar
  oc_id       integer,
  -- El cuerpo tal como llegó, ya parseado. ⛔ No se guarda el texto crudo: la firma ya se validó
  -- contra los bytes y guardarlos otra vez sería la tercera copia de lo mismo.
  payload     jsonb not null,
  -- 'procesado'  el evento se entendió y escribió su OC.
  -- 'ignorado'   tipo desconocido: se acepta con 200 —o el emisor reintenta 17 horas por algo que
  --              no va a cambiar— pero no escribe nada.
  -- 'error'      llegó firmado y bien formado, y el procesamiento explotó. Queda para reprocesar.
  estado      text not null default 'procesado',
  error       text,
  -- El `webhook-timestamp`, o sea cuándo lo mandó el emisor. Es distinto de `recibido_en`, que es
  -- cuándo lo agarramos: la diferencia entre los dos es lo que dice si hubo cola del otro lado.
  enviado_en  timestamptz,
  recibido_en timestamptz not null default now()
);

do $$ begin
  alter table recepcion_evento add constraint recepcion_evento_estado
    check (estado in ('procesado', 'ignorado', 'error'));
exception when duplicate_object then null; end $$;

-- Lo que se mira: los últimos que entraron, y los que quedaron para reprocesar.
create index if not exists idx_recepcion_evento_fecha on recepcion_evento (recibido_en desc);
create index if not exists idx_recepcion_evento_rotos on recepcion_evento (recibido_en desc) where estado = 'error';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · La orden de compra
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists recepcion_oc (
  id          text primary key,                    -- '<store>:<oc_id>' — ver el docblock de arriba
  store       text not null,                       -- 'bdi' | 'zattia'
  oc_id       integer not null,
  oc_label    text,                                -- 'OC-0042', como la nombra el otro sistema
  oc_estado   text,
  fecha_compra  date,
  fecha_ingreso date,
  -- Cuándo se confirmó la OC del otro lado. 🔑 Es la fecha por la que se ORDENA la lista, y no las
  -- dos de arriba: ésas las carga una persona y el emisor las manda vacías en la mayoría (62 de las
  -- 79 del historial). `confirmada_at` vino en las 79. Tampoco sirve `recibido_en`: cuando se
  -- prendió el envío llegaron las 79 en el mismo minuto y ese orden es azar.
  confirmada_at timestamptz,
  proveedor_id     integer,
  proveedor_nombre text,

  -- ── Lo que AFIRMA el evento (bloque `totales`) ──────────────────────────────────────────────
  productos           integer not null default 0,
  lineas              integer not null default 0,
  unidades_pedidas    integer not null default 0,
  unidades_contadas   integer not null default 0,
  diferencia_unidades integer not null default 0,
  lineas_con_diferencia integer not null default 0,

  -- ── Lo que calculamos NOSOTROS con los renglones ────────────────────────────────────────────
  --
  -- 🔴 `diferencia_unidades` es un NETO y un neto esconde el caso caro: 2 de menos en un talle y 2
  -- de más en otro dan cero, y no es cero — es un talle que falta y otro que sobra. Por eso se
  -- guardan las dos puntas por separado, sumadas renglón por renglón.
  unidades_faltantes  integer not null default 0,   -- suma de las diferencias negativas, en positivo
  unidades_sobrantes  integer not null default 0,   -- suma de las positivas
  lineas_nuevas       integer not null default 0,   -- las que el emisor marca `es_nuevo`
  -- contadas / pedidas, 0..n. Null si no se pidió nada (dividir por cero no es 100%).
  cumplimiento        numeric(6,4),

  -- ⚠️ **La discrepancia es un dato, no un error.** El evento manda sus totales y además sus
  -- renglones; si no coinciden, la fila se guarda igual y esto queda en `false`. Rechazar el POST
  -- lo pondría a reintentar 17 horas por algo que no se arregla reintentando, y quedarnos callados
  -- haría que un emisor que manda los renglones recortados se lea como una entrega incompleta.
  totales_coinciden   boolean not null default true,
  lineas_recibidas    integer not null default 0,   -- cuántos renglones vinieron de verdad

  -- ── El cruce contra el espejo de GN, al momento de recibir ──────────────────────────────────
  --
  -- 🔑 Es una FOTO, no la verdad de hoy: un producto nuevo entra sin estar en GN y aparece dos
  -- días después. La pantalla vuelve a cruzar en vivo; esto guarda cómo estaba cuando llegó.
  -- `espejo_consultado = false` significa "no se pudo preguntar", que ⛔ no es lo mismo que
  -- "ninguno estaba": sin esta bandera, un espejo caído se leería como catálogo vacío.
  espejo_consultado   boolean not null default false,
  skus_sin_espejo     integer,

  evento_id   text references recepcion_evento(webhook_id),
  recibido_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

do $$ begin
  alter table recepcion_oc add constraint recepcion_oc_store check (store in ('bdi', 'zattia'));
exception when duplicate_object then null; end $$;

-- La tabla ya existía cuando se sumó `confirmada_at` (27-ago-2026), así que el `create table if
-- not exists` de arriba no la agrega: hace falta el alter. `if not exists` para que el archivo
-- siga siendo idempotente. ⛔ Es un ADD, nunca un cambio de tipo: eso se escribe como DROP COLUMN
-- y se lleva los datos puestos.
alter table recepcion_oc add column if not exists confirmada_at timestamptz;

-- Una OC no puede entrar dos veces con dos ids distintos: la clave de negocio es (marca, id de OC).
create unique index if not exists idx_recepcion_oc_natural on recepcion_oc (store, oc_id);
-- Los dos accesos reales: la lista por fecha, y "las que llegaron con diferencia".
-- `nulls last` a propósito: una OC sin `confirmada_at` (un emisor que deje de mandarlo) va al
-- final y no arriba de todo, que es donde la pondría el orden descendente por defecto.
create index if not exists idx_recepcion_oc_confirmada on recepcion_oc (store, confirmada_at desc nulls last);
create index if not exists idx_recepcion_oc_fecha on recepcion_oc (store, recibido_en desc);
create index if not exists idx_recepcion_oc_proveedor on recepcion_oc (proveedor_id, recibido_en desc);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · Los renglones
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists recepcion_linea (
  id        text primary key,                      -- '<store>:<oc_id>:<orden>'
  oc_ref    text not null references recepcion_oc(id) on delete cascade,
  store     text not null,
  -- El orden en que vino el renglón. Se guarda porque es el único criterio con el que la pantalla
  -- puede mostrar la OC como la ve quien la contó del otro lado.
  orden     integer not null default 0,
  sku       text,
  codigo_barras text,
  nombre    text,
  talle     text,
  color     text,
  cantidad_pedida  integer not null default 0,
  cantidad_contada integer not null default 0,
  diferencia       integer not null default 0,
  observaciones    text,
  es_nuevo  boolean not null default false,
  -- El cruce, misma foto que la cabecera. `null` = no se pudo preguntar (ver `espejo_consultado`).
  en_gn       boolean,
  producto_id text
);

-- ── Las fotos del renglón (agregadas el 1-sep-2026) ──────────────────────────────────────────
-- Van como `alter` y no adentro del `create table` de arriba: la tabla YA existe en producción con
-- 1.516 renglones, y `create table if not exists` no agrega columnas a una tabla que ya está — no
-- falla, no hace nada, y el `insert` del webhook empieza a dar error por una columna que el .sql
-- dice tener. Es el mismo motivo por el que este archivo se corre entero cada vez.
-- 🔴 **La migración va ANTES del deploy**, no después: si el código que las manda sale primero, el
-- insert rebota, el evento queda en `error` y la OC no se guarda.
alter table recepcion_linea add column if not exists imagen_url text;
alter table recepcion_linea add column if not exists imagen_thumb_url text;

create index if not exists idx_recepcion_linea_oc on recepcion_linea (oc_ref);
-- "De este SKU, ¿qué me llegó y cuándo?" — la pregunta que hace Compras.
create index if not exists idx_recepcion_linea_sku on recepcion_linea (store, sku) where sku is not null;
-- Las que hay que mirar: las que no cerraron.
create index if not exists idx_recepcion_linea_dif on recepcion_linea (oc_ref) where diferencia <> 0;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- `sql/migrate-rls.sql` prendió RLS recorriendo las tablas que existían ese día; una tabla creada
-- después nace SIN RLS y quedaría abierta a la clave pública. Sin políticas a propósito: el
-- navegador nunca lee estas tablas derecho — todo pasa por `api/_recepciones.js`, que usa la
-- service key y no mira RLS.
alter table recepcion_evento enable row level security;
alter table recepcion_oc     enable row level security;
alter table recepcion_linea  enable row level security;
