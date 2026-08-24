-- Reclamos: apagar los pendientes que nunca correspondieron.
--
-- # Qué arregla
--
-- Hasta agosto de 2026 los pendientes de un reclamo se derivaban con dos condiciones escritas a mano
-- adentro de `decidir` (`api/_reclamos.js`), una por columna. Tres de las siete resoluciones no
-- estaban en esas listas, así que al decidir se encendían pendientes que **no corresponden**:
--
--   reenvio  → "devolver la plata" + "anular la venta en GN"   ← ninguna de las dos: se le manda lo
--                                                                que faltaba y la compra sigue en pie
--   cupon    → "devolver la plata" + "anular la venta en GN"   ← tampoco: no sale plata hoy
--   ninguna  → "anular la venta en GN"                         ← "no se compensa" no es "se deshace
--                                                                la compra"
--
-- La derivación ya se arregló en `lib/reclamos/efectos.core.js`, pero eso vale para lo que se decide
-- de ahora en más. **Las filas ya guardadas siguen con sus pendientes imposibles**: reclamos que no
-- pueden cerrarse nunca, en la columna que la gente después aprende a no mirar. Esto las apaga.
--
-- # Qué NO toca
--
-- Sólo pasa de 'pendiente' a 'no_aplica', y sólo en esas tres resoluciones. Un pendiente que alguien
-- ya tildó ('hecho') queda como está: si se devolvió plata de verdad, el registro de que se devolvió
-- no se borra — se corrige a mano si hiciera falta, con la persona que lo tildó delante.
--
-- Idempotente: correrlo dos veces no cambia nada la segunda.
-- 🔴 **El bloque 2 (la columna nueva) va ANTES de deployar el código.** El 1 puede ir después.
-- ⚠️ Correr en el Supabase de BDI **y** en el de ZATTIA.

-- # 1 · Apagar los pendientes que nunca correspondieron

-- Reenvío y cupón: no sale plata de la caja.
update devoluciones
   set reintegro_estado = 'no_aplica'
 where compensacion in ('reenvio', 'cupon')
   and reintegro_estado = 'pendiente';

-- Reenvío, cupón y "sin compensación": la venta original no se anula. El cliente se queda con lo
-- que compró.
update devoluciones
   set stock_estado = 'no_aplica'
 where compensacion in ('reenvio', 'cupon', 'ninguna')
   and stock_estado = 'pendiente';

-- # 2 · La columna que faltaba: lo que sale HACIA el cliente
--
-- Tres resoluciones le mandan algo al cliente —el cambio, la reposición y el reenvío— y **cerrar un
-- reclamo no miraba el envío en ninguna de las tres**. En el cambio existe `solicitud_envio`, pero
-- eso es el requisito para *facturar*: se puede facturar y no despachar nunca. En la reposición y el
-- reenvío no había ni eso — el envío era un cartel en pantalla que nada verificaba.
--
-- Nace en 'no_aplica' para todas las filas existentes: un reclamo viejo ya cerrado no tiene por qué
-- reabrirse con un pendiente nuevo. Lo enciende `pendientesDe()` de ahora en más.
--
-- 🔴 **ESTA PARTE VA ANTES DE DEPLOYAR.** El código escribe `envio_nuevo_estado` al decidir; si la
-- columna no existe, el `update` de `decidir` falla entero y no se puede decidir ningún reclamo.

alter table devoluciones add column if not exists envio_nuevo_estado text not null default 'no_aplica';

-- Cuántas quedaron tocadas, para poder decirlo con un número y no de memoria.
-- (Corre después de los update: si dio 0 en ambas, no había filas viejas con el problema.)
select compensacion,
       count(*) filter (where reintegro_estado = 'no_aplica') as sin_reintegro,
       count(*) filter (where stock_estado    = 'no_aplica') as sin_anulacion,
       count(*)                                              as total
  from devoluciones
 where compensacion in ('reenvio', 'cupon', 'ninguna')
 group by compensacion
 order by compensacion;
