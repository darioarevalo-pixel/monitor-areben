// La ficha del cliente de Gestión Nube → la tabla `clientes` del espejo.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ---------------------------
// Hasta el 23-ago-2026 el espejo **no copiaba la ficha del cliente: la deducía de las ventas**
// (`extraerClientes`, sync-ventas-hoy.js:92 y sus dos gemelos), quedándose con la foto que GN
// pegó en cada venta. Dos agujeros, los dos medidos:
//
//  1. **La ficha que se completa DESPUÉS de la venta no llega nunca.** Un cliente cargado sin
//     teléfono, que compra, y al que se le carga el WhatsApp al otro día, queda "sin teléfono"
//     para siempre — salvo que vuelva a comprar.
//
//  2. 🔑 **El WhatsApp no viaja en la venta.** La ficha de GN tiene DOS teléfonos y la venta
//     expone uno solo: `phone_number` (el común). El que carga Bruno es el otro,
//     **`cellphone_number`** — el "Teléfono Móvil/WA" de la pantalla de GN. Testigo: Belen
//     Orellana (649338) → `phone_number: ''`, `cellphone_number: '3834270554'`.
//
// Resultado medido sobre los 785 clientes mayoristas (canal 10): **526 figuraban sin teléfono y
// 463 de ellos lo tenían cargado en la ficha.** El CRM pasa de 33% a 92% de cobertura.
//
// LA REGLA QUE ORDENA TODO
// ------------------------
// 🔴 **La ficha manda; la venta sólo sirve para descubrir clientes nuevos.** Por eso los syncs de
// ventas pasaron a `ignoreDuplicates` (insertan al que no existe, nunca actualizan) y quien
// mantiene los datos al día es este módulo. Antes los dos escribían la misma fila y el de ventas
// ganaba por ser el que corre seguido.

/** Los campos de la ficha que el espejo guarda. `phone` sale de dos campos de GN, ver abajo. */
export const CAMPOS = ['name', 'email', 'phone', 'city', 'province', 'address', 'postal_code'];

const limpio = (v) => String(v ?? '').trim();

/**
 * Una ficha de GN → la fila del espejo.
 *
 * 🔴 **`cellphone_number` va PRIMERO y no es un detalle de orden.** Es el campo donde vive el
 * WhatsApp; `phone_number` es el teléfono común y en la mayoría de las fichas está vacío. Si se
 * invirtiera el orden, los clientes que tienen los dos cargados quedarían con el fijo — que es
 * justo el número al que no se le puede escribir.
 */
export function mapearFicha(f) {
  return {
    id: f.id,
    name: limpio(f.name),
    email: limpio(f.email),
    phone: limpio(f.cellphone_number) || limpio(f.phone_number),
    city: limpio(f.city),
    province: limpio(f.province),
    address: limpio(f.address),
    postal_code: limpio(f.postal_code),
  };
}

/**
 * Qué escribir de una ficha, sabiendo lo que el espejo ya tiene.
 *
 * 🔴 **Un campo vacío en GN NO borra lo que había.** Ésta es la mitad del arreglo: el `upsert` de
 * los syncs de ventas pisa todas las columnas, así que una venta sin teléfono **borraba un
 * teléfono bueno**. Acá un valor vacío simplemente no se propone, y el dato viejo sobrevive.
 *
 * Devuelve `null` si no hay nada que cambiar. Eso importa: son 14.107 fichas y casi ninguna
 * cambia de un día para el otro. Sin este corte, cada corrida reescribiría el padrón entero.
 *
 * @param {object} ficha  la fila ya mapeada con `mapearFicha`
 * @param {object|undefined} actual  la fila del espejo, o undefined si el cliente es nuevo
 */
export function cambiosDeFicha(ficha, actual) {
  const patch = {};
  for (const campo of CAMPOS) {
    const nuevo = ficha[campo];
    if (!nuevo) continue; // vacío en GN → no se toca lo que haya
    const viejo = limpio(actual?.[campo]);
    if (nuevo !== viejo) patch[campo] = nuevo;
  }
  if (!Object.keys(patch).length) return null;
  return { id: ficha.id, ...patch };
}

/**
 * El lote a escribir: las filas que cambian, ya con `updated_at`.
 *
 * ⚠️ Las filas de un `upsert` tienen que tener **las mismas columnas**: PostgREST arma el INSERT
 * con la unión de las claves y a la fila que no la trae le pone NULL — o sea que un patch parcial
 * mezclado con otro borraría campos, que es exactamente el bug que vinimos a arreglar. Por eso
 * cada fila se completa con lo que YA tiene el espejo antes de salir.
 */
export function armarLote(fichas, porId, ahora) {
  const filas = [];
  for (const f of fichas) {
    const actual = porId.get(f.id);
    const patch = cambiosDeFicha(f, actual);
    if (!patch) continue;
    const fila = { id: f.id, updated_at: ahora };
    for (const campo of CAMPOS) {
      fila[campo] = patch[campo] !== undefined ? patch[campo] : (actual?.[campo] ?? null);
    }
    filas.push(fila);
  }
  return filas;
}
