-- Reclamos: EL REGISTRO DE LA OFERTA DE RETENCIÓN — qué se ofreció y qué contestó.
--
-- # Qué guarda
--
--   retencion_monto     cuánto se le ofreció para que se lo quede
--   retencion_respuesta 'acepto' | 'rechazo'
--
-- Hasta el 25-ago-2026 de la retención existía **sólo el permiso**: el perfil del caso dice si se
-- le puede ofrecer, y de la oferta en sí no quedaba nada. La aceptada se podía adivinar por la
-- resolución (termina en `plata_parcial` o en `cupon`); **la rechazada no dejaba ningún rastro**.
-- Con la mitad de los casos invisible no se puede decir cuántas veces funciona la retención, y sin
-- ese número negociar un cupón se vuelve una forma de pagar menos sin que nadie se entere.
--
-- ⚠️ Las dos columnas van **juntas o ninguna**: media oferta —un monto sin respuesta, o una
-- respuesta sin monto— es exactamente lo que después hace que la cuenta mienta. Lo valida
-- `registroDeRetencion` en `lib/reclamos/casos.core.js`. ⛔ No hay `check` en la base a propósito,
-- por lo mismo que el escenario: la regla se va a mover más que la tabla.
--
-- # Qué pasa con las filas viejas
--
-- Quedan las dos en NULL, y **NULL ⛔ no significa "no se le ofreció": significa SIN REGISTRAR.**
-- Medido antes de correr esto: BDI tiene 10 reclamos, los 10 sin decidir, y ZATTIA 0 — así que no
-- hay ninguna oferta perdida, sólo casos que todavía no llegaron a la decisión. Contar los nulos
-- como rechazos sería inventar negativas.
--
-- Idempotente. ⚠️ Correr en el Supabase de BDI **y** en el de ZATTIA.
-- 🔴 **VA ANTES DE DEPLOYAR**: `decidir` escribe estas columnas, y sin ellas el `update` falla
-- entero — o sea que no se puede decidir NINGÚN reclamo.

alter table devoluciones add column if not exists retencion_respuesta text;
alter table devoluciones add column if not exists retencion_monto numeric;

-- Cuántas ofertas hay registradas y cómo salieron. El día de la migración son todas nulas por
-- definición; recién sirve después de usarlo un tiempo.
select count(*)::int                                                as reclamos,
       count(*) filter (where retencion_respuesta = 'acepto')::int  as aceptadas,
       count(*) filter (where retencion_respuesta = 'rechazo')::int as rechazadas
  from devoluciones;

-- ── El cupón deja de ser un cartel y pasa a ser un pendiente ────────────────────
--
-- `cupon_codigo` se tipea a mano y **nada avisaba si el cupón nunca se creó en la tienda**: el
-- reclamo se cerraba "con cupón" y el cliente se enteraba en la próxima compra de que el código no
-- existe. Ahora la resolución `cupon` deja `cupon_estado='pendiente'` (`EFECTOS_RESOLUCION`), y
-- cerrar lo pide (`faltantesParaCerrar`).
--
-- Nace en 'no_aplica' para todas las filas existentes: un reclamo viejo ⛔ no se reabre con un
-- pendiente nuevo. Medido antes: BDI y ZATTIA tienen **0 reclamos con resolución `cupon`** y 0 con
-- código cargado, así que no hay ninguna promesa vieja que rescatar.
--
-- 🔴 **VA ANTES DE DEPLOYAR**, como la de arriba: `decidir` escribe esta columna.

alter table devoluciones add column if not exists cupon_estado text not null default 'no_aplica';
