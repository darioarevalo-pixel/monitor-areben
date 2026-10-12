-- Registro de las ventas que el MONITOR crea en Gestión Nube: una fila por venta, con las prendas que
-- se mandaron, de qué depósito, cuándo y desde qué flujo. La escribe `api/crear-venta.js` (la única
-- puerta del monitor que crea ventas en GN, salvo la Caja, que guarda las suyas en `caja_venta`).
-- Se aplica en las dos bases: `node scripts/aplicar-sql.mjs sql/migrate-gn-venta-monitor.sql gn_venta_monitor`.
--
-- 🔑 POR QUÉ EXISTE (libro de stock en sombra, ERP propio, Bruno 12-oct-2026). Para apagar GN, cada
-- venta que origina el monitor tiene que tener el dato completo POR SÍ SOLA: qué prendas, cuántas, de
-- qué depósito y a qué hora. Medido el 12-oct, varias fuentes ⛔ lo guardaban: Stunned TN guarda un
-- CONTEO de renglones, el canje por envío resuelve los ids de GN y ⛔ los guarda, las regaladas de un
-- reclamo guardan sólo el NÚMERO, el reemplazo ⛔ guarda la hora, las solicitudes tampoco, y la falla
-- «recibida» pisa de dónde salió. En vez de arreglar cada fuente, se anota en la puerta común.
-- (`~/Projects/areben-libro-stock/PENDIENTES.md`, «Lo que la F2 encontró en el MONITOR».)
--
-- `ref` es el `integration_id` que se le manda a GN (`falla-12-local`, `reclamo-5-regaladas-deposito`,
-- el número de orden de TN…): dice de qué hecho del monitor salió la venta.
-- `anulada_en`: GN ⛔ anula por API, así que hoy la anulación la hace una persona en la web de GN y acá
-- se ANOTA (verificando contra GN que de verdad ya no está activa). Sin GN, éste es el registro.
--
-- PRECONDICIONES: ninguna. No toca ninguna tabla existente.
--
-- VERIFICACIÓN (después de la primera venta creada desde el monitor):
--   select marca, proposito, count(*), max(creada_en) from gn_venta_monitor group by 1, 2 order by 4 desc;
--
-- ROLLBACK (se lleva el registro; las ventas siguen en GN):
--   drop table if exists gn_venta_monitor;

create table if not exists gn_venta_monitor (
  gn_venta_id   bigint      primary key,   -- el id interno de GN (el que trae el espejo en `ventas.id`)
  gn_number     text,                      -- el número que se ve en la pantalla de GN
  marca         text        not null,      -- el `store` del pedido: 'zattia' · 'bdi' · 'stunned' (vive en la base de Zattia)
  proposito     text        not null,      -- fotos · falla · canje · reclamo · cambio · cambio_real · reingreso · tn_import
  ref           text        not null,      -- el `integration_id` que se mandó a GN
  store_id      bigint      not null,      -- el depósito de GN del que salió (18210/11780 Zattia, 13307/18393 BDI)
  lineas        jsonb       not null,      -- [{product_id, size_id, quantity, unit_price}] tal como se mandaron
  creada_en     timestamptz not null default now(),
  creada_por    text,
  anulada_en    timestamptz,
  anulada_por   text,
  anulada_nota  text
);

create index if not exists gn_venta_monitor_ref_idx on gn_venta_monitor (ref);
create index if not exists gn_venta_monitor_creada_idx on gn_venta_monitor (creada_en);

-- El navegador no lee Supabase (Fase S): RLS prendido y sin políticas ⇒ sólo la service key.
alter table gn_venta_monitor enable row level security;
