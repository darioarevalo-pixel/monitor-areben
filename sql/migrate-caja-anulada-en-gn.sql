-- Caja: la venta que GN ya ⛔ tiene queda ANOTADA en `caja_venta.anulada_en_gn` (pedido del libro de stock,
-- 12-oct-2026, con el OK de Bruno). GN ⛔ anula por API: la venta anulada a mano en la web de GN deja de
-- venir en `ventas/obtener`. Hasta acá el cierre del turno la detectaba (A12) y ⛔ la guardaba.
--
--   anulada_en_gn = { por: 'sync' | 'cierre', en: <ISO>, nota?: texto }   ·   `estado` ⛔ cambia (sigue 'en_gn')
--
-- La marcan el cierre del turno (`api/_caja.js`) y el sync diario (`scripts/sync-diario*.js`), con
-- `lib/caja/anuladas.js`. Lo lee el libro de stock (`areben-libro-stock/lib/fuentes/caja.mjs`).
--
-- BASES: las DOS. La Caja vive en la base de cada marca (V4): Zattia en la suya, BDI en la del monitor.
-- Sin la columna, el cierre y el sync siguen andando y ⛔ anotan nada (lo dicen en el log).
--   node scripts/aplicar-sql.mjs sql/migrate-caja-anulada-en-gn.sql caja_venta
--   (sólo Zattia: SOLO=ZATTIA node scripts/aplicar-sql.mjs sql/migrate-caja-anulada-en-gn.sql caja_venta)
--
-- LAS 7 VENTAS DE PRUEBA del 4 al 6-oct (Zattia): GN ya ⛔ las devuelve, leído el 12-oct contra
-- `ventas/obtener` de sus días. El update toca sólo esos 7 ids y sólo si siguen sin anotar ⇒ en BDI ⛔
-- toca nada (los ids son de Zattia) y correrlo dos veces ⛔ las vuelve a anotar.
--
-- VERIFICACIÓN (en ZATTIA tiene que dar la columna jsonb, el check, y las 7 filas con `por = sync`):
--   select column_name, data_type from information_schema.columns where table_name = 'caja_venta' and column_name = 'anulada_en_gn';
--   select conname from pg_constraint where conname = 'caja_venta_anulada_en_gn_check';
--   select gn_number, estado, anulada_en_gn from caja_venta where anulada_en_gn is not null order by gn_number;

alter table caja_venta add column if not exists anulada_en_gn jsonb;

alter table caja_venta drop constraint if exists caja_venta_anulada_en_gn_check;
alter table caja_venta add constraint caja_venta_anulada_en_gn_check check (
  anulada_en_gn is null
  or (anulada_en_gn ->> 'por' in ('sync', 'cierre') and (anulada_en_gn ->> 'en') is not null)
);

update caja_venta
   set anulada_en_gn = jsonb_build_object(
         'por', 'sync',
         'en', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'nota', 'Venta de prueba (4 al 6-oct): Gestión Nube ya no la devuelve (leído el 12-oct)')
 where anulada_en_gn is null
   and estado = 'en_gn'
   and id in (
     '0b186752-896a-472a-88a2-d6323a4f0024',  -- #30048
     'c03f7806-129d-4de6-82c4-cec39bbf6db5',  -- #30049
     '1c8204e2-4eaa-4612-90e9-041f685a6be2',  -- #30050
     '38ec6f7e-b3bd-482c-ab2f-d82cd3caebb2',  -- #30051
     '95bcf9a7-0143-48a8-99d3-7c57b28dc3ea',  -- #30074
     '2cfa74ae-f2bd-44d8-b64a-55a9bc126be5',  -- #30075
     '1b7ee97b-adb9-447f-b1d5-0fbe3be6a10f'   -- #30106
   );
