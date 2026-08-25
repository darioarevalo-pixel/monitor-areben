/**
 * **Por dónde entró el producto** — las cuatro puertas del ingreso, y la regla de qué paso corre
 * en cuál.
 *
 * # Por qué existe
 *
 * El disparador del ingreso clona los moldes cargados en la Agenda. Hasta acá clonaba **siempre los
 * mismos**, y eso sirve para una sola de las cuatro puertas: el manual «El nombre y la descripción
 * del producto» cierra esos dos pasos **por puerta de entrada, no por sector**, y la dueña cambia.
 *
 * | entra por…            | el NOMBRE           | la DESCRIPCIÓN                          |
 * | --------------------- | ------------------- | --------------------------------------- |
 * | Producción propia     | Stefi               | ya viene escrita — **no lleva renglón**  |
 * | Compra nacional       | Administración      | el local (básica + medidas)              |
 * | Importación           | Marketing           | Marketing                                |
 * | Accesorios nacionales | Darío o Lorena      | Administración                           |
 *
 * Los otros cuatro pasos —precio, foto, publicar, pantallas— **no cambian con la puerta**.
 *
 * # Por qué es un dato del molde y no un `if`
 *
 * La puerta viaja en `datos.puertas` del molde, y **vacío quiere decir todas** — exactamente como se
 * lee `marcas: []` en este mismo repo. Con eso los cuatro pasos comunes se cargan **una sola vez** y
 * no cuatro, y *«producción propia no lleva renglón de descripción»* se dice **no cargando ese
 * molde**: no hay ninguna rama en el código que lo sepa. La dueña de cada paso sigue cambiándose
 * editando un ítem, que es la razón por la que los renglones no están escritos en el repo.
 *
 * # Por qué este archivo es `.js`
 *
 * Mismo motivo que `reglas.core.js`: `api/_agenda.js` corre en Node sin pasar por el compilador de
 * Next y no puede importar TypeScript. El handler tiene que filtrar los moldes **antes** de
 * insertarlos, así que la regla vive acá y `lib/agenda/index.ts` la re-exporta tipada.
 */

/**
 * Las cuatro puertas. `key` es lo que se guarda; el rótulo es para la pantalla.
 *
 * ⚠️ Este es **nuestro** vocabulario. Los tipos que maneja el sistema de Ingresos de Gerardo no
 * tienen por qué llamarse igual: para eso está `puertaDeTipo`.
 */
export const PUERTAS = [
  {
    key: 'produccion',
    label: 'Producción propia',
    ayuda: 'Sale del taller. Viene con el nombre puesto desde producción y la descripción ya escrita.',
  },
  {
    key: 'nacional',
    label: 'Compra nacional',
    ayuda: 'Flores. El nombre lo asigna Administración desde el banco de nombres; la descripción la escribe el local.',
  },
  {
    key: 'importacion',
    label: 'Importación',
    ayuda: 'Planificada con meses. El nombre y la descripción son de Marketing.',
  },
  {
    key: 'accesorios',
    label: 'Accesorios nacionales',
    ayuda: 'Nombre comercial de Darío o Lorena; la descripción, de Administración.',
  },
];

export const CLAVES_PUERTA = PUERTAS.map((p) => p.key);

/** El nombre de la puerta en castellano, o la clave cruda si alguien guardó algo que ya no existe. */
export function rotuloPuerta(key) {
  const p = PUERTAS.find((x) => x.key === key);
  return p ? p.label : String(key || '');
}

/** ¿Es una de las cuatro? Se pregunta **una sola vez**, en la entrada de `sembrarIngreso`. */
export function puertaValida(v) {
  return CLAVES_PUERTA.includes(String(v));
}

/**
 * ¿Este molde corre para esta puerta?
 *
 * 🔑 **Lista vacía = todas.** Es la misma lectura que `marcas: []`, y es lo que evita cargar cuatro
 * veces los pasos que no cambian.
 *
 * ⚠️ **No revalida la puerta a propósito**: quien llama ya la validó con `puertaValida` y devolvió
 * 400. Repetir el guard acá sería la segunda implementación de la misma regla — y la de acá sería
 * peor, porque en vez de un error devolvería «no corre ninguno», que se lee como «faltan moldes».
 */
export function moldeCorreEn(puertasDelMolde, puerta) {
  const lista = Array.isArray(puertasDelMolde) ? puertasDelMolde : [];
  return lista.length === 0 || lista.includes(String(puerta));
}

/**
 * **El vocabulario de Gerardo, traducido al nuestro.**
 *
 * 📌 Vive acá y no en `ingreso2` a propósito: las cuatro puertas son una decisión nuestra —salen del
 * manual 06— y Gerardo no tiene por qué cambiar la suya para que nosotros sembremos bien.
 *
 * ⚠️ **Hoy sólo están las cuatro claves nuestras, y no es un olvido**: la lista exacta de tipos que
 * maneja `ingreso2` todavía no llegó (es una mano de Bruno con Gerardo). Hasta que llegue, el primer
 * aviso real contesta un 400 que **nombra el tipo que trajo**, así que la primera prueba de Gerardo
 * documenta sola el vocabulario que falta y agregarlo es un renglón acá.
 *
 * 🔴 **Un tipo que no está en el mapa es un 400, ⛔ nunca una puerta por defecto**: un default
 * sembraría once renglones con la dueña equivocada, que es peor que no sembrar.
 */
export const TIPOS_INGRESO2 = {
  produccion: 'produccion',
  nacional: 'nacional',
  importacion: 'importacion',
  accesorios: 'accesorios',
};

/** La puerta que le corresponde a un tipo de `ingreso2`, o `null` si no lo conocemos. */
export function puertaDeTipo(tipo) {
  const t = String(tipo || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TIPOS_INGRESO2, t) ? TIPOS_INGRESO2[t] : null;
}
