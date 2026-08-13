-- El umbral de rentabilidad de cada línea de pauta: hasta cuánto se puede pagar por una compra.
--
-- Tanda 2 de `/meta-ads/rentabilidad`. La tanda 1 salió con los supuestos clavados en el código y
-- lo que se movía se perdía al salir de la pantalla. Esto los guarda.
--
-- ⚠️ LA CLAVE ES LA LÍNEA, NO EL STORE. BDI, Zattia y Stunned se pautean desde la misma cuenta
-- publicitaria y el eje de toda la sección es la línea (`lib/meta-ads/lineas.core.js`). El techo se
-- compara contra el costo por compra de un CONJUNTO, y los conjuntos cuelgan de una línea. Stunned
-- además no es una `Marca` del monitor: guardar esto por store lo dejaría sin lugar propio, o
-- peor, compartiendo el techo de Zattia — que es otro producto, con otro costo y otro margen.
--
-- ⚠️ VA A UNA SOLA BASE, la de BDI, igual que `meta_ads_campania_linea` y `meta_ads_accion`. Las
-- tres describen la misma cuenta publicitaria. Y hay un motivo más, propio de esta tabla: el
-- semáforo de la tanda 3 va a querer leer las tres líneas de una para comparar techos contra la
-- foto diaria, y con las filas repartidas en dos bases eso son dos viajes y un merge a mano.
--
-- 🔑 LOS SUPUESTOS VAN EN UN `jsonb` Y NO EN 19 COLUMNAS. Son los parámetros de un modelo, no
-- entidades: se leen y se escriben SIEMPRE juntos, ninguna consulta filtra por «los que tienen IVA
-- 21» y agregar uno mañana no puede costar una migración en producción. Lo que protege de que
-- entre cualquier cosa no es el tipo de la columna sino `normalizar()`
-- (`lib/meta-ads/rentabilidad.core.js`), que corre en el handler ANTES del upsert: un campo que
-- falta o que vino mal cae al default, y uno fuera de rango se recorta contra el borde.
--
-- Correr con `node scripts/apply-meta-rentabilidad.mjs`. Idempotente.

create table if not exists meta_ads_rentabilidad (
  linea       text primary key,                      -- 'bdi' | 'zattia' | 'stunned'
  supuestos   jsonb not null,
  -- Quién lo dejó así. El umbral define qué se lee como «rinde» en todas las otras pantallas: que
  -- se pueda preguntar quién lo movió no es auditoría de más, es la primera pregunta.
  por         text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Son tres filas: no hay índice que agregar más allá de la PK.

-- 🔴 RLS PRENDIDA, y sin política.
--
-- `migrate-rls.sql` (13-ago-2026) la prende en bucle sobre todas las tablas que existían ESE día,
-- así que una tabla nueva nace afuera de ese barrido: hay que prenderla acá o queda abierta para
-- cualquiera que tenga la anon key. Sin política, `anon` no lee ni escribe — y está bien: el
-- navegador nunca toca esta tabla, entra por `api/datos.js?recurso=meta-rentabilidad`, que usa la
-- service key y no mira RLS.
alter table meta_ads_rentabilidad enable row level security;
revoke all on meta_ads_rentabilidad from anon;
