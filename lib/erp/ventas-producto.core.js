/**
 * ERP › Ventas › Por producto (diseño §7, tablero 1b del v8; ⛔ «por prenda»: también BDI): qué se vendió de cada producto.
 * Dos vistas: **Agrupado por producto** (por defecto: unidades, ventas, vendido y, para quien ve costos, el margen) y
 * **Cada renglón** (un renglón por producto de cada venta, como Gestión Nube). Núcleo puro: lo usan `api/_erp-por-producto.js`
 * (arma los renglones) y `components/erp/ventas/PorProductoErp.tsx` (agrupa, filtra, ordena).
 *
 * 🔑 Sale del espejo de GN (`ventas` + `venta_detalles`), como Inicio: GN es el que vende hoy y el motor tiene sólo una
 *    parte (medido 20-oct: Zattia, el local, 181 ventas en el motor contra 604 en GN). Un renglón con cantidad negativa es
 *    una devolución de GN: resta.
 * 🔑 El margen usa el costo VIGENTE del motor (`costo_vigente`), ⛔ el de cuando se vendió; sin costo ⇒ «sin costo» (⛔ un 0).
 */
import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'
import { normal } from './ventas-lista.core.js'

export { moverColumna }

const pesos = (x) => Math.round(Number(x || 0) * 100) / 100

/** «20/10»: GN guarda el DÍA de la venta, sin hora (⛔ «00:00»). */
export const diaCorto = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' }) : '—')

/** El canal de GN como lo dice la pantalla («Mi Local» ⇒ «Local»). */
export const CANAL = { 'Mi Local': 'Local', 'Tienda Nube': 'Tienda Nube', Mayorista: 'Mayorista', Mercadolibre: 'Mercado Libre', 'Otro Canal': 'Otro', Ninguno: 'Sin canal' }

/**
 * Un renglón del espejo (la consulta de `api/_erp-por-producto.js`) como lo lee la pantalla.
 * @param {any} r @param {{ linea: (sku: string | null) => string, costos?: Map<string, number> | null }} o
 */
export function armarRenglon(r, { linea, costos = null }) {
  const cantidad = Number(r.quantity || 0)
  const costo = costos ? costos.get(String(r.product_id)) ?? null : null
  return {
    id: String(r.id), ventaId: String(r.sale_id), numero: r.number == null ? null : String(r.number), cuando: new Date(r.date_sale).toISOString(),
    canal: CANAL[r.channel] ?? (r.channel || 'Sin canal'), cliente: r.client_name || null,
    producto: String(r.product_id), nombre: r.product_name || `Producto ${r.product_id}`, talle: r.size || '—', sku: r.sku ?? null,
    cantidad, precio: pesos(r.unit_price), total: pesos(r.total), linea: linea(r.sku ?? null),
    costo: costo == null ? null : pesos(costo * cantidad),
  }
}

/**
 * Los renglones agrupados por producto: unidades netas, ventas distintas, vendido, precio promedio, margen (sólo si TODOS
 * sus renglones tienen costo; si no, `margen: null` y se dice) y la última vez que se vendió.
 * @param {ReturnType<typeof armarRenglon>[]} renglones
 */
export function agrupar(renglones) {
  /** @type {Map<string, any>} */
  const m = new Map()
  for (const r of renglones) {
    let g = m.get(r.producto)
    if (!g) {
      g = { id: r.producto, producto: r.producto, nombre: r.nombre, linea: r.linea, unidades: 0, vendido: 0, costo: 0, sinCosto: 0, ventas: new Set(), talles: new Map(), canales: new Set(), ultimo: r.cuando }
      m.set(r.producto, g)
    }
    g.unidades += r.cantidad
    g.vendido += r.total
    if (r.costo == null) g.sinCosto++
    else g.costo += r.costo
    g.ventas.add(r.ventaId)
    g.talles.set(r.talle, (g.talles.get(r.talle) || 0) + r.cantidad)
    g.canales.add(r.canal)
    if (r.cuando > g.ultimo) g.ultimo = r.cuando
  }
  return [...m.values()].map((g) => ({
    id: g.id, producto: g.producto, nombre: g.nombre, linea: g.linea, unidades: g.unidades, ventas: g.ventas.size, vendido: pesos(g.vendido),
    promedio: g.unidades > 0 ? pesos(g.vendido / g.unidades) : null,
    costo: g.sinCosto ? null : pesos(g.costo), margen: g.sinCosto ? null : pesos(g.vendido - g.costo),
    talles: [...g.talles].filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(' · '),
    canales: [...g.canales].join(' · '), ultimo: g.ultimo,
    busca: normal(g.nombre),
  }))
}

