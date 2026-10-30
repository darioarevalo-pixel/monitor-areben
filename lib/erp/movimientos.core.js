/**
 * ERP › Stock › Movimientos, con el molde del diseño (`~/Documents/erp-monitor/diseno.md` §3, §4 y §7; tablero 3 del v8):
 * la lista de REGISTRO del libro de stock — cada fila de `stock_movimiento` (cuándo · tipo · prenda · dónde · cantidad ·
 * lo que quedó · el documento que lo explica · quién). «Nada se borra»: una corrección es otro movimiento.
 * Puro: el servidor (`api/_erp-stock.js`, `vista=movimientos`) lee las filas y esto las arma.
 *
 * 🔑 «Queda» es lo que quedó de ESA prenda en ESE depósito después del movimiento, con el mismo orden que el historial
 *    de la ficha (`stockDeVariante`: por hora y, a igual hora, por id) ⇒ la lista y la ficha dicen el mismo número.
 * 🔴 El libro ⛔ guarda QUIÉN: se lee de donde está (la venta del ERP, el ajuste); si ⛔ está, se dice de qué sistema vino
 *    (⛔ se inventa una persona). Pedido a A en `PENDIENTES.md` (Diseño 7).
 */
import { NOMBRE_DEPOSITO, NOMBRE_ORIGEN, NOMBRE_TIPO } from './stock.core.js'
import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const NOMBRE_LINEA = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
const MOTIVO = { fallado: 'Con falla', canje: 'Canje', regalo: 'Regalo', otro: 'Otro', conteo: 'Conteo' }

/**
 * El documento que explica el movimiento, en palabras (⛔ la clave técnica del libro).
 * @param {any} m la fila cruda (con `venta_numero`/`ajuste_numero` si el servidor los cruzó)
 */
export function documentoDe(m) {
  const d = m.detalle || {}
  if (m.tipo === 'apertura') return 'Stock inicial (foto de Gestión Nube)'
  if (m.origen === 'caja') return m.venta_numero != null ? `Venta #${m.venta_numero}` : 'Venta de la Caja'
  if (m.origen === 'ajuste') {
    const n = m.ajuste_numero ?? d.ajuste
    return [n != null ? `Ajuste A-${n}` : 'Ajuste', MOTIVO[d.motivo]].filter(Boolean).join(' · ')
  }
  if (m.origen === 'gn') {
    const gn = String(m.origen_ref ?? '').split(':')[0]
    return [gn && `Gestión Nube ${gn}`, d.tn_order && `Tienda Nube ${d.tn_order}`].filter(Boolean).join(' · ') || 'Venta de Gestión Nube'
  }
  if (m.origen === 'tn') return d.tn_order ? `Pedido Tienda Nube ${d.tn_order}` : 'Tienda Nube'
  if (m.origen === 'repo') return d.transfer_id ? `Transferencia ${d.transfer_id}` : 'Transferencia (Reposición)'
  return NOMBRE_ORIGEN[m.origen] ?? m.origen
}

/** Quién lo hizo, si se sabe; si ⛔, de qué sistema vino (`de: 'sistema'`, la pantalla lo pinta gris). */
export function quienDe(m) {
  const persona = m.venta_usuario || m.ajuste_usuario || m.detalle?.usuario || null
  return persona ? { nombre: String(persona), de: 'persona' } : { nombre: NOMBRE_ORIGEN[m.origen] ?? m.origen, de: 'sistema' }
}

/**
 * Una fila de la lista a partir de lo que leyó el servidor (la del libro + `queda` + los cruces) y el espejo de GN.
 * @param {any} m @param {Map<string, any>} nombres `product_id/size_id` → { nombre, talleNombre, sku, barcode }
 */
export function armarMovimiento(m, nombres) {
  const producto = String(m.product_id), talle = String(m.size_id)
  const n = nombres.get(`${producto}/${talle}`) || {}
  const quien = quienDe(m)
  const documento = documentoDe(m)
  const fila = {
    id: String(m.id), producto, talle, linea: m.linea,
    nombre: n.nombre ?? `Producto ${producto}`, talleNombre: n.talleNombre ?? talle, sku: m.sku ?? n.sku ?? null, barcode: m.barcode ?? n.barcode ?? null,
    cuando: new Date(m.ocurrido_en).toISOString(), horaExacta: m.hora_exacta !== false,
    tipo: m.tipo, tipoTexto: NOMBRE_TIPO[m.tipo] ?? m.tipo, origen: m.origen,
    deposito: m.deposito, depositoTexto: NOMBRE_DEPOSITO[m.deposito] ?? m.deposito,
    cantidad: Number(m.cantidad), queda: Number(m.queda), documento, quien: quien.nombre, quienDe: quien.de,
  }
  return { ...fila, busca: normal([fila.nombre, fila.talleNombre, fila.sku, documento, quien.nombre].join(' ')) }
}

/**
 * Las vistas, con su número arriba (diseño §3). Una venta anulada vuelve con la venta: es su contracara.
 * @type {Array<[string, string, (f: any) => boolean]>}
 */
export const VISTAS = [
  ['todos', 'Todos', () => true],
  ['ventas', 'Ventas', (f) => f.tipo === 'venta' || f.tipo === 'anulacion'],
  ['transferencias', 'Transferencias', (f) => f.tipo === 'transferencia'],
  ['ajustes', 'Ajustes', (f) => f.tipo === 'ajuste' || f.tipo === 'ajuste_conteo'],
  ['ingresos', 'Ingresos', (f) => f.tipo === 'ingreso'],
  // Lo que arranca o corrige el libro (apertura, reapertura, corrección): pocos, y se ven aparte.
  ['libro', 'Del ERP', (f) => f.tipo === 'apertura' || f.tipo === 'reapertura' || f.tipo === 'correccion'],
]

