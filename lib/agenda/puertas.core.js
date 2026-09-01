/**
 * **Por dónde entró el producto** — las puertas del ingreso, la marca en la que existe cada una, y
 * la regla de qué paso corre en cuál.
 *
 * # Por qué existe
 *
 * El disparador del ingreso clona los moldes cargados en la Agenda. Hasta acá clonaba **siempre los
 * mismos**, y eso sirve para una sola de las puertas: el manual «El nombre y la descripción del
 * producto» cierra esos dos pasos **por puerta de entrada, no por sector**, y la dueña cambia.
 *
 * | entra por…            | existe en   | el NOMBRE           | la DESCRIPCIÓN                          |
 * | --------------------- | ----------- | ------------------- | --------------------------------------- |
 * | Producción propia     | Zattia      | Stefi               | ya viene escrita — **no lleva renglón**  |
 * | Compra nacional       | las dos     | Zattia: Administración · BDI: Darío o Lorena | Zattia: el local · BDI: Administración |
 * | Importación           | BDI         | Marketing           | Marketing                                |
 *
 * Los otros pasos —precio, foto, publicar, pantallas— **no cambian con la puerta**.
 *
 * # 🆕 SON TRES, Y CADA UNA VIVE EN SU MARCA (1-sep-2026, decisión de Bruno)
 *
 * Eran cuatro y se ofrecían las cuatro en las dos marcas. Bruno, mirando la pregunta de la puerta
 * con once órdenes abiertas: *«bdi y zattia tienen compra nacional; la diferencia es que bdi tiene
 * importado, y zattia tiene producción propia»* y *«accesorios nacionales sería compra nacional»*.
 *
 * - 🔑 **«Accesorios nacionales» ⛔ no era una puerta: era la compra nacional de BDI.** Comprar
 *   accesorios en el país y comprar fundas en el país entran por el mismo lugar; lo único que las
 *   distinguía —de quién es el nombre y la descripción— ya lo separa la **marca**, que es el dato
 *   que el ingreso trae solo. Dos claves para el mismo hecho eran dos formas de contestar bien la
 *   misma pregunta, y la de arriba en la lista se elige más.
 * - 🔑 **La marca acota QUÉ SE OFRECE, ⛔ no de quién es el paso.** De quién es cada renglón lo
 *   sigue diciendo el molde (`marcas: []` = las dos). Esto es una capa antes: una puerta que en esa
 *   marca no existe ⛔ no se dibuja y el servidor la rechaza, porque **la opción imposible que
 *   igual se puede apretar es la que se aprieta**.
 * - 🔴 **Y `accesorios` sigue vivo en el mapa de Gerardo** (`TIPOS_INGRESO2`), traducido a
 *   `nacional`: es su vocabulario, no el nuestro, y sacarlo de ahí convertiría un aviso que hoy
 *   entra en un 400. Para eso existe el mapa.
 *
 * # Por qué es un dato del molde y no un `if`
 *
 * La puerta viaja en `datos.puertas` del molde, y **vacío quiere decir todas** — exactamente como se
 * lee `marcas: []` en este mismo repo. Con eso los pasos comunes se cargan **una sola vez** y no
 * tres, y *«producción propia no lleva renglón de descripción»* se dice **no cargando ese molde**:
 * no hay ninguna rama en el código que lo sepa. La dueña de cada paso sigue cambiándose editando un
 * ítem, que es la razón por la que los renglones no están escritos en el repo.
 *
 * # Por qué este archivo es `.js`
 *
 * Mismo motivo que `reglas.core.js`: `api/_agenda.js` corre en Node sin pasar por el compilador de
 * Next y no puede importar TypeScript. El handler tiene que filtrar los moldes **antes** de
 * insertarlos, así que la regla vive acá y `lib/agenda/index.ts` la re-exporta tipada.
 */

/**
 * Las puertas. `key` es lo que se guarda; el rótulo es para la pantalla; `marcas` es **en qué
 * negocio existe**, y —igual que en todo el repo— **vacío quiere decir las dos**.
 *
 * ⚠️ Este es **nuestro** vocabulario. Los tipos que maneja el sistema de Ingresos de Gerardo no
 * tienen por qué llamarse igual: para eso está `puertaDeTipo`.
 */
export const PUERTAS = [
  {
    key: 'produccion',
    label: 'Producción propia',
    marcas: ['zattia'],
    ayuda: 'Sale del taller. Viene con el nombre puesto desde producción y la descripción ya escrita.',
  },
  {
    key: 'nacional',
    label: 'Compra nacional',
    marcas: [],
    ayuda: 'Se compró en el país: la ropa de Flores en Zattia, los accesorios en BDI. El nombre lo asigna Administración en Zattia y Darío o Lorena en BDI. La descripción la escribe el local si es ropa de Zattia, y Administración si es de BDI.',
  },
  {
    key: 'importacion',
    label: 'Importación',
    marcas: ['bdi'],
    ayuda: 'Planificada con meses. El nombre y la descripción son de Marketing.',
  },
];

