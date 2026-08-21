-- Votación de diseños por link: rondas y boletas (Compras → Diseños).
--
-- Antes vivía en OTRO repo: `bdi-catalogo/api/votacion.js` sobre KV, con la página pública
-- `bdi-catalogo.vercel.app/votar`. Funcionaba, pero traía tres cosas que no se arreglan desde
-- afuera:
--   1. La ronda vigente se guardaba en el `localStorage` del que la creaba, así que el link no lo
--      veía nadie más del equipo — un tablero compartido con una votación de un solo navegador.
--   2. Los votos volvían PISANDO los contadores 👍/👎 del tablero, que son otra cosa: el voto
--      rápido de la oficina. Traer los votos online borraba los de la mesa.
--   3. Copiaba cada imagen al KV del otro proyecto, una por una, aunque el tablero ya guarda
--      URLs públicas de Vercel Blob que el portal puede leer directo.
--
-- Acá las boletas quedan al lado del tablero, y el link es un portal propio del monitor
-- (`/votacion/<token>`), con el mismo molde que `/reclamo/<token>` y `/canje/<token>`.
--
-- Correr con `node scripts/apply-disenos-votacion.mjs`. Idempotente. Crea tablas NUEVAS: no toca
-- `disenos` ni migra nada.

-- Una ronda = un link. El snapshot de `disenos` va CONGELADO a propósito, por dos motivos:
--   - Es la whitelist de salida: entran `id`, `name` y `url`, y nada más. La `nota` del tablero
--     ("Pros / contras") es un juicio interno del equipo y no puede viajar a un portal abierto —
--     mismo criterio que `vetada_motivo` en `api/_canje-portal.js`.
--   - El link tiene que abrir aunque después alguien saque el diseño del tablero. Igual que la
--     vitrina de canjes, que viaja congelada para no depender de Tienda Nube.
create table if not exists disenos_rondas (
  id           text primary key,
  store        text not null,                        -- 'bdi' | 'zattia'
  titulo       text not null default '',
  token        text not null unique,                 -- 64 hex: la llave del link, no se adivina
  token_vence  timestamptz not null,
  cerrada_at   timestamptz,                          -- cerrar = revocar el link; los votos quedan
  creada_por   text,
  disenos      jsonb not null default '[]'::jsonb,   -- [{ id, name, url }]
  created_at   timestamptz not null default now()
);

create index if not exists idx_disenos_rondas_store on disenos_rondas (store, created_at desc);

-- Una fila por persona y por ronda. La clave primaria es lo que hace que volver a entrar al link
-- CORRIJA el voto en vez de apilar otro: el portal manda la boleta entera y esto la pisa.
create table if not exists disenos_votos (
  ronda_id   text not null references disenos_rondas(id) on delete cascade,
  votante_id text not null,                          -- id de dispositivo (localStorage del votante)
  nombre     text not null default '',
  puntajes   jsonb not null default '{}'::jsonb,     -- { "<idDiseño>": 1..5 }
  updated_at timestamptz not null default now(),
  primary key (ronda_id, votante_id)
);

create index if not exists idx_disenos_votos_ronda on disenos_votos (ronda_id);

alter table disenos_rondas disable row level security;
alter table disenos_votos  disable row level security;