/** @param {any[]} filas */
export function contarVistas(filas) {
  return Object.fromEntries(VISTAS.map(([k, , entra]) => [k, filas.filter(entra).length]))
}

/**
 * La vista, el buscador (prenda, talle, SKU, documento, quién; un código de barras entero, exacto), la línea y el depósito.
 * @param {any[]} filas @param {{ vista?: string, q?: string, linea?: string, deposito?: string }} o
 */
export function filtrar(filas, { vista = 'todos', q = '', linea = '', deposito = '' } = {}) {
  const entra = VISTAS.find(([k]) => k === vista)?.[2] ?? (() => true)
  const t = normal(q).trim().replace(/^#/, '')
  return filas.filter((f) => entra(f) && (!linea || f.linea === linea) && (!deposito || f.deposito === deposito)
    && (!t || f.barcode === q.trim() || f.busca.includes(t)))
}

/**
 * El resumen ARRIBA: cuántos movimientos, lo que entró y salió (sin las transferencias: mueven entre depósitos, ⛔ entran
 * ni salen), cuánto se vendió y cuánto se transfirió (la pata que entra, una vez por prenda).
 * @param {any[]} filas
 */
export function resumen(filas) {
  let entraron = 0, salieron = 0, vendidas = 0, transferidas = 0, ajustes = 0
  for (const f of filas) {
    if (f.tipo === 'transferencia') { if (f.cantidad > 0) transferidas += f.cantidad; continue }
    if (f.tipo === 'apertura' || f.tipo === 'reapertura') continue
    if (f.cantidad > 0) entraron += f.cantidad
    else salieron -= f.cantidad
    if (f.tipo === 'venta') vendidas -= f.cantidad
    if (f.tipo === 'anulacion') vendidas -= f.cantidad
    if (f.tipo === 'ajuste' || f.tipo === 'ajuste_conteo') ajustes += f.cantidad
  }
  return { movimientos: filas.length, entraron, salieron, vendidas, transferidas, ajustes }
}

/**
 * Por columna (↓ ↑); sin orden elegido, el más nuevo arriba (a igual hora, el que se escribió después).
 * @param {any[]} filas @param {{ col: string, dir: 'asc' | 'desc' } | null} orden
 * @returns {any[]}
 */
export function ordenar(filas, orden) {
  const k = orden?.col
  const dir = orden?.dir === 'asc' ? 1 : -1
  const val = (f) => (k === 'cant' ? f.cantidad : k === 'queda' ? f.queda : k === 'p' ? normal(`${f.nombre} ${f.talleNombre}`) : Date.parse(f.cuando))
  const nuevo = (a, b) => Date.parse(b.cuando) - Date.parse(a.cuando) || Number(b.id) - Number(a.id)
  return filas.slice().sort((a, b) => {
    if (!k) return nuevo(a, b)
    const x = val(a), y = val(b)
    return (x > y ? 1 : x < y ? -1 : 0) * dir || nuevo(a, b)
  })
}

/**
 * Las columnas: clave → [título, ancho, ordena, fija]. 🔴 Cada ancho con su MÍNIMO en px (`ListaTrabajo`): las de siempre
 * suman ~1.010 px con el tilde y el «⋯»: entran a 1333 px al lado del menú del ERP (con Tipo en 150 y Prenda en 190, «Quién»
 * quedaba cortada: visto en prod 19-oct).
 * @type {Record<string, [string, string, boolean, boolean]>}
 */
export const COLUMNAS = {
  h: ['Cuándo', '96px', true, true],
  tipo: ['Tipo', '128px', false, true],
  p: ['Producto', 'minmax(170px, 2fr)', true, true],
  sku: ['código', '118px', false, false],
  dep: ['Dónde', '120px', false, false],
  cant: ['Cantidad', '84px', true, true],
  queda: ['Queda', '72px', true, false],
  doc: ['Documento', 'minmax(150px, 1.3fr)', false, false],
  quien: ['Quién', '112px', false, false],
  linea: ['Línea', '76px', false, false],
}
export const COLUMNAS_DE_SIEMPRE = { orden: ['h', 'tipo', 'p', 'sku', 'dep', 'cant', 'queda', 'doc', 'quien', 'linea'], visibles: ['h', 'tipo', 'p', 'dep', 'cant', 'queda', 'doc', 'quien'] }
export const normalizarPrefs = (raw) => normalizarPrefsDe(COLUMNAS, COLUMNAS_DE_SIEMPRE, raw)
export const alternarColumna = (prefs, col) => alternarColumnaDe(COLUMNAS, prefs, col)
export { moverColumna }

/** El período, en días argentinos (YYYY-MM-DD, inclusive): 'hoy', 'ayer', '7d', 'mes'. */
export function rangoDeMovimientos(periodo, hoy) {
  const atras = (n) => new Date(Date.parse(`${hoy}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)
  if (periodo === 'ayer') return { desde: atras(1), hasta: atras(1) }
  if (periodo === '7d') return { desde: atras(6), hasta: hoy }
  if (periodo === 'mes') return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }
  return { desde: hoy, hasta: hoy }
}
/** @type {Array<[string, string]>} */
export const PERIODOS_MOV = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7d', 'Últimos 7 días'], ['mes', 'Este mes']]

export { NOMBRE_LINEA }
