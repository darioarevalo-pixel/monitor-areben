-- El teléfono del que va a transferir, en el compromiso.
--
-- # Qué hueco tapa (planteado por Darío el 3-sep-2026, mirándolo en uso)
--
-- Un mayorista nuevo compra por WhatsApp y **todavía no está cargado en Gestión Nube**: se carga
-- después, cuando se arma el pedido. Pero el cobro se arregla en esa misma charla — "te paso el
-- alias del contador y transferile ahí". Hasta ahora el panel no tenía nada que ofrecerle a ese
-- chat: sin ficha no había cliente, y sin cliente no había promesa.
--
-- La promesa en sí **ya se podía guardar sin cliente**: `cliente_id` nace nullable justamente
-- porque el id de GN es una referencia blanda. Lo que faltaba era **con qué reengancharla** cuando
-- el cliente por fin existe. El nombre no sirve: se escribe a mano, con o sin apellido, con o sin
-- acento, y el mismo cliente entra dos veces distinto.
--
-- 🔑 **El teléfono sí sirve, porque es la identidad del chat.** Es lo mismo que ya usa el panel
-- para encontrar la ficha (`normalizeArgPhone` + el índice del servidor), así que cuando el cliente
-- aparece en GN con ese número, el compromiso se puede vincular de un clic y sin buscar a nadie.
--
-- ⛔ **Y por eso va como columna y no adentro de `notas`.** En `notas` serviría para leerlo y nada
-- más — es exactamente el problema que ya se pagó con el pagador, que vivía como texto libre
-- ("Nazarena Luciani - BDI Mayorista") y no se podía agrupar por cliente. Un dato con el que se
-- cruza es una columna.
--
-- ⚠️ Se guarda NORMALIZADO (lo que devuelve `normalizeArgPhone`), no como lo escribió nadie: dos
-- formas del mismo número que no se comparan iguales dejan la promesa huérfana igual que antes.
--
-- ⛔ Correr a mano en el SQL Editor de Supabase, en la base de **BDI**. Idempotente.

alter table compromisos_pago
  add column if not exists cliente_telefono text;

comment on column compromisos_pago.cliente_telefono is
  'Teléfono del chat, normalizado. Es con lo que se reengancha la promesa cuando el cliente recién después existe en Gestión Nube.';

-- "¿Hay alguna promesa anotada con este número que todavía no tenga cliente?" — es la pregunta que
-- el panel hace al abrir la ficha de alguien, y la única que justifica el índice. Parcial: sólo
-- interesan las que están esperando ser vinculadas.
create index if not exists idx_compromisos_telefono_sin_cliente
    on compromisos_pago (cliente_telefono)
    where cliente_telefono is not null and cliente_id is null;
