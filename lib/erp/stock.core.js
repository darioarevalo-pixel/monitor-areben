/**
 * Stock e historial de una prenda (pestaña `erp › Stock`): lo que dice el LIBRO de stock
 * (`stock_movimiento`, lo escribe `areben-libro-stock` una vez por día) al lado de lo que dice GN.
 * Puro: el handler (`api/_erp.js`) lee las filas y esto las arma.
 *
 * 🔑 El libro es inmutable: una anulación o una corrección es OTRO movimiento ⇒ el nivel es la suma,
 * y el historial muestra cada fila con el saldo de su depósito después de ella.
 * ⚠️ En Zattia el depósito de GN se llama `Deposito ` (con espacio) ⇒ se compara recortado.
 * El mapa de nombres es copia de `lib/depositos.mjs` del libro (esta app no lo importa todavía).
 */

const POR_NOMBRE = {
  bdi: { 'local': 'local', 'deposito minorista': 'deposito_minorista', 'deposito mayorista': 'deposito_mayorista' },
  zattia: { 'local': 'local', 'deposito': 'deposito' },
}

/** El depósito canónico de un `store_name` de GN, o null si no se conoce (⛔ se adivina). */
export function depositoDe(marca, storeName) {
  if (storeName == null) return null
  return POR_NOMBRE[marca]?.[String(storeName).trim().toLowerCase()] ?? null
}

/** Cómo se lee cada depósito en pantalla. */
export const NOMBRE_DEPOSITO = {
  local: 'Local', deposito: 'Depósito', deposito_minorista: 'Depósito minorista', deposito_mayorista: 'Depósito mayorista',
}

/** Qué fue cada movimiento, en palabras del equipo. */
export const NOMBRE_TIPO = {
  apertura: 'Stock inicial', venta: 'Venta', anulacion: 'Anulación', correccion: 'Corrección',
  transferencia: 'Transferencia', ingreso: 'Ingreso', ajuste_conteo: 'Ajuste por conteo', reapertura: 'Reapertura', ajuste: 'Ajuste del ERP',
}

/** De qué sistema salió cada movimiento. */
export const NOMBRE_ORIGEN = {
  apertura: 'foto de Gestión Nube', gn: 'Gestión Nube', repo: 'Reposición', recepcion: 'Ingreso', conteo: 'Conteo', caja: 'Caja',
  monitor: 'Monitor', falla: 'Fallas', reclamo: 'Reclamos', canje: 'Canjes', solicitud: 'Solicitudes', tn: 'Tienda Nube', ajuste: 'Ajustes del ERP', realineo: 'Conteo (el ERP pasa a lo contado)',
  gn_foto: 'Transferencia hecha en Gestión Nube (el ERP la ve en la foto del día)',
}

/**
 * @template {{id?:string|number,deposito:string,cantidad:number|string,ocurrido_en:string,tipo:string,origen:string}} M
 * @param {{ movimientos: M[], gn: Array<{store_name:string,available_quantity:number|string|null}>, marca: string }} p
 * @returns {{ depositos: Array<{deposito:string,libro:number,gn:number|null,diferencia:number|null}>,
 *             historial: Array<M & {cantidad:number,saldo:number}>, sinDeposito: string[] }}
 */
export function stockDeVariante({ movimientos, gn, marca }) {
  // Orden estable: por hora, y a igual hora por id (el libro escribe en orden).
  const orden = [...movimientos].sort((a, b) =>
    new Date(a.ocurrido_en).getTime() - new Date(b.ocurrido_en).getTime() || Number(a.id ?? 0) - Number(b.id ?? 0))
  const saldo = new Map()
  const historial = orden.map((m) => {
    const s = (saldo.get(m.deposito) ?? 0) + Number(m.cantidad)
    saldo.set(m.deposito, s)
    return { ...m, cantidad: Number(m.cantidad), saldo: s }
  })

  const enGN = new Map()
  const sinDeposito = []
  for (const g of gn) {
    const d = depositoDe(marca, g.store_name)
    if (!d) { sinDeposito.push(String(g.store_name)); continue }
    enGN.set(d, (enGN.get(d) ?? 0) + Number(g.available_quantity ?? 0))
  }

  const todos = [...new Set([...saldo.keys(), ...enGN.keys()])].sort()
  const depositos = todos.map((d) => {
    const libro = saldo.get(d) ?? 0
    const g = enGN.has(d) ? enGN.get(d) : null
    return { deposito: d, libro, gn: g, diferencia: g == null ? null : g - libro }
  })
  // El más nuevo arriba: es lo que se busca primero.
  return { depositos, historial: historial.reverse(), sinDeposito }
}
