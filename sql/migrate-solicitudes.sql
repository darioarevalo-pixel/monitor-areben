-- Cajón ÚNICO de solicitudes (Fase 2A de la reestructura).
--
-- Hasta ahora las solicitudes vivían en DOS claves del KV de bdi-catalogo
-- (`sesionfotos:<marca>` y `solicitudesinternas:<marca>`), cada una con el historial
-- entero en un solo JSON. Eso obligaba a que cada consumidor supiera de los dos cajones
-- (el Inicio miraba solo el de fotos, así que las internas no aparecían nunca en
-- "pendientes de armar") y a reescribir la lista completa en cada guardado.
--
-- Acá una solicitud es UNA FILA. El documento entero va en `datos` (jsonb) y las columnas
-- de al lado son solo para filtrar/ordenar: así el motor sigue manipulando el mismo objeto
-- que ya manipulaba y la migración es mecánica, sin reescribir la lógica.
--
-- Correr en el Supabase de CADA marca (BDI y ZATTIA) con `node scripts/apply-solicitudes.mjs`.
-- Idempotente: se puede correr varias veces.

create table if not exists solicitudes (
  -- El id es el que ya generan hoy (`s<epoch>_<rand>`), NO uno nuevo: así la migración
  -- conserva los links y los ids que la gente ya tiene anotados.
  id          text not null,
  store       text not null,                          -- 'bdi' | 'zattia'
  -- De qué cajón viene / con qué preset se comporta: 'sesionfotos' | 'solicitudesinternas'.
  -- Se conserva durante la convivencia; la Fase 2 lo vuelve un detalle histórico frente
  -- a motivo + destino.
  kind        text not null,
  motivo      text,                                    -- 'Sesión de fotos', 'Video/contenido', …
  -- Retornable (vuelve a la venta) o consumo (baja definitiva). En el documento el campo
  -- se sigue llamando `tipo`, que es como lo lee el motor; acá se llama destino porque es
  -- lo que significa.
  destino     text not null default 'retornable',
  estado      text not null,
  creado      bigint,                                  -- Date.now() de la creación original
  creado_por  text,
  fecha       text,                                    -- YYYY-MM-DD como lo guarda el motor
  datos       jsonb not null,                          -- la solicitud COMPLETA (items, ventas, devuelto…)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (store, id)
);

-- Listar el historial de una marca (lo que hace la pantalla al abrir).
create index if not exists idx_solicitudes_store_creado
  on solicitudes (store, creado desc);

-- Pendientes por estado y por cajón (Inicio, filtros de la vista unificada).
create index if not exists idx_solicitudes_store_estado
  on solicitudes (store, estado, kind);

-- Igual que fallas_deposito / conteos_deposito: el gate es el login server-side de
-- api/solicitudes.js (service key), no RLS.
alter table solicitudes disable row level security;
