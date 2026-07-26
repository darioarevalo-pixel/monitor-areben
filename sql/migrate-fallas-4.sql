-- Fallas — nombre de la variante (talle/color) de la unidad. Idempotente.
-- La falla ya guardaba `size_id` para poder descontar el stock en GN, pero no el NOMBRE de la
-- variante, así que la etiqueta no podía decir de qué talle era la prenda: había que ir a
-- buscarla por SKU. El buscador de artículos ya devuelve `size_name`; esto solo lo persiste.
-- Las fallas ya cargadas quedan en null y su etiqueta cae al SKU.
-- Correr en Supabase de BDI y ZATTIA.
alter table fallas_deposito add column if not exists variante text;
