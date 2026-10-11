-- Caja: lo que pide la auditoría del 11-oct-2026 para reemplazar al POS de GN (A7, A8, B2, B3, B4, B5).
-- Correr en el proyecto Supabase de ZATTIA, ANTES del push: el handler nuevo escribe estas columnas y,
-- sin ellas, ⛔ cobra (el insert de la venta falla).
--   node scripts/aplicar-sql.mjs sql/migrate-caja-auditoria.sql caja_venta
--   (en BDI da «relation caja_venta does not exist»: es lo ESPERADO, la Caja es sólo de Zattia)
--
-- A7 — LA CARRERA CONFIRMAR / CERRAR TURNO: una venta podía guardarse en un turno que se estaba cerrando
-- y quedar fuera de su foto (y del próximo). El trigger frena el insert de una venta o de un movimiento
-- en un turno CERRADO, y toma el turno `for share`: el `update` del cierre espera a que termine el
-- insert que ya pasó el control, y el handler relee las ventas DESPUÉS de cerrar.
--
-- A8 + B4 — LOS MOVIMIENTOS DEL TURNO: `aporte` (entra efectivo: el cambio que trae alguien) además de
-- `salida`, quién lo cargó con un dato que ⛔ cambia (`usuario_cuenta`, el mail del padrón), y se ANULAN
-- (⛔ se borran): la fila queda, tachada, con quién, cuándo y por qué.
--
-- B2 — RESOLVER UNA VENTA QUE GN RECHAZÓ: `resolucion` = { tipo: 'a_mano' | 'descartada', por, en,
-- nota, gn_number? }. La descartada (estado nuevo) deja de sumar al turno, como la cancelada.
-- B3 — CONFIRMAR UNA TRANSFERENCIA A MANO (admin): `confirmacion` = { por, en, comprobante }.
-- B5 — LO HECHO A MANO, A LA VISTA (Bruno, 11-oct: «libre pero a la vista»): `a_mano` = { venta,
-- prendas, precios } en pesos: el descuento a la venta, el de las prendas y lo que se bajó el precio.
--
-- VERIFICACIÓN (tiene que dar: las 3 columnas de caja_venta · las 4 de caja_turno_mov · los 2 triggers
-- · y los tres checks con los valores nuevos):
--   select column_name from information_schema.columns where table_name = 'caja_venta' and column_name in ('resolucion', 'confirmacion', 'a_mano') order by 1;
--   select column_name from information_schema.columns where table_name = 'caja_turno_mov' and column_name in ('usuario_cuenta', 'anulado_en', 'anulado_por', 'anulado_motivo') order by 1;
--   select tgname from pg_trigger where tgname in ('caja_venta_turno_abierto', 'caja_turno_mov_turno_abierto') order by 1;
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('caja_venta_estado_check', 'caja_venta_mp_cruce_check', 'caja_turno_mov_tipo_check');

alter table caja_venta drop constraint if exists caja_venta_estado_check;
alter table caja_venta add constraint caja_venta_estado_check
  check (estado in ('borrador', 'enviando', 'en_gn', 'error', 'esperando_pago', 'cancelada', 'descartada'));
-- B3: `mp_cruce = 'admin'` (la confirmó un admin con el comprobante, sin pago de MP).
alter table caja_venta drop constraint if exists caja_venta_mp_cruce_check;
alter table caja_venta add constraint caja_venta_mp_cruce_check check (mp_cruce in ('solo', 'cajera', 'admin'));
alter table caja_venta add column if not exists resolucion jsonb;
alter table caja_venta add column if not exists confirmacion jsonb;
alter table caja_venta add column if not exists a_mano jsonb;

alter table caja_turno_mov drop constraint if exists caja_turno_mov_tipo_check;
alter table caja_turno_mov add constraint caja_turno_mov_tipo_check check (tipo in ('salida', 'aporte'));
alter table caja_turno_mov add column if not exists usuario_cuenta text;
alter table caja_turno_mov add column if not exists anulado_en timestamptz;
alter table caja_turno_mov add column if not exists anulado_por text;
alter table caja_turno_mov add column if not exists anulado_motivo text;

create or replace function caja_turno_abierto_chk() returns trigger language plpgsql as $$
declare
  cerrado timestamptz;
begin
  if new.turno_id is null then
    return new;
  end if;
  select cerrado_en into cerrado from caja_turno where id = new.turno_id for share;
  if cerrado is not null then
    raise exception 'caja_turno_cerrado: el turno ya está cerrado' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists caja_venta_turno_abierto on caja_venta;
create trigger caja_venta_turno_abierto before insert on caja_venta
  for each row execute function caja_turno_abierto_chk();
drop trigger if exists caja_turno_mov_turno_abierto on caja_turno_mov;
create trigger caja_turno_mov_turno_abierto before insert on caja_turno_mov
  for each row execute function caja_turno_abierto_chk();
