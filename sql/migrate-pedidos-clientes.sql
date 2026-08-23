-- "Faltantes": lo que un cliente pidió y no teníamos.
--
-- # Qué hueco tapa
--
-- El local escucha todo el día qué producto le piden y no tiene. Eso hoy no queda en ningún lado:
-- se lo dice a quien esté al lado, y a la semana nadie se acuerda. Cuando llega el momento de
-- decidir qué comprar, la única evidencia disponible es lo que YA se vende — o sea, la demanda de
-- lo que no tenemos es exactamente el dato que ninguna pantalla del monitor puede mostrar, porque
-- no existe una venta que lo registre.
--
-- Lo que hace útil a esta tabla no es la lista: es **el agregado**. Una fila suelta no decide nada;
-- «te lo pidieron 7 veces en 30 días» sí. Por eso lo que importa acá es `texto` (que se normaliza
-- para agrupar repetidos, ver lib/pedidos-clientes/core.ts) y `creado_en` (que define la ventana).
--
-- # `tipo` no estaba en el pedido original y es lo que hace que la lista no se pudra
--
-- El pedido fue «qué producto pide el cliente y no tenemos, para mejorar la variedad». Pero el
-- rótulo de la sección es **«Faltantes»**, y con ese rótulo entra sí o sí lo que se acabó: la
-- clienta pide un talle 2 de algo que SÍ vendemos y está sin stock. Las dos cosas son ciertas y
-- **son decisiones distintas** — una es comprar variedad nueva, la otra es reponer— así que si
-- caen en el mismo montón el ranking mezcla dos preguntas y no contesta ninguna.
--
-- # Vive en la base de CADA marca, al revés que `buzon_mensajes`
--
-- El buzón es uno solo porque quien arma los paquetes arma los de las dos marcas. Acá no: lo que se
-- decide con esto es **qué compra cada marca**, que son dos plata distintas y dos compradores
-- distintos. Mismo criterio que `atencion`. `scripts/apply-pedidos-clientes.mjs` corre en las dos.
--
-- # Por qué no hay `stunned`
--
-- Stunned es una LÍNEA de Zattia y lo único que la separa es el prefijo de SKU (`docs/lineas.md`).
-- Un producto que **no tenemos** no tiene SKU, así que no hay nada que lo pueda clasificar: pedir
-- la línea acá sería pedir un dato que no existe y que alguien va a completar a ojo. La marca sí se
-- sabe siempre, porque se sabe en qué local se lo pidieron.
--
-- Correr con `node scripts/apply-pedidos-clientes.mjs`. Idempotente.

create table if not exists pedidos_clientes (
  id          text primary key,
  store       text not null,                       -- 'bdi' | 'zattia'
  -- Lo que pidió, **como lo dijo**. ⛔ No se normaliza al guardar: la normalización es para agrupar
  -- y vive en el núcleo (`claveDeTexto`). Guardar el texto ya masticado tira la única evidencia de
  -- cómo lo nombra la gente — que es justamente lo que hay que leer para saber qué comprar.
  texto       text not null,
  -- 'no_trabajamos' (variedad que no tenemos) | 'sin_stock' (lo vendemos y se acabó ⇒ es Reposición).
  tipo        text not null default 'no_trabajamos',
  canal       text not null default 'local',       -- local | whatsapp | instagram | mail | tienda
  cliente     text,                                -- opcional: quién lo pidió, si quedó el nombre
  estado      text not null default 'pedido',      -- pedido | conseguido | descartado
  nota        text,
  -- Cuándo se pidió. Es la mitad del dato: sin fecha no hay ventana, y sin ventana «lo más pedido»
  -- no significa nada. `default now()` y no nullable a propósito — una fila sin fecha quedaría
  -- afuera de todo ranking sin que nadie lo note.
  creado_en   timestamptz not null default now(),
  creado_por  text,
  actualizado_en timestamptz not null default now(),
  actualizado_por text
);

-- Los dos accesos reales: la ventana (todo ranking corta por fecha) y el corte por marca.
create index if not exists idx_pedidos_clientes_ventana on pedidos_clientes (store, creado_en desc);
-- Lo que sigue pendiente, que es lo que se mira primero.
create index if not exists idx_pedidos_clientes_pendientes on pedidos_clientes (store, estado) where estado = 'pedido';

-- 🔴 Los tres dominios cerrados, en la base y no sólo en el validador.
--
-- No es redundancia con `lib/pedidos-clientes/reglas.core.js`: el validador cuida lo que entra por
-- el handler, y esto cuida lo que entra por **cualquier otro lado** — un `psql` a mano, un script
-- de backfill, la Fase que traiga pedidos de otra fuente. Un `tipo` inventado no rompe nada: se
-- guarda, no cae en ninguno de los dos cortes del ranking, y esa fila **desaparece de la cuenta sin
-- avisar**. Un dominio que sólo vive en el validador es un dominio que se abre solo.
do $$ begin
  alter table pedidos_clientes add constraint pedidos_clientes_tipo
    check (tipo in ('no_trabajamos', 'sin_stock'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table pedidos_clientes add constraint pedidos_clientes_estado
    check (estado in ('pedido', 'conseguido', 'descartado'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table pedidos_clientes add constraint pedidos_clientes_canal
    check (canal in ('local', 'whatsapp', 'instagram', 'mail', 'tienda'));
exception when duplicate_object then null; end $$;

-- Un texto vacío es una fila que ocupa lugar en el ranking y no le dice a nadie qué comprar.
do $$ begin
  alter table pedidos_clientes add constraint pedidos_clientes_texto
    check (length(btrim(texto)) > 0);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS.
--
-- `sql/migrate-rls.sql` prendió RLS recorriendo las tablas que existían ese día; una tabla creada
-- después nace SIN RLS y quedaría abierta a la clave pública. Acá además hay `cliente`, que es el
-- nombre de una persona — mismo criterio que `buzon_mensajes`.
--
-- Sin políticas a propósito: el navegador nunca lee esta tabla derecho. Todo pasa por
-- `api/_pedidos-clientes.js`, que usa la service key y no mira RLS.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table pedidos_clientes enable row level security;