export const CLAVES_PUERTA = PUERTAS.map((p) => p.key);

/** El nombre de la puerta en castellano, o la clave cruda si alguien guardó algo que ya no existe. */
export function rotuloPuerta(key) {
  const p = PUERTAS.find((x) => x.key === key);
  return p ? p.label : String(key || '');
}

/** ¿Es una de las tres? Se pregunta **una sola vez**, en la entrada de `sembrar`. */
export function puertaValida(v) {
  return CLAVES_PUERTA.includes(String(v));
}

/**
 * **Las puertas que existen en esta marca**, en el orden del catálogo.
 *
 * 🔑 Es lo que dibuja la pantalla, y ⛔ no un adorno: la pregunta de la puerta se contesta de un
 * click, y una opción que en esa marca no existe está a un click de sembrar seis renglones con la
 * dueña equivocada. **Un pendiente que ya tiene nombre puesto no lo revisa nadie.**
 *
 * ⚠️ Una marca desconocida devuelve **sólo las que corren en las dos**, ⛔ nunca todas: es el mismo
 * criterio de siempre —lo que falta cierra, no abre— y deja la lista más corta, no la más larga.
 */
export function puertasDeMarca(marca) {
  const m = String(marca || '');
  return PUERTAS.filter((p) => p.marcas.length === 0 || p.marcas.includes(m));
}

/**
 * ¿Esta puerta existe en esta marca? Es el guard del servidor, y va **además** de `puertaValida`:
 * aquélla contesta «esa puerta no existe», ésta «esa puerta no existe **acá**», y son dos errores
 * distintos para el que los lee.
 */
export function puertaValeEnMarca(key, marca) {
  return puertasDeMarca(marca).some((p) => p.key === String(key));
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
 * ¿Este molde corre para esta MARCA? Misma lectura que las puertas: **lista vacía = las dos**.
 *
 * 🔑 Existe aparte de `esDeMisMarcas` (el GET de `api/_agenda.js`) aunque la forma sea la misma,
 * porque la pregunta es otra: allá es *«¿puedo ver esto?»* —una persona con acceso a las dos las ve
 * las dos— y acá es *«¿este paso es de este ingreso?»*, donde el ingreso tiene **una sola** marca.
 * Aplanarlas en una función haría que cambiar una de las dos reglas cambiara la otra sin querer.
 *
 * De dónde sale la necesidad: la descripción de una compra nacional la escribe **el local si es
 * ropa de Zattia, y nunca si son fundas de BDI** (Bruno, 25-ago-2026) — son dos moldes de la misma
 * puerta que se separan por marca, y sin esto los dos caerían en cada ingreso nacional.
 */
export function moldeCorreEnMarca(marcasDelMolde, marca) {
  const lista = Array.isArray(marcasDelMolde) ? marcasDelMolde : [];
  return lista.length === 0 || lista.includes(String(marca));
}

/**
 * **El vocabulario de Gerardo, traducido al nuestro.**
 *
 * 📌 Vive acá y no en `ingreso2` a propósito: las puertas son una decisión nuestra —salen del
 * manual 06— y Gerardo no tiene por qué cambiar la suya para que nosotros sembremos bien.
 *
 * 🔑 **Y desde el 1-sep-2026 el mapa deja de ser 1 a 1, que es para lo que existe.** `accesorios`
 * era una puerta nuestra y dejó de serlo —es la compra nacional de BDI—, así que acá **se traduce**
 * en vez de desaparecer: un aviso que hoy entra tiene que seguir entrando. Sacarlo de este mapa
 * convertiría un ingreso bien avisado en un 400, y el 400 lo cobra la mercadería que llegó.
 *
 * ⚠️ **La lista exacta de tipos que maneja `ingreso2` todavía no llegó** (es una mano de Bruno con
 * Gerardo). Hasta que llegue, un tipo desconocido contesta un 400 que **lo nombra**, así que la
 * primera prueba de Gerardo documenta sola el vocabulario que falta y agregarlo es un renglón acá.
 *
 * 🔴 **Un tipo que no está en el mapa es un 400, ⛔ nunca una puerta por defecto**: un default
 * sembraría seis renglones con la dueña equivocada, que es peor que no sembrar.
 */
export const TIPOS_INGRESO2 = {
  produccion: 'produccion',
  nacional: 'nacional',
  importacion: 'importacion',
  // 🔑 Era la cuarta puerta nuestra hasta el 1-sep-2026. Entra igual, y entra como lo que es.
  accesorios: 'nacional',
};

/** La puerta que le corresponde a un tipo de `ingreso2`, o `null` si no lo conocemos. */
export function puertaDeTipo(tipo) {
  const t = String(tipo || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TIPOS_INGRESO2, t) ? TIPOS_INGRESO2[t] : null;
}
