-- La venta del espejo guarda la HORA, el pedido de Tienda Nube y la marca de quién la creó.
-- Se aplica en las dos bases (`node scripts/aplicar-sql.mjs sql/migrate-ventas-gn-hora.sql ventas`)
-- ⛔ ANTES de publicar el `scripts/lib/ventas-espejo.mjs` que las escribe (si no, el upsert de ventas
-- cae a guardarlas sin estas columnas y lo avisa en `problemas[]`).
--
-- 🔑 POR QUÉ EXISTE (libro de stock en sombra, Bruno 12-oct-2026). `date_sale` es un `date`: sin hora
-- no se puede saber si una venta fue antes o después de un conteo o de la foto del día (medido: 29
-- pares de conteo en BDI y 31 en Zattia quedan ambiguos por eso). GN SÍ la manda (`created_at`),
-- junto con `tn_order` (el número del pedido de TN: cruce exacto con Tienda Nube), `integration_id`
-- (lo pone el monitor al crear la venta: cruce exacto con Caja, fallas, canjes…), `integration_source`
-- y `store_id` (el depósito por id, sin depender del nombre con espacios). El mapeo los tiraba.
--
-- PRECONDICIONES: ninguna. Columnas nuevas y nulas: ninguna lectura existente las ve.
--
-- VERIFICACIÓN (después del próximo sync, que relee 90 días):
--   select count(*) filter (where gn_created_at is not null) con_hora, count(*) from ventas where date_sale >= current_date - 7;
--
-- ROLLBACK:
--   alter table ventas drop column if exists gn_created_at, drop column if exists tn_order,
--     drop column if exists integration_id, drop column if exists integration_source, drop column if exists store_id;

alter table ventas add column if not exists gn_created_at      timestamptz;
alter table ventas add column if not exists tn_order           text;
alter table ventas add column if not exists integration_id     text;
alter table ventas add column if not exists integration_source text;
alter table ventas add column if not exists store_id           integer;
