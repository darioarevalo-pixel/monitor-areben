-- Chequeo de exhibición LIBRE: el recorrido del local por LUGAR, guardado en la base.
-- Correr este script en el proyecto Supabase de ZATTIA (la sección `exhib` es `brands: ['zattia']`).
-- Sirve igual para BDI el día que se le habilite: es idempotente y no asume datos previos.
--
-- 🔑 POR QUÉ EXISTE. Hasta el 19-sep-2026 el recorrido se caminaba POR CATEGORÍA de Tienda Nube y
-- no guardaba nada: estados y errores vivían en el `localStorage` del teléfono que escaneaba
-- (`monitor_exhib_<marca>`), así que desde otra máquina no había forma de ver qué dio un chequeo.
-- Y la categoría engloba mal —el perchero de tops se compara contra «TOPS Y BODIES», un bolsón de
-- 291 que se come tops, bodies, blusas, camisas, corsets y musculosas—, mientras que en el local
-- una misma categoría está colgada en varios lugares distintos.
-- ⇒ el modo libre escanea por LUGAR («perchero tops»), tal como está armado el salón.
--
-- ⛔ ESTAS TABLAS NO CALCULAN FALTANTES, y es una decisión, no un pendiente: lo que se pidió es el
-- DATO de qué se escaneó en cada lugar, para compararlo por afuera contra la categoría que
-- corresponda. La app ⛔ no decide qué debería estar colgado en cada perchero.
--
-- PRECONDICIONES: ninguna. No toca ninguna tabla existente y no hay datos que migrar (lo que había
-- vivía en el navegador y ⛔ no se sube: era de un teléfono, sin lugar y sin recorrido).
--
-- VERIFICACIÓN (correr después; tiene que devolver las dos filas):
--   select table_name, (select count(*) from information_schema.columns c
--                       where c.table_name = t.table_name) as columnas
--   from information_schema.tables t
--   where table_name in ('exhib_recorrido', 'exhib_escaneo') order by 1;
--
-- ROLLBACK (⚠️ se lleva los recorridos guardados; `exhib_escaneo` cae solo por el `on delete cascade`):
--   drop table if exists exhib_escaneo;
--   drop table if exists exhib_recorrido;

create table if not exists exhib_recorrido (
  id         text primary key,                    -- `ex<epoch>_<azar>`, lo genera el teléfono
  store      text not null,                       -- 'zattia' | 'bdi'
  -- Deja lugar a que el modo por categoría suba a la base algún día. Hoy siempre entra 'libre':
  -- el modo por categoría sigue viviendo en el localStorage y ⛔ no se tocó.
  modo       text not null default 'libre',
  persona    text,                                -- 🔑 la firma sale de perfil.name, NUNCA del body
  estado     text not null default 'en_curso',    -- 'en_curso' | 'cerrado'
  nota       text,
  creado_en  timestamptz not null default now(),
  cerrado_en timestamptz
);

create table if not exists exhib_escaneo (
  id           bigint generated always as identity primary key,
  recorrido_id text not null references exhib_recorrido(id) on delete cascade,
  -- El lugar tal como lo escribió la persona parada ahí («perchero tops», «mesa de la entrada»).
  -- Texto libre y ⛔ no un catálogo: el salón se reacomoda, y un desplegable que no tiene el
  -- perchero de hoy obliga a elegir uno que miente. Las sugerencias salen de los ya usados.
  lugar        text not null,
  -- `exhibId()` de lib/exhib/core.ts: barcode, o `productId|talle` si la variante no tiene código.
  -- Si el código escaneado ⛔ no cruzó con el inventario, es '?' + el código normalizado.
  variante_id  text not null,
  -- 🔑 El código que NO cruza se guarda igual. Hasta hoy la pantalla decía «ese código no está en
  -- la lista» y el dato se perdía: escanear en el salón algo que ⛔ no figura con stock en el Local
  -- ES un hallazgo del recorrido —stock mal cargado, prenda de otra marca, devolución sin ingresar—
  -- y es justamente lo que nadie puede reconstruir después.
  encontrado   boolean not null default true,
  codigo_crudo text,                              -- lo que tipeó el lector, tal cual
  barcode      text,
  sku          text,
  product_id   text,
  product_name text,
  size         text,
  -- 🔑 TODAS las categorías TN limpias del producto, ⛔ no la primera. `construirItems` se queda con
  -- `cleanCats[0]` y por eso BLUSAS, SHORTS y BERMUDAS muestran CERO en el modo por categoría
  -- (medido sobre 770 productos el 7-sep-2026). Acá se guardan todas porque son exactamente el
  -- dato que se va a comparar contra el lugar: el perchero de tops contra lo que TN dice de cada
  -- prenda, sin el englobado de «TOPS Y BODIES».
  cats         jsonb not null default '[]'::jsonb,
  qty          integer,                           -- stock en Local al momento de escanear
  -- Los dos precios de TN **congelados al escanear**, para que `precioDeGondola` pueda decir
  -- después qué tenía que decir el cartelito ESE día. ⛔ No se recalculan al exportar: un recorrido
  -- de la semana pasada leído contra los precios de hoy daría un número que ⛔ no fue el que la
  -- persona tuvo en la mano. `promo` en null = ⛔ no estaba en oferta; los dos en null = el producto
  -- ⛔ no cruzó con TN, que es distinto.
  precio       numeric(12, 2),
  promo        numeric(12, 2),
  -- El reloj del teléfono: el local puede quedarse sin señal y la cola se sube después. `now()` acá
  -- diría cuándo se pudo subir, ⛔ no cuándo se escaneó.
  escaneado_en timestamptz not null default now()
);

-- 🔑 El único es (recorrido, LUGAR, variante) y ⛔ no (recorrido, variante): la misma prenda
-- colgada en dos percheros son DOS filas, y eso es información —no un duplicado—. Lo que el único
-- corta es el doble escaneo de la misma prenda en el mismo lugar, que sí es ruido.
create unique index if not exists ux_exhib_escaneo on exhib_escaneo (recorrido_id, lugar, variante_id);
create index if not exists idx_exhib_escaneo_rec on exhib_escaneo (recorrido_id, escaneado_en);
create index if not exists idx_exhib_recorrido_store on exhib_recorrido (store, creado_en desc);
