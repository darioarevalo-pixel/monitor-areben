/**
 * ERP › Ventas › Por producto (diseño §7, tablero 1b del v8; ⛔ «por prenda»: también BDI): qué se vendió de cada producto.
 * Dos vistas: **Agrupado por producto** (por defecto: unidades, ventas, vendido y, para quien ve costos, el margen) y
 * **Cada renglón** (un renglón por producto de cada venta). Núcleo puro: lo usan `api/_erp-por-producto.js` (arma los
 * renglones) y `components/erp/ventas/PorProductoErp.tsx` (agrupa, filtra, ordena).
 *
 * 🔑 27-nov (Bruno: «pq las ventas totales por producto y las ventas por venta no dan lo mismo»): sale de las ventas del ERP
 *    (`venta_ficha`, las MISMAS que lee «Por venta»), ⛔ del espejo de GN: el espejo se llenaba desde el ERP una vez por noche
 *    (lo de hoy ⛔ estaba) y el renglón guardaba el precio de lista. El ERP tiene la historia de GN (origen `gn`, medido 27-nov:
 *    mes a mes igual a GN ±0,5%).
 * 🔑 Lo vendido de cada renglón = su importe × (total − envío) / Σ importes de la venta: el descuento del pago (efectivo,
 *    transferencia), el cupón y el ajuste del mayorista se reparten entre los productos y el ENVÍO queda aparte ⇒
 *    Σ por producto + envíos = Σ por venta, al peso (medido 27-nov: Zattia nov y BDI 93 días, diferencia $0).
 *    Un renglón con cantidad negativa es una devolución (cambio): resta.
 * 🔑 El margen usa el costo VIGENTE del motor (`costo_vigente`), ⛔ el de cuando se vendió; sin costo ⇒ «sin costo» (⛔ un 0).
 */
import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'
import { normal } from './ventas-lista.core.js'

export { moverColumna }

const pesos = (x) => Math.round(Number(x || 0) * 100) / 100

/** «20/10». */
export const diaCorto = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' }) : '—')

/** El canal de GN como lo dice la pantalla («Mi Local» ⇒ «Local»): las ventas de origen `gn` lo traen en `detalle.canal_gn`. */
export const CANAL = { 'Mi Local': 'Local', 'Tienda Nube': 'Tienda Nube', Mayorista: 'Mayorista', Mercadolibre: 'Mercado Libre', 'Otro Canal': 'Otro', Ninguno: 'Sin canal' }
/** El origen de una venta del ERP como lo dice la pantalla. */
export const ORIGEN_PRODUCTO = { caja: 'Local', tn: 'Tienda Nube', ml: 'Mercado Libre', mayorista: 'Mayorista', manual: 'Manual', postventa: 'Postventa' }

/** El envío de una venta: el de TN (`detalle.tn.envio`) o el de GN y el mayorista (`detalle.envio`). */
export const envioDe = (detalle) => pesos(detalle?.tn?.envio ?? detalle?.envio ?? 0)

/**
 * Los renglones de UNA venta del ERP (una fila de `venta_ficha`, con `lineas`), como los lee la pantalla.
 * @param {{ id: string, numero: number|string, tipo: string, origen: string, total: number|string, ocurrida_en: string|Date, detalle?: any, cliente?: string|null, lineas: any[] }} v
 * @param {{ linea: (sku: string | null) => string, costos?: Map<string, number> | null, nombres?: Map<string, string>, talles?: Map<string, string> }} o
 */
export function renglonesDeVenta(v, { linea, costos = null, nombres = new Map(), talles = new Map() }) {
  const lineas = Array.isArray(v.lineas) ? v.lineas : []
  const envio = envioDe(v.detalle)
  const suma = lineas.reduce((a, l) => a + Number(l.importe || 0), 0)
  // Un cambio parejo (devuelve y lleva lo mismo) suma ~0: ahí ⛔ hay qué repartir.
  const factor = Math.abs(suma) >= 1 ? (Number(v.total) - envio) / suma : 1
  const canal = v.tipo === 'cambio' ? 'Cambio' : v.origen === 'gn' ? (CANAL[v.detalle?.canal_gn] ?? (v.detalle?.canal_gn || 'Sin canal')) : (ORIGEN_PRODUCTO[v.origen] ?? v.origen)
  const cuando = new Date(v.ocurrida_en).toISOString()
  return lineas.map((l) => {
    const cantidad = Number(l.cantidad || 0)
    const producto = String(l.product_id)
    const costo = costos ? costos.get(producto) ?? null : null
    const sku = l.sku || null
    return {
      id: String(l.id), ventaId: String(v.id), numero: v.numero == null ? null : String(v.numero), tn: v.detalle?.tn?.numero != null ? String(v.detalle.tn.numero) : null,
      cuando, canal, cliente: v.cliente || null,
      producto, nombre: nombres.get(producto) || `Producto ${producto}`, talle: talles.get(`${producto}:${l.size_id}`) || '—', sku,
      cantidad, precio: pesos(l.precio), total: pesos(Number(l.importe || 0) * factor), linea: linea(sku), envio,
      costo: costo == null ? null : pesos(costo * cantidad),
    }
  })
}

