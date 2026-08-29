/**
 * **Las plantillas de siembra de la Agenda**: qué hechos clonan una lista de moldes, y con qué eje.
 *
 * # Qué es una plantilla, y por qué son dos y no una
 *
 * Un ítem marcado como plantilla **no corre ningún día**: es un molde. Cuando pasa el hecho que lo
 * dispara —llegó mercadería, se armó una sesión de fotos— el handler **clona** los moldes de esa
 * plantilla con la fecha del hecho más `offsetDias`. Los renglones no están escritos en el repo, y
 * eso es el diseño: la dueña de cada paso cambia cuando cambia la gente, y con moldes eso es editar
 * un ítem en una pantalla, no un deploy.
 *
 * El 28-ago-2026 la auditoría de disparadores midió cuál era el que seguía: la **sesión de fotos**
 * aparece en 27 días distintos de 2026 y en **16** toca dos sectores o más — el doble que el
 * siguiente. Sus nueve renglones ya estaban escritos, con dueña y con momento, en el manual
 * «Sesiones de fotos». Lo que faltaba era el motor, que hasta acá sabía decir «ingreso» y nada más.
 *
 * # El EJE: la columna que decide de quién es el renglón
 *
 * Las dos plantillas tienen la misma forma y por el mismo motivo:
 *
 * | plantilla     | el eje       | valores                        | qué cambia con él                    |
 * | ------------- | ------------ | ------------------------------ | ------------------------------------ |
 * | ingreso       | la PUERTA    | producción · nacional · …      | de quién es el nombre y la descripción |
 * | sesión de fotos | el ORIGEN  | ingreso · campaña · faltante   | de quién es la sesión (el 1º y el 9º) |
 *
 * 🔑 **El eje viaja en el molde y la lista vacía quiere decir «en todos»**, igual que `marcas: []`.
 * Con eso los pasos que no cambian se cargan **una sola vez**, y «este paso no existe para este
 * valor» se dice **no cargando un molde**: no hay ninguna rama en el código que lo sepa.
 *
 * 🔴 **Y el eje es obligatorio al sembrar, sin default.** Sembrar «todo» dejaría renglones con la
 * dueña equivocada, que es peor que no sembrar: nadie revisa un pendiente que ya tiene nombre
 * puesto. Mismo criterio que el 503 de la puerta sin secreto — **lo que falta cierra, no abre.**
 *
 * # Por qué el ingreso ⛔ no admite offsets negativos y la sesión SÍ
 *
 * No es una preferencia: es que **los dos relojes arrancan en momentos distintos**. El ingreso se
 * entera cuando la mercadería YA llegó, así que un paso «dos días antes» sería un pendiente que
 * nace vencido. La sesión de fotos se arma con fecha —el manual dice **modelo 48 h antes** y
 * **referencias el día anterior**—, y esos dos pasos son justamente los que hoy se caen. Por eso el
 * rango es un dato de la plantilla y se valida **al cargar el molde**: un `-2` cargado en un molde
 * de ingreso se rechaza y se dice, ⛔ no se recorta callado a `0`.
 *
 * # Por qué este archivo es `.js`
 *
 * Mismo motivo que `puertas.core.js`: `api/_agenda.js` corre en Node sin pasar por el compilador de
 * Next. El handler filtra y valida **antes** de insertar, así que la regla vive acá.
 */

import { CLAVES_PUERTA, rotuloPuerta } from './puertas.core.js';
import { DISPARADORES, rotuloDisparador } from '../solicitudes/disparador.core.js';

/**
 * Las plantillas que existen. Es una lista y no un booleano desde el día uno, justamente para que
 * entre la segunda sin tocar el motor (`PLANTILLAS = ['ingreso']`, 24-ago-2026).
 *
 * ⚠️ `key` es lo que se guarda en `datos.plantilla` de cada molde y en `datos.de` de cada clon:
 * ⛔ no se renombra sin migrar lo que ya está cargado.
 */
