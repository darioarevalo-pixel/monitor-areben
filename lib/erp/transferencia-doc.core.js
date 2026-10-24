/**
 * ERP › Stock › Transferencias COMO DOCUMENTO del motor (`motor/stock/transferencia.mjs`, sql/034; contrato en
 * `areben-motor/TRANSFERENCIA.md`). Este núcleo es lo puro de la puerta `api/_erp-transferencia.js`: lee el pedido del
 * navegador (⛔ se confía en él) y dice en palabras de la pantalla lo que el motor contesta. Sin red ni base.
 */
export const LINEAS = ['bdi', 'zattia', 'stunned']
export const baseDe = (linea) => (linea === 'bdi' ? 'bdi' : 'zattia')
export const ACCIONES = ['transferencia-crear', 'transferencia-armar', 'transferencia-enviar', 'transferencia-recibir', 'transferencia-cancelar']

const entero = (x) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && Number.isInteger(Number(x))

/** Las prendas del pedido: sólo lo que el motor usa, ⛔ lo que el navegador agregue. */
export function leerRenglones(r) {
  if (r == null) return []
  if (!Array.isArray(r)) return null
  const lista = []
  for (const x of r) {
    if (!x || typeof x !== 'object') return null
    lista.push({
      product_id: x.product_id, size_id: x.size_id, cantidad: x.cantidad,
      sku: typeof x.sku === 'string' ? x.sku.slice(0, 80) : null, barcode: typeof x.barcode === 'string' ? x.barcode.slice(0, 80) : null,
    })
  }
  return lista
}

/** @returns {{ error: string } | { linea: string, id?: string, entrada: any }} */
export function leerAccion(body) {
  const linea = String(body?.linea || '')
  if (!LINEAS.includes(linea)) return { error: 'Línea inválida' }
  const renglones = leerRenglones(body.renglones)
  if (renglones === null) return { error: 'Las prendas vienen mal armadas' }
  const accion = body.accion
  if (accion === 'transferencia-crear') {
    const desde = String(body.desde || ''), hacia = String(body.hacia || '')
    if (!desde || !hacia) return { error: 'Falta de dónde sale y a dónde llega' }
    const origen = body.origen === 'reposicion' ? 'reposicion' : 'libre'
    return { linea, entrada: { linea, desde, hacia, origen, origen_ref: body.origen_ref ? String(body.origen_ref) : undefined, nota: body.nota ? String(body.nota).slice(0, 300) : undefined, renglones } }
  }
  const id = String(body.transferenciaId || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Falta la transferencia' }
  if (accion === 'transferencia-cancelar') return { linea, id, entrada: { motivo: String(body.motivo || '') } }
  if (accion === 'transferencia-enviar') {
    const gn = body.gn_transfer_id
    return { linea, id, entrada: { gn_transfer_id: gn != null && (entero(gn) || typeof gn === 'string') ? String(gn).slice(0, 40) : undefined } }
  }
  if (accion === 'transferencia-armar' || accion === 'transferencia-recibir') return { linea, id, entrada: { renglones } }
  return { error: 'Acción desconocida' }
}

export const STATUS = { ENTRADA_INVALIDA: 400, NO_ENCONTRADO: 404, ESTADO_INVALIDO: 409, SIN_PRENDAS: 409, FUERA_DEL_PEDIDO: 409, NO_SALIO_EN_ESTA: 409 }
const MENSAJE = {
  SIN_PRENDAS: 'No hay nada escaneado para transferir.',
  NO_ENCONTRADO: 'No está esa transferencia.',
  FUERA_DEL_PEDIDO: 'Esa prenda no está en el pedido de Reposición.',
  NO_SALIO_EN_ESTA: 'Esa prenda no salió en esta transferencia: si llegó de más, se anota como ajuste.',
}
/** El error del motor, dicho como en la pantalla (el motor habla de «libro»). */
export function errorDe(r) {
  const c = r.error.codigo
  const texto = c === 'ESTADO_INVALIDO' ? `${r.error.mensaje}. Volvé a leer.` : MENSAJE[c] ?? String(r.error.mensaje || '').replace(/\u26D4\s*/g, 'no ')
  return { status: STATUS[c] ?? 409, error: texto }
}

export function textoDeAviso(a) {
  if (a.codigo === 'SIN_STOCK_EN_LIBRO') return `${a.sku || 'Una prenda'}: el ERP tiene ${a.libro} en ese depósito y se mueven ${a.armada}. Se anota igual; conviene contarla.`
  if (a.codigo === 'ARMADA_MAS_QUE_PEDIDA') return `${a.sku || 'Una prenda'}: se armaron ${a.armada} y el pedido era de ${a.pedida}.`
  return a.codigo
}
