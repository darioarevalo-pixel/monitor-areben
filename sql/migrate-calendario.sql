-- Calendario editorial (Marketing).
--
-- Hasta ahora no había ningún lugar donde vivieran las fechas. Las comerciales se recordaban
-- tarde —el Día de la Madre quince días antes, cuando ya no hay tiempo de producir una pieza— y
-- los lanzamientos propios vivían en la cabeza de cada uno, así que dos personas planificaban
-- contra dos fechas distintas sin enterarse.
--
-- Las comerciales NO se guardan acá: se calculan en `lib/calendario/fechas.core.js` (el tercer
-- domingo de octubre es una regla, no un dato). Lo que sí necesita base es lo que una persona
-- decide y la máquina no puede saber sola. De ahí las dos tablas:
--
--   `calendario_hitos`           — lo propio del equipo: lanzamientos, sesiones, mercadería.
--   `calendario_fechas_fijadas`  — la fecha REAL de una comercial anunciada (Hot Sale,
--                                  CyberMonday, Día del Niño), que la define una cámara y el
--                                  catálogo solo puede estimar. Mientras nadie la fije, la
--                                  pantalla la muestra marcada como estimada: una fecha estimada
--                                  presentada como firme es peor que no tener la fecha.
--
-- Va en las DOS bases (hay una Supabase por marca), con columna `store` y PK compuesta, igual que
-- `disenos` y `solicitudes`. `datos jsonb` es la fuente de verdad del hito y las columnas de al
-- lado son proyecciones para filtrar y ordenar: un campo nuevo viaja sin migración.
--
-- Correr con `node scripts/apply-calendario.mjs`. Idempotente.

create table if not exists calendario_hitos (
  id          text not null,                          -- `h<epoch>_<rand>`, generado en el cliente
  store       text not null,                          -- 'bdi' | 'zattia'
  fecha       date not null,
  firme       boolean not null default true,          -- false = proyectada, se puede mover
  titulo      text not null,
  tipo        text,                                    -- lanzamiento | sesion-fotos | mercaderia | mail | evento | otro
  nota        text,
  creado_por  text,
  datos       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (store, id)
);

-- La consulta real es siempre "qué se viene": por marca y por fecha ascendente.
create index if not exists idx_calendario_hitos_store_fecha on calendario_hitos (store, fecha);

create table if not exists calendario_fechas_fijadas (
  store       text not null,
  clave       text not null,                          -- 'hot-sale' | 'cybermonday-ar' | 'dia-nino' | …
  anio        int  not null,                          -- se fija POR AÑO: el año que viene vuelve a estimarse
  fecha       date not null,
  por         text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (store, clave, anio)
);

alter table calendario_hitos disable row level security;
alter table calendario_fechas_fijadas disable row level security;
