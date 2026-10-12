-- Foto diaria del stock de GN: una por día, la PRIMERA del día (el sync de las 06:40, con el local
-- cerrado). Se aplica en las dos bases (`node scripts/aplicar-sql.mjs sql/migrate-stock-foto.sql
-- stock_foto`); la escriben `sync-diario.js` y `sync-diario-zattia.js` (scripts/lib/stock-foto.mjs).
--
-- 🔑 POR QUÉ EXISTE (libro de stock en sombra, ERP propio, Bruno 12-oct-2026). El libro compara cada
-- día cuánto cambió el stock de GN contra los movimientos que el monitor conoce. El espejo
-- `inventario` pisa la foto en cada sync y `stock_cambios` guarda sólo lo que cambió entre DOS syncs
-- cualesquiera (incluido el de mediodía, con el local abierto) ⇒ no hay contra qué comparar día por
-- día. Medido el 12-oct: ⛔ hay historia del stock de GN antes del 11-oct, y cada día sin foto se
-- pierde para siempre (`~/Documents/erp-monitor/mediciones/2026-10-12-libro-sombra-f0.md`).
--
-- Se guardan SÓLO las filas con cantidad ≠ 0: la que falta vale 0. Son ~3.000 filas por día en BDI y
-- ~1.200 en Zattia (medido el 12-oct), ~150 MB por año entre las dos.
-- ⚠️ Igual que el espejo, ⛔ trae el stock de los productos INACTIVOS (el sync los saltea).
--
-- PRECONDICIONES: ninguna. No toca ninguna tabla existente.
--
-- VERIFICACIÓN (después del sync de la mañana, una sola foto por día y tomada temprano):
--   select fecha, count(*), sum(cantidad), min(tomada_en), max(tomada_en) from stock_foto group by fecha order by fecha desc;
--
-- ROLLBACK (⚠️ se lleva la historia, que no se puede volver a bajar de GN):
--   drop table if exists stock_foto;

create table if not exists stock_foto (
  fecha        date        not null,      -- día de Argentina de la foto
  product_id   bigint      not null,
  size_id      bigint      not null,
  store_name   text        not null,      -- igual que `inventario`: 'Local', 'Deposito ' (con espacio), …
  cantidad     integer     not null,      -- ≠ 0 siempre (las de 0 no se guardan)
  tomada_en    timestamptz not null,      -- cuándo la bajó el sync: la de las 06:40 o, si esa falló, la de más tarde
  primary key (fecha, product_id, size_id, store_name)
);

create index if not exists stock_foto_variante_idx on stock_foto (product_id, size_id, store_name, fecha);

-- El navegador no lee Supabase (Fase S): RLS prendido y sin políticas ⇒ sólo la service key.
alter table stock_foto enable row level security;
