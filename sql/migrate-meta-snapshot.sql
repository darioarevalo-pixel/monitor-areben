-- La foto diaria de la pauta de Meta: una fila por objeto por día.
--
-- ⚠️ VA A UNA SOLA BASE, la de BDI, y guarda las tres líneas. Mismo razonamiento que
-- `meta_ads_campania_linea` y `meta_ads_accion` (ver los SQL de al lado): las cuentas
-- publicitarias son compartidas entre líneas, así que "cuánto gastó esto el martes" es un hecho
-- único y no una decisión editorial de cada marca. Partirlo por store daría dos historias
-- parciales de la misma cuenta.
--
-- # Por qué existe esta tabla
--
-- Hasta ahora todo se le preguntaba a Graph en vivo, y una consulta en vivo contesta "cómo está
-- hoy", nunca "cómo venía". Sin serie no hay tendencia, no hay fatiga y no hay "este conjunto ya
-- gastó lo suficiente para juzgarlo" — o sea, no hay escalado que no sea adivinar. El histórico
-- se venía guardando a mano en CSVs fuera del repo (`~/Projects/analista-meta/datos/`).
--
-- # Una fila POR DÍA, y las ventanas se derivan sumando
--
-- Se guarda sólo el día (`time_increment=1`). Los "últimos 7" o "últimos 30" se calculan sumando,
-- no se guardan aparte: guardar la misma verdad en dos granularidades es la forma más rápida de
-- que las dos empiecen a discrepar.
--
-- 🔴 **`alcance` y `frecuencia` NO se suman entre días.** El alcance de Meta es gente única
-- deduplicada dentro del período consultado: sumar el alcance de siete días cuenta siete veces a
-- quien vio el aviso los siete días. Para un alcance de 7 días hay que **preguntárselo a Meta con
-- ese rango**. Acá se guardan igual porque el alcance y la frecuencia DEL DÍA son el dato con el
-- que se detecta la fatiga (una frecuencia diaria que sube es un público que se está quemando), y
-- ese sí es válido día por día.
--
-- Los ratios (`ctr`, `cpc`, `cpm`, `roas`) se guardan aunque sean derivables porque `roas` NO es
-- `revenue / spend`: sale de `purchase_roas`, que Meta calcula con la ventana de atribución. Al
-- sumar días hay que **recalcular los ratios desde los agregados**, nunca promediarlos.
--
-- # `diario_crudo`: el presupuesto vigente ese día
--
-- 🔑 Sin esta columna no se sabe CUÁNDO cambió el presupuesto, y entonces no se puede medir el
-- efecto de un escalón: "subí 20% y mejoró" no se puede afirmar si no está registrado el día en
-- que se subió. Va en la UNIDAD MENOR de la moneda, como la devuelve Meta (en ARS, `150000` es
-- $1.500). Se guarda cruda a propósito, para que la conversión sea una decisión visible y no un
-- `/100` perdido en el medio. Ver `factorMoneda()` en `lib/meta-ads/acciones.core.js`.
--
-- # `estado_real`: lo que la API no contesta aunque no mienta
--
-- Un conjunto puede figurar `ACTIVE` con TODOS sus avisos apagados: no está pausado y tampoco
-- puede entregar. `status` y `effective_status` los dos dicen la verdad y ninguno contesta esa
-- pregunta. Se calcula mirando los estados de los avisos que cuelgan (ver `estadoRealDe()` en
-- `lib/meta-ads/snapshot.core.js`). Es la columna que hasta hoy se llenaba a ojo mirando la
-- columna "Entrega" de Ads Manager.
--
-- Correr con `node scripts/apply-meta-snapshot.mjs`. Idempotente.

