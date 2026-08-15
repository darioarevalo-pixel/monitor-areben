-- El envío bonificado deja de necesitar una segunda columna de plata.
--
-- # Qué estaba mal
--
-- `migrate-envios-cuenta.sql` resolvió el envío bonificado con `pago_cadete`: el precio del envío se
-- ponía en **cero** —porque la clienta no paga nada— y aparte se anotaba lo que el cadete cobraba
-- igual. Dos columnas para el mismo número, que es la enfermedad que este módulo persigue en todos
-- lados: un total guardado y otro derivado que se pueden contradecir.
--
-- Y se contradecían de la peor forma. Con el precio en cero, la fila decía **que el reparto salió
-- gratis** en todas las lecturas que no supieran de la segunda columna, y la que se comía la
-- diferencia era la única persona que no está mirando la pantalla: el cadete.
--
-- # Qué lo reemplaza
--
-- `monto_envio` pasa a ser **el costo del reparto, siempre**. Nunca se pone en cero para decir que
-- no se cobra: eso lo dicen dos booleanos, que son dos hechos distintos sobre quién paga.
--
--     envio_pagado      la clienta ya lo transfirió       → plata que YA entró
--     envio_bonificado  se lo regalamos                   → plata que no entró NUNCA
--
-- En la puerta valen lo mismo —el cadete no cobra el envío— y por eso `aCobrar` los mira juntos. Se
-- guardan separados porque «cuánto regalamos en envíos» es una pregunta que se va a hacer, y
-- colapsados en un booleano la respuesta no existe más. `validarEnvio` rechaza los dos juntos: son
-- dos verdades sobre la misma plata.
--
-- Ver `lib/envios/reglas.core.js` (`aCobrar`, `tarifaCadete`, `envioSaldado`).
--
-- ⚠️ **Esta mitad es ADITIVA y va ANTES de deployar.** El `drop` de `pago_cadete` vive aparte, en
-- `migrate-envios-plata-drop.sql`, y va DESPUÉS de que el código nuevo esté sirviendo: prod y los
-- previews comparten una sola base, y el código viejo pide `pago_cadete` por nombre en su `select`.
-- Correr con `node scripts/apply-envios.mjs`. Idempotente.

alter table envios_reparto add column if not exists envio_bonificado boolean not null default false;

-- El candado en la base, además del de `validarEnvio`. No es redundante: el handler valida lo que
-- entra por la pantalla, esto ataja cualquier otro camino —un script de backfill, una corrección a
-- mano en el editor de Supabase— que es justo donde nadie está mirando.
--
-- Va como `not valid` a propósito: si en producción quedó alguna fila con los dos tildes puestos, un
-- check normal haría fallar la migración entera. Así el candado rige para todo lo que se escriba de
-- acá en adelante, y las viejas (si las hay) se miran con la consulta que imprime `apply-envios.mjs`.
do $$
begin
  alter table envios_reparto
    add constraint envios_pagado_o_bonificado
    check (not (envio_pagado and envio_bonificado)) not valid;
exception
  when duplicate_object then null;   -- ya estaba de una corrida anterior
end
$$;
