-- La cola de redacción de descripciones de producto (Tienda Nube > Redacción).
--
-- Por qué existe una tabla y no una clave del KV: acá vive `html_previo`, que es **la única
-- copia que existe en el mundo** de la descripción anterior. TiendaNube no tiene historial:
-- cuando se pisa una descripción, la de antes no está en ningún lado. Y el KV de `ingresos`
-- guarda un mapa entero por clave, valida sólo `typeof map === 'object'` —o sea que un `{}`
-- pasa y lo borra todo— y ya casi cuesta 305 clientes y 653 teléfonos.
--
-- El invariante que sostiene todo esto: **el respaldo se escribe ANTES que TiendaNube**. El
-- paso que escribe en la tienda no sale si el que guarda `html_previo` no confirmó. De yapa,
-- eso deja gratis el verbo de vuelta: reescribir `html_previo` crudo.
--
-- Correr en el Supabase de CADA marca con `node scripts/apply-tn-descripciones.mjs`.
-- Idempotente: se puede correr varias veces.

create table if not exists tn_descripciones (
  store          text not null,                     -- 'bdi' | 'zattia'
  tn_id          text not null,                     -- id del producto en TiendaNube
  nombre         text,                              -- nombre al momento de entrar a la cola

  -- Lo que tipea el local: 3 o 4 palabras («gasa, botones nacarados»). De acá sale la TELA,
  -- y por eso el validador rechaza un bullet de tela que no se apoye en este campo o en el
  -- nombre: una foto de estudio no distingue gasa de voile, y una tela mal puesta es un
  -- cambio o una devolución.
  insumo         text,
  insumo_por     text,
  insumo_at      timestamptz,

  -- El borrador es DATO, no texto libre: {parrafo, bullets:[{etiqueta,texto}]}. Se guarda
  -- así a propósito, para que el día que lo escriba un modelo no cambie ni la tabla ni la
  -- pantalla ni el validador: sólo cambia de dónde vienen estos campos.
  borrador       jsonb,

  html_previo    text,                              -- 🔑 EL RESPALDO. La única copia.
  hash_previo    text,                              -- para el compare-and-swap contra TN
  html_escrito   text,                              -- lo que quedó, releído de TN
  verificado     boolean,                           -- ⛔ que el PUT diera 200 no alcanza

  estado         text not null default 'sin-insumo',-- sin-insumo|con-insumo|borrador|aprobado|escrito|falla
  aprobado_por   text,
  aprobado_at    timestamptz,
  escrito_at     timestamptz,
  error          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (store, tn_id)
);

create index if not exists idx_tn_descripciones_store on tn_descripciones (store, estado);

-- RLS PRENDIDO y SIN políticas: nadie entra con la clave pública, ni a leer ni a escribir.
--
-- El molde es `sql/migrate-tn-fotos-verificadas.sql`, y acá el motivo es todavía más duro:
-- la clave pública viaja adentro del bundle, así que con RLS apagado cualquiera podría pisar
-- `html_previo` — o sea, borrar el único respaldo de lo que había en la tienda.
--
-- La app entra con la **service key**, que pasa por encima de RLS. Si la Redacción empieza a
-- fallar en una marca, es que a esa base le falta su `*_SUPABASE_SERVICE_KEY` en Vercel y
-- está cayendo a la clave pública.
alter table tn_descripciones enable row level security;
