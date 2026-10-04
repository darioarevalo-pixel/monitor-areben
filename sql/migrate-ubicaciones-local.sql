-- Ubicaciones depósito: en qué estante del depósito de atrás del local de Zattia está cada producto.
-- Correr en el proyecto Supabase de ZATTIA (la sección `ubicaciones-local` es `brands: ['zattia']`).
-- Es idempotente.
--
-- 🔑 POR QUÉ EXISTE (Bruno, 4-oct-2026): percha + depósito de atrás son UN stock («Local» en GN) y
-- ⛔ eso no se separa. Lo que faltaba es DÓNDE está guardado: se ordena por SKU, pero con un SKU nadie
-- sabe a qué estante ir, y el depósito se reacomoda con cada ingreso y cada agotado.
-- Plan: ~/Documents/reunion-gerencia/2026-10-04-ubicaciones-deposito-plan-v1.md
--
-- FORMA:
--   `ubicacion_local`          la FOTO actual: una fila por (estante, producto). `clave` = SKU de la
--                              variante sin color/talle (`RBT-0137`), ⛔ no el product_id de GN.
--   `ubicacion_local_lectura`  el HISTORIAL: un renglón por cada escaneo de estante.
--
-- 🔴 `reemplazar_estante` EXISTE PORQUE LA API REST NO TIENE TRANSACCIONES: escanear un estante
-- REEMPLAZA su contenido (borrar + insertar). Hecho en dos llamadas, un corte en el medio deja el
-- estante vacío y la Caja diciendo «no hay atrás» de algo que sí hay.
--
-- VERIFICACIÓN (correr después):
--   select table_name from information_schema.tables where table_name like 'ubicacion_local%';
--   select proname from pg_proc where proname = 'reemplazar_estante';
--
-- ROLLBACK (se lleva todas las ubicaciones cargadas):
--   drop function if exists reemplazar_estante(text, text, jsonb, jsonb, text);
--   drop table if exists ubicacion_local_lectura; drop table if exists ubicacion_local;

create table if not exists ubicacion_local (
  store          text not null,                  -- 'zattia'
  estante        text not null,                  -- 'A1' (la etiqueta dice EST-A1)
  clave          text not null,                  -- 'RBT-0137'
  bolsas         int  not null default 1,        -- cuántas veces se leyó en ese estante
  escaneado_en   timestamptz not null default now(),
  -- 🔑 la firma sale de perfil.name, NUNCA del body
  escaneado_por  text,
  primary key (store, estante, clave)
);
create index if not exists ubicacion_local_clave on ubicacion_local (store, clave);

create table if not exists ubicacion_local_lectura (
  id             bigserial primary key,
  store          text not null,
  estante        text not null,
  claves         jsonb not null,                 -- [{clave, bolsas}]
  sin_resolver   jsonb not null default '[]',    -- lo que se leyó y ⛔ es ningún producto
  escaneado_en   timestamptz not null default now(),
  escaneado_por  text
);
create index if not exists ubicacion_local_lectura_estante on ubicacion_local_lectura (store, estante, escaneado_en desc);

-- El navegador nunca lee estas tablas derecho: todo pasa por `api/_ubicaciones-local.js`, con la service key.
alter table ubicacion_local enable row level security;
alter table ubicacion_local_lectura enable row level security;

-- Reemplaza el contenido de UN estante y deja el renglón del historial, todo o nada.
-- `filas` = [{clave, bolsas}]; vacío = el estante quedó vacío (también vale).
create or replace function reemplazar_estante(p_store text, p_estante text, p_filas jsonb, p_sin_resolver jsonb, p_por text)
returns void
language plpgsql
security invoker
as $$
begin
  delete from ubicacion_local where store = p_store and estante = p_estante;
  insert into ubicacion_local (store, estante, clave, bolsas, escaneado_en, escaneado_por)
    select p_store, p_estante, f->>'clave', greatest(1, coalesce((f->>'bolsas')::int, 1)), now(), p_por
    from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) f
    where coalesce(f->>'clave', '') <> '';
  insert into ubicacion_local_lectura (store, estante, claves, sin_resolver, escaneado_en, escaneado_por)
    values (p_store, p_estante, coalesce(p_filas, '[]'::jsonb), coalesce(p_sin_resolver, '[]'::jsonb), now(), p_por);
end;
$$;

-- ⛔ Que la anon key no pueda llamarla: sólo el servidor (service_role).
revoke execute on function reemplazar_estante(text, text, jsonb, jsonb, text) from public, anon, authenticated;
