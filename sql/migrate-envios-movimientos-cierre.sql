-- La segunda mitad de `migrate-envios-movimientos.sql`: se lleva `trajo` y `pagado_aparte`.
--
-- ⛔ **NO se corre junto con la primera.** Va cuando el código nuevo ya se está sirviendo en prod,
-- por `node scripts/apply-envios.mjs --cerrar-tanda-g`.
--
-- El motivo es el de siempre y ya mordió dos veces: prod y los previews comparten UNA base, y
-- `api/_envios.js` pide sus columnas por nombre (`CAMPOS_CIERRE`). Mientras haya una versión vieja
-- andando —la de prod antes de deployar, o el preview de otra rama— este `drop` le contesta **500 a
-- cada lectura de la hoja del día**, que es la pantalla que se abre veinte veces por jornada. En la
-- tanda 4 pasó al revés con `envios_turno`: la migración se aplicó antes de deployar y la pantalla
-- vieja quedó unos minutos leyendo una tabla que no existía.
--
-- # Qué hace, en orden
--
-- 1. **La siembra vuelve a correr sola**, porque `apply-envios.mjs` aplica los dos archivos en orden
--    y en la misma transacción: la primera parte siembra otra vez y recién después llega esto. Hace
--    falta porque entre las dos corridas la pantalla vieja siguió cerrando días con plata, y esos
--    cierres todavía no tienen movimiento.
-- 2. **Dropea, detrás de un guard de huérfanos.**
--
-- # El guard no es ceremonia
--
-- Un huérfano es un día con plata en `envios_dia` que **no tiene un movimiento vivo con ese mismo
-- número**. Puede pasar de dos formas: la siembra no llegó a correr para ese día, o alguien cambió
-- el cierre después de sembrado y quedaron peleados. En los dos casos, dropear borra el único
-- registro que existe de esa plata y no se deshace.
--
-- ⚠️ El guard mira el **monto**, no sólo que el id exista: un movimiento anulado a propósito cuenta
-- como migrado —la plata se anotó y después alguien decidió anularla, que es una decisión posterior
-- y legítima—, pero uno con otro número es un cierre que se editó y hay que mirar de a uno.
--
-- Con huérfanos, las columnas se quedan donde están y el script lo canta en rojo.

do $$
declare
  huerfanos int;
begin
  select count(*) into huerfanos
    from envios_dia d
   where (coalesce(d.trajo, 0) <> 0 and not exists (
            select 1 from envios_movimientos m
             where m.id = 'mvdia_' || to_char(d.fecha, 'YYYY-MM-DD') || '_t' and m.monto = -d.trajo))
      or (coalesce(d.pagado_aparte, 0) <> 0 and not exists (
            select 1 from envios_movimientos m
             where m.id = 'mvdia_' || to_char(d.fecha, 'YYYY-MM-DD') || '_a' and m.monto = d.pagado_aparte));

  if huerfanos = 0 then
    alter table envios_dia drop column trajo;
    alter table envios_dia drop column pagado_aparte;
  end if;
exception
  when undefined_column then null;   -- ya se fueron en una corrida anterior
end
$$;
