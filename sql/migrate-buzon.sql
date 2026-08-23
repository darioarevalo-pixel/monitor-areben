-- "Mensajes de clientes": lo que la clienta escribió y todavía no se resolvió.
--
-- # Qué hueco tapa
--
-- Los reclamos y los pedidos de cambio llegan por mail (la comunicación de Tienda Nube va a una
-- casilla). El problema no es que no se contesten: es **cuándo**. Un mail entra el domingo, nadie
-- lo mira, y el lunes a las 9 el paquete se arma y se despacha con el talle que la clienta pidió
-- cambiar. El mail existe, la orden existe, y no hay ningún lugar donde las dos cosas se toquen —
-- así que el despacho no tiene forma de frenarse.
--
-- Esta tabla es ese lugar. Lo que la hace útil no es guardar el texto: es la columna
-- `orden_numero`, que es lo que le permite a Envíos poner una pastilla en la fila y preguntar
-- antes de que el paquete avance.
--
-- # Por qué no es una pestaña de Reclamos
--
-- Reclamos y Cambios está frenado (`AGENTS.md`) y contesta otra pregunta: ahí vive el proceso de
-- una devolución ya aceptada. Esto es el escalón de antes y su unidad de medida es el tiempo.
--
-- # Vive en la base de BDI y en ninguna otra
--
-- Mismo criterio que `envios_reparto` y que Canjes: quien mira esto es la misma persona que arma
-- los paquetes de las dos marcas, y `scripts/apply-buzon.mjs` ni siquiera lee DATABASE_URL_ZATTIA.
-- Si alguna vez `select count(*) from buzon_mensajes` funciona en el Supabase de Zattia, alguien
-- corrió la migración donde no iba.
--
-- Correr con `node scripts/apply-buzon.mjs`. Idempotente.

create table if not exists buzon_mensajes (
  id             text primary key,
  store          text not null,                       -- 'bdi' | 'zattia'
  -- Normalizado (sin '#', sin espacios) por `normalizarOrden` en lib/buzon/reglas.core.js.
  -- 🔴 Nullable a propósito: la clienta escribe antes de comprar, o sin decir el número. Un mensaje
  -- sin orden no frena ningún despacho, pero se ve igual — esconderlo lo devuelve al lugar donde
  -- está hoy, que es la casilla que nadie abre.
  orden_numero   text,
  remitente      text,
  asunto         text,
  cuerpo         text not null,
  -- Cuándo lo escribió la clienta, NO cuándo se cargó acá. Son dos fechas distintas y la que
  -- importa es ésta: el mail del domingo cargado el martes sigue siendo del domingo.
  recibido_en    timestamptz not null default now(),
  origen         text not null default 'a_mano',      -- 'mail' | 'a_mano'
  -- La llave anti-duplicado de la Fase B (traer la casilla sola). Traerla dos veces no puede dejar
  -- el mismo mail dos veces en la bandeja. Null en los cargados a mano, y por eso el índice único
  -- es PARCIAL: en Postgres varios NULL no chocan entre sí, pero el índice parcial lo dice.
  mensaje_ext_id text,
  resuelto       boolean not null default false,
  resuelto_por   text,
  resuelto_en    timestamptz,
  -- Qué se hizo. Se pide al resolver: sin esto, "resuelto" es un tilde que no le dice nada al que
  -- lo lee después.
  accion         text,
  autor          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- El índice que usa la pantalla: lo abierto, por marca y orden.
create index if not exists idx_buzon_abiertos on buzon_mensajes (store, orden_numero) where resuelto = false;
-- La bandeja se lee por fecha de recepción.
create index if not exists idx_buzon_recibido on buzon_mensajes (recibido_en desc);
-- El segundo candado del dedup. Si salta, salta como error y no en silencio.
create unique index if not exists idx_buzon_ext on buzon_mensajes (store, mensaje_ext_id) where mensaje_ext_id is not null;

-- Un mensaje resuelto sin fecha de resolución es un tilde que no se puede auditar.
do $$ begin
  alter table buzon_mensajes add constraint buzon_resuelto_con_fecha
    check (resuelto = false or resuelto_en is not null);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS.
--
-- ⚠️ No es opcional y no se copia de `migrate-atencion.sql`, que la DESACTIVA: ahí lo guardado son
-- links y mensajes de la empresa, y acá hay **nombre, mail y lo que escribió una clienta**. Es el
-- mismo criterio que `envios_reparto`, que también guarda domicilio y teléfono.
--
-- `sql/migrate-rls.sql` prendió RLS recorriendo las tablas que existían en ese momento; una tabla
-- creada después nace SIN RLS y sería la única abierta de la base. Sin política de lectura para
-- `anon` a propósito: el navegador nunca lee esta tabla directo — todo pasa por `api/_buzon.js`,
-- que usa la service key y no mira RLS.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table buzon_mensajes enable row level security;
