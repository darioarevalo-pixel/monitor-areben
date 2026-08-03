-- Canjes con influencers y creadoras — el módulo entero, seis tablas.
--
-- Un canje es producto (o producto + plata) a cambio de contenido publicitario. Cubre el ciclo
-- completo: llega un Instagram → propuesta → aprobación → acuerdo → se compra y se despacha →
-- se verifica el cumplimiento → se cierra con un balance.
--
-- ⚠️⚠️ ESTO VA EN UNA SOLA BASE: LA DE **BDI**. NO CORRER EN ZATTIA. ⚠️⚠️
--
-- Suena mal porque el resto del monitor tiene una base por marca, así que el próximo que entre
-- va a asumir lo mismo. La razón es `canje_personas`: **el padrón de personas es único y
-- compartido entre las tres marcas**. La misma creadora trabaja para BDI y para Zattia, y la
-- pregunta que da sentido al módulo — "¿hace cuánto no hacemos una acción con ella?" — tiene que
-- tener UNA respuesta, no dos. Con dos bases habría que bajar los canjes de las dos y mergear en
-- el browser, y la FK `canjes.persona_id → canje_personas.id` no se podría declarar de verdad.
--
-- De qué marca es cada canje lo dice la columna `store` de `canjes`. El esquema está particionado
-- por `store` desde el día uno justamente para que separarlo mañana sea un `insert ... select`.
--
-- `scripts/apply-canjes.mjs` apunta SÓLO a DATABASE_URL_BDI, deliberadamente: no itera las dos
-- bases como `apply-devoluciones.mjs`, así es imposible crear estas tablas en Zattia por
-- distracción. Si alguna vez `select count(*) from canje_personas` funciona en el Supabase de
-- Zattia, alguien corrió esto donde no iba.
--
-- Idempotente (`create table if not exists` + `create index if not exists`): re-correrlo no hace
-- nada. Crea tablas NUEVAS, no toca ninguna existente ni migra datos.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. canje_personas — EL PADRÓN. Sin `store`: es transversal a las tres marcas.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists canje_personas (
  id                bigint generated always as identity primary key,

  -- El @ es el ÚNICO campo obligatorio: dar de alta a alguien tiene que costar un renglón.
  -- Se guarda normalizado (minúsculas, sin @, sin URL) y con `unique`, para que `Lucia.MKP`,
  -- `@lucia.mkp` e `instagram.com/lucia.mkp` sean la misma persona y no tres.
  -- `instagram_raw` conserva lo que se tipeó, que a veces tiene mayúsculas que ella usa.
  instagram         text not null unique,
  instagram_raw     text,

  nombre            text,
  apellido          text,
  telefono          text,
  email             text,
  tiktok            text,
  ciudad            text,

  -- La dirección vive en la PERSONA, no en el canje. Se muda una vez cada tres años, y volver a
  -- pedírsela en cada canje es exactamente la fricción que hace que no completen el formulario.
  -- El canje congela su propia copia en `canjes.envio_direccion` al despachar, así el histórico
  -- no miente si después se mudó.
  dni               text,
  calle             text,
  numero            text,
  piso              text,
  depto             text,
  cp                text,
  provincia         text,
  localidad         text,
  direccion_nota    text,

  -- Qué se le pide según la marca, y es obligatorio porque sin esto no se puede armar el pedido.
  -- Los dos CONVIVEN en la misma persona: la misma creadora puede tener talles cargados por un
  -- canje de Zattia y modelo de celular por uno de BDI. El portal le muestra sólo el que
  -- corresponde a la marca de ESE canje, para no pedirle datos que no le sirven a nadie.
  talles            jsonb not null default '{}'::jsonb,   -- {remera, pantalon, calzado} — Zattia y Stunned
  modelo_celular    text,                                 -- qué iPhone tiene — BDI

  -- Carga manual. Sin fecha el número miente: "50k seguidores" de hace dos años no es un dato.
  seguidores_ig     integer,
  seguidores_tt     integer,
  seguidores_at     timestamptz,

  -- El pin manual. Es filtro y orden, NO puntaje: sirve para lo que el número no ve (una
  -- producción hermosa, que trajo clientas al local) y para cuando todavía no hay datos.
  destacada         boolean not null default false,
  destacada_nota    text,
  -- El veto manual, que es el que NO se revierte solo. La banda `no_repetir` derivada de los
  -- cierres incompletos es otra cosa y vive en el puntaje (fase 3).
  vetada            boolean not null default false,
  vetada_motivo     text,

  cadencia_dias     integer not null default 90,          -- cada cuánto tiene sentido volver a llamarla

  -- ⚠️ Las notas llevan `id` propio A PROPÓSITO: [{id, texto, at, usuario}].
  -- `lib/crm/leads.ts` las borra por índice posicional y ya borró la equivocada. No copiar ese bug.
  notas             jsonb not null default '[]'::jsonb,
  archivos          jsonb not null default '[]'::jsonb,   -- [{url, nombre, tipo, at, usuario}] media kit, capturas
  historial         jsonb not null default '[]'::jsonb,

  usuario           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- El unique de `instagram` ya crea su índice. Este es para el buscador por nombre.
create index if not exists idx_canje_personas_nombre    on canje_personas (lower(coalesce(nombre, '')), lower(coalesce(apellido, '')));
create index if not exists idx_canje_personas_destacada on canje_personas (destacada) where destacada = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. canjes — un canje pertenece a UNA marca y a UNA persona.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists canjes (
  id                bigint generated always as identity primary key,
  -- La FK que sólo existe porque todo vive en la misma base. Es la mitad de la razón del diseño.
  persona_id        bigint not null references canje_personas (id) on delete restrict,

  -- Tres valores, igual que `SkuStore` en lib/sku-map/tipos.ts: 'bdi' | 'zattia' | 'stunned'.
  -- Stunned no es marca de primera clase en el monitor (es una línea de Zattia por prefijo de SKU
  -- `STU`), pero acá se elige como una más; al leer costos rutea a la base de Zattia, que es
  -- exactamente lo que ya hace api/sku-map.js.
  store             text not null,

  tipo              text not null default 'producto',     -- 'producto' | 'producto_plata'
  estado            text not null default 'borrador',     -- ver el ciclo de vida abajo
  titulo            text,                                 -- "Lanzamiento cápsula invierno"
  nota              text,

  -- ── El tope tiene DOS MODOS ────────────────────────────────────────────────
  -- 'monto'    → `tope_pvp`: "elegí hasta $80.000". Control DURO: la suma de PVP no puede pasarlo.
  -- 'unidades' → `tope_unidades`: [{cantidad, descripcion}], ej. [{2,'fundas'},{1,'jean'}].
  --              Control DURO sobre el TOTAL de unidades y BLANDO sobre el detalle: el operador ve
  --              la lista acordada al lado de lo que carga y valida a ojo que sean las prendas
  --              correctas. No se intenta adivinar si algo "es un jean" — la categoría de GN no es
  --              lo bastante prolija para colgar de ahí un bloqueo, y una validación que se
  --              equivoca la mitad de las veces se termina apagando.
  -- En los DOS modos siempre se calcula la plata, porque gerencia aprueba mirando un número.
  tope_tipo         text not null default 'monto',        -- 'monto' | 'unidades'
  tope_pvp          numeric,
  tope_unidades     jsonb not null default '[]'::jsonb,

  -- Plata del canje mixto. El pago se hace por fuera; acá sólo se registra.
  monto_plata       numeric,
  pago_estado       text not null default 'no_aplica',    -- 'pendiente' | 'pagado' | 'no_aplica'
  pago_at           timestamptz,
  pago_nota         text,

  -- ── Aprobación ─────────────────────────────────────────────────────────────
  -- `aprobacion_nivel` se GUARDA, no se recalcula: si mañana cambia el umbral, lo ya aprobado
  -- sigue diciendo con qué regla se aprobó.
  aprobado_por      text,
  aprobado_at       timestamptz,
  aprobacion_nivel  text,                                 -- 'aprobar' | 'aprobar-plata'
  rechazado_motivo  text,
  rechazado_por     text,
  rechazado_at      timestamptz,
  acordado_at       timestamptz,

  -- ── El portal de la persona ────────────────────────────────────────────────
  -- El token es POR CANJE, pero la pantalla abre PRELLENADA con lo que ya está en la ficha: en el
  -- segundo canje ella entra, ve todo cargado y sólo confirma o corrige. Lo que edite se escribe
  -- en la PERSONA (es el dato vigente); al despachar, el canje congela su copia en
  -- `envio_direccion`.
  -- `datos_confirmados_at` distingue "nunca lo miró" de "lo miró y estaba bien", que no es lo
  -- mismo cuando hay que despachar.
  token                text unique,
  token_vence          timestamptz,
  datos_confirmados_at timestamptz,

  -- No hay `catalogo` ni `seleccion_cerrada_at` a propósito: ella NO elige productos por el
  -- portal. Los pasa por mensaje y los carga el operador, porque qué se le puede ofrecer depende
  -- de si el producto ya está lanzado en la tienda, y eso no se puede modelar desde acá.

  -- ── Compra y envío ─────────────────────────────────────────────────────────
  -- La orden se crea A MANO en el admin de Tienda Nube (100% de descuento, envío a nuestro
  -- cargo): este repo no tiene credenciales de TN. El monitor sólo la VERIFICA leyéndola por
  -- número. La orden cae sola en Gestión Nube y descuenta stock por el camino normal, así que no
  -- hace falta venta técnica — confirmado por Bruno el 27-jul, incluso en órdenes a $0.
  -- `stock_estado` y `gn_venta_number` se dejan igual: no cuestan nada y dan dónde marcarlo si
  -- algún día aparece un caso raro.
  tn_orden          text,
  compra_estado     text not null default 'pendiente',    -- 'pendiente' | 'hecho' | 'no_aplica'
  compra_at         timestamptz,
  compra_por        text,
  gn_venta_number   text,
  stock_estado      text not null default 'no_aplica',

  envio_via         text,                                 -- 'correo' | 'andreani' | 'cadete' | 'presencial'
  envio_seguimiento text,
  envio_costo       numeric,
  envio_estado      text not null default 'pendiente',
  envio_at          timestamptz,
  envio_direccion   jsonb,                                -- copia congelada al despachar
  aviso_estado      text not null default 'pendiente',    -- ¿ya se le avisó que salió?
  aviso_at          timestamptz,
  -- Al setear `entregado_at` se congelan los `vence_el` de cada entregable. Es el pivote del
  -- módulo: hasta que no llega el pedido no hay plazo que contar.
  entregado_at      timestamptz,

  -- El cupón para su audiencia es cosa APARTE del canje, en pocos acuerdos, creado a mano.
  cupon_codigo      text,
  cupon_desde       date,
  cupon_hasta       date,

  -- ── Balance: snapshot al cerrar, no una vista ──────────────────────────────
  -- Se congela porque el costo que importa es el del día del canje, no el de hoy.
  balance_costo_productos numeric,
  balance_costo_envio     numeric,
  balance_costo_plata     numeric,
  balance_costo_total     numeric,
  balance_alcance         integer,
  balance_interacciones   integer,
  balance_cpm             numeric,
  balance_puntaje_manual  integer,                        -- 1–5, el ÚNICO manual
  balance_nota            text,

  -- Se cerró sin que cumpliera todo. Penaliza el puntaje (fase 3).
  cerrado_incompleto boolean not null default false,
  cierre_motivo      text,
  cerrado_por        text,
  cerrado_at         timestamptz,

  -- Devolvió o vendió lo que le mandamos. Queda en el historial de la persona y le baja el
  -- puntaje. Deliberadamente NO hay flujo de reingreso ni enganche con Reclamos: pasa dos veces
  -- al año, cada caso es distinto, y un flujo entero para eso es complejidad que después nadie
  -- usa. Si amerita, se la veta a mano.
  producto_no_conservado        boolean not null default false,
  producto_no_conservado_motivo text,
  producto_no_conservado_por    text,
  producto_no_conservado_at     timestamptz,

  cancelado_motivo  text,

  usuario           text,
  historial         jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Ciclo de vida (ocho estados y ni uno más):
--   borrador → propuesta → (rechazado | acuerdo) → preparando → en_curso → cerrado
--   cancelado ← desde cualquier estado no terminal, con motivo. Revoca el token.
-- Lo que avanza a ritmos distintos NO es un estado sino un pendiente (`compra_estado`,
-- `envio_estado`, `pago_estado`, `aviso_estado`) — mismo criterio que Reclamos.

create index if not exists idx_canjes_store_estado on canjes (store, estado, created_at desc);
create index if not exists idx_canjes_persona      on canjes (persona_id, created_at desc);
-- "Hace cuánto no hacemos una acción con ella", cruzando marcas: es LA consulta del módulo.
create index if not exists idx_canjes_persona_at   on canjes (persona_id, acordado_at desc);
create index if not exists idx_canjes_aprobacion   on canjes (estado) where estado = 'propuesta';
-- El portal entra por el token: sin índice, cada visita escanea la tabla.
create index if not exists idx_canjes_token        on canjes (token) where token is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. canje_items — snapshot de los productos. Los carga el OPERADOR, no ella.
-- ─────────────────────────────────────────────────────────────────────────────
-- Es un snapshot y no un join contra el catálogo: `costo_unit` y `pvp_unit` quedan congelados,
-- que es justamente lo que un balance necesita — el costo DE ESE DÍA, no el de hoy. Es también
-- lo que permite que el módulo viva en la base de BDI sin joinear contra tablas de la marca.
create table if not exists canje_items (
  id            bigint generated always as identity primary key,
  canje_id      bigint not null references canjes (id) on delete cascade,

  sku           text,
  product_id    text,                                     -- ids de Gestión Nube / Tienda Nube
  size_id       text,
  nombre        text,
  variante      text,
  cantidad      integer not null default 1,
  costo_unit    numeric,
  pvp_unit      numeric,

  origen        text not null default 'equipo',           -- 'persona' | 'equipo'
  -- Los quitados NO se borran: que algo se haya caído por falta de stock es información.
  estado        text not null default 'propuesto',        -- 'propuesto' | 'confirmado' | 'sin_stock' | 'quitado'
  motivo        text,

  usuario       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_canje_items_canje on canje_items (canje_id, estado);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. canje_entregables — qué prometió publicar.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists canje_entregables (
  id                    bigint generated always as identity primary key,
  canje_id              bigint not null references canjes (id) on delete cascade,

  -- Lista CERRADA en código (5 tipos): historia_ig | reel_ig | post_ig | video_tiktok | contenido.
  -- Una lista abierta se llena de duplicados (`Reel`, `reel ig`, `REEL`) y estos tipos alimentan
  -- el puntaje y los avisos. Sumar uno es una línea + deploy.
  tipo                  text not null,
  cantidad_comprometida integer not null default 1,

  -- El plazo se guarda EN DÍAS DESDE LA ENTREGA, no como fecha: al armar el acuerdo todavía no se
  -- sabe cuándo va a llegar el pedido. `vence_el` se calcula al setear `canjes.entregado_at` y se
  -- congela ahí.
  plazo_dias            integer,
  vence_el              date,

  obligatorio           boolean not null default true,
  nota                  text,

  -- ⚠️ `cantidad_cumplida` NO es columna, a propósito: se DERIVA contando evidencias verificadas.
  -- Un contador denormalizado se desincroniza el día que alguien borre una evidencia.

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_canje_entregables_canje on canje_entregables (canje_id);
-- Los vencidos, para el aviso del sidebar.
create index if not exists idx_canje_entregables_vence on canje_entregables (vence_el) where vence_el is not null and obligatorio = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. canje_evidencias — la prueba de que publicó. La carga EL EQUIPO.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists canje_evidencias (
  id                bigint generated always as identity primary key,
  canje_id          bigint not null references canjes (id) on delete cascade,
  entregable_id     bigint references canje_entregables (id) on delete set null,

  url_publicacion   text,
  -- Las historias vencen a las 24 h: la captura ES la prueba, no un adorno.
  captura_url       text,
  archivo_url       text,
  archivo_tipo      text,

  -- Se compara contra `canje_entregables.vence_el` → de ahí sale la puntualidad.
  fecha_publicacion date,
  -- A mano: cada formato reporta distinto y la API de Instagram está fuera de alcance.
  metricas          jsonb not null default '{}'::jsonb,

  subido_por        text not null default 'equipo',       -- 'persona' | 'equipo'

  -- Una evidencia SIN VERIFICAR no cuenta. Sin esto, pegar un link roto cierra el canje.
  verificada        boolean not null default false,
  verificada_por    text,
  verificada_at     timestamptz,
  rechazada_motivo  text,

  usuario           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_canje_evidencias_canje      on canje_evidencias (canje_id);
create index if not exists idx_canje_evidencias_entregable on canje_evidencias (entregable_id, verificada);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. canje_config — una fila por marca, con los números que si no serían constantes
--    escondidas en el código que en seis meses nadie va a saber dónde tocar.
-- ─────────────────────────────────────────────────────────────────────────────
-- Se edita desde la propia sección con permiso de admin, y se LEE, nunca se asume: las funciones
-- del dominio la reciben por parámetro, así siguen siendo puras y testeables con cualquier valor.
create table if not exists canje_config (
  store                          text primary key,        -- 'bdi' | 'zattia' | 'stunned'

  -- null = TODO va a la firma alta. Es el default seguro y el monto todavía no está definido.
  umbral_aprobacion_alta         numeric,
  cadencia_dias_default          integer not null default 90,
  plazo_entregable_dias_default  integer not null default 10,
  tope_evidencias_por_canje      integer not null default 30,
  -- El ratio costo/PVP para estimar la plata ANTES de que haya items cargados, que es cuando
  -- gerencia tiene que aprobar.
  factor_costo_estimado          numeric not null default 0.4,

  -- ⚠️ ARRANCA APAGADO A PROPÓSITO. El riesgo principal del módulo no es técnico: es que el
  -- cumplimiento se cargue a mano y se abandone a los dos meses. Si nadie carga evidencias, TODO
  -- EL MUNDO figura como incumplidor y el sistema empieza a frenar canjes con gente que sí
  -- cumplió. Se prende recién cuando la carga se haya sostenido un mes — y es un click, sin
  -- deploy.
  bloquear_por_vencidos          boolean not null default false,
  -- Con esta cantidad de cierres incompletos la persona cae sola en la banda `no_repetir`. Es
  -- derivado, no un flag: si después cierra bien un par de canjes, sale sola.
  cierres_incompletos_no_repetir integer not null default 2,

  -- UNA SOLA carpeta general por marca, configurada una vez. Lo que caiga ahí se mueve después a
  -- carpetas filtradas A MANO: el sistema no lo organiza ni pretende hacerlo.
  drive_url                      text,

  updated_at                     timestamptz not null default now()
);

-- Las tres filas sembradas con los defaults. `on conflict do nothing` para que re-correr la
-- migración no pise lo que alguien ya configuró desde el panel.
insert into canje_config (store) values ('bdi'), ('zattia'), ('stunned')
on conflict (store) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Tanda 1 (2-ago-2026) — los ajustes del sector: la propuesta
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ Va acá abajo y con `alter table` porque `create table if not exists` NO agrega columnas a una
-- tabla que ya existe: re-correr la migración con la columna nueva arriba no haría nada.
--
-- Qué entra: el tramo en que la pelota la tiene ella. `propuesta` (nuestra firma interna) y
-- `enviada` (esperando su respuesta) son dos esperas distintas; antes había una sola y un canje que
-- la creadora nunca contestó figuraba como acordado.

-- ¿Ya se le escribió? Es un pendiente, no un estado: la propuesta está armada igual.
alter table canjes add column if not exists contacto_estado  text not null default 'pendiente';
alter table canjes add column if not exists contacto_at      timestamptz;

-- Su respuesta. El motivo sale de MOTIVOS_NO_ACEPTO (lista cerrada); la nota sólo si es 'Otro'.
alter table canjes add column if not exists respuesta_motivo text;
alter table canjes add column if not exists respuesta_nota   text;
alter table canjes add column if not exists respuesta_at     timestamptz;

-- Con qué palabra se cuentan las unidades en cada marca. En la config y no en código para que
-- cambiar "fundas" por "fundas y accesorios" no cueste un deploy.
alter table canje_config add column if not exists unidad_default     text;
alter table canje_config add column if not exists unidades_sugeridas jsonb not null default '[]'::jsonb;

-- La semilla. `where … is null` para no pisar lo que alguien haya configurado desde el panel.
update canje_config set unidad_default = 'fundas'
  where store = 'bdi' and unidad_default is null;
update canje_config set unidad_default = 'prendas'
  where store in ('zattia', 'stunned') and unidad_default is null;

-- La cola de "esperando su respuesta" es la que se mira todos los días.
create index if not exists idx_canjes_enviada on canjes (store, estado) where estado = 'enviada';

-- `estado` es text sin CHECK a propósito (el gate es ESTADOS.includes en el handler), así que
-- `enviada` y `no_acepto` no necesitan DDL.

-- ⚠️ Los borradores que ya existían van a 'propuesta', NO a 'enviada'. Un borrador es una
-- propuesta armada que nunca se firmó ni se le mandó a nadie, y de los dos estados nuevos el
-- honesto es el de la firma pendiente: mandarlos a 'enviada' diría que la creadora la recibió,
-- que es exactamente el tipo de mentira que estos estados vienen a arreglar. Sin esta línea
-- quedan zombis: `puedeIr('borrador', …)` es false para todo y tampoco se pueden editar.
update canjes set estado = 'propuesta' where estado = 'borrador';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Tanda 2 (2-ago-2026) — la vitrina: que ELLA elija, con fotos
-- ─────────────────────────────────────────────────────────────────────────────
-- Una vitrina es **un espejo curado de Tienda Nube**: se trae de la tienda lo que se quiere
-- promocionar, se saca el resto, y eso es lo que la creadora ve al abrir su link. De acá **no
-- vuelve nada a TN**: lo que ella elige se escribe sólo en `canje_items`, y sirve después para
-- tipear la venta a mano en el admin de la tienda.
--
-- ⚠️ **Todo se congela, foto incluida.** Es la decisión que sostiene el resto, y son cuatro razones
-- por peso: el portal **no tiene sesión** y no puede pedirle nada a TN; el link tiene que abrir en
-- un celular aunque el catálogo esté caído; "Fundas verano" tiene que seguir mostrando lo mismo
-- aunque mañana cambien las fotos en la tienda; y es el mismo criterio con el que `canje_items` ya
-- congela `costo_unit` y `pvp_unit`.

create table if not exists canje_vitrinas (
  id          bigint generated always as identity primary key,
  store       text not null,                          -- 'bdi' | 'zattia' | 'stunned'
  nombre      text not null,                          -- "Fundas verano", "Sweaters Days"
  -- 'borrador'  se está armando, ningún canje la puede usar todavía
  -- 'activa'    se le puede colgar a un canje
  -- 'archivada' los canjes que ya la tienen la siguen viendo; no se ofrece para nuevos
  estado      text not null default 'borrador',
  nota        text,
  usuario     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_canje_vitrinas_store on canje_vitrinas (store, estado, created_at desc);

-- Un producto de la vitrina, con su foto y sus opciones congeladas al momento de armarla.
create table if not exists canje_vitrina_items (
  id             bigint generated always as identity primary key,
  vitrina_id     bigint not null references canje_vitrinas (id) on delete cascade,
  orden          integer not null default 0,

  -- El id del PRODUCTO en Tienda Nube. Es la llave y no el SKU porque el SKU no alcanza: en BDI 4
  -- de cada 10 variantes no lo tienen cargado, y en Zattia el mismo SKU se repite en las 24
  -- variantes de un producto (`CORSET FRANK` para todas). El id, en cambio, viene siempre.
  tn_product_id  text not null,
  sku            text,                                 -- informativo: para buscarlo a ojo
  nombre         text not null,
  foto_url       text,
  -- Precio de LISTA, de TN. El costo no está acá a propósito: vive en Gestión Nube y no se puede
  -- cruzar de forma confiable por lo que dice el comentario de arriba. Lo completa el equipo al
  -- confirmar el item, y mientras tanto el balance lo estima con `factor_costo_estimado`.
  pvp            numeric,

  -- Las variantes del producto, congeladas: `[{id, valores:[…], foto, sku, barcode}]`.
  --
  -- ⚠️ **Los ejes cambian producto por producto y no se pueden nombrar de antemano.** Medido sobre
  -- los dos catálogos: en BDI 181 productos tienen un solo eje (`iPhone 12`) y 19 tienen dos
  -- (`iPhone 11/12/12 Mini` + `Rosa`); en Zattia son 495 y 42 (`Negro` + `XS`). Escribir "elegí
  -- modelo" y "elegí color" sería mentira la mitad de las veces. Por eso se guardan los `valores`
  -- tal como los manda TN y la pantalla los muestra con la palabra de la tienda.
  --
  -- Las variantes **sin stock al armar la vitrina no se guardan**: es la única forma honesta de no
  -- ofrecer lo agotado. Un stock congelado hace dos semanas miente, así que no se muestra ni se
  -- escribe "sin stock" en ningún lado — simplemente no está.
  opciones       jsonb not null default '[]'::jsonb,

  -- `false` en vez de borrar, una vez que la vitrina ya salió: que un producto se haya apagado es
  -- información, y sin eso no se entiende por qué la vitrina salió como salió. Mientras la vitrina
  -- está en `borrador` no hay nada que explicar y sacar un producto lo borra de verdad.
  activo         boolean not null default true,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Un producto no entra dos veces a la misma vitrina: traer una categoría que se pisa con otra ya
-- traída tiene que ser inofensivo, no duplicar la grilla.
create unique index if not exists idx_canje_vitrina_items_prod on canje_vitrina_items (vitrina_id, tn_product_id);
create index if not exists idx_canje_vitrina_items_vitrina    on canje_vitrina_items (vitrina_id, activo, orden);

-- Qué vitrina le toca a este canje. Muchos canjes → una vitrina: **la vitrina se reusa, el link
-- no**, porque el link lleva su cantidad y sus datos prellenados.
alter table canjes add column if not exists vitrina_id bigint references canje_vitrinas (id);

-- Cuándo mandó su elección. Se cierra al mandar: si vuelve a abrir el link ve lo que eligió, en
-- lectura. Es también lo que distingue "todavía no entró" de "entró y eligió".
alter table canjes add column if not exists seleccion_cerrada_at timestamptz;

-- Sin RLS, como el resto del monitor: el gate es server-side en api/_canjes.js
-- (`exigirUsuario` + `soloMismoOrigen`), igual que fallas, reclamos, solicitudes y conteos.
alter table canje_personas      disable row level security;
alter table canjes              disable row level security;
alter table canje_items         disable row level security;
alter table canje_entregables   disable row level security;
alter table canje_evidencias    disable row level security;
alter table canje_config        disable row level security;
alter table canje_vitrinas      disable row level security;
alter table canje_vitrina_items disable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Tanda 3 (2-ago-2026) — la carga a TN sin transcribir y la cola de tránsito
-- ─────────────────────────────────────────────────────────────────────────────

-- El cupón de 100% con el que la orden de canje se tipea en $0 en el admin de Tienda Nube.
--
-- Es **uno solo por marca, genérico y sin vencimiento**: no se emite uno por creadora ni por
-- campaña, es interno de marketing y su único trabajo es que la venta marque $0. Se crea A MANO en
-- TN —el monitor no puede crear cupones— y acá se guarda para no ir a buscarlo cada vez.
--
-- Por qué en la config y no en el código: es un dato que marketing va a querer cambiar solo, y un
-- deploy para cambiar un código de cupón es un impuesto absurdo.
alter table canje_config add column if not exists cupon_codigo text;

-- Los intentos de entrega del correo, `[{at, nota, usuario}]`.
--
-- Es una lista y no una fecha porque **el correo intenta más de una vez**: con una sola columna el
-- segundo intento pisa al primero y se pierde justo lo que explica por qué un pedido tardó tres
-- semanas. Anotar un intento **no cambia el estado del canje**: sigue en la cola de tránsito hasta
-- que alguien marque que llegó, que es el único evento que congela los vencimientos.
alter table canjes add column if not exists intentos jsonb not null default '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Revisar el stock de una vitrina contra la tienda (2-ago-2026)
-- ─────────────────────────────────────────────────────────────────────────────

-- Cuándo se revisó **la vitrina entera** contra Tienda Nube.
--
-- Va aparte de `updated_at` porque no es lo mismo: `updated_at` se mueve al renombrarla o al sumar
-- una categoría, y lo que hay que poder mirar de un vistazo es **qué tan vieja es la foto del
-- stock**. Una vitrina es un espejo CONGELADO —el portal no tiene sesión y no puede preguntarle
-- nada a la tienda— así que lo agotado se sigue ofreciendo hasta que alguien la revisa.
--
-- `null` = nunca se revisó desde que se armó; la pantalla cae a `created_at`.
alter table canje_vitrinas add column if not exists stock_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. El mail con el que se tipea la orden en Tienda Nube (3-ago-2026)
-- ─────────────────────────────────────────────────────────────────────────────

-- Hasta ahora la orden de canje se cargaba con el mail DE LA CREADORA, que es el que ella dejó en
-- el portal. Eso mezclaba dos cosas distintas: la orden es un trámite interno para que el envío
-- salga y la venta marque $0, y su mail es una herramienta de contacto nuestra.
--
-- Con el mail de la marca, todas las órdenes de canje quedan bajo un mismo cliente en TN y la
-- tienda no le manda nada a ella. El suyo queda en `canje_personas.email` —ahora obligatorio en el
-- portal— para volver a escribirle dentro de seis meses.
--
-- Es por marca porque BDI, Zattia y Stunned son tres tiendas distintas. Va en la config y no en el
-- código por lo mismo que el cupón: cambiar una dirección de mail no puede costar un deploy.
alter table canje_config add column if not exists email_pedido text;
