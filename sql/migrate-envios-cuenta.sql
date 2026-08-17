-- La cuenta corriente del cadete: el cierre pasa de ser por TURNO a ser por DÍA, y arrastra saldo.
--
-- # Qué hueco tapa
--
-- `migrate-envios.sql` cerraba el turno con dos números tipeados a mano (`rendido` y
-- `pagado_al_cadete`) y ahí se terminaba: cada turno era una isla. Pero el reparto no funciona así.
-- **Hay un solo cadete**, se rinde el día anterior, y lo que queda a favor de uno o del otro **no se
-- salda ese día: se descuenta de los envíos que siguen**. Sin arrastre, la mitad de los cierres iban
-- a quedar en "faltan $4.300" para siempre, que es la forma de que nadie vuelva a mirar el número.
--
-- La cuenta, entera, es una resta por envío entregado:
--
--     lo que el cadete cobró en la puerta   `aCobrar(e)`      (el envío impago + el saldo del pedido)
--   − lo que le debemos por llevarlo        `tarifaCadete(e)`
--   ─────────────────────────────────────────────────────────────────────────────────────────────
--   = lo que tiene que traer por ese paquete   (puede dar NEGATIVO: ahí le debemos nosotros)
--
-- En el caso normal —envío cobrado en la puerta, producto ya pagado por transferencia— cobra el
-- envío y se lo queda entero: el neto da cero y **no trae nada**, que es exactamente lo que pasa hoy
-- en la calle. Trae plata cuando cobró producto en efectivo, y le debemos cuando el cliente ya había
-- pagado el envío por adelantado (él lo llevó y no cobró nada por él).
--
-- # Por qué no se guarda ningún total
--
-- Mismo criterio que `aCobrar` en `lib/envios/core.ts`, por el que ya se peleó una vez: un total
-- guardado y otro derivado que se pueden contradecir es la forma de que la pantalla diga una cosa y
-- la caja otra. Acá pesa más todavía, porque el saldo se arrastra: si el día de ayer quedó
-- congelado en una columna y alguien corrige el precio de un envío de ayer, el acumulado de hoy
-- quedaría mintiendo sin que nada falle. **El único hecho que se guarda por día es cuánto trajo**;
-- todo lo demás sale de `envios_reparto`.
--
-- Correr con `node scripts/apply-envios.mjs`, que aplica los tres archivos en orden. Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- `pago_cadete`: lo que cobra el cadete por llevarlo, cuando NO es lo que se le cobró al cliente.
--
-- 🔑 **Son dos preguntas distintas y se separan el día que aparece el envío bonificado.** Lo normal
-- es que coincidan —el precio del mapa de zonas se le cobra a la clienta y el cadete se lo queda
-- entero—, y por eso el default es `null` y nadie lo tipea en el 95% de los casos. Pero cuando el
-- envío va bonificado, `monto_envio` es 0 y el cadete **cobra igual**: sin esta columna, la cuenta
-- diría que ese reparto salió gratis y el cadete se comería la diferencia en silencio.
--
-- `null` NO es cero: es "lo mismo que el envío". Guardar una copia de `monto_envio` acá haría que
-- cotizar de nuevo dejara los dos números peleados, que es el defecto que esta migración evita en
-- todo lo demás.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 🔴 **`if not exists` NO alcanza acá: la columna se DROPEA después.** Este archivo se aplica en
-- cada corrida de `apply-envios.mjs`, así que una vez que `--cerrar-tanda-a` se llevó `pago_cadete`,
-- la corrida siguiente **la volvía a crear** — y el script lo informaba encima como «sigue (0 filas
-- la usan)», o sea pidiendo que se cierre otra vez una tanda ya cerrada, para siempre. Medido el
-- 17-ago-2026: cerró la tanda A, y `--cerrar-tanda-g` veinte minutos después la resucitó.
--
-- 🔑 **El guard se lee de la base**: `envio_bonificado` es lo que la REEMPLAZA y lo agrega
-- `migrate-envios-plata.sql`, que corre **después** de este archivo. En una base nueva todavía no
-- existe ⇒ la columna se crea como siempre; en una base ya migrada existe ⇒ no se resucita.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'envios_reparto' and column_name = 'envio_bonificado'
  ) then
    alter table envios_reparto add column if not exists pago_cadete numeric(12,2);
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- El cierre del DÍA. Reemplaza a `envios_turno`.
--
-- 🔑 **La rendición es del día, no del turno**, por lo mismo que la hoja es del día: el cadete es
-- uno solo, sale a la mañana y a la tarde con la misma plata en el bolsillo, y partir la caja en dos
-- obligaría a repartir a mano un saldo que en la calle nunca estuvo partido.
--
--   · `trajo`          — la plata que entregó. `null` es "todavía no se cerró"; 0 es "no trajo nada",
--                        que es lo NORMAL: en la mediana el 100% de lo que cobra es el envío, y el
--                        envío se lo queda él.
--   · `pagado_aparte`  — plata que se le dio por fuera del reparto (una transferencia para saldar lo
--                        que se le debía). Es el único escape que tiene la cuenta: sin él, el día que
--                        se le pague el saldo en efectivo el acumulado queda torcido para siempre y
--                        no hay forma de corregirlo sin inventar un envío.
--   · `nota`           — por qué. Un ajuste sin motivo es un número que nadie se anima a tocar.
--
-- El saldo acumulado NO vive acá: se calcula sumando los días (`cuentaDelCadete`, en `core.ts`).
-- Arranca en cero — al 14-ago-2026 están a mano — y por eso no hay fila de apertura.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists envios_dia (
  fecha         date primary key,
  trajo         numeric(12,2),
  pagado_aparte numeric(12,2) not null default 0,
  nota          text,
  cerrado_por   text,
  cerrado_en    timestamptz,
  datos         jsonb not null default '{}'::jsonb
);

-- ⚠️ Igual que en `migrate-envios.sql`: prender RLS no queda como default de la base. Una tabla
-- creada después de `migrate-rls.sql` nace SIN RLS y sería la única abierta. Acá hay plata.
alter table envios_dia enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Se va `envios_turno`, **pero sólo si está vacía**.
--
-- Se verificó el 14-ago-2026 contra producción: cero filas. El cierre por turno se escribió, se
-- deployó y no llegó a usarse nunca, así que no hay nada que migrar. El guard no es ceremonia: si
-- alguien cerró un turno entre esa medición y esta migración, esos son los únicos datos de caja que
-- existen y borrarlos no se deshace. Con filas, la tabla queda ahí y el script lo canta.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from envios_turno) then
    drop table envios_turno;
  end if;
exception
  when undefined_table then null;   -- ya se borró en una corrida anterior
end
$$;
