-- Novedades: lo que cambió en los sistemas, y quién lo leyó.
--
-- # Por qué NO tiene columna `store`
--
-- Todas las tablas del monitor van con PK `(store, id)`, y ésta se sale del molde a propósito: una
-- novedad es del SISTEMA, no de BDI ni de Zattia. Duplicarla por marca duplicaría el registro de
-- lectura —¿leyó la de BDI y no la de Zattia?— y haría que el cartel apareciera dos veces al
-- cambiar de marca. Una columna que sólo puede tener un valor es un campo que miente.
--
-- Por lo mismo vive en la base de BDI y en ninguna otra. Hay un motivo duro además del conceptual:
-- Zattia no tiene `ZATTIA_SUPABASE_SERVICE_KEY`, escribe con anon key, y un registro de quién leyó
-- qué no puede depender de eso. Mismo criterio que Canjes.
--
-- Correr con `node scripts/apply-novedades.mjs`. Idempotente.

create table if not exists novedades (
  id           text primary key,                    -- n<epoch>_<rand>, generado en el cliente
  estado       text not null default 'borrador',    -- borrador | publicada | archivada
  importante   boolean not null default false,      -- las que frenan al entrar (cartel)
  titulo       text not null,
  cuerpo       text not null,                       -- markdown del subconjunto de lib/markdown
  version      integer not null default 1,
  autor        text,                                -- perfil.name de quien publicó
  publicada_at timestamptz,
  -- A quién le llega: {tipo:'todos'} | {tipo:'seccion',key} | {tipo:'roles',roles[]}.
  -- Ver lib/novedades/destino.core.js. El filtro corre en el SERVIDOR: si sólo filtrara la
  -- pantalla, una novedad que no es para vos igual te encendería el badge y te frenaría el cartel.
  destino      jsonb not null default '{"tipo":"todos"}'::jsonb,
  datos        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Para las bases donde la tabla ya existía sin la columna (la de BDI, creada el 9-ago-2026).
alter table novedades add column if not exists destino jsonb not null default '{"tipo":"todos"}'::jsonb;

create index if not exists idx_novedades_estado on novedades (estado, publicada_at desc);

-- # Por qué la versión entra en la clave
--
-- Si una novedad importante se corrige y hay que volver a hacerla leer, se sube `version` y todos
-- la vuelven a ver **sin borrar** que la habían leído en la v1 — que es justo el dato que se quiere
-- conservar. Sin esto, la única forma de re-mostrarla sería destruir el historial.
--
-- `usuario` es `perfil.name` y no el mail: los puestos compartidos (`Local`, `Depósito`) tienen
-- email null. ⚠️ Eso significa que "el puesto Local marcó leído" NO es "una persona se enteró", y
-- la pantalla lo tiene que decir.
create table if not exists novedades_leidas (
  novedad_id text not null references novedades(id) on delete cascade,
  usuario    text not null,
  version    integer not null default 1,
  leida_at   timestamptz not null default now(),
  primary key (novedad_id, usuario, version)
);

create index if not exists idx_novedades_leidas_usuario on novedades_leidas (usuario);

alter table novedades disable row level security;
alter table novedades_leidas disable row level security;
