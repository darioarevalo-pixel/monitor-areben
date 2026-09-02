/**
 * La dirección de un canje, del lado en que se ESCRIBE.
 *
 * Vive acá, en JS plano y sin un solo import, por lo mismo que `reglas.core.js` y
 * `nota-gn.core.js`: lo llaman los dos handlers, y uno de ellos —`api/_canje-portal.js`— es el
 * único endpoint del módulo sin sesión y abierto a internet. Arrastrarle `lib/` entero al bundle es
 * justo lo que se evita.
 *
 * 🔑 Y está separado del formulario a propósito: la misma corrección tiene que correr cuando carga
 * ella por su link y cuando el equipo edita la ficha a mano. Media regla en una de las dos pantallas
 * es exactamente lo que dejó cuatro fichas con la provincia mal.
 */

/**
 * El único tramo de código postal argentino que determina la provincia sin ambigüedad: la Ciudad
 * Autónoma de Buenos Aires ocupa 1000–1499 completo, y ninguna otra provincia entra ahí.
 *
 * ⛔ **No es el comienzo de una tabla de CP → provincia, y no hay que completarla "para que quede
 * pareja".** El resto de los rangos se pisan entre sí —el 2000 es Rosario pero el 2900 es San
 * Nicolás, en Buenos Aires; el 5000 es Córdoba capital pero hay CPs de Córdoba arriba del 6000— así
 * que una tabla larga escrita de memoria corregiría direcciones que están bien. Acá entra un rango
 * nuevo el día que alguien lo mida contra el nomenclador, no antes.
 */
const CABA = { desde: 1000, hasta: 1499, provincia: 'Ciudad Autónoma de Buenos Aires' };

/**
 * Los cuatro dígitos de un CP argentino, salga como salga escrito.
 *
 * Los CPA nuevos son `C1406DGH`: letra de provincia, cuatro dígitos, tres letras de cara de manzana.
 * Se le sacan las letras y quedan los mismos cuatro dígitos del CP viejo, que es lo que se compara.
 * 🔴 Con más de cuatro dígitos devuelve `null` en vez de recortar: `14060` es un error de tipeo, y
 * leerlo como `1406` sería inventar una respuesta sobre un dato que nadie escribió.
 *
 * @param {unknown} cp
 * @returns {number|null}
 */
export function digitosDelCp(cp) {
  const soloDigitos = String(cp ?? '').replace(/\D/g, '');
  if (soloDigitos.length !== 4) return null;
  return parseInt(soloDigitos, 10);
}

/**
 * La provincia que el código postal afirma, o `null` si el CP no alcanza para saberlo.
 *
 * 🔑 El `null` es la respuesta normal, no un error: de casi todos los CP del país no se deduce nada
 * y la provincia que escribió la persona queda como está.
 *
 * @param {unknown} cp
 * @returns {string|null}
 */
export function provinciaDelCp(cp) {
  const n = digitosDelCp(cp);
  if (n === null) return null;
  return (n >= CABA.desde && n <= CABA.hasta) ? CABA.provincia : null;
}

/**
 * Corrige la provincia contra el código postal, cuando el CP la determina.
 *
 * Es el guard que faltaba: al cargar las etiquetas del 1-sep-2026, **4 de 13 fichas decían «Buenos
 * Aires» siendo CABA** y una decía literalmente «Provincia». Nadie lo veía porque los dos campos son
 * texto libre y ninguna pantalla los cruza; se descubrió tipeándolos uno por uno en Envío Nube,
 * donde elegir mal la provincia manda el paquete a otro lado.
 *
 * ⚠️ **Pisa lo que escribió la persona, y eso es deliberado**: con un CP de CABA, «Buenos Aires» no
 * es una opinión ni un caso raro, es un error —son dos jurisdicciones distintas para el correo—.
 * Lo que sí hace es quedar visible: el valor corregido es el que la pantalla vuelve a mostrar, así
 * que ella lo ve al recargar su link y el equipo lo ve en la ficha. ⛔ Lo que no se puede es
 * corregir **callado y hacia adentro**, guardando una cosa y mostrando otra.
 *
 * ⛔ Y no inventa una provincia donde no había: si el campo vino vacío, sale vacío y el formulario
 * lo reclama como faltante. Completar un obligatorio por atrás sería aprobarle a alguien un dato
 * que nunca afirmó.
 *
 * @param {unknown} provincia lo que vino escrito
 * @param {unknown} cp el código postal del mismo formulario
 * @returns {{ provincia: unknown, corregida: boolean }}
 */
export function provinciaCorregida(provincia, cp) {
  const delCp = provinciaDelCp(cp);
  if (!delCp) return { provincia, corregida: false };
  const escrita = String(provincia ?? '').trim();
  if (!escrita) return { provincia, corregida: false };
  if (escrita.toLowerCase() === delCp.toLowerCase()) return { provincia, corregida: false };
  return { provincia: delCp, corregida: true };
}
