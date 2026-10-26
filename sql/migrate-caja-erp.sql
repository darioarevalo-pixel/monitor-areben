-- Caja · el ticket de STUNNED va al ERP, ⛔ a GN (Bruno, 26-oct). Idempotente. Lo corre Bruno (SQL crudo).
--   1) `destino`: a dónde va la venta ('gn' como siempre, 'erp' para Stunned). Es lo que impide que un reintento mande
--      a GN una venta del ERP: el código lo mira en `enviarVenta` y en el despacho.
--   2) estado `en_erp`: la venta que el ERP ya tiene (el equivalente de `en_gn`).
--   3) `anulada`: la venta del ERP anulada ({ por, en, motivo }); el cierre de caja no la suma (hito «anuladas persistidas»).
-- ROLLBACK: alter table caja_venta drop column destino, drop column anulada; (y volver el check sin 'en_erp' si no hay filas en_erp).
alter table caja_venta add column if not exists destino text not null default 'gn' check (destino in ('gn', 'erp'));
alter table caja_venta add column if not exists anulada jsonb;
alter table caja_venta drop constraint if exists caja_venta_estado_check;
alter table caja_venta add constraint caja_venta_estado_check
  check (estado in ('borrador', 'enviando', 'en_gn', 'en_erp', 'error', 'esperando_pago', 'cancelada', 'descartada'));
