-- Adelantos de sueldo: un TERCER destino de compromiso, el empleado (28-sep-2026).
--
-- ⛔ Correr a mano en el SQL Editor de la base de **BDI** (`srqzzffmiiescffabtlc`), la del
-- Monitor — no la del dashboard. Es re-ejecutable.
--
-- Un cliente mayorista le transfiere directo a un empleado ANTES de que se liquide su sueldo. Mismo
-- circuito que con un acreedor (Pedido → Acreditado), con dos diferencias:
--
--   - **No hay techo.** No existe deuda contra la cual controlar: el sueldo todavía no se liquidó.
--   - **Confirmar no le escribe al dashboard.** El adelanto vive acá hasta que existe la nómina; al
--     liquidar, es el DASHBOARD el que pregunta qué adelantos hay y los cuelga como pagos parciales
--     (`areben-dashboard/lib/adelantos.ts`). ⛔ Lo aplicado no se guarda acá: se cuenta allá, de los
--     pagos con `adelanto_id` = el `operacion_id` de esta fila.
--
-- `acreedor_id` es el id del empleado en el dashboard, igual que para un acreedor es el del
-- proveedor: la columna es "a quién va la plata", y quién es cada id lo dice `origen`.

alter table compromisos_pago add column if not exists mes_sueldo text;
alter table compromisos_pago add column if not exists fecha_acreditado date;

comment on column compromisos_pago.mes_sueldo is
  'Sólo origen empleado: a qué mes de sueldo va el adelanto (AAAA-MM). Entra en esa nómina o en una posterior.';
comment on column compromisos_pago.fecha_acreditado is
  'El día que entró la transferencia, según quien confirmó. Es la fecha del pago de nómina en el dashboard.';

alter table compromisos_pago drop constraint if exists compromisos_pago_origen;
alter table compromisos_pago add constraint compromisos_pago_origen
  check (origen in ('dashboard', 'manual', 'empleado'));

-- Un adelanto sin mes no sabe en qué nómina entrar.
alter table compromisos_pago drop constraint if exists compromisos_pago_empleado_mes;
alter table compromisos_pago add constraint compromisos_pago_empleado_mes
  check (origen <> 'empleado' or mes_sueldo ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- Un adelanto confirmado tampoco tiene `pagos_dashboard` (no se llamó a ninguna puerta), pero sí
-- tiene que decir qué día entró: es la fecha con la que se escribe el pago al liquidar.
alter table compromisos_pago drop constraint if exists compromisos_pago_confirmado_completo;
alter table compromisos_pago add constraint compromisos_pago_confirmado_completo
  check (
    estado <> 'confirmado'
    or (
      monto_confirmado is not null
      and (
        origen = 'manual'
        or (origen = 'empleado' and fecha_acreditado is not null)
        or pagos_dashboard is not null
      )
    )
  );

create index if not exists idx_compromisos_empleado
    on compromisos_pago (acreedor_id) where origen = 'empleado';

comment on column compromisos_pago.origen is
  'dashboard = acreedor del dashboard (confirmar escribe en su ledger). manual = cuenta de acá. empleado = adelanto de sueldo (se aplica al liquidar, desde el dashboard).';
