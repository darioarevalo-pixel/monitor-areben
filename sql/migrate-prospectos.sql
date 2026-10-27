-- Mapa de locales del CRM: locales sacados de Google Maps a los que todavía no les vendemos, y lo
-- que se hizo con cada uno. Correr en el proyecto Supabase de BDI (el CRM es bdi-only). Idempotente.
--
-- 🔑 POR QUÉ EXISTE (26-oct-2026, pedido de Darío): 201 locales de la costa (Gesell, Pinamar,
-- Madariaga, Mar del Plata) que no son clientes ni leads. Viven en la pestaña «Mapa» del CRM
-- «sin contactar» hasta que responden: ahí pasan a Leads (`crm:leads:bdi`) y `lead_id` queda atado.
--
-- 🔑 POR QUÉ EN LA BASE Y NO EN EL KV: el KV del CRM se reescribe ENTERO en cada guardado y no tiene
-- historial (ver docs/secciones/crm.md). Acá cada toque es una FILA de `prospecto_evento`: lo que
-- se hizo con un local no se pisa nunca, y la estadística por medio sale de contar filas.
--
-- Carga inicial: `node scripts/prospectos-cargar.mjs ~/Bruno/leads-mapa/locales_costa.json`
-- (no pisa el estado de un local que ya está).
--
-- VERIFICACIÓN:
--   select estado, count(*) from prospecto_local group by 1;
--   select tipo, medio, count(*) from prospecto_evento group by 1, 2;
--
-- ROLLBACK (se lleva el historial):
--   drop table if exists prospecto_evento; drop table if exists prospecto_local;

create table if not exists prospecto_local (
  id              text primary key,               -- slug del nombre @ lat,lng (scripts/prospectos-cargar.mjs)
  nombre          text not null,
  rubro           text,
  direccion       text,
  ciudad          text,
  lat             double precision,
  lng             double precision,
  telefono        text,                           -- normalizado 549…
  tel_maps        text,                           -- como lo muestra Google Maps
  whatsapp_seguro boolean not null default false, -- false = Maps no trae el 15, puede no ser celular
  instagram       text,
  facebook        text,
  web             text,
  correo          text,
  estrellas       numeric,
  resenas         integer,
  origen          text,                           -- 'maps-costa-2026-10'
  estado          text not null default 'sin_contactar'
                  check (estado in ('sin_contactar', 'contactado', 'respondio', 'descartado')),
  ultimo_contacto timestamptz,
  ultimo_medio    text,
  lead_id         text,                           -- el id en crm:leads:bdi cuando respondió
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create index if not exists prospecto_local_ciudad on prospecto_local (ciudad);

create table if not exists prospecto_evento (
  id        bigint generated always as identity primary key,
  local_id  text not null references prospecto_local (id) on delete cascade,
  en        timestamptz not null default now(),
  tipo      text not null check (tipo in ('contacto', 'estado', 'nota')),
  medio     text check (medio in ('whatsapp', 'llamada', 'instagram', 'correo')),
  estado    text,                                 -- el estado al que pasó (tipo = 'estado')
  texto     text,
  -- 🔑 la firma sale de perfil.name, NUNCA del body
  por       text
);

create index if not exists prospecto_evento_local on prospecto_evento (local_id, en desc);

-- El navegador nunca lee estas tablas derecho: todo pasa por `api/_prospectos.js`, con la service key.
alter table prospecto_local enable row level security;
alter table prospecto_evento enable row level security;
