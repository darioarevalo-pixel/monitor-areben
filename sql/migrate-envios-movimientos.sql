-- La cuenta del cadete pasa a ser **movimientos con signo**, y el cierre del día deja de pedir plata.
--
-- ⚠️ Aditivo: crea la tabla y **siembra** desde `envios_dia`. No dropea nada. El `drop` de las dos
-- columnas viejas vive en `migrate-envios-movimientos-cierre.sql` y va DESPUÉS de deployar.
--
-- # Qué hueco tapa
--
-- El único hecho de plata era el cierre del día (`envios_dia.trajo`), con la PK en el día de
-- **reparto**. Pero el cadete no rinde por día de reparto: rinde cuando pasa. «El jueves trajo lo
-- del lunes, martes y miércoles» no se podía anotar — había que repartirlo a mano entre tres días
-- que en la calle nunca estuvieron partidos, o inventar un cierre en un día sin moto.
--
-- Y al revés: **había un solo casillero por día**. Dos rendiciones el mismo jueves, o una rendición
-- más una transferencia, entraban sumadas en un número que después nadie podía desarmar.
--
-- # 🔑 El signo, una sola vez y acá
--
-- `monto` es **el efecto sobre el saldo del cadete**, y el saldo es «cuánta plata nuestra tiene él».
--
--     rindió $10.000   ⇒  monto = -10000   (nos la entregó: tiene menos plata nuestra)
--     le pagamos $3.000 ⇒  monto = +3000    (le dimos plata: ahora la tiene él)
--
-- **No hay columna `tipo`.** Una columna `tipo` obliga a un `if` en cada lectura para decidir si ese
-- número suma o resta, y ese `if` se puede invertir en cualquiera de los cuatro lugares que lo leen
-- —la pantalla, el papel, la cuenta, el informe— dando un número plausible en los dos sentidos. Es
-- exactamente el defecto que ya cazó una vez el test de `pagado_aparte`: restarlo DUPLICABA la deuda
-- en vez de saldarla. Con el signo adentro del dato, la suma es una suma y no hay dónde invertirla.
--
-- Nadie tipea un número negativo: la pantalla tiene dos botones (**Rindió** / **Le pagamos**) y
-- `montoDelMovimiento()` (`lib/envios/reglas.core.js`) convierte. El signo entra por un solo lugar.
--
-- # Por qué no se borra, se anula
--
-- Un movimiento puede tener un **recibo impreso en la mano del cadete**. Borrar la fila deja ese
-- papel hablando de algo que en el sistema no existe, y la conversación pasa a ser la memoria de dos
-- personas contra un papel — que es de donde este módulo entero viene escapando. Anular deja la
-- huella: qué se anotó, quién lo anuló y cuándo.
--
-- Correr con `node scripts/apply-envios.mjs`. Idempotente.

create table if not exists envios_movimientos (
  id           text primary key,
  -- El día que la plata se movió, que **no** es necesariamente un día de reparto: el jueves que
  -- rinde lo del lunes al miércoles es un movimiento del jueves, y un sábado sin moto también puede
  -- tener uno. Por eso no hay FK contra `envios_dia`.
  fecha        date not null,
  -- 🔑 El efecto sobre el saldo, con signo. Ver el bloque de arriba.
  --
  -- El `check (monto <> 0)` no es cosmética: un movimiento de $0 no dice nada —«no trajo nada» es lo
  -- NORMAL en la calle y ya lo dice la ausencia de movimiento— pero ocupa una fila, sale en la
  -- pantalla y se puede imprimir un recibo de cero pesos.
  monto        numeric(12,2) not null check (monto <> 0),
  nota         text,
  autor        text,
  created_at   timestamptz not null default now(),
  anulado_en   timestamptz,
  anulado_por  text
);

-- La cuenta pide todos los días desde el principio y los agrupa por fecha.
create index if not exists envios_movimientos_fecha_idx on envios_movimientos (fecha);

-- ⚠️ Igual que en las otras tres: prender RLS no es el default de la base. Una tabla creada después
-- de `migrate-rls.sql` nace SIN RLS y sería la única abierta. Acá hay plata.
alter table envios_movimientos enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- La siembra desde `envios_dia`, idempotente y con id determinista.
--
-- `mvdia_<fecha>_t` es la rendición y `mvdia_<fecha>_a` la plata que se le dio por fuera. Que el id
-- se derive de la fecha es lo que permite correr esto dos veces —una antes de deployar y otra
-- después, para levantar lo que la pantalla vieja cerró en el medio— sin duplicar un solo peso.
--
-- 🔑 **`trajo = 0` no siembra nada, y está bien.** Cero es la respuesta normal —en la mediana el
-- 100% de lo que el cadete cobra es el envío, y el envío se lo queda él—: no hubo movimiento de
-- plata. Que el día se haya cerrado sigue vivo en `cerrado_en`, que no se toca. Desde esta tanda,
-- cerrar el día deja de ser un hecho de plata y pasa a ser lo que siempre fue en la práctica:
-- alguien lo revisó.
--
-- El `do nothing` es a propósito: en la segunda corrida, un movimiento que ya existe **no se pisa**.
-- Si entre las dos alguien tocó ese número, lo que corresponde es mirarlo, no sobrescribirlo — y el
-- guard de huérfanos de la segunda parte no deja dropear hasta que cierre.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  insert into envios_movimientos (id, fecha, monto, nota, autor, created_at)
  select 'mvdia_' || to_char(d.fecha, 'YYYY-MM-DD') || '_t', d.fecha, -d.trajo,
         'Rendición del día', d.cerrado_por, coalesce(d.cerrado_en, now())
    from envios_dia d
   where d.trajo is not null and d.trajo <> 0
  on conflict (id) do nothing;

  insert into envios_movimientos (id, fecha, monto, nota, autor, created_at)
  select 'mvdia_' || to_char(d.fecha, 'YYYY-MM-DD') || '_a', d.fecha, d.pagado_aparte,
         'Se le pagó por fuera del reparto', d.cerrado_por, coalesce(d.cerrado_en, now())
    from envios_dia d
   where d.pagado_aparte is not null and d.pagado_aparte <> 0
  on conflict (id) do nothing;
exception
  -- Las dos columnas ya se fueron: la tanda está cerrada y no hay nada que sembrar.
  when undefined_column then null;
end
$$;
