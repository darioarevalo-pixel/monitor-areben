-- Las cuatro columnas que le faltan al espejo de ventas para poder calcular la CONTRIBUCIÓN.
--
-- ## Por qué existen
--
-- Norte (Dirección) muestra por dónde sale el stock, y hasta hoy lo mostraba **en unidades**: el
-- ETL trae cantidades y no precios, así que la plata que deja cada canal no se podía calcular. El
-- camino elegido el 18-ago-2026 fue **no inventar una cascada nueva**: el dashboard ya tiene una,
-- verificada contra el P&L real de Gestión Nube, y lo que faltaba era el dato para aplicarla.
--
--     ventas − IVA (sólo si la cuenta de cobro es de Areben) + envíos − descuentos = netas
--     netas − CMV − comisiones − costo de envíos                                    = contribución
--
-- ⇒ hacen falta cuatro datos que el espejo no guardaba y que **ya baja todos los días**: el sync
-- pide `ventas/obtener?include_details=1`, el mismo endpoint que usa el dashboard, y el mapeo de
-- `scripts/lib/ventas-espejo.mjs` simplemente tiraba estos campos.
--
-- | columna           | para qué |
-- |-------------------|----------|
-- | `account_display` | la cuenta de cobro. **Es lo único que decide si la venta lleva IVA o no** |
-- | `discount`        | el descuento de la venta, que va afuera de las netas |
-- | `shipping_cost`   | el envío cobrado al cliente, que entra como ingreso |
-- | `total_cost`      | el CMV. **En BDI ya existía; en Zattia no**, y por eso Zattia no tiene margen |
--
-- ## 🔑 `account_display` no es cosmético: es el 21%
--
-- El IVA no depende del canal ni del medio de pago, sino de **en qué cuenta entró la plata**. El
-- dashboard mantiene esa clasificación en `cuentas_cobro_gn` (`tipo`: `areben` = facturable, contra
-- `propia` y `efectivo`). Medido el 18-ago-2026 sobre julio: las ventas mayoristas de BDI entran
-- por «Transferencia Mayorista» (propia) y «Sin cobro» ⇒ **no llevan IVA**, y sus netas son iguales
-- a las brutas. Deducirlo del canal habría dado un número 21% más bajo con cara de estar bien.
--
-- ⛔ **La clasificación NO se copia acá.** Se lee del dashboard al calcular (ver `api/_norte.js`):
-- son 18 filas que alguien mantiene en una pantalla, y una segunda copia es lo que diverge.
--
-- ## Zattia y el CMV
--
-- `scripts/lib/ventas-espejo.mjs` guarda dos juegos de columnas y Zattia usaba el corto, de 9. Esto
-- le agrega el CMV y las tres nuevas —**no** los campos de cliente, que son PII y son otra
-- decisión—. Sin `total_cost`, la contribución de Zattia no se puede calcular y la pantalla tendría
-- que decir "falta el dato" en la mitad del negocio.
--
-- Idempotente: `add column if not exists`, y ningún script las borra. Se puede re-correr.
-- Aplicar con: `node scripts/apply-ventas-cobro.mjs`

alter table ventas add column if not exists account_display text;
alter table ventas add column if not exists discount        numeric;
alter table ventas add column if not exists shipping_cost   numeric;
alter table ventas add column if not exists total_cost      numeric;

comment on column ventas.account_display is
  'Cuenta de cobro de Gestión Nube. Decide si la venta lleva IVA: el dashboard la clasifica en cuentas_cobro_gn (tipo areben = facturable).';
comment on column ventas.discount is
  'Descuento de la venta entera, en pesos. Resta de las ventas netas.';
comment on column ventas.shipping_cost is
  'Envío COBRADO al cliente, en pesos. Suma como ingreso; su costo real se netea contra esto.';

-- Las tres nuevas nacen en null en todas las filas viejas y se llenan solas: el sync relee los
-- últimos 90 días. 🔴 Antes de ese barrido, una ventana de 30 días tiene filas sin cuenta de cobro,
-- y quien calcule tiene que contarlas y decirlo — no asumirles "no facturable", que es el lado
-- barato y da una contribución 21% más alta.
