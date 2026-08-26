/**
 * **El techo: Dirección arriba, el resto abajo.**
 *
 * # Por qué existe
 *
 * `agenda.cargar` es un permiso de todo o nada: quien lo tiene **ve la agenda entera** en «Cargar»
 * y en «Cumplimiento» (`api/_agenda.js`, `const visibles = cargar ? items : …`). Mientras el único
 * que lo tenía fuera el admin eso no molestaba a nadie. El día que Administración lo tiene —que es
 * para lo que se escribió el filtro de «de quién»— empieza a ver **las rutinas de los socios**: la
 * reunión semanal de gerencia, lo que se esté por decidir, lo que aparezca mañana.
 *
 * Bruno, 26-ago-2026: *«que puedan asignar para abajo, o no poder asignar para arriba ni ver para
 * arriba»*.
 *
 * # La regla, entera
 *
 * Un ítem es **de arriba** si su destino apunta a `direccion`. Eso es todo. No hay escalera entre
 * los otros cuatro roles y **no se va a escribir una hasta que aparezca el segundo caso**: es el
 * mismo criterio con el que el agrupador del ingreso quedó siendo el prefijo del título.
 *
 * ⛔ **Y no hay excepción por tarea.** Se evaluó un tilde «igual la ve todo el equipo» y no entró:
 * una rutina dirigida a Dirección que en realidad hace otro **está mal asignada**, y el arreglo es
 * asignársela a quien la hace, no taparlo con una bandera. Lo que es para todos se carga como para
 * todos.
 *
 * # 🔑 Por qué se DERIVA y no se guarda
 *
 * La tentación es estampar `datos.nivel = 'direccion'` al guardar el ítem: sale gratis y no hace
 * falta el padrón. Pero una bandera escrita al crear **empieza a mentir** en cuanto alguien cambia
 * de función — la rutina de un gerente que deja de serlo seguiría escondida, y la de quien asciende
 * seguiría a la vista. Es exactamente el argumento por el que `esPedidoUgc` se derivó de los
 * entregables en vez de guardarse en una columna (`docs/secciones/canjes.md`).
 *
 * El costo de derivarlo es que para el destino **por nombre** hace falta saber la función de esa
 * persona, o sea el padrón. Por eso `esDeArriba` lo recibe: la función es pura y quien la llama
 * decide de dónde sale la lista (el servidor la pide con la credencial del request, la pantalla la
 * tiene ya cargada del selector).
 *
 * # Por qué este archivo es `.js`
 *
 * Mismo motivo que `reglas.core.js` y `puertas.core.js`: **el corte real está en el servidor**
 * (`api/_agenda.js`), que corre en Node sin pasar por el compilador de Next y no puede importar
 * TypeScript. Y tiene que estar en el servidor y no en la pantalla por lo de siempre: un pendiente
 * que se filtra sólo al dibujar igual enciende el badge del menú y sigue viajando en el JSON.
 */

import { normalizarDestino } from '../novedades/destino.core.js';

/** La función que manda. Es la gerencia — `administracion` es oficina, y son cosas distintas. */
export const FUNCION_TECHO = 'direccion';

/** ¿Esta persona es de arriba? `equipo` es `[{name, funcion}]`, tal como sale del padrón. */
function esDeDireccion(nombre, equipo) {
  const u = (equipo || []).find((x) => x && x.name === nombre);
  const fs = Array.isArray(u?.funcion) ? u.funcion : u?.funcion ? [u.funcion] : [];
  return fs.includes(FUNCION_TECHO);
}

/**
 * ¿Este ítem es **de arriba**?
 *
 * - `{tipo:'roles'}` con `direccion` adentro → **sí**, y sin mirar el padrón: el destino ya lo dice.
 * - `{tipo:'personas'}` con alguien de Dirección → **sí**. Acá sí hace falta `equipo`.
 * - `{tipo:'todos'}` y `{tipo:'seccion'}` → **no**. Algo dirigido a todo el equipo, o a quien usa
 *   una pantalla, no es de nadie en particular: esconderlo sería esconder lo que más se comparte.
 *
 * 🔴 **Alcanza con UNO.** Un pendiente dirigido a «Marketing y Dirección» es de arriba: si bastara
 * con que hubiera alguien de abajo, escribir dos destinatarios sería la forma de saltear el techo.
 *
 * ⚠️ **Sin `equipo` (lista vacía) el destino por nombre da `false`.** Es a propósito y es el default
 * seguro del lado correcto: si el padrón no se pudo leer, lo que pasa es que Administración ve de
 * más —el estado de hoy—, no que el equipo entero se quede sin agenda. El que cierra es el guard de
 * escritura, que corre con el padrón en la mano o no deja guardar.
 */
export function esDeArriba(destino, equipo) {
  const d = normalizarDestino(destino);
  if (d.tipo === 'roles') return d.roles.includes(FUNCION_TECHO);
  if (d.tipo === 'personas') return d.personas.some((n) => esDeDireccion(n, equipo));
  return false;
}

/**
 * ¿Este perfil está **arriba del techo**? Los que ven todo.
 *
 * El admin entra por lo de siempre: es el que tiene que darse cuenta si algo se cargó mal, y para
 * eso lo tiene que ver. Y Dirección entra porque el techo es ella misma.
 */
export function veLoDeArriba(perfil) {
  if (!perfil) return false;
  if (perfil.admin === true) return true;
  const fs = Array.isArray(perfil.funcion) ? perfil.funcion : perfil.funcion ? [perfil.funcion] : [];
  return fs.includes(FUNCION_TECHO);
}
