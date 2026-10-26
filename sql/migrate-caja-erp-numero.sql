-- Caja · el número de la venta que el ERP le dio al ticket de STUNNED (Bruno, 26-oct: el cartel «Última venta» decía
-- «Venta #null · en Gestión Nube»). `gn_number` ⛔ se reusa: mezclaría los números de los dos sistemas y rompería las
-- conciliaciones con GN. Idempotente. Lo corre Bruno (SQL crudo), EN LAS DOS BASES (BDI y Zattia), ANTES de publicar el código.
-- ROLLBACK: alter table caja_venta drop column erp_numero;
alter table caja_venta add column if not exists erp_numero integer;
