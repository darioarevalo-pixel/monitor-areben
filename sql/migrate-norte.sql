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

  -- El costo NO vive acá: va por MATERIAL, en `costos` (ver el bloque del 18-ago-2026 más abajo).

  -- 🔴 La moneda no es formato, es riesgo. Las fundas se compran en dólares (US$1,08 promedio,
  -- hasta US$1,35 las encapsuladas) y se venden en pesos: una cuota a 60 días tiene el monto en
  -- pesos SIN FIJAR hasta que se paga. Se guarda la moneda de origen y se convierte al mirar, en
  -- vez de congelar un número que envejece mal.
  moneda          text not null default 'USD' check (moneda in ('USD', 'ARS')),

  -- Las unidades facturadas tampoco: son por material y viajan adentro de `costos`.

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

  -- 🔑 QUÉ se cuenta. El catálogo vive en `lib/norte/medidores.core.js` y el handler valida contra
  -- él antes de guardar. Acá NO va un check con la lista repetida a propósito: sería una tercera
  -- copia del mismo vocabulario, y agregar un medidor pasaría a necesitar una migración.
  medidor         text not null default 'unidades-dia',

  -- El canal que se mide, o null = todos juntos. Los valores son los de `canalDe`.
  canal           text,

  -- Espejo de la unidad del medidor, para poder leer la fila suelta en psql sin tener el catálogo
  -- al lado. ⚠️ **No es la fuente**: la pantalla usa el medidor. Antes era texto libre, y eso era
  -- el defecto: nada impedía cargar un objetivo "por mes" contra un medido que sale por día.
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

-- Las dos columnas del medidor, para las bases donde la tabla ya existe (18-ago-2026). Cuando esto
-- se escribió `norte_metas` estaba VACÍA en las dos bases —se verificó antes de correrlo—, así que
-- no hay backfill que hacer: el default alcanza.
alter table norte_metas add column if not exists medidor text not null default 'unidades-dia';
alter table norte_metas add column if not exists canal   text;

-- ── El costo por MATERIAL, y el tilde que hace deuda (18-ago-2026) ────────────────────────────
--
-- 🔑 **El costo no es uno por importación.** Un contenedor trae IMD, encapsuladas y transparentes
-- juntas y cada material tiene su precio (US$1,08 las comunes, hasta US$1,35 las encapsuladas). El
-- promedio ponderado da el mismo total y **miente en cada línea**: el día que se pregunte cuánto
-- cuesta una encapsulada, la respuesta va a ser el promedio de otra cosa. Los materiales son los
-- **bloques** del ingreso en el KV, que ya traen sus unidades; acá se les cuelga el precio.
--
--   costos = [{bloqueId, nombre, costo, unidades}]   -- `unidades` null = las del bloque (fuente viva)
--
-- ⚠️ `nombre` es un **snapshot** y no la fuente: sirve para poder NOMBRAR un costo cuyo bloque ya
-- no está en el ingreso. El motor no lo suma —sus unidades no existen— y lo dice en pantalla.
alter table compras_condiciones add column if not exists costos jsonb not null default '[]'::jsonb;

-- 🔑 **El tilde que convierte una proyección en una deuda**, y la fecha que lo acompaña. Lo firma
-- quien carga la plata. ⛔ NO se deduce del `estado` de la importación (cotizando · pedido ·
-- producción · tránsito · aduana · arribado): ese estado lo mueve otra pantalla y otra persona, y
-- al 18-ago-2026 hay importaciones que ya llegaron figurando «en tránsito». Deducirlo de ahí haría
-- que un olvido ajeno mueva el calendario de pagos.
--
-- Sin el tilde una compra costeada igual se proyecta, pero contra la llegada **estimada** y en la
-- tabla de estimados. Recién con factura los plazos cuentan desde ella y el vencimiento es deuda.
alter table compras_condiciones add column if not exists confirmado    boolean not null default false;
alter table compras_condiciones add column if not exists fecha_ingreso date;

-- Y se van las dos columnas del modelo viejo (18-ago-2026, después de que el código nuevo estuviera
-- sirviendo y verificado contra producción). 🔑 **El orden importa y es éste**: agregar → deployar →
-- verificar en la calle → recién ahí soltar. Al revés, el handler vivo escribe una columna que ya
-- no existe y el guardado falla justo cuando nadie lo está mirando.
--
-- ⛔ No hay backfill que hacer: la tabla estuvo en 0 filas en las dos bases hasta este cambio, así
-- que ningún costo viejo se pierde. Dejarlas «por las dudas» sería sostener para siempre un «si no
-- hay costos por bloque, usá el de arriba», que es la clase de default que después contesta de más.
alter table compras_condiciones drop column if exists costo_unitario;
alter table compras_condiciones drop column if exists unidades;

-- **A cuánto se pesificó la deuda** (18-ago-2026). Lo corrigió Bruno mirando la pantalla: el costo
-- está nominado en dólares, pero **los cheques salen diferidos al recibir la mercadería**, y desde
-- que se emiten **el riesgo de devaluación lo toma el proveedor**. ⇒ la deuda deja de estar en
-- dólares en ese momento, y el monto en pesos pasa a ser un DATO, no una conversión.
--
-- 🔑 Es **una por importación y no una por cuota** porque los cheques se emiten todos juntos, el
-- mismo día y al mismo cambio. Una por cuota invitaría a cargar cuatro números donde hay uno.
--
-- ⚠️ `null` = todavía no se pesificó, y ahí **no se inventa**: la pantalla pone una raya y dice qué
-- falta, igual que hace cuando falta el costo de un material. Antes de esto la pantalla convertía
-- con un `useState(1380)` escrito a mano en el código, que no salía de ninguna cotización, no se
-- guardaba, y presentaba el resultado en una columna que decía «En pesos» a secas.
alter table compras_condiciones add column if not exists cotizacion numeric;
