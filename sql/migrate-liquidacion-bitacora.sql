-- Bitácora de Liquidación — la ida y la vuelta de cada precio de sale.
--
-- Un renglón por **escritura confirmada en Gestión Nube**: se le puso una oferta a un producto, o
-- se le sacó. Nada más. Las decisiones (quién definió qué precio, quién lo revisó) ya viven en el
-- ítem con su nombre y su fecha; acá entra sólo lo que el cliente llegó a ver en la góndola.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 🔑 POR QUÉ ES UNA TABLA APARTE Y NO UN CAMPO ADENTRO DEL ÍTEM
--
-- Es la pregunta obvia —`liquidacion_items.datos` es jsonb y un campo nuevo viaja sin migración—
-- y la respuesta es que ahí el historial no sobrevive. Tres motivos, los tres medibles hoy:
--
--   1. `guardar-item`, `revisar` y `decidir-masivo` (api/_liquidacion.js) **reescriben `datos`
--      entero** con el objeto que arma el navegador. Un historial guardado adentro lo borra el
--      próximo que toque un precio, sin un solo error y sin que nadie se entere.
--   2. `quitar-item` **borra la fila** y `borrar` se lleva la campaña completa. Que a un producto
--      lo hayan sacado de la lista no deshace el precio que estuvo puesto en la tienda de verdad.
--   3. `itemDelBody` es lista blanca y el ítem llega del cliente: un historial que viaje en ese
--      body se puede falsear o vaciar desde el navegador. Es el mismo motivo por el que
--      `confirmado` no entra por `guardar-item`.
--
-- Por eso también se copian `liq_nombre`, `producto` y `sku` en vez de referenciarlos: el evento
-- tiene que poder leerse cuando la campaña ya no existe. Es un registro, no una vista.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 🔑 `precio_de` SALE DE LA PROPIA BITÁCORA
--
-- "Qué había antes de esta escritura" es, por definición, el `precio_a` del evento anterior de ese
-- producto. Sólo cuando no hay ninguno se cae a la oferta congelada en la foto (`promoPrevia`), que
-- es lo que el producto traía al entrar a la campaña. Deducirlo siempre de la foto mentiría al
-- segundo ciclo: después de un poner → sacar, la foto sigue diciendo que había una oferta que ya no
-- está. La regla vive en `precioAnterior()` de `lib/liquidacion/bitacora.ts` y se testea sola.
--
-- `null` en `precio_a` significa **sin oferta** (el producto quedó a precio de lista), que es lo
-- mismo que se le manda a Gestión Nube: `tiendanube_promotional_price: null`.
--
-- Va en las DOS bases, con columna `store`, igual que `liquidaciones` y `liquidacion_items`.
-- Correr con `node scripts/apply-liquidacion-bitacora.mjs`. Idempotente.

create table if not exists liquidacion_bitacora (
  id            bigserial primary key,
  store         text not null,                      -- 'bdi' | 'zattia'
  liq_id        text not null,
  liq_nombre    text not null,                      -- copiado: el evento sobrevive a la campaña
  pid           text not null,                      -- id de producto de Gestión Nube
  producto      text not null,                      -- copiado, por lo mismo
  sku           text,
  -- poner → se le escribió una oferta · sacar → se le sacó (a lista o a la que tenía antes)
  modo          text not null check (modo in ('poner', 'sacar')),
  precio_de     numeric(12,2),                      -- la oferta que había antes. NULL = no había
  precio_a      numeric(12,2),                      -- la que quedó. NULL = quedó sin oferta
  precio_lista  numeric(12,2),                      -- el precio normal, para leer el % sin ir a buscarlo
  por_quien     text,
  cuando        timestamptz not null default now()
);

-- Las dos preguntas que se hacen: "qué pasó en esta campaña" (la pestaña) y "qué le pasó a este
-- producto" (que es lo que después van a leer Análisis y el chequeo de exhibición).
create index if not exists idx_liq_bitacora_campania on liquidacion_bitacora (store, liq_id, cuando desc);
create index if not exists idx_liq_bitacora_producto on liquidacion_bitacora (store, pid, cuando desc);

-- El candado del backfill. `scripts/backfill-liquidacion-bitacora.mjs` reconstruye la ida de lo que
-- ya está aplicado usando **el `aplicadoEn` original** como `cuando`, así que re-correrlo choca acá
-- en vez de duplicar el evento. Sin esto, la única forma de saber qué ya se insertó sería bajarse la
-- tabla entera y comparar a mano — y equivocarse ahí ensucia el registro justamente en la campaña
-- más grande.
create unique index if not exists idx_liq_bitacora_unico
  on liquidacion_bitacora (store, liq_id, pid, modo, cuando);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS.
--
-- ⚠️ Va acá y no es opcional, por lo mismo que lo explica `migrate-envios.sql`: `migrate-rls.sql`
-- prendió RLS recorriendo las tablas que existían **en ese momento**, y prender RLS no queda como
-- default. Una tabla creada después nace SIN RLS y sería la única abierta de la base.
--
-- No lleva política de lectura: el navegador nunca toca esta tabla directo. Todo pasa por
-- `api/_liquidacion.js`, que usa la service key y no mira RLS. Y no debería tocarla: acá hay
-- precios de costo indirectos (el de sale contra el de lista) de las dos marcas.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table liquidacion_bitacora enable row level security;
