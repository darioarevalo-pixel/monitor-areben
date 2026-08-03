-- Etapas de la pauta: el override de clasificación y las ideas de creativos (Marketing).
--
-- Nace del mismo problema que la pantalla `/meta-ads/etapas`: toda la pauta de BDI y Zattia es de
-- la primera etapa, y el cuello de botella no es pautar —eso lo hace Bruno— sino que nadie del
-- equipo sabía qué estadios estaban corriendo, así que nadie craneaba los creativos que faltaban.
--
--   `meta_ads_etapa`  — la corrección manual de la etapa de una campaña.
--   `meta_ads_ideas`  — las ideas de creativos que anota el equipo, con su ciclo de estados.
--
-- ⚠️ Por qué el override NO es un capricho: la etapa es una propiedad del PÚBLICO, no del objetivo
-- de la campaña. Una campaña `OUTCOME_SALES` apuntada a gente que nunca te vio es prospecting
-- disfrazado de BOFU, y el mapa automático la cuenta como BOFU igual. El `objective` es la mejor
-- aproximación posible con los datos que hoy se traen de la Graph API; esta tabla es la válvula
-- que hace que el diagnóstico sea confiable. El detalle está en `lib/meta-ads/etapas.core.js`.
--
-- Se guardan `objetivo` y `nombre` AL MOMENTO de corregir, y no por prolijidad: si después le
-- cambian el objetivo a la campaña, el override queda mintiendo en silencio y no habría forma de
-- notarlo. Con la foto vieja al lado, la fila puede avisar "cambió el objetivo desde que la
-- corregiste".
--
-- Va en las DOS bases (hay una Supabase por marca), con columna `store` y PK compuesta, igual que
-- `disenos`. `datos jsonb` es la fuente de verdad de la idea —incluido el historial de estados— y
-- las columnas de al lado son proyecciones para filtrar y ordenar.
--
-- Correr con `node scripts/apply-meta-funnel.mjs`. Idempotente.

create table if not exists meta_ads_etapa (
  campaign_id text not null,
  store       text not null,                          -- 'bdi' | 'zattia'
  cuenta_id   text not null,                          -- account_id sin `act_`, para poder auditar
  etapa       text not null,                          -- 'tofu' | 'mofu' | 'bofu'
  objetivo    text,                                   -- el objetivo AL MOMENTO de corregir…
  nombre      text,                                   -- …y el nombre, para detectar que cambiaron
  motivo      text,
  por         text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (store, campaign_id)
);

create table if not exists meta_ads_ideas (
  id          text not null,                          -- `i<epoch>_<rand>`, generado en el cliente
  store       text not null,
  etapa       text not null,                          -- 'tofu' | 'mofu' | 'bofu'
  estado      text not null default 'propuesta',      -- propuesta|aprobada|en-produccion|lista|pauteada|descartada
  evento      text,                                   -- a qué fecha apunta: `comercial:<clave>:<año>` o `hito:<id>`
  titulo      text not null,
  creado      bigint,
  creado_por  text,
  datos       jsonb not null,                         -- el documento completo + historial de estados
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (store, id)
);

-- Las dos consultas reales: el tablero por marca, y "qué ideas cuelgan de esta fecha" (el renglón
-- "Etapas armadas" del calendario, que es lo que convierte una fecha en un pedido concreto).
create index if not exists idx_meta_ads_ideas_store on meta_ads_ideas (store, updated_at desc);
create index if not exists idx_meta_ads_ideas_evento on meta_ads_ideas (store, evento);

alter table meta_ads_etapa disable row level security;
alter table meta_ads_ideas disable row level security;