/** Las dos vistas (el número de cada una: productos y renglones de lo buscado). @type {Array<[string, string, () => boolean]>} */
export const VISTAS = [
  ['agrupado', 'Agrupado por producto', () => true],
  ['renglones', 'Cada renglón', () => true],
]

/**
 * Lo buscado (nombre, SKU, número de venta, cliente), de la línea y el canal elegidos.
 * @param {ReturnType<typeof armarRenglon>[]} renglones @param {{ q?: string, linea?: string, canal?: string }} f
 */
export function filtrar(renglones, { q = '', linea = '', canal = '' } = {}) {
  const t = normal(q.trim())
  return renglones.filter((r) => (!linea || r.linea === linea) && (!canal || r.canal === canal)
    && (!t || normal(`${r.nombre} ${r.sku ?? ''} ${r.numero ?? ''} ${r.cliente ?? ''}`).includes(t)))
}

/** Lo de arriba: unidades, vendido, productos distintos, margen (o cuántos productos sin costo). */
export function resumen(renglones) {
  const g = agrupar(renglones)
  const conCosto = g.filter((x) => x.margen != null)
  return {
    unidades: renglones.reduce((a, r) => a + r.cantidad, 0), vendido: pesos(renglones.reduce((a, r) => a + r.total, 0)), productos: g.length,
    ventas: new Set(renglones.map((r) => r.ventaId)).size,
    margen: pesos(conCosto.reduce((a, x) => a + x.margen, 0)), vendidoConCosto: pesos(conCosto.reduce((a, x) => a + x.vendido, 0)), sinCosto: g.length - conCosto.length,
  }
}

/** Ordena por la columna elegida; sin orden, agrupado = más vendido primero, renglones = más nuevo primero. */
export function ordenar(filas, orden, vista) {
  const k = orden?.col
  if (!k) return filas.slice().sort(vista === 'agrupado' ? (a, b) => b.vendido - a.vendido || b.unidades - a.unidades : (a, b) => (b.cuando > a.cuando ? 1 : b.cuando < a.cuando ? -1 : 0))
  const dir = orden.dir === 'asc' ? 1 : -1
  const val = (f) => (k === 'p' ? normal(f.nombre) : k === 'f' || k === 'ult' ? f[k === 'f' ? 'cuando' : 'ultimo'] : f[{ u: 'unidades', c: 'cantidad', v: 'vendido', tot: 'total', m: 'margen', pr: 'precio', prom: 'promedio', n: 'ventas' }[k] ?? k] ?? -Infinity)
  return filas.slice().sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir })
}

/**
 * Las columnas de cada vista: clave → [título, ancho, ordena, fija]. El margen y el costo sólo con `costos` (Admin).
 * @param {'agrupado' | 'renglones'} vista @param {boolean} costos
 * @returns {Record<string, [string, string, boolean, boolean]>}
 */
export function columnasDe(vista, costos) {
  if (vista === 'agrupado') {
    return {
      p: ['Producto', 'minmax(220px, 2fr)', true, true], u: ['Unidades', '88px', true, false], n: ['Ventas', '72px', true, false],
      v: ['Vendido', '112px', true, false], prom: ['Precio promedio', '120px', true, false],
      ...(costos ? { m: ['Margen', '112px', true, false] } : {}),
      talles: ['Talles', 'minmax(140px, 1fr)', false, false], canales: ['Canales', 'minmax(130px, 1fr)', false, false],
      ult: ['Última venta', '108px', true, false], linea: ['Línea', '80px', false, false],
    }
  }
  return {
    f: ['Fecha', '96px', true, false], venta: ['Venta', '88px', false, false], p: ['Producto', 'minmax(220px, 2fr)', true, true],
    t: ['Talle', '64px', false, false], c: ['Cant.', '64px', true, false], pr: ['Precio', '100px', true, false], tot: ['Quedó en', '104px', true, false],
    ...(costos ? { m: ['Margen', '104px', true, false] } : {}),
    canal: ['Origen', '120px', false, false], cli: ['Cliente', 'minmax(140px, 1fr)', false, false], linea: ['Línea', '80px', false, false], sku: ['SKU', '110px', false, false],
  }
}

export function columnasDeSiempre(vista, costos) {
  const todas = Object.keys(columnasDe(vista, costos))
  const visibles = vista === 'agrupado' ? ['p', 'u', 'n', 'v', 'prom', 'm', 'talles', 'ult'] : ['f', 'venta', 'p', 't', 'c', 'pr', 'tot', 'm', 'canal']
  return { orden: todas, visibles: visibles.filter((k) => todas.includes(k)) }
}

export const normalizarPrefs = (vista, costos, raw) => normalizarPrefsDe(columnasDe(vista, costos), columnasDeSiempre(vista, costos), raw)
export const alternarColumna = (vista, costos, prefs, col) => alternarColumnaDe(columnasDe(vista, costos), prefs, col)
