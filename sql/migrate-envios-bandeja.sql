-- El código postal sube de `datos` a su propia columna.
--
-- # Para qué
--
-- Para avisar cuando un pedido eligió **cadetería sin ser de la zona**. Pasa: la opción de envío la
-- elige el cliente en Tienda Nube, y quien cotiza se entera recién cuando busca la dirección en el
-- mapa — o peor, cuando el paquete ya está en la mochila.
--
-- El aviso compara contra `CP_DE_REPARTO` (`lib/envios/core.ts`), que es una lista a mano sacada del
-- mismo mapa con el que se cotiza. **Avisa, no bloquea**: un pedido de afuera puede salir igual, lo
-- decide quien cotiza; lo que no puede es pasar desapercibido.
--
-- ⚠️ **El CP no alcanza solo.** Medido en prod el 15-ago-2026: una orden con CP 2000 (Rosario) y
-- localidad «San Martin de las Escobas», que está a 100 km. Lo tipea el cliente, así que puede
-- mentir. Por eso el CP se muestra al lado de la localidad y no la reemplaza.
--
-- # Por qué una columna y no leer el jsonb
--
-- El dato ya está adentro de `datos->'tn'->'envio_direccion'->>'cp'`, pero la pantalla lo pregunta
-- **por fila, en cada render**. Y los envíos cargados a mano —el 10%— no tienen `datos.tn` en
-- absoluto: sin columna, el CP no se podría escribir para ellos.
--
-- Aditiva: va ANTES de deployar. Correr con `node scripts/apply-envios.mjs`. Idempotente.

alter table envios_reparto add column if not exists cp text;

-- El relleno sale gratis de la orden congelada, que es justamente para lo que existe ese jsonb.
-- Medido antes de escribir esto: las 9 filas de Tienda Nube que hay en prod traen el CP adentro.
update envios_reparto
   set cp = datos->'tn'->'envio_direccion'->>'cp'
 where cp is null
   and datos->'tn'->'envio_direccion'->>'cp' is not null;
