-- Norte (Dirección): la economía de cada importación y las metas de mediano plazo.
--
-- ## Por qué existe
--
-- La sección `ingresos` (Compras → Ingresos proyectados) ya guarda **cuánto** llega y **cuándo**:
-- cantidad, modelos, proveedor, fecha estimada y estado. De plata no dice una palabra — no hay
-- costo, ni moneda, ni plazo de pago. Esa mitad que falta es lo único que Norte crea; todo lo
-- demás lo lee de lo que ya existe.
--
-- El 17-ago-2026 eso costó caro: el análisis del stock cambió de conclusión tres veces en una
-- tarde, y las tres por un dato que existía sólo en la cabeza de Bruno (las fechas de pago reales,
-- las importaciones que venían). Acá es donde deja de perderse.
--
-- ## 🔴 Por qué en la BASE y no en el KV, que es donde viven los ingresos
--
-- Los ingresos proyectados NO están en Supabase: viven en un KV de `bdi-catalogo`, y **ese GET es
-- público**. Su portero (`exigirUsuario`) sólo corre cuando el request trae `?kind=`, y los
-- ingresos proyectados usan la ruta default, sin `kind` ⇒ hoy cualquiera que sepa la URL lee
-- proveedor, cantidades, modelos, fechas y las fotos de los diseños que vienen.
--
-- ⇒ Meter ahí el costo y los vencimientos sería **publicar la deuda de la empresa**. Va en la base,
-- detrás de `api/_norte.js`, como todo lo que lleva plata en este repo (invariante de la Fase S:
-- el navegador no le pide una sola fila a Supabase).
--
-- ## La unión con el KV, y su fragilidad
--
-- `ingreso_id` es el `id` del `Ingreso` en el KV (`g<epoch>_<rand>`, generado en el cliente). No hay
-- foreign key posible: son dos almacenamientos distintos. ⚠️ **Si alguien borra una importación del
-- KV, su fila acá queda huérfana** — la pantalla la ignora al cruzar, y no se borra sola a
-- propósito: perder los plazos de una compra por un borrado accidental es peor que dejar una fila
-- colgada. Limpiar es una decisión, no un efecto.
--
-- Va en las DOS bases (hay una Supabase por marca), con `store` y PK compuesta, igual que
-- `calendario_hitos` y `disenos`.
--
-- Correr con `node scripts/apply-norte.mjs`. Idempotente.

create table if not exists compras_condiciones (
  ingreso_id      text not null,             -- el id del Ingreso en el KV de bdi-catalogo
  store           text not null,             -- 'bdi' | 'zattia'

  -- 🔑 La fecha de la FACTURA, no la de llegada. Los plazos del proveedor cuentan desde acá, y
  -- confundirlas da vencimientos corridos un mes: el 17-ago eso dio una cuota "vencida" que no
  -- existía, y dio vuelta la conclusión del análisis hasta que apareció la fecha correcta.
  fecha_factura   date,

  costo_unitario  numeric not null default 0,

  -- 🔴 La moneda no es formato, es riesgo. Las fundas se compran en dólares (US$1,08 promedio,
  -- hasta US$1,35 las encapsuladas) y se venden en pesos: una cuota a 60 días tiene el monto en
  -- pesos SIN FIJAR hasta que se paga. Se guarda la moneda de origen y se convierte al mirar, en
  -- vez de congelar un número que envejece mal.
  moneda          text not null default 'USD' check (moneda in ('USD', 'ARS')),

  -- Snapshot opcional. Si queda null se toma `totalU()` del ingreso, que es la fuente viva: sirve
  -- para cuando lo facturado no coincide con lo que finalmente entró.
  unidades        numeric,

  -- [{dias, pct, fecha?}]. `fecha` pisa a `dias` porque el mundo real no es aritmética: "a 30 días"
  -- del 7-ago da 6-sep contando, y el proveedor de BDI cobra el 7-sep.
  cuotas          jsonb not null default '[]'::jsonb,

  nota            text not null default '',
  actualizado_por text,
  actualizado_en  timestamptz not null default now(),

  primary key (ingreso_id, store)
);

create index if not exists compras_condiciones_store_idx on compras_condiciones (store);

-- Las metas de mediano plazo con su objetivo. **Lo medido NO se guarda**: se calcula al mirar,
-- contra las ventas reales. Una meta con su avance congelado en la base es una meta que miente el
-- día que nadie la actualiza — y ese día llega siempre.
create table if not exists norte_metas (
  key             text not null,             -- 'ventas-online-dia', 'unidades-por-pedido', …
  store           text not null,
  label           text not null,
  unidad          text not null default '',
  objetivo        numeric not null default 0,
  fecha_objetivo  date,
  orden           int not null default 0,
  activa          boolean not null default true,
  actualizado_por text,
  actualizado_en  timestamptz not null default now(),

  primary key (key, store)
);

create index if not exists norte_metas_store_idx on norte_metas (store, activa, orden);
