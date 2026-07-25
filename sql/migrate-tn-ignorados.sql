-- Productos de la tienda que NO hay que revisar (Fase 4 — Tienda Nube > Fotos).
--
-- La revisión de fotos lista ~220 productos, y una parte no va a tener foto nunca porque no
-- son de la tienda: mayoristas, pruebas, cosas viejas. Sin poder sacarlos, la lista nunca
-- llega a cero y deja de servir como tablero: se convierte en ruido permanente.
--
-- Se guarda el id de TiendaNube (no el de GN) porque es el que identifica al producto en la
-- pantalla, y el motivo, para que dentro de seis meses se entienda por qué está afuera.
--
-- Correr en el Supabase de CADA marca con `node scripts/apply-tn-ignorados.mjs`.
-- Idempotente: se puede correr varias veces.

create table if not exists tn_ignorados (
  store       text not null,                          -- 'bdi' | 'zattia'
  tn_id       text not null,                          -- id del producto en TiendaNube
  nombre      text,                                   -- nombre al momento de ignorarlo (referencia)
  motivo      text,                                   -- 'mayorista', 'prueba', libre
  usuario     text,
  created_at  timestamptz not null default now(),
  primary key (store, tn_id)
);

create index if not exists idx_tn_ignorados_store on tn_ignorados (store);

-- Igual que las demás tablas del monitor: el gate es el login server-side del endpoint
-- (service key), no RLS.
alter table tn_ignorados disable row level security;
