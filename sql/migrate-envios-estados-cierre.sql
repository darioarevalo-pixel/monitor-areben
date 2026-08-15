-- Los estados del envío: **segunda mitad**. Renombra lo viejo y estrecha el check a cinco.
--
-- ⛔ **NO se corre junto con la primera.** Va con el código nuevo ya sirviéndose en prod:
-- `node scripts/apply-envios.mjs --cerrar-tanda-a`. Ver el encabezado de `migrate-envios-estados.sql`.
--
-- # Los dos renombres
--
--   · `despachado` → `en_transito`. Es el mismo hecho con el nombre que se usa en el local.
--   · `reintento`  → `pendiente`. `reintento` quería decir «vuelve a salir», que no es un estado
--     sino una decisión: el paquete estaba en casa esperando, o sea `pendiente`. Lo que ahora
--     registra el reintento es `datos.intentos[]`, que se apila al reprogramar.
--
-- ⚠️ **Antes de correr esto, mirar a mano** —lo imprime `apply-envios.mjs`—:
--
--     select estado, count(*) from envios_reparto group by 1;
--     select id, fecha, turno from envios_reparto where estado = 'reintento' and fecha is not null;
--
-- Un `reintento` CON fecha es ambiguo: puede ser un paquete que ya estaba agendado de nuevo (y
-- entonces `pendiente` está bien) o uno que volvió y nadie sacó del día (y entonces lo que
-- corresponde es `no_entregado`). Se miran de a uno. Al 15-ago-2026 había **cero** en prod, así que
-- este update no toca nada; queda escrito porque la próxima base donde corra puede no estar igual.

update envios_reparto set estado = 'en_transito' where estado = 'despachado';
update envios_reparto set estado = 'pendiente'   where estado = 'reintento';

alter table envios_reparto drop constraint if exists envios_reparto_estado_check;
alter table envios_reparto add constraint envios_reparto_estado_check
  check (estado in ('pendiente', 'preparado', 'en_transito', 'entregado', 'no_entregado'));
