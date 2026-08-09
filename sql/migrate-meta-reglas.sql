-- Automatizaciones de la pauta de Meta: reglas que MIRAN y PROPONEN, nunca ejecutan.
--
-- ⚠️ VA A UNA SOLA BASE, la de BDI, igual que `meta_ads_snapshot_dia`, `meta_ads_plan` y
-- `meta_ads_accion`, y por el mismo motivo escrito en esos SQL: **las cuentas publicitarias son
-- compartidas entre líneas**, así que "qué detectó una regla" es un hecho único de la cuenta y no
-- una decisión editorial de cada marca. Partirlo por store daría dos mitades de la misma historia.
--
-- # Qué es esto y qué NO es
--
-- Una regla corre sola una vez por día en GitHub Actions, **lee `meta_ads_snapshot_dia`** y deja un
-- HALLAZGO: un renglón que dice qué pasa, con qué números, y qué se podría hacer al respecto. El
-- hallazgo aparece en el Panel dentro de «Qué hay que decidir» y alguien aprieta un botón; recién
-- ahí se arma un plan y recién ahí se escribe en Meta.
--
-- ⛔ **Ninguna regla ejecuta.** Es una decisión de Bruno y es la correcta para plata real sin nadie
-- mirando: el peor caso de un umbral mal puesto es un renglón de más, no un presupuesto duplicado
-- de madrugada. Lo que el motor de planes ya sabe hacer —permisos, sonda, adopción, registro— se
-- reusa entero desde el botón; acá no hay una segunda implementación de "escribir en Meta".
--
-- 🔑 **El script no necesita el token de Meta.** Lee snapshots de Supabase. El día que Meta se
-- caiga o el token venza, las automatizaciones siguen andando y el Panel sigue contestando.
--
-- # Los umbrales, y por qué esta tabla puede estar vacía
--
-- Los umbrales de cada línea no están definidos y nadie los va a inventar. Tres de los seis presets
-- no piden ninguno y se prenden igual (ver `reglas.core.js`); los otros tres llegan con un default
-- MEDIDO sobre los 90 días que ya están en `meta_ads_snapshot_dia`, y con un calibrador que dice
-- cuántas veces habrían saltado. Una regla que pide umbral y no lo tiene cargado **no grita con un
-- default silencioso: queda apagada.** Un aviso con un número inventado enseña a ignorar los avisos.
--
-- Correr con `node scripts/apply-meta-reglas.mjs`. Idempotente.

create table if not exists meta_ads_regla (
  id             bigserial primary key,
  creada         timestamptz not null default now(),
  actualizada    timestamptz not null default now(),
  quien          text not null,
  -- Cuál de los seis presets. La lógica vive en `lib/meta-ads/reglas.core.js`, no acá: esto es sólo
  -- el nombre con el que se la busca. Ver `PRESETS` ahí.
  preset         text not null,
  -- 🔴 `not null`, igual que en `meta_ads_plan`: una regla sin línea propondría acciones sobre
  -- objetos que nadie puede accionar, porque accionar exige el permiso de la línea. Y el ROAS
  -- objetivo de BDI no es el de Stunned: una regla cross-línea no tendría con qué compararse.
  linea          text not null,
  -- `null` = todas las cuentas donde esa línea tenga pauta. Se guarda una sola porque el eje del
  -- módulo es cuenta × línea y a veces se quiere acotar a una (Zattia se muda a cuenta propia).
  cuenta_id      text,
  -- Los umbrales de ESTA regla, sobreescribiendo los de la línea. Vacío = usa los de
  -- `meta_ads_umbral`. Se guarda el override y no una copia completa para que subir el ROAS
  -- objetivo de una línea alcance a todas sus reglas sin editarlas una por una.
  parametros     jsonb not null default '{}'::jsonb,
  activa         boolean not null default false,
  ultima_corrida timestamptz,
  -- Qué pasó en la última corrida, en castellano. Incluye el caso «apagada por falta de umbral»,
  -- que es información y no un error: es lo que se lee en la pantalla para saber por qué no grita.
  detalle        text
);

