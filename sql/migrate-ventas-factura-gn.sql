-- La factura que GN ya emitió para cada venta. Va en las DOS bases; la escribe `guardarVentasBatch`
-- (scripts/lib/ventas-espejo.mjs), igual que `ventas_cobros`.
--   node scripts/aplicar-sql.mjs sql/migrate-ventas-factura-gn.sql ventas_factura_gn
--
-- 🔑 POR QUÉ EXISTE (ERP, F5 facturación, 12-oct-2026). Mientras GN siga facturando, lo pendiente del
-- mes es el techo MENOS lo que ya facturó GN y lo que facturó el monitor. Sin esto el monitor ve como
-- pendiente lo que GN ya facturó ⇒ la misma venta, dos facturas. El dashboard lo traía en vivo de GN
-- («Sincronizar facturación», `facturas_emitidas` origen gn); oráculo: sep-2026 = 650 facturas,
-- $29.904.039,40. Se imputa por `date_sale`, como el dashboard: GN ⛔ da la fecha de la factura.
--
-- Una venta releída REEMPLAZA su fila; una que perdió la factura (anulada en GN) queda sin fila.
--
-- PRECONDICIONES: `ventas` con `id` como clave primaria (verificado en las dos bases el 12-oct).
-- Sin la tabla el sync guarda las ventas igual y avisa: ⛔ frena el espejo.
--
-- VERIFICACIÓN (después del próximo sync de ventas):
--   select to_char(fecha, 'YYYY-MM'), count(*), sum(monto) from ventas_factura_gn group by 1 order by 1;
--
-- ROLLBACK (se vuelve a llenar sola con el sync, hasta 90 días atrás):
--   drop table if exists ventas_factura_gn;

create table if not exists ventas_factura_gn (
  venta_id   bigint primary key references ventas(id) on delete cascade,
  numero     text not null,              -- «B 00002-00012144», como lo muestra GN
  tipo       text,                       -- 'A' | 'B'
  pto_vta    integer,
  voucher    bigint,
  cae        text,
  estado     text,                       -- el de GN: 'APROBADO', …
  fecha      date,                       -- el día de la VENTA (GN ⛔ da el de la factura)
  monto      numeric(14, 2) not null     -- el total de la venta, como lo cuenta el dashboard
);

create index if not exists ventas_factura_gn_fecha_idx on ventas_factura_gn (fecha);

-- El navegador no lee Supabase (Fase S): RLS prendido y sin políticas ⇒ sólo la service key.
alter table ventas_factura_gn enable row level security;

-- 🔑 El MES por el que se emite cada factura del monitor (sólo en BDI: `facturas` no existe en Zattia,
-- y el `if exists` lo vuelve un no-op ahí). La factura sale con fecha de HOY (ARCA acepta ±5 días),
-- así que el techo de septiembre se factura a principios de octubre: sin esta columna esas facturas
-- contarían en octubre. GN las imputa por la fecha de la venta, que cae en el mes del techo.
alter table if exists facturas add column if not exists mes text check (mes ~ '^\d{4}-\d{2}$');
