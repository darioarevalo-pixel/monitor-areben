-- Tandas del mapa de locales del CRM (parte 2). Correr en el proyecto Supabase de BDI, DESPUÉS de
-- sql/migrate-prospectos.sql. Idempotente.
--
-- 🔑 POR QUÉ (27-oct-2026, Darío): no trabajar los 201 locales a la vez sino de a grupos chicos
-- («15 de Pinamar esta semana») y ver cómo le fue a cada grupo.
--
-- Un local entra a UNA sola tanda y queda en ella: así la cuenta de cada tanda (contactados,
-- respondieron) sale de mirar sus locales, y ⛔ no se pisa cuando se arma la siguiente. Una tanda
-- nueva sólo toma locales «sin contactar» que no estén en otra.
--
-- VERIFICACIÓN:
--   select t.nombre, l.estado, count(*) from prospecto_local l join prospecto_tanda t on t.id = l.tanda_id group by 1, 2;
--
-- ROLLBACK:
--   alter table prospecto_local drop column if exists tanda_id; drop table if exists prospecto_tanda;

create table if not exists prospecto_tanda (
  id        bigint generated always as identity primary key,
  nombre    text not null,
  creada_en timestamptz not null default now(),
  por       text                                  -- perfil.name, nunca del body
);

alter table prospecto_local add column if not exists tanda_id bigint references prospecto_tanda (id) on delete set null;

create index if not exists prospecto_local_tanda on prospecto_local (tanda_id);

alter table prospecto_tanda enable row level security;
