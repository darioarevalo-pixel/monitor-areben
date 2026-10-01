-- Mapa del local: el armado de los percheros del salón de Zattia, editado desde el monitor.
-- Correr en el proyecto Supabase de ZATTIA (la sección `mapa-local` es `brands: ['zattia']`).
-- Es idempotente.
--
-- 🔑 POR QUÉ EXISTE (30-sep-2026, pedido de Bruno): *«ver nuestro mapa con nuestros percheros y
-- decidir a distancia»*. El local se satura una y otra vez porque ⛔ no hay un cupo por barra: medido
-- ese día, ~640 prendas (producto×color con stock en el Local) contra ~300 perchas cómodas.
--
-- FORMA: UNA fila por marca con el mapa entero en jsonb (`lib/mapa-local/tipos.ts` → `MapaLocal`).
-- ⛔ No es una tabla por módulo: son 15 módulos que se editan juntos y se leen siempre juntos, y el
-- mapa tiene que guardarse ENTERO o nada — medio armado guardado es una hoja que miente en el salón.
-- El saneo vive en `lib/mapa-local/validar.core.js`, que corre en el servidor antes de escribir.
--
-- 🔴 `actualizado_en` ES EL CANDADO: el guardado manda el `actualizado_en` que leyó, y si otro
-- guardó en el medio el servidor contesta 409 en vez de pisarlo (`api/_mapa-local.js`).
--
-- VERIFICACIÓN (correr después):
--   select column_name, data_type from information_schema.columns where table_name = 'mapa_local';
--
-- ROLLBACK (se lleva el armado guardado; la pantalla vuelve al mapa inicial del código):
--   drop table if exists mapa_local;

create table if not exists mapa_local (
  store           text primary key,               -- 'zattia'
  mapa            jsonb not null,
  actualizado_en  timestamptz not null default now(),
  -- 🔑 la firma sale de perfil.name, NUNCA del body
  actualizado_por text
);

-- El navegador nunca lee esta tabla derecho: todo pasa por `api/_mapa-local.js`, con la service key.
alter table mapa_local enable row level security;
