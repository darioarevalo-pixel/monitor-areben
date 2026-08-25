-- Reclamos: la columna del ESCENARIO — el nivel del medio del chasis.
--
-- # Qué guarda
--
-- Cuál de las respuestas cerradas del caso se encontró. Hasta el 25-ago-2026 se iba del caso a la
-- decisión de una sola vez, sin dejar registrado qué se había encontrado — y en tres casos eso es
-- justamente lo que determina la plata:
--
--   no_como_publicado  → sólo si la diferencia es OBJETIVA el error es nuestro (y va el envío de ida)
--   demora             → sólo si quedó parada en preparación la demora es nuestra (y va un cupón)
--   arrepentimiento    → si el pedido todavía no salió es una CANCELACIÓN: no hay producto en juego
--
-- La lista de escenarios válidos vive en `lib/reclamos/casos.core.js` y la valida el handler contra
-- el caso de la fila. ⛔ No hay `check` en la base a propósito: la lista se va a mover más que la
-- tabla, y un `check` desactualizado rechaza filas buenas en producción sin que nadie sepa por qué.
--
-- # Qué pasa con las filas viejas
--
-- Quedan en NULL, y eso es correcto: nadie miró ese nivel cuando se resolvieron. Con el escenario
-- nulo el perfil del caso cae en su default, que en los tres casos de arriba es **el que NO regala
-- plata**. Ninguna fila cambia de comportamiento por esta migración.
--
-- Idempotente. ⚠️ Correr en el Supabase de BDI **y** en el de ZATTIA.
-- 🔴 **VA ANTES DE DEPLOYAR**: el código escribe `escenario` al decidir, y sin la columna el
-- `update` de `decidir` falla entero — o sea que no se puede decidir NINGÚN reclamo.

alter table devoluciones add column if not exists escenario text;

-- Cuántas filas hay y cuántas tienen escenario. Recién sirve después de usarlo un tiempo: el día
-- de la migración son todas nulas por definición.
select count(*)::int                                          as reclamos,
       count(*) filter (where escenario is not null)::int      as con_escenario
  from devoluciones;
