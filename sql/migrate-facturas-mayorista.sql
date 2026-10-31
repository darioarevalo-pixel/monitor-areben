-- Facturación de MAYORISTAS (pedido de Darío §5, decidido por Bruno 31-oct): la factura deja de ser «una por venta».
-- Va SÓLO a la base de BDI (la del monitor: `facturas` vive ahí para las dos marcas). Idempotente, en una transacción,
-- con el usuario dueño (el mismo de `bin/migrar.mjs` del motor).
--
-- Tres CLASES de factura:
--   'venta'  la de siempre: la venta ENTERA (`venta_id` = la venta). Lo que ya existe queda así (default).
--   'parte'  una PARTE por monto de una venta («Facturado $X de $Y»): `venta_ref` = la venta, `venta_id` = `<venta>:parte:<uuid>`
--            (así el `facturas_venta_factura_uq` de siempre ⛔ la choca), `tope` = el total de la venta.
--   'libre'  sin venta («100 fundas» con precio a mano): `venta_id` = `libre:<uuid>`. Suma al techo del mes por `mes`,
--            ⛔ mueve stock ni toca la cuenta corriente (eso es del motor, que ni se entera).
-- `renglones` = lo que imprime el PDF de una parte o una libre (ARCA sólo recibe el TOTAL: los renglones son nuestros).
-- `cliente_id` = la ficha del cliente en el motor (la factura sale en su ficha).
--
-- 🔑 «⛔ pasarse» y «⛔ la entera y partes a la vez» los frena la BASE (`facturas_no_pasarse`), ⛔ sólo la pantalla: con un
-- candado por venta (`pg_advisory_xact_lock`) dos partes al mismo tiempo ⛔ se suman las dos sin verse. Las NC de una parte
-- le devuelven lugar.
--
-- VERIFICACIÓN:
--   select column_name from information_schema.columns where table_name = 'facturas' and column_name in ('clase','venta_ref','tope','renglones','cliente_id');
--   select tgname from pg_trigger where tgname = 'facturas_no_pasarse';
-- ROLLBACK (sólo si ninguna fila es 'parte' ni 'libre'):
--   drop trigger facturas_no_pasarse on facturas; drop function facturas_no_pasarse();
--   alter table facturas drop column clase, drop column venta_ref, drop column tope, drop column renglones, drop column cliente_id;

alter table facturas add column if not exists clase text not null default 'venta';
alter table facturas add column if not exists venta_ref text;
alter table facturas add column if not exists tope numeric(14, 2);
alter table facturas add column if not exists renglones jsonb;
alter table facturas add column if not exists cliente_id uuid;

do $$ begin
  alter table facturas add constraint facturas_clase_ck check (
    clase in ('venta', 'parte', 'libre')
    and (clase <> 'parte' or (venta_ref is not null and tope is not null and venta_id like venta_ref || ':parte:%'))
    and (clase <> 'libre' or venta_id like 'libre:%')
  );
exception when duplicate_object then null; end $$;

create index if not exists facturas_venta_ref_idx on facturas (ambiente, marca, venta_ref) where venta_ref is not null;
create index if not exists facturas_cliente_idx on facturas (cliente_id) where cliente_id is not null;

create or replace function facturas_no_pasarse() returns trigger language plpgsql as $$
declare
  clave text := coalesce(new.venta_ref, new.venta_id);
  hecho numeric;
begin
  -- Sólo las FACTURAS (A/B) que entran vivas; las NC, ND y las libres ⛔ tienen tope.
  if new.tipo not in (1, 6) or new.estado = 'rechazada' or new.clase = 'libre' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('facturas:' || new.ambiente || ':' || new.marca || ':' || clave));
  if new.clase = 'parte' then
    if exists (select 1 from facturas where ambiente = new.ambiente and marca = new.marca and venta_id = clave
               and clase = 'venta' and tipo in (1, 6) and estado <> 'rechazada') then
      raise exception 'FACTURA_PARTE: la venta ya tiene la factura entera' using errcode = '23514';
    end if;
    select coalesce(sum(p.total), 0)
         - coalesce((select sum(n.total) from facturas n join facturas q on q.id = n.asociado_id
                     where q.ambiente = new.ambiente and q.marca = new.marca and q.venta_ref = clave and q.clase = 'parte'
                       and n.tipo in (3, 8) and n.estado <> 'rechazada'), 0)
      into hecho
      from facturas p
     where p.ambiente = new.ambiente and p.marca = new.marca and p.venta_ref = clave and p.clase = 'parte'
       and p.tipo in (1, 6) and p.estado <> 'rechazada';
    if round((hecho + new.total) * 100) > round(new.tope * 100) then
      raise exception 'FACTURA_PARTE: se pasa del total de la venta (facturado %, pide %, total %)', hecho, new.total, new.tope
        using errcode = '23514';
    end if;
  elsif exists (select 1 from facturas where ambiente = new.ambiente and marca = new.marca and venta_ref = new.venta_id
                and clase = 'parte' and tipo in (1, 6) and estado <> 'rechazada') then
    raise exception 'FACTURA_PARTE: la venta ya tiene facturas por partes' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists facturas_no_pasarse on facturas;
create trigger facturas_no_pasarse before insert on facturas for each row execute function facturas_no_pasarse();
