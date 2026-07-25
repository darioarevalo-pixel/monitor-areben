-- Tablero de diseños compartido (Fase 5 — Compras).
--
-- Hasta ahora vivía en el `localStorage` del navegador (`monitor_designboard_v1`), y eso
-- hacía que NO fuera un tablero de equipo: cada uno veía el suyo, lo que cargaba una
-- diseñadora no le aparecía a nadie más, y limpiar el navegador borraba todo. Encima el
-- almacenamiento se llenaba (las fotos van embebidas) y la app tenía que avisar que ya no
-- podía guardar.
--
-- Una fila por diseño, con el documento entero en `datos` (mismo criterio que `solicitudes`:
-- el motor sigue manipulando el mismo objeto y la migración es mecánica).
--
-- Correr con `node scripts/apply-disenos.mjs`. Idempotente.

create table if not exists disenos (
  id          text not null,
  store       text not null,                          -- 'bdi' | 'zattia'
  estado      text,                                    -- confirmado | duda | rechazado | (nuevo)
  datos       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (store, id)
);

create index if not exists idx_disenos_store on disenos (store, updated_at desc);

alter table disenos disable row level security;
