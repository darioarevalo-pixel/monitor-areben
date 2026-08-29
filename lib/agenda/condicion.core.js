/**
 * **Qué cambió** — los tres cambios de condición comercial, y la regla de qué paso corre en cuál.
 *
 * # Por qué existe
 *
 * El manual «Las chiquitas» lo dice con todas las letras, y es la frase que abrió este disparador:
 *
 * > Un cambio de condición comercial —una promo, una forma de pago, un cambio de envío— **no es un
 * > posteo**: es destacadas + barra de anuncios + bio + el local avisado + el mail. Si se comunica
 * > de a pedazos queda información vieja dando vueltas.
 *
 * Eso es exactamente un disparador: **un hecho que prende trabajo en varios sectores**. La
 * auditoría del 28-ago-2026 lo midió cuarto en el corpus de chats —23 días distintos de 2026, 6 con
 * dos sectores o más— y lo único que le faltaba era **qué lo aprieta**.
 *
 * # Los tres son los del manual, ⛔ no una lista inventada
 *
 * `promo`, `forma-de-pago` y `envio` son las tres cosas que esa misma frase nombra. ⛔ No hay un
 * cuarto «otros»: un cajón que acepta cualquier cosa deja de decir algo el día que alguien lo usa,
 * y acá el valor **viaja al clon** y es el único rastro de por qué este cambio sembró cinco
 * renglones y no seis.
 *
 * ⚠️ **La liquidación ⛔ no es uno de éstos.** La auditoría la midió aparte (3 días en 2026, ninguno
 * con dos sectores) y no llegó a hecho recurrente. El día que lo sea, es una fila más acá — y ése
 * es el punto de que esto sea un catálogo.
 *
 * # Por qué es un dato del molde y no un `if`
 *
 * El cambio viaja en `datos.cambios` del molde, y **vacío quiere decir los tres** — la misma
 * lectura que `marcas: []` y que `datos.puertas` en el ingreso. Con eso los pasos que no cambian se
 * cargan una sola vez, y *«los videos de las pantallas son a cada cambio de promo»* se dice
 * cargando ese molde con `cambios: ['promo']`: ninguna rama del código lo sabe.
 *
 * # Por qué este archivo es `.js`
 *
 * Mismo motivo que `puertas.core.js`: `api/_agenda.js` corre en Node sin pasar por el compilador de
 * Next y no puede importar TypeScript. El handler filtra los moldes **antes** de insertarlos, así
 * que la regla vive acá y `lib/agenda/index.ts` la re-exporta tipada.
 */

/**
 * Los tres cambios. `key` es lo que se guarda; el rótulo y la ayuda son para la pantalla.
 *
 * ⚠️ La ayuda dice **qué se comunica**, ⛔ no qué se hace: quien aprieta el botón está eligiendo el
 * hecho que pasó, y la única forma de elegir mal es no reconocerlo escrito.
 */
export const CAMBIOS = [
  {
    key: 'promo',
    label: 'Una promo',
    ayuda: 'Un descuento, un 2x1, una promo bancaria nueva. Es el que además cambia los videos de las pantallas de los locales.',
  },
  {
    key: 'forma-de-pago',
    label: 'Una forma de pago',
    ayuda: 'Se suma o se saca un medio: cuotas, transferencia, una billetera. Cambia las destacadas de «formas de pago» y lo que contesta el mostrador.',
  },
  {
    key: 'envio',
    label: 'Un cambio de envío',
    ayuda: 'Costo, zonas, plazos o el envío gratis a partir de cierto monto. Es lo que el local tiene que desarmar en el mostrador si el banner promete otra cosa.',
  },
];

export const CLAVES_CAMBIO = CAMBIOS.map((c) => c.key);

/**
 * El rótulo de un cambio.
 *
 * 🔑 **Lo desconocido vuelve tal cual y ⛔ no cae en el primero.** Un `key` viejo o mal escrito
 * tiene que poder leerse en la pantalla como lo que es —raro— y no disfrazado de «Una promo»: el
 * último `if` de una cadena es un default, y un default acá esconde justo el dato que se guardó mal.
 */
export function rotuloCambio(key) {
  const c = CAMBIOS.find((x) => x.key === String(key));
  return c ? c.label : String(key);
}

/** ¿Es uno de los tres? ⛔ Nunca «el primero por descarte». */
export function esCambio(key) {
  return CLAVES_CAMBIO.includes(String(key));
}
