-- Envíos pendientes de fecha: la bandeja de los que ya se cotizaron y todavía no tienen día.
--
-- # Qué hueco tapa
--
-- `migrate-envios.sql` hizo obligatorios `fecha` y `turno`, y eso **fue el arreglo**: en la planilla
-- vivían en un encabezado de sección, y ahí se perdía el 21,8% de las filas y el 53,8% de los
-- turnos. Nada de eso cambia acá.
--
-- Lo que faltaba es otra cosa: **el día lo confirma el cliente, no la orden**. Un pedido se cotiza
-- —hay que ponerle el precio a mano, porque Tienda Nube manda la cadetería siempre en $0: se midió
-- 18 de 18, el precio vive en el texto de la opción de envío, por zona— y queda esperando a que la
-- persona diga qué día está. Recién ahí se manda a un turno. Sin este estado intermedio, la única
-- forma de anotar un pedido cotizado era meterlo en un día inventado, que es exactamente el ruido
-- que la tabla vino a sacar.
--
-- # Por qué `null` en las dos y un `check`, y no una columna `programado`
--
-- «Sin día» no es un atributo del envío: es la ausencia del dato. Una bandera al lado de la fecha se
-- puede contradecir con ella (programado=true con fecha null), y entonces hay dos verdades sobre lo
-- mismo. Con `null` hay una sola, y el `check` impide el estado que sí sería un problema: **fecha
-- sin turno**, que es el 53,8% de la planilla vieja volviendo por la ventana.
--
-- El día no las ve nunca: la consulta del día es `where fecha = $1`, y `null` no matchea. La bandeja
-- las pide aparte, por su propia pestaña.
--
-- No borra ni migra nada: sólo afloja dos `not null`. Las filas que ya están siguen siendo válidas y
-- el código anterior sigue escribiendo igual, que importa porque **producción y los previews comparten
-- esta misma base**.
--
-- Correr con `node scripts/apply-envios.mjs`, que aplica los dos archivos en orden. Idempotente.

alter table envios_reparto alter column fecha drop not null;
alter table envios_reparto alter column turno drop not null;

-- Un envío tiene día y turno, o no tiene ninguno de los dos. Nunca queda medio agendado.
-- `add constraint` no tiene `if not exists`, así que el idempotente se hace a mano.
do $$
begin
  alter table envios_reparto add constraint envios_fecha_turno_juntos
    check ((fecha is null) = (turno is null));
exception
  when duplicate_object then null;
end
$$;

-- La bandeja se pide entera y es chica (los pendientes de una semana, no un histórico), así que el
-- índice es parcial: no paga nada por las filas que ya tienen día, que son casi todas.
create index if not exists idx_envios_pendientes
  on envios_reparto (created_at)
  where fecha is null;