export const PLANTILLAS = [
  {
    key: 'ingreso',
    /** Cómo se nombra el hecho en la pantalla y en los errores. */
    evento: 'ingreso',
    // 🔑 Las dos formas del hecho, escritas y no compuestas: «Falta el nombre de el ingreso» es lo
    // que sale de concatenar, y un motor de artículos para dos plantillas es peor que dos strings.
    elHecho: 'el ingreso',
    delHecho: 'del ingreso',
    /**
     * En qué campo de `datos` va la clave de idempotencia del clon. 🔑 Es una por plantilla y ⛔ no
     * un campo genérico: `datos.ingreso` ya está escrito en la base desde el 24-ago, y renombrarlo
     * dejaría a los clones viejos sin llave — el mismo ingreso avisado de nuevo los duplicaría.
     */
    campoClave: 'ingreso',
    label: 'Es un paso de la lista de ingreso',
    ayuda: 'Los pasos que dispara la llegada de mercadería. El molde no corre ningún día: se clona cuando entra un ingreso.',
    eje: {
      /** La lista que lleva el molde, dentro de `datos`. */
      campo: 'puertas',
      /** Cómo se llama el valor —uno solo— en el clon: `datos.puerta`. */
      campoClon: 'puerta',
      titulo: 'Las puertas de entrada',
      claves: CLAVES_PUERTA,
      rotulo: rotuloPuerta,
      // 🔑 Las dos frases están escritas a mano y ⛔ no compuestas: «Falta el/la X de el/la Y»
      // necesitaría un motor de género y artículo para decir peor lo que dos strings dicen bien.
      pide: 'Falta por qué puerta entró',
      invalido: 'Puerta inválida',
    },
    offsetMin: 0,
    offsetMax: 90,
  },
  {
    key: 'sesion-fotos',
    evento: 'sesión de fotos',
    elHecho: 'la sesión',
    delHecho: 'de la sesión',
    campoClave: 'sesion',
    label: 'Es un paso de la sesión de fotos',
    ayuda: 'Los nueve pasos del manual «Sesiones de fotos». El molde no corre ningún día: se clona cuando se arma una sesión.',
    eje: {
      campo: 'disparadores',
      campoClon: 'disparador',
      titulo: 'De qué origen sale la sesión',
      claves: DISPARADORES,
      rotulo: rotuloDisparador,
      pide: 'Falta de qué origen sale la sesión',
      invalido: 'Origen inválido',
    },
    // 🔑 Dos semanas hacia atrás es el techo, y sale del manual: el paso más temprano de la sesión
    // es la modelo, 48 h antes. El margen es para lo que se decida con más aire, ⛔ no una ventana
    // abierta: un molde con -60 sembraría un pendiente que ya nació fuera de la ventana de arrastre.
    offsetMin: -14,
    offsetMax: 90,
  },
];

export const CLAVES_PLANTILLA = PLANTILLAS.map((p) => p.key);

/** La plantilla, o `null` si no es ninguna. ⛔ Nunca la primera por descarte. */
export function plantillaDe(key) {
  return PLANTILLAS.find((p) => p.key === String(key)) || null;
}

/**
 * ¿Es una de las plantillas que existen?
 *
 * ⚠️ Se llama `esClavePlantilla` y ⛔ no `esPlantilla` porque ese nombre ya está tomado en
 * `lib/agenda/index.ts` por otra pregunta: allá es *«¿este ÍTEM es un molde?»*. Dos funciones con
 * el mismo nombre y distinto sujeto es la forma más barata de que alguien llame a la otra.
 */
export function esClavePlantilla(key) {
  return CLAVES_PLANTILLA.includes(String(key));
}

/**
 * ¿Este molde corre para este valor del eje?
 *
 * 🔑 **Lista vacía = todos.** Es la misma lectura que `marcas: []`, y es lo que evita cargar cuatro
 * veces los pasos que no cambian.
 *
 * ⚠️ **No revalida el valor a propósito**: quien llama ya lo validó y devolvió 400. Repetir el guard
 * acá sería la segunda implementación de la misma regla — y la de acá sería peor, porque en vez de
 * un error devolvería «no corre ninguno», que se lee como «faltan moldes».
 */
export function moldeCorreEnEje(listaDelMolde, valor) {
  const lista = Array.isArray(listaDelMolde) ? listaDelMolde : [];
  return lista.length === 0 || lista.includes(String(valor));
}

/**
 * El `offsetDias` que acepta esta plantilla, o `null` si no viene un número.
 *
 * 🔴 **Devuelve `null` para lo que está fuera de rango, ⛔ no lo recorta.** Un `-2` recortado a `0`
 * en un molde de ingreso, o un `120` recortado a `90`, es la pantalla diciendo que guardó una cosa
 * y la base guardando otra: el que llama tiene que poder contestar un 400 que lo nombre.
 *
 * ⚠️ `Number(null)` es `0`, no `NaN`: por eso el vacío se descarta a mano antes de convertir. Sin
 * eso, «no puse nada» se guardaría como «el mismo día».
 */
export function offsetDeMolde(plantilla, v) {
  const p = plantillaDe(plantilla);
  if (!p) return null;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < p.offsetMin || t > p.offsetMax) return null;
  return t;
}
