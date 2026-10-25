-- La NC pasa de «una por VENTA» a «una por COMPROBANTE que acredita» (25-oct, sesión A).
-- Antes: `facturas_venta_nc_uq` (ambiente, marca, venta_id) para tipos 3/8 ⇒ una venta con la NC de su factura ⛔ podía tener la NC
-- de una NOTA DE DÉBITO (probado en producción 25-oct: la ND B #1 salió con CAE y su NC rebotó con «duplicate key … facturas_venta_nc_uq»).
-- Ahora: una NC por (ambiente, marca, venta, comprobante asociado). Para una factura es lo MISMO que antes (una factura tiene una sola
-- venta y la NC se asocia a ella; una segunda sigue chocando); sólo habilita la NC de una ND.
-- Aplicada con el usuario dueño (el mismo de `bin/migrar.mjs` del motor), en una transacción. Idempotente.
--
-- VERIFICACIÓN:  select indexdef from pg_indexes where indexname = 'facturas_venta_nc_uq';
-- ROLLBACK (sólo si ninguna venta tiene dos NC):
--   drop index facturas_venta_nc_uq;
--   create unique index facturas_venta_nc_uq on facturas (ambiente, marca, venta_id) where tipo in (3, 8) and estado <> 'rechazada';

drop index if exists facturas_venta_nc_uq;
create unique index facturas_venta_nc_uq on facturas (ambiente, marca, venta_id, coalesce(asociado_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where tipo in (3, 8) and estado <> 'rechazada';
