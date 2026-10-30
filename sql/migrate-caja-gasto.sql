-- La CAJA CHICA (Bruno, 30-oct): un gasto pagado con el efectivo de la caja es una SALIDA con categoría (`lib/caja/gasto.core.js`).
-- Resta del esperado como cualquier salida; la categoría sólo dice QUÉ fue. Las claves las valida el handler (⛔ check:
-- sumar una categoría ⛔ pide migración).
-- Correr en ZATTIA y en BDI, ANTES del push (sin la columna, «Cargar un gasto» dice que falta preparar la base):
--   node scripts/aplicar-sql.mjs sql/migrate-caja-gasto.sql caja_turno_mov
--
-- VERIFICACIÓN (tiene que dar: categoria · text):
--   select column_name, data_type from information_schema.columns where table_name = 'caja_turno_mov' and column_name = 'categoria';

alter table caja_turno_mov add column if not exists categoria text;
create index if not exists caja_turno_mov_gasto on caja_turno_mov (usuario_cuenta, creado_en desc) where categoria is not null;
