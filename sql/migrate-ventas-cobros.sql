-- Los cobros de cada venta, como los da GN (`include_payments=1`). Van en las DOS bases (cada una
-- tiene su espejo de ventas); los escribe `guardarVentasBatch` (scripts/lib/ventas-espejo.mjs).
--   node scripts/aplicar-sql.mjs sql/migrate-ventas-cobros.sql ventas_cobros
--
-- 🔑 POR QUÉ EXISTE (ERP propio, F5 facturación, Bruno 12-oct-2026). El techo de facturación del mes
-- es lo que ENTRÓ a cuentas de Areben, imputado por la fecha y la cuenta de CADA COBRO: una venta
-- puede cobrarse en dos cuentas y en otro mes que el de la venta. El espejo guardaba una sola cuenta
-- por venta (`account_display`) ⇒ con eso el techo da otro número. Lo calculaba el dashboard bajando
-- GN; desde el 12-oct lo calcula el monitor (`lib/arca/techo.core.js`). Validado contra GN: sep-2026
-- dio $29.903.066,32, igual al centavo que el cierre del dashboard.
--
-- Cada vez que el sync relee una venta (90 días) le REEMPLAZA los cobros, y si GN la deja de devolver
-- y la purga la borra, sus cobros se van con ella (`on delete cascade`). Las anuladas, archivadas y
-- presupuestos quedan sin cobros (`ventaCuenta`).
--
-- PRECONDICIONES: `ventas` con `id` como clave primaria (verificado en las dos bases el 12-oct).
-- Sin esta tabla el sync guarda las ventas igual y avisa (`sinCobros`): ⛔ frena el espejo.
--
-- VERIFICACIÓN (después del próximo sync):
--   select date_trunc('month', fecha), count(*), sum(monto) from ventas_cobros group by 1 order by 1;
--
-- ROLLBACK (se vuelve a llenar sola con el sync, hasta 90 días atrás):
--   drop table if exists ventas_cobros;

create table if not exists ventas_cobros (
  venta_id   bigint not null references ventas(id) on delete cascade,
  n          smallint not null,          -- posición del cobro dentro de la venta (0, 1, …)
  fecha      date,                       -- el día del COBRO (≠ el de la venta)
  cuenta     text,                       -- la cuenta de cobro de GN, tal cual (`account_name`)
  monto      numeric(14, 2) not null,
  primary key (venta_id, n)
);

create index if not exists ventas_cobros_fecha_idx on ventas_cobros (fecha);

-- El navegador no lee Supabase (Fase S): RLS prendido y sin políticas ⇒ sólo la service key.
alter table ventas_cobros enable row level security;
