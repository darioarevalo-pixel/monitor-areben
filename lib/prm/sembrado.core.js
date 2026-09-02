/**
 * La ficha de proveedor que NACE de una orden de compra.
 *
 * 🔴 Vive en el núcleo porque la escriben DOS lugares: `scripts/sembrar-prm.mjs` —la foto de una
 * vez, con la que arrancó el padrón— y `api/_oc-webhook.js`, que la abre para cada proveedor nuevo
 * que aparece. Copiada en los dos lados serían **dos reglas sobre la misma fila**: el día que
 * cambie el estado o el motivo, cambiaría uno solo y nadie se enteraría.
 *
 * JS plano —y no `.ts`— porque lo importa `api/_oc-webhook.js`, que corre en Node sin pasar por el
 * compilador de Next. `lib/prm/core.ts` lo re-exporta tipado, igual que `geo.core.js`.
 */

/** 🔑 Los dos van OBLIGATORIOS para que el llamador no herede un reloj ni un azar de acá adentro. */
export function nuevoIdDeLocal({ ahora, azar }) {
  if (!Number.isFinite(ahora)) throw new Error('nuevoIdDeLocal: falta ahora')
  if (!azar) throw new Error('nuevoIdDeLocal: falta azar')
  return `pl${ahora}_${azar}`
}

/**
 * La fila del local sembrado, tal cual entra a `proveedor_local`.
 *
 * - `estado: 'compro'` es la verdad medida, no un default: tiene órdenes de compra confirmadas.
 * - 🔴 **`zona` queda AFUERA a propósito** (o sea `null`). La recorrida filtra por zona, así que un
 *   proveedor al que se le compra por mail —`CHINA`, `RHOVE`— ⛔ no entra a un viaje por accidente.
 *   Clasificarlo es una mano de Bruno, y la nota lo pide.
 * - 🔑 **El motivo va escrito en la fila.** Dentro de un mes, «¿de dónde salió éste?» tiene que
 *   contestarse solo, sin ir a mirar quién corrió qué script.
 */
export function filaDeLocalSembrado({ id, proveedorId, nombre, origen }) {
  if (!id) throw new Error('filaDeLocalSembrado: falta id')
  // 🔴 **`0` NO es un proveedor y hay que rechazarlo acá.** `enteroDe` (el normalizador del
  // webhook) devuelve 0 cuando el campo no vino, y recién después lo colapsa a `null`; cualquier
  // llamador que haga `Number(oc.proveedor_id)` sobre ese `null` vuelve a tener un 0 que
  // `Number.isFinite` da por bueno — y entonces TODAS las órdenes sin proveedor comparten una
  // misma ficha fantasma, «Proveedor #0», con el cumplimiento de todas ellas sumado.
  if (!Number.isInteger(proveedorId) || proveedorId <= 0)
    throw new Error('filaDeLocalSembrado: proveedorId inválido')
  if (!origen) throw new Error('filaDeLocalSembrado: falta origen')
  return {
    id,
    // Un proveedor sin nombre igual merece ficha: sin ella sus OCs no se ven desde el PRM, y el
    // número es lo único que lo identifica hasta que alguien lo bautice.
    nombre: String(nombre || '').trim() || `Proveedor #${proveedorId}`,
    estado: 'compro',
    proveedor_id_ingresos: proveedorId,
    creado_por: 'sembrado',
    nota: `${origen}. Falta clasificarle la zona.`,
  }
}
