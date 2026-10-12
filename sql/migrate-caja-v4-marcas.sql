-- Caja V4 — las formas de pago son DATO DE CADA TIENDA (Bruno, 12-oct-2026). Base de ZATTIA.
--
-- Hasta la V4 había tres cosas de Zattia FIJAS en el código; ahora salen de `caja_config.reglas` de cada
-- marca (BDI es otra empresa en GN: otros ids). La fila de Zattia ya está sembrada ⇒ se le suman acá:
-- - `medios.tarjetaOferta`: «Feria TC» (25869), la cuenta de débito/crédito en oferta con recargo
--   (era `CUENTA_OFERTA_TARJETA` en lib/caja/core.core.js).
-- - `titulares`: la cuenta de GN de «Transfirió a otra cuenta» (era `TITULARES` en
--   lib/caja/otra-cuenta.core.js): Areben Comercial ⇒ 13015, Darío o Bruno ⇒ 20595.
-- - `verificarTransferencia`: true (lo de siempre: la transferencia espera el pago en Mercado Pago).
-- ⛔ Pisa nada ya cargado: cada clave sólo si falta.
--
-- 🔴 Hay que correrlo ANTES del push: sin `tarjetaOferta` la oferta con tarjeta ⛔ se cobra, y sin
-- `titulares` ⛔ aparece «Transfirió a otra cuenta». Correr con `SOLO=ZATTIA node scripts/aplicar-sql.mjs`.
-- BDI ⛔ necesita esto: su fila nace con `REGLAS_INICIALES_BDI` (lib/caja/marcas.core.js) la primera vez
-- que se abre la Caja de BDI.

update caja_config
   set reglas = jsonb_set(
                  reglas,
                  '{medios}',
                  jsonb_build_object('tarjetaOferta', 25869) || (reglas -> 'medios')
                )
                || jsonb_build_object(
                  'titulares', coalesce(reglas -> 'titulares', '{"areben": 13015, "dario": 20595, "bruno": 20595}'::jsonb),
                  'verificarTransferencia', coalesce(reglas -> 'verificarTransferencia', 'true'::jsonb)
                ),
       actualizado_en = now(), actualizado_por = 'migrate-caja-v4-marcas'
 where store = 'zattia' and reglas ? 'medios';

-- VERIFICACIÓN (tiene que dar: 25869 · {"areben": 13015, "bruno": 20595, "dario": 20595} · true):
--   select reglas #> '{medios,tarjetaOferta}', reglas -> 'titulares', reglas -> 'verificarTransferencia'
--     from caja_config where store = 'zattia';