create table if not exists meta_ads_hallazgo (
  id             bigserial primary key,
  regla_id       bigint not null references meta_ads_regla(id) on delete cascade,
  detectado      timestamptz not null default now(),
  -- El día EN LA ZONA DE LA CUENTA sobre el que se evaluó, no el del runner. Mismo criterio que
  -- `meta_ads_snapshot_dia.fecha`, y tiene que ser el mismo o el `unique` de abajo no cierra.
  fecha          date not null,
  nivel          text not null,           -- 'campania' | 'conjunto' | 'aviso'
  objeto_id      text not null,
  -- El nombre AL MOMENTO de detectarlo, por la misma razón que en el snapshot: un objeto renombrado
  -- después no debería reescribir el renglón que ya se leyó.
  objeto_nombre  text,
  linea          text not null,
  cuenta_id      text not null,
  -- 🔑 La frase que se LEE, con los números adentro («gastó $84.200 en 5 días sin una sola compra»).
  -- Se guarda armada y no se compone en la UI a propósito: el motivo tiene que sobrevivir a que
  -- cambien los umbrales o el preset. Un hallazgo viejo debe seguir diciendo por qué saltó ENTONCES.
  motivo         text not null,
  -- Las filas de snapshot que lo justifican, congeladas. Es lo que permite discutirlo tres días
  -- después sin volver a consultar nada.
  evidencia      jsonb not null default '{}'::jsonb,
  -- La `entrada` lista para `armarPlan…`, o `null` si el preset sólo avisa y no propone una acción
  -- mecánica (fatiga propone pensar un creativo, que no es un POST).
  sugerencia     jsonb,
  -- 'nuevo' | 'accionado' | 'ignorado' | 'caducado'
  estado         text not null default 'nuevo',
  -- Quién lo accionó o lo ignoró, y cuándo. Es la mitad honesta del «historial visible»: acá dice
  -- quién apretó, cosa que una automatización que ejecuta sola no puede decir.
  resuelto_por   text,
  resuelto_en    timestamptz,
  -- El plan que salió de apretar el botón. Es el puente al motor que ya existe.
  plan_id        bigint,
  -- 🔑 La idempotencia del cron: puede correr dos veces el mismo día y no duplica el renglón. Y es
  -- también el freno del ruido — un hallazgo IGNORADO no vuelve a proponerse esa fecha, porque el
  -- upsert choca contra la fila que ya está en 'ignorado' y no la pisa.
  unique (regla_id, fecha, objeto_id)
);

-- Los umbrales POR LÍNEA. Es la tabla que estaba diseñada desde el plan del módulo y nunca se
-- construyó. Todas las columnas son `null`-ables a propósito: **estar sin definir es un estado
-- válido y frecuente**, y es lo que apaga las reglas que dependen de ese número en vez de hacerlas
-- gritar contra un placeholder.
create table if not exists meta_ads_umbral (
  linea             text primary key,
  actualizado       timestamptz not null default now(),
  quien             text,
  roas_objetivo     numeric,
  cpa_maximo        numeric,
  -- Cuánto tiene que haber gastado algo antes de que se lo pueda juzgar. Es el umbral que evita el
  -- hallazgo tonto: un aviso que gastó $300 y no vendió no dice nada.
  --
  -- 🔴 **EN PESOS, no en unidad menor** — y la asimetría con `techo_diario_crudo` de abajo es
  -- deliberada: **cada umbral vive en la unidad de aquello contra lo que se compara.** Éste se
  -- compara contra `meta_ads_snapshot_dia.spend`, que Meta devuelve en pesos; el techo se compara
  -- contra `diario_crudo`, que Meta devuelve en unidad menor. Guardar los dos "en crudo por
  -- consistencia" obligaría a un `/100` en cada punto de comparación, y ese es exactamente el `/100`
  -- perdido contra el que advierte `factorMoneda()` en `acciones.core.js`. El sufijo `_crudo` en el
  -- nombre es lo que hace visible cuál es cuál.
  gasto_minimo      numeric,
  -- 🔴 Se compara contra la frecuencia de UN DÍA, nunca contra una suma. El alcance y la frecuencia
  -- son dedup dentro del período consultado: sumar siete días cuenta siete veces a quien vio el
  -- aviso los siete días, y da un número inflado y creíble. Ver `sumarDias()`, que los devuelve en
  -- `null` justamente para que nadie los sume sin darse cuenta.
  frecuencia_maxima numeric,
  -- El techo del diario al que un escalón puede llegar, en unidad menor. Sin esto, «subí 20%
  -- mientras el ROAS aguante» no tiene freno.
  techo_diario_crudo bigint,
  -- Cuántos días seguidos tiene que cumplirse una condición antes de proponer moverse. Es lo que
  -- separa una tendencia de un día bueno.
  dias_seguidos     int
);

-- `create table if not exists` no toca una tabla que ya está, así que toda columna que se sume
-- después va por acá o no llega nunca a la base donde importa. `if not exists` las hace
-- re-corribles. (Misma nota que en `migrate-meta-planes.sql`.)

-- El umbral de gasto nació como `gasto_minimo_crudo bigint`, en unidad menor "por consistencia" con
-- `diario_crudo`. Estaba mal: se compara contra `spend`, que viene en pesos. Se corrigió el mismo
-- día y con la tabla vacía, pero la primera versión ya se había aplicado en la base de BDI, y
-- `create table if not exists` no la iba a tocar nunca. El `do` mira antes de renombrar, así que es
-- re-corrible y no falla en una base donde la columna ya nació con el nombre bueno.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'meta_ads_umbral' and column_name = 'gasto_minimo_crudo'
  ) then
    alter table meta_ads_umbral rename column gasto_minimo_crudo to gasto_minimo;
    alter table meta_ads_umbral alter column gasto_minimo type numeric;
  end if;
end $$;

-- Las tres consultas reales: los hallazgos vivos de una línea (el Panel), el historial de una regla
-- (la pantalla de Automatizaciones), y las reglas que el cron tiene que evaluar.
create index if not exists idx_meta_hallazgo_linea  on meta_ads_hallazgo (linea, estado, fecha desc);
create index if not exists idx_meta_hallazgo_regla  on meta_ads_hallazgo (regla_id, fecha desc);
create index if not exists idx_meta_regla_activa    on meta_ads_regla (activa, linea);

alter table meta_ads_regla    disable row level security;
alter table meta_ads_hallazgo disable row level security;
alter table meta_ads_umbral   disable row level security;
