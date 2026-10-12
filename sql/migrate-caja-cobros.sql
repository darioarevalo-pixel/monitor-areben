-- Caja: la transferencia que ⛔ llega justa (Bruno, 12-oct, segunda tanda del POS).
-- Correr en el proyecto Supabase de ZATTIA, ANTES del push: el handler nuevo escribe estas columnas y
-- esta tabla; sin ellas, el cruce de la transferencia falla.
--   SOLO=ZATTIA node scripts/aplicar-sql.mjs sql/migrate-caja-cobros.sql caja_venta_mp
--
-- TOLERANCIA — el redondeo: un pago de hasta $100 de más o de menos confirma la venta. `mp_diferencia`
-- = lo que llegó menos lo que se esperaba (pesos; negativo = transfirió de menos). GN recibe el TOTAL.
--
-- VARIOS COBROS (13.300 + 100): la cajera suma pagos de MP hasta completar el total. `caja_venta_mp` es
-- el CANDADO: un pago de MP confirma UNA venta (la PK), como el índice único de `mp_pago_id` para el
-- cruce de un solo pago. `mp_pago_id` de la venta queda con el primero; la lista va en `confirmacion`.
-- `mp_cruce = 'varios'`.
--
-- OTRA CUENTA NUESTRA: transfirió a Areben Comercial, Darío o Bruno (⛔ la cuenta de MP que se mira).
-- La confirma la cajera con titular y banco (`confirmacion`) y sale un mail a Darío y Bruno.
-- `mp_cruce = 'otra_cuenta'`.
--
-- CAMBIAR FORMA DE PAGO: la venta esperando se cancela y el carrito vuelve al POS. `cancelada_motivo`
-- = 'cambio_pago' (⛔ «no llegó»).
--
-- VERIFICACIÓN (tiene que dar: las 2 columnas · la tabla · el check con los 5 valores):
--   select column_name from information_schema.columns where table_name = 'caja_venta' and column_name in ('mp_diferencia', 'cancelada_motivo') order by 1;
--   select column_name from information_schema.columns where table_name = 'caja_venta_mp' order by 1;
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'caja_venta_mp_cruce_check';

alter table caja_venta add column if not exists mp_diferencia numeric;
alter table caja_venta add column if not exists cancelada_motivo text;

alter table caja_venta drop constraint if exists caja_venta_mp_cruce_check;
alter table caja_venta add constraint caja_venta_mp_cruce_check
  check (mp_cruce in ('solo', 'cajera', 'admin', 'varios', 'otra_cuenta'));

create table if not exists caja_venta_mp (
  mp_pago_id text primary key,
  venta_id   uuid not null references caja_venta (id) on delete cascade,
  store      text not null,
  monto      numeric not null,
  pago_en    timestamptz,
  creado_en  timestamptz not null default now()
);
create index if not exists caja_venta_mp_venta on caja_venta_mp (venta_id);
create index if not exists caja_venta_mp_creado on caja_venta_mp (store, creado_en);

-- Como el resto de las tablas de la Caja: sólo el servidor (service role) la lee y la escribe.
alter table caja_venta_mp enable row level security;
