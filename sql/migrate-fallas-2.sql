-- Fase A del rediseño Post-venta: extiende fallas_deposito para el flujo por roles.
-- Local carga (estado 'cargada', ubicacion 'local' con el motivo); Administración recibe
-- (ubicacion 'deposito', estado 'recibida') y confirma (estado 'confirmada' + genera venta en GN
-- que descuenta la unidad + código de barras interno). Idempotente: se puede correr varias veces.
-- Correr en el Supabase de BDI y de ZATTIA (node scripts/apply-fallas.mjs).

alter table fallas_deposito add column if not exists product_id        text;  -- variante GN (para la venta)
alter table fallas_deposito add column if not exists size_id           text;
alter table fallas_deposito add column if not exists barcode           text;  -- código interno generado
alter table fallas_deposito add column if not exists ubicacion         text not null default 'local'; -- 'local' | 'deposito'
alter table fallas_deposito add column if not exists gn_integration_id text;  -- ref anti-duplicado de la venta GN
alter table fallas_deposito add column if not exists gn_venta_id       text;  -- id de la venta creada en GN
alter table fallas_deposito add column if not exists gn_venta_number   text;

create index if not exists idx_fallas_deposito_barcode on fallas_deposito (store, barcode);
