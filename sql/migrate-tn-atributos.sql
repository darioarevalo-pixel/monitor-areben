-- Los ATRIBUTOS de cada producto: la ficha que carga el local con una lista cerrada delante.
--
-- Por qué existe (decisión de Bruno, 27-ago-2026): hasta ahora los bullets de una descripción
-- los escribía un modelo y los sostenía un validador. Eran una tabla escrita en prosa. Acá se
-- cargan como dato, el bullet se compone solo —`lib/tn-desc/atributos.core.js`— y al modelo le
-- queda sólo el párrafo.
--
-- 🔑 Y el motivo de fondo es más grande que las descripciones: con listas cerradas el catálogo
-- se puede SUMAR. «Qué escote se vendió más», «cuánto del catálogo es denim rígido» son un
-- `group by` de acá. Ese dato hoy no existe para decidir qué producir.
--
-- ⛔ Por eso el valor es de una lista cerrada y NO texto libre. La única excepción es
-- `atributo = 'detalle'`, que es el escape («argolla plateada en el medio») y queda **fuera de
-- todo análisis**: cinco maneras de escribir lo mismo son cinco filas distintas.
--
-- Correr con `node scripts/aplicar-sql.mjs sql/migrate-tn-atributos.sql tn_atributos`.
-- Idempotente: se puede correr varias veces.

-- Una fila por (producto, atributo) y no una columna por atributo, por tres razones concretas:
--
--   1. **Agregar un atributo no es una migración.** Va a pasar apenas se use: el diccionario
--      salió de leer 328 fichas, no de conocer todos los casos.
--   2. **El análisis es un `group by` directo**, sin pivotear nada.
--   3. **Queda registrado quién cargó cada valor**, no quién tocó la fila por última vez. Con
--      una columna por atributo, `por` diría el último y taparía a los demás.
create table if not exists tn_atributos (
  store          text not null,                     -- 'bdi' | 'zattia'
  tn_id          text not null,                     -- id del producto en TiendaNube
  atributo       text not null,                     -- tela|calce|silueta|tiro|escote|manga|largo|detalle
  valor          text not null,                     -- de la lista cerrada de su familia
  por            text,                              -- quién lo eligió
  at             timestamptz not null default now(),
  primary key (store, tn_id, atributo)
);

-- 🔑 El índice es (store, atributo, valor) y no (store, tn_id): la clave primaria ya resuelve
-- «los atributos de este producto». Lo que este índice sirve es la otra pregunta, la que
-- justifica la tabla — «cuántos productos tienen este valor» — que hoy nadie puede contestar.
create index if not exists idx_tn_atributos_valor on tn_atributos (store, atributo, valor);

-- ⛔ Sin foreign key a `tn_descripciones` a propósito: un producto puede tener la ficha cargada
-- sin que nadie haya escrito todavía una descripción, y ése es justamente el orden esperado —
-- el local carga cuando entra la mercadería, la redacción viene después.

-- RLS PRENDIDO y SIN políticas: nadie entra con la clave pública, ni a leer ni a escribir.
-- Mismo motivo que `tn_descripciones`: la clave pública viaja adentro del bundle. La app entra
-- con la **service key**, que pasa por encima de RLS. Si Redacción empieza a fallar en una
-- marca, es que a esa base le falta su `*_SUPABASE_SERVICE_KEY` en Vercel.
alter table tn_atributos enable row level security;

-- La FAMILIA del producto, guardada al lado de su cola.
--
-- 🔴 Va acá y no se recalcula al publicar porque **el servidor no ve las categorías de
-- TiendaNube**: las tiene el navegador, que ya bajó el catálogo. Sin este campo, el paso que
-- compone el HTML no sabría contra qué lista mirar y tendría que confiar en lo que le mande la
-- pantalla — justo en el único verbo que escribe en la tienda viva.
--
-- La escribe `op:'atributos'` en cada carga. Si un producto cambia de categoría en TiendaNube,
-- la familia se corrige sola la próxima vez que alguien toque su ficha.
alter table tn_descripciones add column if not exists familia text;
