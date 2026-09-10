-- "Destacados": los productos estrella. La marca que dice **esto es lo que se comunica**.
--
-- # De dónde sale, dicho por Bruno (10-sep-2026)
--
--   «son acciones comerciales donde hay varios productos, pero nosotros identificamos las
--    estrella. incluso en el analisis de cada producto, estaria bueno poder marcarlos en general.»
--
-- 🔑 **Son DOS preguntas y una sola tabla, separadas por `liq_id`:**
--
--  - `liq_id = '<id de campaña>'` → **la estrella de esta acción comercial**. Vale para esta feria
--    y no dice nada del producto en general: un básico barato puede ser la estrella de una
--    liquidación al costo y no serlo nunca más.
--  - `liq_id = null` → **producto estrella en general**, el que se ve en Análisis → Por producto y
--    sigue valiendo para la campaña que venga.
--
-- ⛔ **No son la misma marca y no se derivan una de la otra**, por eso `liq_id` es una columna y no
-- dos tablas: es el mismo verbo ("esto es lo que hay que empujar") sobre dos alcances, y una tabla
-- sola deja que una fila conteste las dos preguntas el día que haga falta.
--
-- ⛔ Y esto **no es** la "estrella de proveedor" del PRM (`lib/prm/estrellas.core.js`), que es un
-- número CALCULADO —qué ingresó hace poco y se colocó bien—. Ésta es una DECISIÓN que queda pegada
-- al producto, igual que `clavados`: por eso es una tabla y no un detector.
--
-- # 🔑 La clave NO lleva quién la marcó
--
-- Copiado de `sql/migrate-meta-favorito.sql`, con el mismo motivo: si la clave fuera
-- `(producto, quien)`, dos personas podrían marcar el mismo producto sin enterarse y la pantalla
-- mostraría un **contador** en vez de una **señal**. La estrella es del equipo: la pone cualquiera
-- que vea la sección y la saca cualquiera. `marcada_por` queda como **firma**, para poder
-- preguntarle por qué.
--
-- # Vive en la base de CADA marca
--
-- `producto_id` es de la base de su marca: el 1234 de BDI y el 1234 de Zattia son dos productos
-- distintos. Mismo criterio que `clavados`, `pedidos_clientes` y `atencion`.
--
-- Correr con `node scripts/aplicar-sql.mjs sql/migrate-destacados.sql destacados`, que la aplica en
-- las DOS bases. Idempotente.

create table if not exists destacados (
  id            text primary key,
  store         text not null,                     -- 'bdi' | 'zattia'
  producto_id   bigint not null,

  -- 🔑 El alcance. `null` = estrella general del producto; un id de campaña = estrella de esa
  -- acción comercial. ⛔ Sin FK a `liquidaciones` a propósito: borrar una campaña ⛔ no tiene por qué
  -- llevarse la decisión de que ese producto era el que se comunicaba, y la tabla de campañas ya
  -- vive sin FKs (ver `sql/migrate-liquidacion.sql`).
  liq_id        text,

  -- 📌 Foto del producto **al momento de marcarlo**, redundante con `productos` a propósito: es
  -- para que una estrella de marzo siga siendo legible cuando el producto ya no exista en el
  -- espejo o le hayan cambiado el nombre. Mismo criterio que `clavados`.
  sku           text,
  nombre        text,

  -- Por qué es estrella. Es el brief: lo que quien la marcó quiere que se comunique de ella.
  nota          text,

  marcada_en    timestamptz not null default now(),
  marcada_por   text,

  -- `null` = está activa. Sacar ⛔ no borra: quién la marcó, cuándo y por qué es justamente lo que
  -- se quiere poder mirar después de la campaña.
  sacada_en     timestamptz,
  sacada_por    text
);

-- El acceso real: las activas de una marca (con o sin campaña), que es lo que pide cada pantalla.
create index if not exists idx_destacados_activos on destacados (store, liq_id) where sacada_en is null;
-- Y el cruce por producto, para la fila de Análisis.
create index if not exists idx_destacados_producto on destacados (store, producto_id);

-- 🔴 Un producto no se puede destacar dos veces **en el mismo alcance mientras siga activo**, y sí
-- puede volver a destacarse después de sacado — es una decisión nueva, con su fecha y su firma. Por
-- eso el único es PARCIAL: uno total borraría el historial o impediría volver a marcarlo, y las dos
-- cosas son perder un dato que ya existía. Mismo molde que `idx_clavados_uno_activo`.
--
-- ⚠️ `coalesce(liq_id, '')` y ⛔ no `liq_id` pelado: en un índice único, `null` ⛔ no colisiona con
-- `null`, así que la estrella GENERAL —que es justamente la que tiene `liq_id` nulo— se podría
-- marcar cien veces sin que nada fallara. Es el caso que el único existe para frenar.
create unique index if not exists idx_destacados_uno_activo
  on destacados (store, producto_id, coalesce(liq_id, '')) where sacada_en is null;

do $$ begin
  alter table destacados add constraint destacados_store check (store in ('bdi', 'zattia'));
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS.
--
-- `sql/migrate-rls.sql` prendió RLS recorriendo las tablas que existían ese día; una tabla creada
-- después nace SIN RLS y quedaría abierta a la clave pública — es lo que pasó con el memo
-- (`75e9e8e`). Sin políticas a propósito: el navegador nunca lee esta tabla derecho, todo pasa por
-- `api/_destacados.js` con la service key.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table destacados enable row level security;
