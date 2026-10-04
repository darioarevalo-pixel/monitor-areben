-- Caja v2, W3: el TURNO PROPIO de la Caja (Bruno, 4-oct-2026). Correr en el proyecto Supabase de
-- ZATTIA, ANTES del push: sin estas tablas la Caja ⛔ cobra (pide abrir el turno y ⛔ puede).
--
-- 🔑 EL TURNO VIVE EN LA CAJA, ⛔ en Gestión Nube: la API de GN ⛔ tiene turnos (medido el 4-oct) y,
-- si todos los cobros pasan por la Caja, la Caja ordena los pagos del turno. El turno de GN se deja
-- de usar. Un día puede tener DOS turnos (mañana y tarde): se cierra uno y se abre el otro.
--
-- `caja_turno`: se abre con el FONDO (el efectivo con que arranca) y se cierra con el EFECTIVO
-- CONTADO. Al cerrar se guarda la foto (`esperado`, `resumen`): lo que la Caja calculó en ese
-- momento ⛔ cambia si después se toca una venta.
-- 🔴 UN SOLO TURNO ABIERTO POR MARCA: el índice único parcial lo frena aunque dos pantallas abran a la vez.
--
-- `caja_turno_mov`: las salidas de efectivo del turno (un gasto, un retiro para gerencia). Restan del
-- efectivo esperado. ⛔ Se borran: un error se corrige con otro movimiento.
--
-- `caja_venta.turno_id`: el turno donde se COBRÓ (⛔ donde llegó a GN). Las ventas de antes quedan en null.
--
-- Las dos con RLS y SIN políticas: sólo las toca el handler (`api/_caja.js`) con la service key.
--
-- VERIFICACIÓN (tiene que dar: las 2 tablas con rowsecurity = true · el índice · la columna):
--   select tablename, rowsecurity from pg_tables where tablename in ('caja_turno', 'caja_turno_mov') order by 1;
--   select indexname from pg_indexes where indexname = 'uq_caja_turno_abierto';
--   select column_name from information_schema.columns where table_name = 'caja_venta' and column_name = 'turno_id';

create table if not exists caja_turno (
  id             uuid primary key default gen_random_uuid(),
  store          text not null default 'zattia',
  abierto_en     timestamptz not null default now(),
  abierto_por    text,
  fondo          numeric(12, 2) not null check (fondo >= 0),
  cerrado_en     timestamptz,
  cerrado_por    text,
  contado        numeric(12, 2) check (contado >= 0),    -- el efectivo que contó la cajera al cerrar
  esperado       numeric(12, 2),                         -- fondo + efectivo cobrado − salidas, al cerrar
  resumen        jsonb,                                  -- la foto del cierre: por cuenta, ventas, salidas
  nota           text
);
create unique index if not exists uq_caja_turno_abierto on caja_turno (store) where cerrado_en is null;
create index if not exists idx_caja_turno_fecha on caja_turno (store, abierto_en desc);
alter table caja_turno enable row level security;

create table if not exists caja_turno_mov (
  id         uuid primary key default gen_random_uuid(),
  turno_id   uuid not null references caja_turno (id),
  tipo       text not null check (tipo in ('salida')),
  monto      numeric(12, 2) not null check (monto > 0),
  motivo     text not null,
  usuario    text,
  creado_en  timestamptz not null default now()
);
create index if not exists idx_caja_turno_mov on caja_turno_mov (turno_id);
alter table caja_turno_mov enable row level security;

alter table caja_venta add column if not exists turno_id uuid references caja_turno (id);
create index if not exists idx_caja_venta_turno on caja_venta (turno_id) where turno_id is not null;
