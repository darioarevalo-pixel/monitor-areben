-- Línea de pauta de cada campaña de Meta: de qué marca es la plata.
--
-- BDI, Zattia y Stunned se pautean TODAS desde la misma cuenta publicitaria. La versión anterior
-- atribuía con un mapa `cuenta → marca` (`MARCA_POR_CUENTA`, ya borrado) y para una cuenta
-- compartida ese mapa no tiene ningún valor correcto: cualquiera que se cargue le regala a una
-- marca la pauta de las tres. La unidad real es la campaña, y no se deduce de nada que traiga hoy
-- la Graph API — la pone una persona.
--
-- ⚠️ VA A UNA SOLA BASE, la de BDI, y la leen las dos. Es lo contrario de `meta_ads_etapa`, que
-- vive en las dos con columna `store`. La diferencia no es de gusto:
--
--   De quién es la campaña X es un HECHO ÚNICO, no una decisión editorial de cada marca. Si se
--   guardara por store, la pantalla de BDI no tendría cómo saber que X ya se asignó a Zattia —la
--   vería «sin asignar» para siempre— y dos personas podrían asignarla a dos líneas distintas sin
--   que ninguna vea el choque.
--
-- Por eso la PK es `campaign_id` PELADO, sin `store`: esa es la invariante que hace imposible el
-- choque. Mismo criterio que Canjes (base única) y que confirmar una fecha del calendario.
--
-- Correr con `node scripts/apply-meta-ads-linea.mjs`. Idempotente.

create table if not exists meta_ads_campania_linea (
  campaign_id  text primary key,                      -- sin `store`: una campaña tiene UNA línea
  linea        text not null,                         -- 'bdi' | 'zattia' | 'stunned'
  cuenta_id    text not null,                         -- account_id sin `act_`, para poder auditar
  -- El nombre y el objetivo AL MOMENTO de asignar, igual que en `meta_ads_etapa`: si después la
  -- renombran o le cambian el objetivo, la pantalla puede avisar que la asignación quedó vieja en
  -- vez de mentir en silencio.
  nombre       text,
  objetivo     text,
  -- De qué línea venía, si fue una reasignación. Que la plata cambie de marca es justo lo que hay
  -- que poder revisar después, y acá no hay lock que lo impida: hay rastro.
  linea_previa text,
  por          text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- La consulta real es una sola: traer TODAS las asignaciones para repartir el censo de campañas.
-- Son decenas de filas, así que no hace falta más índice que la PK. Éste es para el caso de
-- auditar una cuenta puntual.
create index if not exists idx_meta_ads_campania_linea_cuenta
  on meta_ads_campania_linea (cuenta_id);

alter table meta_ads_campania_linea disable row level security;
