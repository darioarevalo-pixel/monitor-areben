-- Devoluciones, tanda 2: el envío de vuelta como se usa de verdad.
--
-- Lo que faltaba, y lo marcó Bruno probando las pantallas:
--   1. **Cómo vuelve la prenda.** No es lo mismo una etiqueta de Andreani que el cliente
--      acercándose al local: la segunda no tiene etiqueta, ni costo, ni código que seguir.
--      Sin este campo, la pantalla asumía siempre que había un envío en curso.
--   2. **El código de seguimiento de la vuelta ya existía** (`seguimiento_vuelta`) pero ninguna
--      pantalla lo escribía. Esta tanda le da UI; la columna no cambia.
--   3. **El segundo envío.** En la falla que se resuelve mandando otra unidad hay DOS envíos —el
--      que vuelve con la fallada y el que va con el reemplazo—, los dos a nuestro cargo. La tabla
--      solo contemplaba uno, así que "lo que costó el caso" quedaba corto.
--
-- Idempotente: se puede correr de nuevo sin efecto. Correr en el Supabase de BDI y de ZATTIA con
-- `node scripts/apply-devoluciones.mjs`.

-- Cómo vuelve: 'correo' | 'andreani' | 'cadete' | 'presencial'. Null mientras no se decidió, o
-- cuando la prenda no vuelve (se la queda el cliente / nunca salió).
alter table devoluciones add column if not exists via_retorno text;

-- El envío del REEMPLAZO (el que va), a nuestro cargo igual que el de vuelta.
alter table devoluciones add column if not exists envio_ida_costo numeric;
alter table devoluciones add column if not exists seguimiento_ida text;

-- La venta técnica que descuenta del stock la unidad de reemplazo. Sin esto, esa prenda sale del
-- depósito y no queda registrada en ningún lado: el stock queda de más hasta el próximo conteo.
alter table devoluciones add column if not exists gn_venta_reemplazo_id text;
alter table devoluciones add column if not exists gn_venta_reemplazo_number text;
