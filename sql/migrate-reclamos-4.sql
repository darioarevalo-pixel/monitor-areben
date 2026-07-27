-- Reclamos, tanda 4: absorber Cambios.
--
-- La sección Cambios pasa a ser una RESOLUCIÓN más del reclamo (`compensacion='otro_producto'`),
-- no una pantalla aparte. Lo que la distingue es que hay diferencia de precio entre lo que
-- devuelve y lo que se lleva.
--
-- Se pudo hacer directo, sin convivencia de dos motores, porque las tablas `cambios` de BDI y
-- ZATTIA estaban **vacías**: cero filas, verificado antes de tocar nada. La tabla vieja se deja
-- donde está (no molesta y es el respaldo si aparece algo).
--
-- Idempotente. Correr con `node scripts/apply-devoluciones.mjs`.

-- Lo que el cliente se lleva en un cambio. De la resta contra lo devuelto sale la diferencia.
alter table devoluciones add column if not exists items_nuevos jsonb not null default '[]'::jsonb;

-- Cómo paga la diferencia: 'tarjeta' | 'transferencia'. Transferencia lleva 10% de descuento,
-- igual que en el motor viejo.
alter table devoluciones add column if not exists forma_pago text;

-- Positivo: lo paga el cliente. Negativo: se le devuelve.
alter table devoluciones add column if not exists diferencia numeric;
alter table devoluciones add column if not exists descuento_manual numeric;

-- La solicitud de etiqueta (EM####) del envío del producto nuevo, como en Cambios.
alter table devoluciones add column if not exists solicitud_envio text;
