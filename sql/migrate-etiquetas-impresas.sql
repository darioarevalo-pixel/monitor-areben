-- Qué producto se etiquetó, y cuándo. Un renglón por producto, que se pisa en cada impresión.
--
-- Es la única pieza que le faltaba a la cola de reetiquetado. La pregunta que contesta la cola es
-- «¿a qué prenda le cambió el precio después de la última vez que la etiquetamos?», y de las dos
-- mitades ya teníamos una: `liquidacion_bitacora` sabe cuándo cambió cada precio. Lo que no existía
-- en ninguna parte era la otra — Etiquetas no persistía nada más que las cantidades cargadas, y eso
-- en el `localStorage` del navegador de quien imprime.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 🔑 POR QUÉ ES UNA TABLA APARTE Y NO UNA COLUMNA EN `liquidacion_bitacora`
--
-- Ahí entraba: bastaba un `etiquetado_en` en el evento y la cola sería un `where` sobre una sola
-- tabla. Pero la bitácora es un **registro**, y lo que la hace confiable es que nadie la edita —
-- por eso ni siquiera `borrar` la toca. Meterle una marca que se pisa cada vez que alguien aprieta
-- imprimir la convierte en una tabla de estado con historial adentro, y el día que haya que
-- arreglar una marca mal puesta se va a estar escribiendo sobre la única prueba de qué precio vio
-- el cliente.
--
-- 🔑 Y ES POR PRODUCTO, NO POR EVENTO. La etiqueta es de la prenda, no del cambio de precio: si a
-- un producto le movieron el precio tres veces en una tarde, hay UNA etiqueta que hacer, no tres.
-- Guardar por evento haría que imprimir una sola vez dejara dos eventos «sin etiquetar» y el
-- producto no saldría nunca de la cola.
--
-- ⚠️ NO lleva `liq_id`. Un cambio de precio puede no venir de ninguna campaña, y ése es justamente
-- el caso que la cola vino a cubrir: hasta ahora la lista de qué etiquetar la daba la campaña, así
-- que el día que se levanta el sale —cuando hay 260 prendas para rehacer— la pantalla mostraba cero.
--
-- Va en las DOS bases, con columna `store`. Correr con `node scripts/apply-etiquetas-impresas.mjs`.
-- Idempotente.

-- `cuando` es «hasta cuándo la etiqueta de esta prenda está al día», no «cuándo se imprimió»: son
-- lo mismo casi siempre, pero también se llega acá con el botón «ya está» —la prenda está en el
-- depósito, o se decidió no etiquetarla— y ahí no se imprimió nada. Por eso va `modo`: decir
-- «impresa» sobre algo que nadie imprimió es una mentira barata que después nadie puede deshacer.
create table if not exists etiquetas_impresas (
  store       text not null,                        -- 'bdi' | 'zattia'
  pid         text not null,                        -- id de producto de Gestión Nube
  cuando      timestamptz not null default now(),   -- la ÚLTIMA vez, no la primera: se pisa
  modo        text not null default 'impresa' check (modo in ('impresa', 'ya_estaba')),
  por_quien   text,
  primary key (store, pid)
);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 🔑 QUÉ NÚMERO DECÍA LA ETIQUETA. Agregado el 16-ago-2026, y cierra el agujero que dejaba la
-- primera versión.
--
-- La cola arrancó comparando FECHAS: «¿le cambió el precio después de la última vez que la
-- etiquetamos?». Eso funciona para lo que escribe el Monitor —el precio promocional— y **deja
-- afuera el precio de lista**, que se sigue cargando a mano en Gestión Nube y no deja rastro en
-- `liquidacion_bitacora`. O sea: se corregía un precio de lista, la etiqueta quedaba mal, y ninguna
-- pantalla lo decía. Lo preguntó Bruno antes de que nos diéramos cuenta.
--
-- Guardando lo que la etiqueta DICE, la pregunta deja de depender de quién movió el precio y pasa a
-- ser la única que importa: **¿lo que dice el cartelito es lo que el cliente paga hoy?**. Eso caza
-- el promocional, el de lista, y cualquier cosa que venga después.
--
-- `null` en las dos = sellado viejo, sin número (las 262 del sellado inicial). Ahí manda la fecha,
-- como antes: no se puede inventar qué decía una etiqueta que se imprimió a mano la semana pasada.
alter table etiquetas_impresas add column if not exists precio       numeric(12,2);
alter table etiquetas_impresas add column if not exists precio_lista numeric(12,2);

-- La consulta de la cola: «todo lo impreso de esta marca», para cruzar contra la bitácora.
create index if not exists idx_eti_impresas_store on etiquetas_impresas (store, cuando desc);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS.
--
-- ⚠️ Va acá y no es opcional, por lo mismo que lo explican `migrate-envios.sql` y
-- `migrate-liquidacion-bitacora.sql`: `migrate-rls.sql` prendió RLS recorriendo las tablas que
-- existían **en ese momento**, y prender RLS no queda como default. Una tabla creada después nace
-- SIN RLS, y después de la Fase S sería la única abierta de la base.
--
-- No lleva política: el navegador nunca la toca directo. Todo pasa por `api/_liquidacion.js`, que
-- usa la service key y no mira RLS.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table etiquetas_impresas enable row level security;
