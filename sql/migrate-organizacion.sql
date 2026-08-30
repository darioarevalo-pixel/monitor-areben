-- Organización: de quién es cada cosa, sin fecha.
--
-- # Por qué no vive en la Agenda, que es donde primero se pensó
--
-- Todo ítem de la Agenda exige una `regla` de las cinco (`unica · rango · diaria · semanal ·
-- mensual`) y `cumplimiento()` emite TODA ocurrencia que esa regla genere. Una responsabilidad
-- permanente no tiene día: o se le inventa uno, o queda roja para siempre. Y medido el 30-ago-2026,
-- la Agenda tampoco DESCRIBE el reparto — Camila Budek tiene 0 rutinas propias y trabaja igual,
-- porque su trabajo dispara por hecho y vive en los moldes. Quien lea la Agenda como «quién
-- responde de qué» concluye que ella no responde por nada, que es falso.
--
--   La Agenda contesta «¿qué me toca hoy?». Esto contesta «¿de quién es esto?».
--
-- # El gris ES una fila, y por eso `persona` es nullable
--
-- 🔑 **`persona IS NULL` no es un dato faltante: es el hallazgo.** Una responsabilidad que el
-- sector tiene y ninguna persona reclamó se guarda igual, con su sector y sin dueña, y la pantalla
-- la cuenta. Un gris escondido es el que se cobra: en este grupo el mismo agujero —el último campo
-- del producto sin dueño— apareció en tres fichas distintas antes de que alguien lo nombrara.
--
-- ⚠️ **Y por eso `persona` sólo puede ser null en la clase `responde`**: «qué decide sola», «qué
-- publica» y «qué NO es suyo» son afirmaciones SOBRE una persona — sin persona no dicen nada. El
-- freno está en `lib/organizacion/core.js` (`filaValida`) y amarrado en `tests/organizacion.test.ts`.
--
-- # Sin marca, base de BDI, igual que `manuales` y `agenda`
--
-- Quién responde de qué no cambia entre BDI y Zattia: es la misma persona en las dos. Por eso el
-- handler no valida `store` y la tabla vive sólo en la maestra.
--
-- Correr con `node scripts/apply-organizacion.mjs`. Idempotente.

-- El organigrama: sectores, personas y puestos, colgando unos de otros.
--
-- ⚠️ `persona` es el `name` EXACTO del padrón (`bdi-catalogo/api/usuarios`), la misma clave con la
-- que se guardan `agenda_items.destino`, `agenda_items.autor` y `agenda_hechos.usuario`. Un nombre
-- mal tipeado acá no falla: dibuja un nodo que no se cruza con nada y nadie reclama.
-- Es nullable porque el organigrama tiene nodos que NO son cuentas del sistema: un sector, un
-- puesto por turno, o alguien del taller que no usa el monitor.
create table if not exists organizacion_nodos (
  id         text primary key,
  label      text not null,
  tipo       text not null default 'persona',      -- 'sector' | 'persona' | 'puesto'
  padre_id   text,                                 -- null = raíz
  persona    text,                                 -- `name` del padrón, o null si no tiene cuenta
  nota       text,
  orden      integer not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_nodos_padre on organizacion_nodos (padre_id, orden);

-- Las responsabilidades. Una fila = una cosa de la que alguien (o nadie) responde.
--
-- `manual_id` es `text` pelado y sin `references`, igual que `agenda_items.manual_id`: borrar el
-- manual no falla ni limpia nada, el botón «Cómo se hace» simplemente deja de dibujarse. La flecha
-- es la misma y a propósito — la rutina dice CUÁNDO, la responsabilidad dice DE QUIÉN, y las dos
-- cuelgan del manual que dice CÓMO.
create table if not exists organizacion_resp (
  id         text primary key,
  sector     text not null,                        -- una de las 5 funciones de lib/permisos.ts
  persona    text,                                 -- `name` del padrón, o NULL = sin dueño (el gris)
  clase      text not null default 'responde',     -- responde | entrega | decide | publica | no_es_suyo
  titulo     text not null,
  detalle    text,                                 -- markdown del subconjunto de lib/markdown/core.ts
  manual_id  text,
  orden      integer not null default 0,
  activo     boolean not null default true,
  autor      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_resp_sector on organizacion_resp (sector, orden, titulo);
create index if not exists idx_org_resp_persona on organizacion_resp (persona);

alter table organizacion_nodos disable row level security;
alter table organizacion_resp  disable row level security;
