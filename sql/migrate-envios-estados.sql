-- Los estados del envío pasan de seis a cinco. **Primera mitad: ensanchar.**
--
-- # Qué cambia
--
--     pendiente → preparado → en_transito → entregado      el camino
--     no_entregado                                          la única salida lateral
--
-- Se va `reintento` («vuelve a salir»), que no era un estado sino una decisión de mañana: el paquete
-- que vuelve a salir es uno que se **reprograma** a otro día, y ahí arranca de `pendiente` como
-- cualquiera. Y `despachado` pasa a llamarse `en_transito`, que es como se dice en el local.
--
-- El motivo de fondo no es el nombre: la pantalla dejaba elegir de una lista de seis, veinte veces
-- por día, y una lista deja elegir **hacia atrás** sin querer — un click de más en «Pendiente» sobre
-- un entregado lo saca de la cuenta del día y nada avisa. Con cinco y un camino, el botón dice a
-- dónde va. Ver `siguienteEstado` en `lib/envios/reglas.core.js`.
--
-- # Por qué acá se aceptan SIETE valores y no cinco
--
-- ⚠️ **Prod y los previews comparten una sola base.** Entre que esto se aplica y que el código nuevo
-- se está sirviendo, el código viejo sigue escribiendo `despachado`. Un check de cinco valores
-- rechazaría esas escrituras y el local se quedaría sin poder tildar un paquete que salió, sin que
-- nadie entienda por qué.
--
-- La segunda mitad —`migrate-envios-estados-cierre.sql`, que renombra y estrecha a cinco— va
-- DESPUÉS del deploy, con `node scripts/apply-envios.mjs --cerrar-tanda-a`.
--
-- Medido en prod el 15-ago-2026 antes de escribir esto: 9 `pendiente` y 1 `entregado`. Ni un
-- `despachado` ni un `reintento`, así que el renombrado no va a tocar ningún dato — pero el check
-- ancho igual hace falta por la ventana de arriba.

alter table envios_reparto drop constraint if exists envios_reparto_estado_check;
alter table envios_reparto add constraint envios_reparto_estado_check
  check (estado in ('pendiente', 'preparado', 'en_transito', 'entregado', 'no_entregado',
                    'despachado', 'reintento'));

-- La bandeja «Sin fecha» dejó de ser `fecha is null` a secas: ahora también trae los que volvieron
-- sin entregar, porque para las chicas es el mismo trabajo —hablar con la clienta y acordar un día—
-- y el que volvía quedaba sólo en la hoja de un día que ya pasó. Ver `FILTRO_BANDEJA`.
create index if not exists idx_envios_no_entregados on envios_reparto (updated_at)
  where estado = 'no_entregado';
