-- Caja F5: la transferencia que se confirma sola (plan del 3-oct-2026). Correr en el proyecto
-- Supabase de ZATTIA, ANTES del push: `lib/caja/enviar.core.js` lee las columnas nuevas.
--
-- Una venta cobrada por Transferencia queda en `esperando_pago` y ⛔ sale a GN hasta que aparece en
-- Mercado Pago un pago aprobado del MONTO EXACTO (`espera_monto`). Ahí pasa a `borrador` y se manda.
--
-- `caja_venta.estado` suma dos:
--   esperando_pago → cobrada por transferencia, el pago todavía ⛔ apareció en MP. ⛔ Está en GN.
--   cancelada      → esperaba la transferencia y la cajera la canceló. ⛔ Sale nunca.
--
-- 🔑 `mp_pago_id` tiene índice ÚNICO: un pago de MP confirma UNA sola venta, aunque dos pantallas
-- crucen a la vez. `mp_cruce` = 'solo' (sin duda) o 'cajera' (lo eligió ella entre los candidatos).

alter table caja_venta drop constraint if exists caja_venta_estado_check;
alter table caja_venta add constraint caja_venta_estado_check
  check (estado in ('borrador', 'enviando', 'en_gn', 'error', 'esperando_pago', 'cancelada'));

alter table caja_venta add column if not exists espera_monto  numeric(12, 2);
alter table caja_venta add column if not exists mp_pago_id    text;
alter table caja_venta add column if not exists mp_pago_en    timestamptz;
alter table caja_venta add column if not exists mp_cruce      text check (mp_cruce in ('solo', 'cajera'));
alter table caja_venta add column if not exists cancelada_por text;

create unique index if not exists uq_caja_venta_mp_pago on caja_venta (mp_pago_id) where mp_pago_id is not null;

-- La cuenta Transferencia (13015) espera el pago. La fila de `caja_config` ya está sembrada (F2) ⇒
-- el `REGLAS_INICIALES` nuevo ⛔ le llega: se marca acá. Otra cuenta, el mismo `jsonb_set`.
update caja_config
   set reglas = jsonb_set(reglas, '{cuentas,13015,esperaPago}', 'true'::jsonb),
       actualizado_en = now(), actualizado_por = 'migrate-caja-transferencia'
 where store = 'zattia' and reglas #> '{cuentas,13015}' is not null;

-- VERIFICACIÓN (tiene que dar: 5 columnas · el índice · esperaPago = true):
--   select column_name from information_schema.columns
--    where table_name = 'caja_venta' and column_name in ('espera_monto','mp_pago_id','mp_pago_en','mp_cruce','cancelada_por');
--   select indexname from pg_indexes where indexname = 'uq_caja_venta_mp_pago';
--   select reglas #> '{cuentas,13015}' from caja_config where store = 'zattia';
