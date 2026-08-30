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
 * | plantilla       | el eje      | valores                        | qué cambia con él                      |
 * | --------------- | ----------- | ------------------------------ | -------------------------------------- |
 * | ingreso         | la PUERTA   | producción · nacional · …      | de quién es el nombre y la descripción |
 * | sesión de fotos | el ORIGEN   | ingreso · campaña · faltante   | de quién es la sesión (el 1º y el 9º)  |
 * | lanzamiento     | **ninguno** | —                              | nada: los once son siempre los mismos  |
 *
 * 🔑 **Y una plantilla PUEDE no tener eje** (`eje: null`, el lanzamiento). No es un caso especial
 * escondido: el eje existe **porque hay un paso que cambia de dueña**, y en el lanzamiento no lo
 * hay. Inventarle uno sería obligar a contestar una pregunta que el manual no hace, y la regla de
 * «lo que falta cierra» ⛔ no aplica donde no hay nada que decidir.
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

import { CLAVES_PUERTA, PUERTAS, rotuloPuerta } from './puertas.core.js';
import { DISPARADORES, rotuloDisparador } from '../solicitudes/disparador.core.js';
import { CAMBIOS, CLAVES_CAMBIO, rotuloCambio } from './condicion.core.js';

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
    /**
     * El título de la tarjeta en la pantalla de Eventos. ⚠️ Es distinto de `evento`, que va **dentro
     * de una frase** («no hay ningún paso cargado de ingreso»): ahí no puede llevar mayúscula ni
     * artículo, y como título pelado «ingreso» no dice de qué.
     */
    nombre: 'Ingreso de mercadería',
    /**
     * 🔑 **Qué prende este evento, en una línea.** Vive en el catálogo y ⛔ no en la pantalla por lo
     * mismo que la copia del botón: es el dato que contesta *«¿y esto cuándo pasa?»* parado frente a
     * la tarjeta, y hasta el 29-ago-2026 vivía **sólo en los comentarios de este archivo** — o sea
     * que no lo podía leer nadie del equipo. El evento que venga lo trae puesto o no se dibuja.
     */
    comoSePrende: 'Se prende solo con cada orden de compra confirmada en Ingresos, y también a mano con el botón.',
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
    ayuda: 'Los pasos que dispara la llegada de mercadería. Una actividad ⛔ no corre ningún día por su cuenta: se copia con la fecha del ingreso.',
    eje: {
      /** La lista que lleva el molde, dentro de `datos`. */
      campo: 'puertas',
      /** Cómo se llama el valor —uno solo— en el clon: `datos.puerta`. */
      campoClon: 'puerta',
      titulo: 'Las puertas de entrada',
      claves: CLAVES_PUERTA,
      rotulo: rotuloPuerta,
      // La ayuda de cada valor, para el modal que lo pregunta. ⚠️ Sale del catálogo del eje y ⛔ no
      // de la pantalla: es la misma frase que explica la puerta en todos lados.
      ayudaDe: (k) => (PUERTAS.find((x) => x.key === String(k)) || {}).ayuda || '',
      // 🔑 Las dos frases están escritas a mano y ⛔ no compuestas: «Falta el/la X de el/la Y»
      // necesitaría un motor de género y artículo para decir peor lo que dos strings dicen bien.
      pide: 'Falta por qué puerta entró',
      invalido: 'Puerta inválida',
    },
    /**
     * 🔑 **La copia de la pantalla vive acá, ⛔ no en el modal**, y por lo mismo que los renglones
     * no están escritos en el repo: el día que entre el quinto disparador con botón, es una fila
     * más de este catálogo y ⛔ no un segundo modal copiado del primero. Cada palabra de acá es la
     * que decía `ModalIngreso` desde el 24-ago-2026.
     */
    pantalla: {
      /**
       * La acción del handler que siembra esto a mano. ⚠️ Es un nombre propio y ⛔ no `sembrar` a
       * secas: una acción que acepta cualquier plantilla dejaría clonar a mano los renglones de un
       * lanzamiento sin el hito que los explica, o los de una sesión que no existe.
       */
      action: 'ingreso',
      boton: 'Ingresó mercadería',
      titulo: 'Ingresó mercadería',
      queLabel: 'Qué entró',
      queHint: 'Va adelante del título de cada pendiente, así se agrupan de un vistazo. Ej: «IMP2», «Camperas invierno».',
      quePlaceholder: 'IMP2',
      cuandoLabel: 'Cuándo entró',
      cuandoHint: 'Desde acá se cuentan los días de cada paso.',
      // El ingreso arranca en hoy: la mercadería llegó y lo normal es avisarlo el mismo día.
      cuandoArrancaEnHoy: true,
      vacio: 'Todavía no hay ninguna actividad cargada en este evento. Se cargan una sola vez con «+ Actividad», poniéndole a cada una su dueña y a los cuántos días va. Después, cada ingreso las copia solo.',
    },
    // La ayuda del campo «a los cuántos días», que es distinta en cada hecho porque los ejemplos
    // salen del manual de cada uno. ⚠️ El rango lo agrega la pantalla: es el mismo texto siempre.
    ayudaOffset: '0 = el día que entra la mercadería. El nombre y el precio traban todo lo demás; la publicación puede ir a los dos.',
    offsetMin: 0,
    offsetMax: 90,
  },
  {
    key: 'sesion-fotos',
    evento: 'sesión de fotos',
    nombre: 'Sesión de fotos',
    comoSePrende: 'Se prende solo cuando alguien arma una sesión de fotos en el Monitor.',
    elHecho: 'la sesión',
    delHecho: 'de la sesión',
    campoClave: 'sesion',
    label: 'Es un paso de la sesión de fotos',
    ayuda: 'Los nueve pasos del manual «Sesiones de fotos». Una actividad ⛔ no corre ningún día por su cuenta: se copia con la fecha de la sesión.',
    eje: {
      campo: 'disparadores',
      campoClon: 'disparador',
      titulo: 'De qué origen sale la sesión',
      claves: DISPARADORES,
      rotulo: rotuloDisparador,
      pide: 'Falta de qué origen sale la sesión',
      invalido: 'Origen inválido',
    },
    /**
     * ⚠️ **Sin botón, y por el mismo motivo que el lanzamiento**: el hecho es que alguien CREE la
     * sesión en el Monitor, y eso ya lo avisa `api/_solicitudes.js` al guardarla.
     */
    pantalla: null,
    // 🔑 Dos semanas hacia atrás es el techo, y sale del manual: el paso más temprano de la sesión
    // es la modelo, 48 h antes. El margen es para lo que se decida con más aire, ⛔ no una ventana
    // abierta: un molde con -60 sembraría un pendiente que ya nació fuera de la ventana de arrastre.
    ayudaOffset: '0 = el día de la sesión. Los pasos previos van en negativo: la modelo −2, las referencias −1.',
    offsetMin: -14,
    offsetMax: 90,
  },
  {
    key: 'lanzamiento',
    evento: 'lanzamiento',
    nombre: 'Lanzamiento de un producto',
    comoSePrende: 'Se prende solo cuando un hito del calendario queda FIRME. ⛔ No se aprieta a mano: un segundo lugar para decirlo dejaría los renglones cargados dos veces.',
    elHecho: 'el lanzamiento',
    delHecho: 'del lanzamiento',
    campoClave: 'lanzamiento',
    label: 'Es un paso de un lanzamiento',
    ayuda: 'Los once renglones del manual «Cómo se lanza un producto» que NO comparte con el ingreso. Una actividad ⛔ no corre ningún día por su cuenta: se copia con la fecha del lanzamiento.',
    /**
     * 🔑 **Sin eje, y es una decisión, ⛔ no un olvido.** Los once renglones tienen la misma dueña
     * pase lo que pase: el guion es de Cami, el banner de Cande, la pauta de Bruno. Lo único que
     * los separa es la MARCA, que ya es un campo aparte y obligatorio en las tres plantillas.
     */
    eje: null,
    /**
     * 🔴 **⛔ No siembra un lanzamiento cuya fecha objetivo ya pasó.** Existe porque había uno firme
     * de agosto cargado en el calendario (medido en producción el 29-ago-2026): editarle una coma
     * le habría sembrado once pendientes de hace tres semanas —la mitad fuera de la ventana de
     * arrastre, o sea invisibles—. Un contador que no baja se deja de mirar en una semana, y con él
     * se dejan de mirar los que sí importan.
     */
    noSiembraSiPaso: true,
    /**
     * ⚠️ **Sin botón: este hecho ⛔ no se aprieta a mano.** Lo dispara que un hito del calendario
     * quede FIRME, que es donde el lanzamiento tiene fecha. Un botón aparte sería un segundo lugar
     * donde decir lo mismo, y el que lo apretara no sabría que el hito ya lo había hecho.
     */
    pantalla: null,
    /**
     * 🔴 **Un mes hacia atrás, y por qué más que las otras dos**: el lanzamiento cuelga de la
     * **fecha objetivo** y su reloj arranca mucho antes que el de la mercadería — los canjes salen
     * *«antes de que llegue»* y la tipografía *«antes de la primera pieza»*. ⚠️ El techo tiene que
     * quedar adentro de `VENTANA_ARRASTRE` (30 días): un molde más viejo que eso sembraría un
     * pendiente que nace fuera de la ventana y desaparece solo sin que nadie lo haya visto.
     */
    ayudaOffset: '0 = el día del lanzamiento. Lo que se prepara antes va en negativo: la tipografía −7, el guion −5.',
    offsetMin: -30,
    offsetMax: 90,
  },
  {
    key: 'condicion',
    evento: 'cambio de condición comercial',
    nombre: 'Cambio de condición comercial',
    comoSePrende: 'Se prende solo al guardar una promoción bancaria prendida, y también a mano con el botón.',
    elHecho: 'el cambio',
    delHecho: 'del cambio',
    campoClave: 'condicion',
    label: 'Es un paso de un cambio de condición comercial',
    ayuda: 'Lo que hay que comunicar cuando cambia una promo, una forma de pago o el envío. Una actividad ⛔ no corre ningún día por su cuenta: se copia con la fecha del cambio.',
    /**
     * 🔑 **El eje es QUÉ CAMBIÓ**, y acá decide **qué renglones corren** más que de quién es cada
     * uno: los videos de las pantallas de los locales son *«a cada cambio de promo»* y las
     * destacadas de formas de pago son *«cada vez que cambia una condición comercial»* —las dos
     * frases están en el manual «Las chiquitas» y no dicen lo mismo—. ⚠️ Es la otra mitad de lo que
     * hace la puerta en el ingreso, y por eso comparten mecanismo: **lista vacía = los tres**.
     */
    eje: {
      campo: 'cambios',
      campoClon: 'cambio',
      titulo: 'Qué cambió',
      claves: CLAVES_CAMBIO,
      rotulo: rotuloCambio,
      ayudaDe: (k) => (CAMBIOS.find((c) => c.key === String(k)) || {}).ayuda || '',
      pide: 'Falta decir qué cambió',
      invalido: 'Cambio inválido',
    },
    /**
     * 🔴 **⛔ No siembra un cambio que ya pasó, y acá el que lo pide ⛔ no es un descuido: es el
     * botón de al lado.** Este disparador lo prende también **el alta de una promo bancaria**, que
     * se guarda con un `upsert` — y en la base hay promos cargadas de antes. Sin esto, editarle una
     * coma a una promo de junio sembraría hoy los cinco renglones de un cambio que se comunicó hace
     * tres meses. Es el mismo freno que el del lanzamiento y por el mismo motivo.
     */
    noSiembraSiPaso: true,
    pantalla: {
      action: 'condicion',
      boton: 'Cambió una condición comercial',
      titulo: 'Cambió una condición comercial',
      /*
        🔑 **El nombre es el agrupador del título de cada clon**, así que se pide con un ejemplo:
        «3 cuotas sin interés», «Envío gratis +$80.000». Un «promo nueva» pelado deja cinco
        pendientes que no se distinguen del cambio anterior.
      */
      queLabel: 'Qué cambió, en pocas palabras',
      queHint: 'Va adelante del título de cada pendiente, así se agrupan de un vistazo. Ej: «3 cuotas Galicia», «Envío gratis +$80.000».',
      quePlaceholder: '3 cuotas sin interés',
      cuandoLabel: 'Desde cuándo rige',
      cuandoHint: 'Desde acá se cuentan los días de cada paso. Es la fecha en que el cambio EMPIEZA, no la de hoy.',
      /**
       * 🔴 **Arranca VACÍA, ⛔ no en hoy**, al revés que el ingreso. Una promo se decide antes de
       * que arranque, así que «hoy» acertaría a veces — y un default que casi siempre acierta es el
       * peor de todos: el día que se equivoca nadie lo mira, porque nadie eligió nada.
       */
      cuandoArrancaEnHoy: false,
      vacio: 'Todavía no hay ninguna actividad cargada en este evento. Se cargan una sola vez con «+ Actividad», poniéndole a cada una su dueña y a los cuántos días va. Después, cada cambio las copia solo.',
    },
    /**
     * 🔑 **Una semana para atrás**, y ⛔ no cero: una promo se carga con anticipación y hay pasos
     * que se preparan antes —el banner se diseña, el mail se escribe—. Más que eso no: el freno de
     * arriba ya rechaza el hecho viejo, y un molde en −30 sembraría un pendiente nacido fuera de la
     * ventana de arrastre, o sea invisible.
     */
    ayudaOffset: '0 = el día en que el cambio empieza a regir, que es cuando tiene que estar comunicado. Lo que se prepara antes va en negativo.',
    offsetMin: -7,
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

/**
 * ¿La fecha del hecho ya pasó?
 *
 * 🔴 **Vive acá porque la contestan DOS handlers.** Nació en `api/_calendario.js` el 29-ago-2026,
 * cuando se midió que había un lanzamiento firme de agosto en producción: editarle una coma le
 * habría sembrado once pendientes con fechas de hace tres semanas. El 4º disparador necesita
 * exactamente el mismo freno —una promo bancaria de junio a la que alguien le corrige el banco— y
 * copiarlo habría dejado la misma regla escrita en dos archivos, que es la forma más barata de que
 * mañana digan cosas distintas.
 *
 * ⚠️ **Con un día de margen, y ⛔ no `< hoy` pelado**: el reloj del servidor es UTC y el de la
 * persona es Argentina, así que a las 21:00 «hoy» ya es mañana acá. El margen hace que el borde no
 * dependa de la hora a la que alguien guarde. 🔑 El caso que distingue esto de `< hoy` es **el de
 * AYER**, ⛔ no el de hoy: con `< hoy`, lo de ayer no siembra.
 */
export function hechoYaPaso(fecha, ahora = Date.now()) {
  const ayer = new Date(ahora - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return String(fecha) < ayer;
}
