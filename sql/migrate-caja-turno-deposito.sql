-- La CAJA DEL EVENTO (Bruno, 29-oct-2026): un turno por PUESTO, el local y el evento. Correr en el proyecto Supabase de
-- ZATTIA, ANTES del push (el código lee la columna; sin ella el local sigue como antes y el evento ⛔ existe).
--
-- 🔑 La plata del evento ⛔ se mezcla con el cierre del local (Bruno: «separada, otro turno»): el turno del evento tiene
-- su fondo, sus ventas y su cierre. La venta de un turno del evento descuenta del depósito Evento del ERP (motor sql/058),
-- ⛔ del local. `api/_caja.js` lo lee por `turno_id` (`depositoDeVenta`): `caja_venta` ⛔ cambia.
--
-- 🔴 UN TURNO ABIERTO POR MARCA Y PUESTO: el índice único parcial pasa de `(store)` a `(store, deposito)`. Los turnos que
-- ya existen quedan `local` (default) ⇒ el índice nuevo ⛔ choca con nada.
--
-- ROLLBACK (sin turnos del evento abiertos):
--   drop index if exists uq_caja_turno_abierto_puesto;
--   create unique index if not exists uq_caja_turno_abierto on caja_turno (store) where cerrado_en is null;
--   alter table caja_turno drop column deposito;
--
-- VERIFICACIÓN (tiene que dar: la columna con default 'local' · el índice nuevo · ⛔ el viejo · 0 filas sin depósito):
--   select column_name, column_default from information_schema.columns where table_name = 'caja_turno' and column_name = 'deposito';
--   select indexname from pg_indexes where tablename = 'caja_turno' and indexname like 'uq_caja_turno_abierto%';
--   select count(*) from caja_turno where deposito is null;
alter table caja_turno add column if not exists deposito text not null default 'local'
  check (deposito in ('local', 'evento'));

create unique index if not exists uq_caja_turno_abierto_puesto on caja_turno (store, deposito) where cerrado_en is null;
drop index if exists uq_caja_turno_abierto;
