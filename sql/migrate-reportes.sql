-- bases: bdi
-- Reportes: «Ayuda / problemas», el botón de abajo a la derecha (Bruno, 12-oct-2026).
--
-- Cualquiera del equipo deja registrado algo que falta mejorar o un problema que pasó, desde la
-- pantalla donde está: la sección y la URL se guardan solas, el autor sale de la sesión (⛔ del body).
-- Un admin los ve en el mismo botón y los marca resueltos.
--
-- Sin marca, base de BDI, igual que `organizacion`, `manuales` y `agenda`: el monitor es uno solo.
--
-- Correr con `SOLO=BDI node scripts/aplicar-sql.mjs sql/migrate-reportes.sql reportes`. Idempotente.

create table if not exists reportes (
  id           uuid primary key default gen_random_uuid(),
  creado_en    timestamptz not null default now(),
  autor        text not null,
  tipo         text not null check (tipo in ('falta', 'problema')),
  texto        text not null check (char_length(texto) between 1 and 4000),
  seccion      text,
  url          text,
  estado       text not null default 'abierto' check (estado in ('abierto', 'resuelto')),
  resuelto_por text,
  resuelto_en  timestamptz
);

create index if not exists reportes_estado_creado on reportes (estado, creado_en desc);

-- El navegador ⛔ le pide filas a Supabase (Fase S): entra todo por `api/_reportes.js` con la llave de
-- servicio. RLS prendido y sin políticas ⇒ la anon key ⛔ lee ni escribe nada.
alter table reportes enable row level security;
