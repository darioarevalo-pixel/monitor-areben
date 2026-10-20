// El envío y su VENTA del ERP (contrato-venta.md §20, motor `venta/contraentrega`): qué le toca hacer al motor cuando
// cambia un envío que apunta a una venta (`envios_reparto.venta_id`).
//
// 🔑 **Quién lleva qué** (Bruno, 20-oct): el motor lleva la VENTA y si ya se cobró; Envíos lleva la CUENTA DEL CADETE.
// Regla de Envíos (17-ago): un pedido ⛔ se entrega si ⛔ está pago ⇒ entregado = cobrado, y `cobrado` dice POR DÓNDE
// entró: `false` le transfirieron al local; `true` o `null` (nadie dijo nada) lo cobró el cadete.
//
// 🔴 **Se decide mirando el ANTES y el DESPUÉS, ⛔ la acción que llegó.** El cadete toca «Entregado», «Cobrado», «No
// cobré» y «No entregado» sueltos y en cualquier orden, y la pantalla puede corregir cualquiera días después: con un
// verbo atado a cada botón, «entregado» y después «no cobré» dejaba la venta cerrada por el cadete. Por eso el motor
// tiene `corregirContraentrega` (deja la venta como dice el envío, sea lo que sea que había) y `reabrirContraentrega`.
//
// 🔑 **Envíos ⛔ se frena por el ERP**: hasta el corte, el ERP es la PRUEBA y Envíos lo usa el equipo de verdad. El
// envío se escribe primero; si el motor falla, vuelve un AVISO (⛔ un error) y la venta sigue en la calle, a la vista
// en Ventas › Cobros › Contraentrega.

/** Lo que dice el envío sobre quién cobró: el `como` del motor. */
export function comoDeCobro(cobrado) {
  return cobrado === false ? 'local' : 'cadete'
}

/**
 * El verbo del motor que corresponde a un cambio del envío, o `null` si no hay nada que hacer.
 * @param {{ estado?: string, cobrado?: boolean|null, venta_id?: string|null }|null} antes  la fila antes de escribir (null = nueva)
 * @param {{ estado?: string, cobrado?: boolean|null, venta_id?: string|null }|null} despues  la fila escrita (null = borrada)
 * @returns {null | { verbo: 'corregir', como: 'cadete'|'local', venta_id: string } | { verbo: 'reabrir', venta_id: string }}
 */
export function verboDeVenta(antes, despues) {
  const ahora = despues && despues.venta_id ? despues : null
  if (ahora && ahora.estado === 'entregado') {
    const como = comoDeCobro(ahora.cobrado)
    // Ya estaba entregado, por el mismo lado y a la misma venta ⇒ nada cambió (⛔ se le pega al motor en cada guardado).
    if (antes && antes.estado === 'entregado' && antes.venta_id === ahora.venta_id && comoDeCobro(antes.cobrado) === como) return null
    return { verbo: 'corregir', como, venta_id: ahora.venta_id }
  }
  // Deja de estar entregado (no entregado, vuelve a la lista, se borró): la plata ⛔ entró ⇒ la venta vuelve a la calle.
  if (antes && antes.venta_id && antes.estado === 'entregado') return { verbo: 'reabrir', venta_id: antes.venta_id }
  return null
}

/** Los errores del motor que NO son un aviso: la venta no se cobra contra entrega (de TN, o pagada en el local). */
export const SIN_AVISO = ['SIN_CONTRAENTREGA']

/** `venta_id` del cuerpo: un uuid, `null` para soltarla, `undefined` si no vino (⛔ se toca). Inválido ⇒ `false`. */
export function ventaIdDe(v) {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v)) ? String(v).toLowerCase() : false
}

/**
 * ¿Se puede ofrecer «Anular la venta» en este envío? Sólo «no entregado» y SIN reintento (si se reprograma, vuelve a
 * `pendiente`: la venta sigue viva), y con su venta.
 */
export function puedeAnularVenta(e) {
  return !!(e && e.venta_id && e.estado === 'no_entregado')
}
