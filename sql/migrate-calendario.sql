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
--   `calendario_decision`        — con cuánta fuerza jugamos cada fecha, y desde cuándo hay que
--                                  producirla. Ver el comentario largo más abajo.
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

-- Con cuánta fuerza jugamos cada fecha comercial.
--
-- El calendario nació deduciendo la urgencia de `anticipoDias` (un número del catálogo): la
-- pantalla anunciaba "ya habría que estar produciendo" para toda fecha cuyo anticipo hubiera
-- vencido, la trabajáramos o no. Es falso y encima es caro: un aviso que se ignora doce veces
-- enseña a ignorar el aviso número trece, que sí importaba. Si estas dos marcas se suman al Día del
-- Niño depende del stock, del público y de si hay manos esa semana — nada de eso está en el
-- almanaque.
--
-- Por eso la decisión se guarda, y **la ausencia de fila es un estado de primera clase**: "todavía
-- no lo decidimos" es la verdad más común y no merece ocupar lugar. La pantalla la muestra como la
-- pregunta abierta que es, en vez de inventarle un default.
--
-- Va por `entrada_id` (`comercial:<clave>:<año>`) y no por clave suelta: el Día del Niño del año
-- que viene es otra decisión, igual que en `calendario_fechas_fijadas`. Los hitos propios NO entran
-- acá — un lanzamiento de colección ya es nuestro, preguntar si nos sumamos no tiene sentido.
create table if not exists calendario_decision (
  store       text not null,                          -- 'bdi' | 'zattia': una puede jugar y la otra pasar
  entrada_id  text not null,                          -- 'comercial:dia-nino:2026'
  prioridad   text not null,                          -- fuerte | suave | pasamos
  arrancar    date,                                    -- cuándo empezar a producir; NULL = falta ponerlo
  por         text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (store, entrada_id)
);

alter table calendario_hitos disable row level security;
alter table calendario_fechas_fijadas disable row level security;
alter table calendario_decision disable row level security;