/**
 * Los renglones agrupados por producto: unidades netas, ventas distintas, vendido, precio promedio, margen (sólo si TODOS
 * sus renglones tienen costo; si no, `margen: null` y se dice) y la última vez que se vendió.
 * @param {ReturnType<typeof renglonesDeVenta>} renglones
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
  ['agrupado', 'Resumen', () => true],
  ['renglones', 'Detalle', () => true],
]

/**
 * Lo buscado (nombre, SKU, número de venta o de pedido de TN, cliente), de la línea y el canal elegidos.
 * @param {ReturnType<typeof renglonesDeVenta>} renglones @param {{ q?: string, linea?: string, canal?: string }} f
 */
export function filtrar(renglones, { q = '', linea = '', canal = '' } = {}) {
  const t = normal(q.trim())
  return renglones.filter((r) => (!linea || r.linea === linea) && (!canal || r.canal === canal)
    && (!t || normal(`${r.nombre} ${r.sku ?? ''} ${r.numero ?? ''} ${r.tn ?? ''} ${r.cliente ?? ''}`).includes(t)))
}

/** Lo de arriba: unidades, vendido, productos distintos, margen (o cuántos productos sin costo) y los envíos de esas ventas (aparte: ⛔ son de un producto). */
export function resumen(renglones) {
  const g = agrupar(renglones)
  const conCosto = g.filter((x) => x.margen != null)
  return {
    unidades: renglones.reduce((a, r) => a + r.cantidad, 0), vendido: pesos(renglones.reduce((a, r) => a + r.total, 0)), productos: g.length,
    ventas: new Set(renglones.map((r) => r.ventaId)).size,
    envios: pesos([...new Map(renglones.map((r) => [r.ventaId, r.envio || 0])).values()].reduce((a, x) => a + x, 0)),
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
      v: ['Vendido', '176px', true, false], prom: ['Precio promedio', '120px', true, false],
      ...(costos ? { m: ['Margen', '150px', true, false] } : {}),
      // Darío 19-nov: «Variantes» se fue de la lista (ilegible): está en la ventana del producto, y en el Exportar.
      canales: ['Canales', 'minmax(130px, 1fr)', false, false],
      ult: ['Última venta', '108px', true, false], linea: ['Línea', '80px', false, false],
    }
  }
  return {
    f: ['Fecha', '96px', true, false], venta: ['Venta', '88px', false, false], p: ['Producto', 'minmax(220px, 2fr)', true, true],
    t: ['Variante', '64px', false, false], c: ['Cant.', '64px', true, false], pr: ['Precio', '100px', true, false], tot: ['Quedó en', '104px', true, false],
    ...(costos ? { m: ['Margen', '104px', true, false] } : {}),
    canal: ['Origen', '120px', false, false], cli: ['Cliente', 'minmax(140px, 1fr)', false, false], linea: ['Línea', '80px', false, false], sku: ['SKU', '110px', false, false],
  }
}

export function columnasDeSiempre(vista, costos) {
  const todas = Object.keys(columnasDe(vista, costos))
  const visibles = vista === 'agrupado' ? ['p', 'u', 'n', 'v', 'prom', 'm', 'ult'] : ['f', 'venta', 'p', 't', 'c', 'pr', 'tot', 'm', 'canal']
  return { orden: todas, visibles: visibles.filter((k) => todas.includes(k)) }
}

export const normalizarPrefs = (vista, costos, raw) => normalizarPrefsDe(columnasDe(vista, costos), columnasDeSiempre(vista, costos), raw)
export const alternarColumna = (vista, costos, prefs, col) => alternarColumnaDe(columnasDe(vista, costos), prefs, col)

/**
 * Los renglones de UN producto, por variante (Darío 19-nov: la columna «Variantes» era ilegible; el dato vive en la ventana).
 * La clave es el SKU (la variante del stock se cruza por ahí); sin SKU, el nombre del talle. Más vendida primero.
 * @param {ReturnType<typeof renglonesDeVenta>} renglones
 */
export function porVariante(renglones) {
  /** @type {Map<string, { clave: string, talle: string, sku: string | null, unidades: number, vendido: number }>} */
  const m = new Map()
  for (const r of renglones) {
    const clave = r.sku || r.talle
    const v = m.get(clave) ?? { clave, talle: r.talle, sku: r.sku, unidades: 0, vendido: 0 }
    v.unidades += r.cantidad
    v.vendido += r.total
    m.set(clave, v)
  }
  return [...m.values()].map((v) => ({ ...v, vendido: pesos(v.vendido) })).filter((v) => v.unidades || v.vendido)
    .sort((a, b) => b.unidades - a.unidades || b.vendido - a.vendido)
}

/** El % del margen sobre lo vendido; `null` sin costo o sin venta. */
export const margenPct = (margen, vendido) => (margen == null || !(vendido > 0) ? null : Math.round((margen / vendido) * 100))
