-- Caja — formas de pago escuetas (Bruno, 4-oct-2026). Base de ZATTIA.
--
-- La cajera ve sólo Efectivo · Transferencia · Tarjeta de débito · Tarjeta de crédito; la cuenta de
-- GN que va detrás es INTERNA y la resuelve `cuentaDeMedio` (lib/caja/core.core.js) con `medios`.
-- La fila de `caja_config` ya está sembrada (F2) ⇒ el `REGLAS_INICIALES` nuevo ⛔ le llega: se suma acá.
--
-- - Cuentas nuevas a precio de lista (0 %), ids leídos de `GET /ventas/referencias` el 4-oct:
--   25188 «Credito - Nro 1 o 13» · 25173 «+$250.000 (6 cuotas sin interes)».
-- - `transferenciaA`: a dónde van las transferencias (13015 Areben Comercial | 20595 Caja Gerencia).
--   Lo cambia un admin desde la Caja. `feria`: modo feria, apagado.
-- ⛔ Pisa una regla ya cargada: `||` agrega claves, y `medios`/`transferenciaA`/`feria` sólo si faltan.
--
-- Hay que correrlo ANTES del push: sin `medios` la pantalla nueva ⛔ cobra (lo dice en rojo).

update caja_config
   set reglas = jsonb_set(
                  reglas,
                  '{cuentas}',
                  '{"25188": {"nombre": "Credito - Nro 1 o 13", "descuento": 0},
                    "25173": {"nombre": "6 cuotas sin interés", "descuento": 0}}'::jsonb || (reglas -> 'cuentas')
                )
                || jsonb_build_object(
                  'medios', coalesce(reglas -> 'medios', '{
                    "efectivo": {"normal": 12921, "feria": 25867},
                    "transferencia": {"opciones": [13015, 20595], "feria": 25868},
                    "debito": {"normal": 20196},
                    "credito": {"normal": 25188, "promo": 25172, "seisCuotas": 25173, "minSeisCuotas": 250000}
                  }'::jsonb),
                  'transferenciaA', coalesce(reglas -> 'transferenciaA', '13015'::jsonb),
                  'feria', coalesce(reglas -> 'feria', 'false'::jsonb)
                ),
       actualizado_en = now(), actualizado_por = 'migrate-caja-medios'
 where store = 'zattia';

-- VERIFICACIÓN (tiene que dar: las 2 cuentas nuevas · medios con 4 claves · 13015 · false):
--   select reglas #> '{cuentas,25188}', reglas #> '{cuentas,25173}',
--          (select count(*) from jsonb_object_keys(reglas -> 'medios')),
--          reglas -> 'transferenciaA', reglas -> 'feria'
--     from caja_config where store = 'zattia';
