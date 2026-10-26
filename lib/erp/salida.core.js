/**
 * ERP › Salida con vuelta (sesión de fotos, muestra para producción, solicitud interna retornable): el documento del motor
 * (`motor/stock/salida.mjs`, sql/048; contrato en `areben-motor/SALIDA.md`). Este núcleo es lo puro de la puerta
 * `api/_erp-salida.js`: lee el pedido del navegador (⛔ se confía en él) y dice en palabras de la pantalla lo que el motor
 * contesta. Sin red ni base.
 */
export const LINEAS = ['bdi', 'zattia', 'stunned']
export const baseDe = (linea) => (linea === 'bdi' ? 'bdi' : 'zattia')
export const ACCIONES = ['salida-crear', 'salida-devolver', 'salida-cerrar', 'salida-cancelar']
export const TIPOS = ['foto', 'produccion', 'interna']

const entero = (x) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && Number.isInteger(Number(x))
const corto = (x, max) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null)

/** Las prendas que SALEN: sólo lo que el motor usa. `null` si vienen mal armadas. */
export function leerSalen(r) {
  if (!Array.isArray(r)) return null
  const lista = []
  for (const x of r) {
    if (!x || typeof x !== 'object') return null
    lista.push({ product_id: x.product_id, size_id: x.size_id, deposito: x.deposito, cantidad: x.cantidad, sku: corto(x.sku, 80), barcode: corto(x.barcode, 80) })
  }
  return lista
}

/** Lo que VUELVE o se declara, por renglón (`n`). `campos` = los números que esa acción acepta. */
export function leerPorRenglon(r, campos) {
  if (!Array.isArray(r)) return null
  const lista = []
  for (const x of r) {
    if (!x || typeof x !== 'object' || !entero(x.n)) return null
    const fila = { n: Number(x.n) }
    for (const c of campos) if (x[c] != null && x[c] !== '') { if (!entero(x[c])) return null; fila[c] = Number(x[c]) }
    lista.push(fila)
  }
  return lista
}

/** @returns {{ error: string } | { linea: string, id?: string, entrada: any }} */
export function leerAccion(body) {
  const linea = String(body?.linea || '')
  if (!LINEAS.includes(linea)) return { error: 'Línea inválida' }
  const accion = body.accion
  if (accion === 'salida-crear') {
    if (!TIPOS.includes(body.tipo)) return { error: 'Falta el tipo de salida (fotos, producción o interna)' }
    const ref = corto(body.ref, 100)
    if (!ref) return { error: 'Falta la solicitud de la que sale' }
    const renglones = leerSalen(body.renglones)
    if (renglones === null) return { error: 'Las prendas vienen mal armadas' }
    const gn = body.gn_sale_ids && typeof body.gn_sale_ids === 'object' && !Array.isArray(body.gn_sale_ids)
      ? Object.fromEntries(Object.entries(body.gn_sale_ids).filter(([k, v]) => ['deposito', 'local'].includes(k) && (entero(v) || typeof v === 'string')).map(([k, v]) => [k, String(v).slice(0, 40)]))
      : {}
    return { linea, entrada: { linea, tipo: body.tipo, ref, detalle: corto(body.detalle, 300) ?? undefined, gn_sale_ids: gn, renglones } }
  }
  const id = String(body.salidaId || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Falta la salida' }
  if (accion === 'salida-cancelar') return { linea, id, entrada: { motivo: String(body.motivo || '') } }
  if (accion === 'salida-devolver') {
    const renglones = leerPorRenglon(body.renglones, ['cantidad'])
    return renglones === null ? { error: 'Las prendas vienen mal armadas' } : { linea, id, entrada: { renglones } }
  }
  if (accion === 'salida-cerrar') {
    const renglones = leerPorRenglon(body.renglones, ['devuelta', 'consumida', 'danada', 'perdida'])
    return renglones === null ? { error: 'Las prendas vienen mal armadas' } : { linea, id, entrada: { renglones } }
  }
  return { error: 'Acción desconocida' }
}

export const STATUS = { ENTRADA_INVALIDA: 400, NO_ENCONTRADA: 404, YA_RESUELTA: 409, DEVUELVE_DE_MAS: 409, FALTA_CONTAR: 409, YA_TIENE_MOVIMIENTO: 409 }
const MENSAJE = {
  NO_ENCONTRADA: 'No está esa salida.',
  YA_RESUELTA: null,
  DEVUELVE_DE_MAS: null,
  YA_TIENE_MOVIMIENTO: null,
}
/** El error del motor, dicho como en la pantalla (el motor habla de «libro»). `FALTA_CONTAR` lleva la lista de lo que falta. */
export function errorDe(r) {
  const c = r.error.codigo
  const texto = MENSAJE[c] ?? String(r.error.mensaje || '').replace(/\u26D4\s*/g, 'no ')
  const base = { status: STATUS[c] ?? 409, error: texto }
  return c === 'FALTA_CONTAR' ? { ...base, faltan: r.error.renglones ?? [] } : base
}

export function textoDeAviso(a) {
  if (a.codigo === 'SIN_STOCK_EN_LIBRO') return `${a.sku || 'Una prenda'}: el ERP tiene ${a.libro} en ese depósito y salen ${a.sale}. Se anota igual; conviene contar la prenda.`
  if (a.codigo === 'SIN_COSTO') return `${a.sku || 'Una prenda'} no tiene costo cargado: el gasto de esta salida queda subestimado.`
  if (a.codigo === 'LIBRO_SE_MOVIO') return `${a.sku || 'Una prenda'}: el libro se movió desde que se armó (tenía ${a.antes} y ahora ${a.ahora}).`
  return a.codigo
}
