-- La segunda mitad de `migrate-envios-plata.sql`: se lleva `pago_cadete`.
--
-- ⛔ **NO se corre junto con la primera.** Va cuando el código nuevo ya se está sirviendo en prod,
-- por `node scripts/apply-envios.mjs --cerrar-tanda-a`.
--
-- El motivo es que prod y los previews comparten una sola base. `api/_envios.js` pide sus columnas
-- por nombre (`CAMPOS`), así que mientras haya una versión vieja andando —la de prod antes de
-- deployar, o el preview de otra rama— este `drop` le contesta con un 500 a cada lectura de la hoja
-- del cadete. Ya pasó una vez al revés, con `envios_turno`: la migración se aplicó antes de deployar
-- y la pantalla vieja quedó leyendo una tabla que no existía.
--
-- # El guard no es ceremonia
--
-- Al 14-ago-2026 la columna tenía **cero valores** —se deployó y no se usó nunca—, pero si alguien
-- escribió una tarifa distinta entre esa medición y esta migración, esa fila es el único lugar del
-- sistema donde vive lo que ese reparto le costó a la empresa, y borrarla no se deshace. Con
-- valores, la columna se queda donde está y el script lo canta en rojo.
--
-- Si eso pasa: cada fila con `pago_cadete` es un envío bonificado del modelo viejo. Se arregla
-- poniendo ese número en `monto_envio` y prendiendo `envio_bonificado` —que es lo que ahora
-- significa lo mismo— y recién después se vuelve a correr esto.

do $$
begin
  if (select count(*) from envios_reparto where pago_cadete is not null) = 0 then
    alter table envios_reparto drop column pago_cadete;
  end if;
exception
  when undefined_column then null;   -- ya se fue en una corrida anterior
end
$$;
