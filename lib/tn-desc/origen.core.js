/**
 * De dónde VINO el producto, y el pie de marca que sale de ahí.
 *
 * Decisión de Bruno (4-sep-2026): el pie «Producto 100% Zattia 🇦🇷» va **sólo si el producto es de
 * producción propia**; si es compra nacional ⛔ no va. Y el dato ⛔ no se carga a mano: **sale de la
 * orden de compra** por la que entró — lo dijo él y se verificó que alcanza.
 *
 * 🔑 **Producción propia = la OC cuyo proveedor es la marca misma.** Medido contra las 74 OC de
 * Zattia: hay 27 proveedores y uno se llama `ZATTIA`, con 15 órdenes y **34 productos publicados**
 * (BABY TEE ARGENTINA, REMERA STRIPES BLUE y PINK, BODY VEGAS, BUZO BROWN…). Confirmado por Bruno.
 *
 * 📊 **Lo que cubre, medido el 4-sep-2026**: de 356 publicados, **220 (62 %) cruzan con alguna OC**.
 * Los otros 136 son anteriores al webhook de Ingresos y ⛔ no tienen manera de saberlo.
 * 🔴 **Y por eso la regla falla CERRADA: sin OC, sin pie.** Poner «100% Zattia» en algo comprado es
 * peor que no ponerlo en algo propio — lo primero es una afirmación falsa sobre el producto, lo
 * segundo es una línea que falta.
 *
 * 🔑 **Ninguno mezcla proveedores**: de los 220 que cruzan, cero aparecen con `ZATTIA` y con otro.
 * Aun así, un producto con proveedores mezclados ⛔ no lleva pie: el día que pase, es una pregunta
 * abierta y no algo para contestar solo.
 */

/** El nombre con el que la marca se compra a sí misma en el sistema de Ingresos. */
const PROPIO = { zattia: 'ZATTIA' };

/**
 * El pie de cada marca. ⚠️ BDI ⛔ no tiene: nadie definió su texto ni cuál es su proveedor propio,
 * y el módulo hoy es de Zattia. Sin entrada acá, ⛔ no sale pie — que es la falla cerrada.
 */
const PIES = { zattia: 'Producto 100% Zattia 🇦🇷' };

/** ¿Cómo se llama el proveedor «nosotros mismos» en esta marca? `null` si no está definido. */
export function proveedorPropio(store) {
  return PROPIO[String(store || '').toLowerCase()] || null;
}

/**
 * ¿Es de producción propia? `proveedores` son los de TODAS las OC por las que entró el producto.
 *
 * ⛔ Sin ninguna OC devuelve `false`, ⛔ no `null`: para el que llama, «no sé» y «no es» terminan en
 * lo mismo —no se pone el pie—, y devolver tres estados invita a que alguien trate el `null` como
 * verdadero en algún lado.
 */
export function esProduccionPropia(store, proveedores) {
  const propio = proveedorPropio(store);
  const lista = (proveedores || []).map((x) => String(x || '').trim().toUpperCase()).filter(Boolean);
  if (!propio || !lista.length) return false;
  // TODOS los proveedores conocidos tienen que ser el propio: uno mezclado es una pregunta abierta.
  return lista.every((x) => x === propio);
}

/** El pie que va al final de la descripción, o `null` si no corresponde. */
export function pieDe(store, proveedores) {
  if (!esProduccionPropia(store, proveedores)) return null;
  return PIES[String(store || '').toLowerCase()] || null;
}