create table if not exists meta_ads_snapshot_dia (
  -- El día EN LA ZONA DE LA CUENTA, que es como Meta corta `time_increment=1`. No es el día del
  -- runner: el cron corre en UTC y en Argentina eso adelantaría la fecha después de las 21 h.
  fecha           date not null,
  nivel           text not null,          -- 'cuenta' | 'campania' | 'conjunto' | 'aviso'
  objeto_id       text not null,
  cuenta_id       text not null,
  -- El padre, para poder agrupar sin volver a preguntarle a Meta. Para el nivel 'campania',
  -- `campaign_id` es el mismo `objeto_id`.
  campaign_id     text,
  adset_id        text,
  -- El nombre AL MOMENTO DE LA FOTO. Se guarda y no se joinea contra el nombre de hoy a propósito:
  -- una campaña renombrada ayer no debería reescribir su propia historia.
  nombre          text,
  linea           text,                   -- 'bdi' | 'zattia' | 'stunned' | null si nadie la asignó
  objetivo        text,
  estado          text,                   -- status
  estado_efectivo text,                   -- effective_status
  estado_real     text,                   -- 'entregando'|'avisos-desactivados'|'sin-avisos'|'pausado'
  diario_crudo    bigint,
  moneda          text,

  spend           numeric,
  impresiones     bigint,
  alcance         bigint,                 -- 🔴 dedup: NO sumar entre días
  frecuencia      numeric,                -- 🔴 ídem
  clicks          bigint,
  ctr             numeric,
  cpc             numeric,
  cpm             numeric,
  compras         numeric,                -- omni_purchase, dedup cross-surface
  revenue         numeric,
  roas            numeric,                -- de purchase_roas, NO revenue/spend
  visitas_perfil  numeric,
  seguidores      numeric,

  capturado_at    timestamptz not null default now(),

  -- Sin `ventana_dias`: una sola granularidad, la del día. Ver el comentario de arriba.
  primary key (fecha, nivel, objeto_id)
);

-- `create table if not exists` no toca una tabla que ya está, así que toda columna que se sume
-- después va por acá o no llega nunca a la base donde importa. `if not exists` las hace re-corribles.
alter table meta_ads_snapshot_dia add column if not exists estado_real   text;
alter table meta_ads_snapshot_dia add column if not exists diario_crudo  bigint;

-- El embudo, agregado el 23-ago-2026. Graph YA los mandaba: `CAMPOS_INSIGHTS` pide `actions` y
-- `FUNNEL` tiene los tres `action_type` desde antes — se leían para la pantalla y se tiraban al
-- guardar. Cero llamadas nuevas a Meta.
-- 🔑 Por qué importan: con $10.000 un test compra ~1,5 COMPRAS y ~30 CARRITOS. Decidir si una
-- pieza sirve con n=1,5 es tirar una moneda (medido: la regla de "1 venta = aprobado" mató una
-- pieza buena por $7 y aprobó una mala por $60). Con 30 eventos se decide.
-- 🔴 Nacen NULL y las filas viejas se quedan NULL A PROPÓSITO: un 0 en "carritos" dice "esta
-- pieza no hizo agregar ninguno", y eso es una afirmación que estas filas no pueden hacer.
-- Quien las lea tiene que distinguir "no lo medíamos" de "dio cero".
alter table meta_ads_snapshot_dia add column if not exists carritos      numeric;
alter table meta_ads_snapshot_dia add column if not exists checkouts     numeric;
alter table meta_ads_snapshot_dia add column if not exists lpv           numeric;

-- Las tres consultas reales:
--   1. la serie de UN objeto (el gráfico de tendencia, y el "viene cayendo" del escalado)
--   2. todo lo de una línea en un rango (el Panel y los candidatos a escalar/podar)
--   3. qué fechas ya están cargadas (para que el backfill no repita trabajo)
create index if not exists idx_meta_snap_objeto on meta_ads_snapshot_dia (objeto_id, fecha desc);
create index if not exists idx_meta_snap_linea  on meta_ads_snapshot_dia (linea, fecha desc);
create index if not exists idx_meta_snap_fecha  on meta_ads_snapshot_dia (fecha desc, nivel);

alter table meta_ads_snapshot_dia disable row level security;
