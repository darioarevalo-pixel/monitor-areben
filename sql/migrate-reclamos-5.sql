-- Reclamos, tanda 5: devolverle a Cambios su POS de venta.
--
-- La tanda 4 absorbió Cambios trayéndose SOLO la aritmética de la diferencia. Lo que quedó afuera
-- fue la pantalla de venta —el cobro en dos tiempos y la venta real en Gestión Nube—, que era lo
-- que hacía útil a la sección. Esta tanda trae las columnas que faltan para que ese flujo viva
-- sobre `devoluciones`.
--
-- El modelo no cambia: un cambio sigue siendo un reclamo con `compensacion='otro_producto'`. Lo
-- que se agrega es el estado de la OPERACIÓN de mostrador, que hasta ahora no se podía guardar:
-- si está cobrado, si la diferencia quedó a cobrar, quién paga el envío, y si el producto que
-- volvió ya se reingresó a mano en GN.
--
-- Idempotente. Correr con `node scripts/apply-devoluciones.mjs`.

-- El cobro de la diferencia, en dos tiempos: primero se marca pagado (el cliente puso la plata),
-- recién después se genera la venta en GN. Sin este flag el cambio se armaba y se cobraba en el
-- mismo gesto, que es justo lo que no pasa en el mostrador.
alter table devoluciones add column if not exists pagado boolean not null default false;

-- 'no_aplica' | 'pendiente' | 'cobrado'. Distinto de `pagado`: `pagado` es el gate para generar la
-- venta; esto es el pendiente de caja cuando la diferencia quedó a cobrar y todavía no entró.
alter table devoluciones add column if not exists cobro_estado text;

-- Quién paga el envío del cambio: 'cliente' | 'nosotros'. El envío NO viaja a la venta de GN
-- (decisión de Bruno en el motor viejo): queda solo acá, pero cambia el total a cobrar.
alter table devoluciones add column if not exists envio_paga text;

-- El producto que el cliente devuelve tiene que volver al stock A MANO en Gestión Nube: GN no
-- acepta una venta negativa por API. Es un pendiente PROPIO del cambio y no hay que confundirlo
-- con `stock_estado`, que traza la ANULACIÓN de la venta original — en un cambio esa venta no se
-- anula nunca, porque el cliente se queda con la compra y solo cambia el artículo.
alter table devoluciones add column if not exists reingreso_estado text;

-- Los reclamos que ya existen no son cambios, así que ninguno de los dos pendientes les aplica.
-- Sin esto quedarían en NULL y las pantallas tendrían que distinguir "no aplica" de "sin definir".
update devoluciones set cobro_estado = 'no_aplica' where cobro_estado is null;
update devoluciones set reingreso_estado = 'no_aplica' where reingreso_estado is null;
