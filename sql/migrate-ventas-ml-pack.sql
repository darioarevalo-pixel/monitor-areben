-- La venta del espejo guarda el PACK de Mercado Libre (sombra de ML del ERP, Bruno 12-oct-2026).
-- Se aplica en las dos bases (`node scripts/aplicar-sql.mjs sql/migrate-ventas-ml-pack.sql ventas`); en Zattia
-- queda siempre en null (no vende por ML), pero el espejo es el mismo código para las dos.
-- ⛔ ANTES de publicar el `scripts/lib/ventas-espejo.mjs` que la escribe (si no, el upsert cae a guardar la
-- venta sin el pack y lo avisa en `problemas[]`: «ventas sin pack de ML»).
--
-- 🔑 POR QUÉ EXISTE. Las ventas de ML de BDI entran a GN por su integración nativa, que deja el pack sólo en
-- el COMENTARIO («Importado de MercadoLibre - Pack: N»), y el espejo ⛔ guarda el comentario. Sin el pack, la
-- sombra (`areben-libro-stock`, `bin/ml.mjs cruce`) no puede cruzar cada pedido de ML con su venta de GN.
-- Texto y ⛔ bigint: el número se compara como texto del otro lado.
--
-- PRECONDICIONES: ninguna. Columna nueva y nula.
--
-- VERIFICACIÓN (después del próximo sync, que relee 90 días):
--   select count(*) filter (where ml_pack is not null) con_pack, count(*) from ventas where channel = 'Mercadolibre' and date_sale >= current_date - 30;
--
-- ROLLBACK:
--   alter table ventas drop column if exists ml_pack;

alter table ventas add column if not exists ml_pack text;
