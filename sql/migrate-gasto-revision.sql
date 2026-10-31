-- La REVISIÓN de gastos (Bruno, 30-oct, tanda 2 de «Cargar un gasto»; `lib/caja/gasto.core.js`):
--   · la OFICINA carga gastos que ⛔ salen de la caja (`gasto_oficina`);
--   · TODO gasto —también la caja chica (`caja_turno_mov` con categoria)— queda PARA REVISAR (`revision` null) hasta que un
--     Admin lo aprueba (⇒ se escribe en el dashboard, `dashboard_gasto_id`) o lo rechaza (`revision_motivo`).
-- Correr en ZATTIA y en BDI, ANTES del push (sin esto, la revisión dice que falta preparar la base):
--   node scripts/aplicar-sql.mjs sql/migrate-gasto-revision.sql gasto_oficina
--
-- VERIFICACIÓN (tiene que dar 2 filas: caja_turno_mov · revision y gasto_oficina · revision):
--   select table_name, column_name from information_schema.columns where column_name = 'revision' and table_name in ('caja_turno_mov', 'gasto_oficina');

alter table caja_turno_mov add column if not exists revision text check (revision in ('aprobado', 'rechazado'));
alter table caja_turno_mov add column if not exists revisado_por text;
alter table caja_turno_mov add column if not exists revisado_en timestamptz;
alter table caja_turno_mov add column if not exists revision_motivo text;
alter table caja_turno_mov add column if not exists dashboard_gasto_id text;

create table if not exists gasto_oficina (
  id                 uuid primary key default gen_random_uuid(),
  store              text not null,
  categoria          text not null,
  detalle            text not null,
  monto              numeric(12, 2) not null check (monto > 0),
  fecha              date not null,
  usuario            text,
  usuario_cuenta     text,
  creado_en          timestamptz not null default now(),
  revision           text check (revision in ('aprobado', 'rechazado')),
  revisado_por       text,
  revisado_en        timestamptz,
  revision_motivo    text,
  dashboard_gasto_id text
);
create index if not exists gasto_oficina_cuenta on gasto_oficina (usuario_cuenta, creado_en desc);
create index if not exists gasto_oficina_revisar on gasto_oficina (store, creado_en) where revision is null;
alter table gasto_oficina enable row level security;
