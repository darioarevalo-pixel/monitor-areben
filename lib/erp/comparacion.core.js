/**
 * ERP › Stock › Comparación con TN y ML (tablero 3 del v8, `~/Documents/erp-monitor/diseno.md` §7): por variante, lo que
 * la tienda TENDRÍA que mostrar según el ERP contra lo que muestra Tienda Nube, con GN al lado. Sólo lee. Puro: el handler
 * (`api/_erp-stock.js`, `vista=comparacion`) lee el libro, el espejo de GN, los pedidos sin pagar y `tn_variante` del motor.
 *
 * 🔑 La cuenta es la de la conciliación del motor (`conciliarStockTN`, areben-libro-stock `lib/conciliacion.mjs`), en vivo
 *    en vez de una vez por día y con TODAS las variantes (la conciliación guarda sólo las que ⛔ cierran):
 *    para la tienda = el libro de los depósitos que publican en ESA tienda − lo apartado por pedidos sin pagar (⛔ < 0);
 *    GN = el espejo de los mismos depósitos. Las clases y sus palabras son las de `CLASE.stock_tn` (Conciliación).
 * 🔴 `DEPOSITOS_TN` es COPIA de `lib/tn/stock.mjs` del motor (⛔ está en `motor/`): cuando A traiga `lib/tn`, se importa.
 * ⚠️ Mercado Libre ⛔ se compara: el motor lee las publicaciones al conciliar pero ⛔ las guarda (sólo las que ⛔ cierran,
 *    en Conciliación) y `ml_publicaciones` de BDI quedó del 24-sep ⇒ la pantalla lo dice (PENDIENTES para A).
 */

import { CLASE } from './conciliacion.core.js'
import { depositoDe } from './stock.core.js'
import { normal } from './stock-lista.core.js'
import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'

/** Los depósitos que publica cada tienda (copia de `DEPOSITOS_TN` del motor, `lib/tn/stock.mjs`). */
export const DEPOSITOS_TN = { bdi: ['deposito_minorista'], zattia: ['local'], stunned: ['deposito', 'local'] }

/** «Qué pasa»: las clases de la conciliación + las dos que sólo ve una lista completa. */
export const QUE_PASA = {
  ...CLASE.stock_tn,
  coincide: { nombre: 'Coincide', mirar: 'La tienda muestra lo que dice el ERP.' },
  no_publicada: { nombre: 'Con stock y sin publicar', mirar: 'El ERP tiene para vender y la variante no está en Tienda Nube (puede ser a propósito).' },
}

const may = (s) => String(s ?? '').trim().toUpperCase()

/**
 * @param {{ marca: 'bdi'|'zattia', filas: import('./stock-lista.core.js').FilaStock[], inventario: any[],
 *   tn: Array<{ tienda: string, variant_id: number|string, sku: string|null, barcode: string|null, stock: number|null,
 *     valores?: string[]|null, nombre?: string|null, publicado?: boolean|null }> }} x
 */
export function armarComparacion({ marca, filas, inventario, tn }) {
  const porSku = new Map()
  const porBarra = new Map()
  for (const f of filas) {
    if (f.sku && !porSku.has(may(f.sku))) porSku.set(may(f.sku), f)
    if (f.barcode && !porBarra.has(may(f.barcode))) porBarra.set(may(f.barcode), f)
  }
  // GN por depósito (el espejo trae una fila por talle y sucursal).
  const gnDep = new Map()
  for (const r of inventario) {
    const d = depositoDe(marca, r.store_name)
    if (!d) continue
    const k = `${r.product_id}/${r.size_id}/${d}`
    gnDep.set(k, (gnDep.get(k) || 0) + Number(r.available_quantity || 0))
  }
  const suma = (deps, f, de) => deps.reduce((a, d) => a + Number(de(d) || 0), 0)

  const salida = []
  const vistas = new Map()
  let sinLimite = 0
  for (const v of tn) {
    if (v.stock == null) { sinLimite++; continue }
    const deps = DEPOSITOS_TN[v.tienda]
    if (!deps) continue
    const f = (v.sku && porSku.get(may(v.sku))) || (v.barcode && porBarra.get(may(v.barcode))) || null
    const enTn = Number(v.stock)
    if (!f) {
      salida.push({
        id: `tn:${v.variant_id}`, tienda: v.tienda, producto: null, talle: null, nombre: v.nombre ?? 'Sin nombre en Tienda Nube',
        talleNombre: (v.valores || []).join(' / ') || '—', sku: v.sku ?? null, barcode: v.barcode ?? null,
        paraTienda: null, enPedidos: 0, tn: enTn, gn: null, diferencia: null, clase: 'sin_variante', oculta: v.publicado === false, repetidas: 0,
      })
      continue
    }
    const ya = vistas.get(f.id)
    // La misma variante del ERP en dos de TN (SKU repetido): decide la primera, como en la conciliación.
    if (ya) { ya.repetidas++; continue }
    const libro = suma(deps, f, (d) => f.deps[d])
    const paraTienda = Math.max(0, libro - (f.enPedidos || 0))
    const gn = suma(deps, f, (d) => gnDep.get(`${f.producto}/${f.talle}/${d}`))
    const clase = enTn === paraTienda && enTn === gn ? 'coincide' : paraTienda === gn ? 'tn_atrasado' : enTn === gn ? 'libro_aparte' : paraTienda === enTn ? 'gn_aparte' : 'los_tres'
    const fila = {
      id: f.id, tienda: v.tienda, producto: f.producto, talle: f.talle, nombre: f.nombre, talleNombre: f.talleNombre, sku: f.sku, barcode: f.barcode,
      paraTienda, enPedidos: f.enPedidos || 0, tn: enTn, gn, diferencia: enTn - paraTienda, clase, oculta: v.publicado === false, repetidas: 0,
    }
    vistas.set(f.id, fila)
    salida.push(fila)
  }
  // Las que el ERP tiene para vender en los depósitos de la tienda y la tienda ⛔ tiene.
  for (const f of filas) {
    if (vistas.has(f.id)) continue
    const tienda = marca === 'bdi' ? 'bdi' : f.linea === 'stunned' ? 'stunned' : 'zattia'
    const paraTienda = Math.max(0, suma(DEPOSITOS_TN[tienda], f, (d) => f.deps[d]) - (f.enPedidos || 0))
    if (paraTienda <= 0) continue
    salida.push({
      id: f.id, tienda, producto: f.producto, talle: f.talle, nombre: f.nombre, talleNombre: f.talleNombre, sku: f.sku, barcode: f.barcode,
      paraTienda, enPedidos: f.enPedidos || 0, tn: null, gn: null, diferencia: null, clase: 'no_publicada', oculta: false, repetidas: 0,
    })
  }
  return { filas: salida, sinLimite }
}

/** Las que ⛔ cierran (sin las sin publicar, que pueden ser a propósito). */
const noCoincide = (f) => f.clase !== 'coincide' && f.clase !== 'no_publicada'

/** @type {Array<[string, string, (f: any) => boolean]>} */
export const VISTAS = [
  ['no', 'No coinciden', noCoincide],
  ['mas', 'Muestra de más', (f) => f.diferencia != null && f.diferencia > 0],
  ['menos', 'Muestra de menos', (f) => f.diferencia != null && f.diferencia < 0],
  ['sinerp', 'Sin producto en el ERP', (f) => f.clase === 'sin_variante'],
  ['sinpub', 'Sin publicar', (f) => f.clase === 'no_publicada'],
  ['todas', 'Todas', () => true],
]

export function contarVistas(filas) {
  return Object.fromEntries(VISTAS.map(([k, , ok]) => [k, filas.filter(ok).length]))
}

export function filtrar(filas, { vista = 'todas', q = '', tienda = '' } = {}) {
  const ok = VISTAS.find(([k]) => k === vista)?.[2] ?? (() => true)
  const t = normal(q)
  return filas.filter((f) => ok(f) && (!tienda || f.tienda === tienda)
    && (!t || [f.nombre, f.sku, f.barcode].some((x) => normal(x).includes(t))))
}

/** El resumen de lo que se mira: cuántas ⛔ cierran y cuántas unidades de más / de menos muestra la tienda. */
export function resumen(filas) {
  let deMas = 0, deMenos = 0, uMas = 0, uMenos = 0
  for (const f of filas) {
    if (f.diferencia > 0) { deMas++; uMas += f.diferencia }
    if (f.diferencia < 0) { deMenos++; uMenos -= f.diferencia }
  }
  return { noCoinciden: filas.filter(noCoincide).length, deMas, deMenos, uMas, uMenos, comparadas: filas.filter((f) => f.clase !== 'no_publicada' && f.clase !== 'sin_variante').length }
}

/** Orden: las que más se van de número primero (la sobreventa arriba); después por nombre. */
export function ordenar(filas, orden) {
  const val = {
    p: (f) => normal(f.nombre), t: (f) => normal(f.talleNombre), sku: (f) => normal(f.sku), tienda: (f) => f.tienda,
    para: (f) => f.paraTienda ?? -1, tn: (f) => f.tn ?? -1, gn: (f) => f.gn ?? -1, dif: (f) => f.diferencia ?? 0, que: (f) => QUE_PASA[f.clase]?.nombre ?? '',
  }
  const xs = [...filas]
  if (orden?.col && val[orden.col]) {
    const g = val[orden.col], s = orden.dir === 'desc' ? -1 : 1
    return xs.sort((a, b) => (g(a) < g(b) ? -s : g(a) > g(b) ? s : 0))
  }
  return xs.sort((a, b) => Math.abs(b.diferencia ?? 0) - Math.abs(a.diferencia ?? 0) || (b.diferencia ?? 0) - (a.diferencia ?? 0) || normal(a.nombre).localeCompare(normal(b.nombre)))
}

/** Columnas: [título, ancho, ¿ordena?, ¿fija?]. @type {Record<string, [string, string, boolean?, boolean?]>} */
export const COLUMNAS = {
  p: ['Prenda', 'minmax(220px, 1.8fr)', true, true],
  t: ['Talle', '90px', true],
  sku: ['SKU', '130px', true],
  tienda: ['Tienda', '90px', true],
  para: ['Según el ERP', '110px', true],
  tn: ['Tienda Nube', '104px', true],
  dif: ['Diferencia', '96px', true],
  gn: ['En GN', '80px', true],
  ped: ['En pedidos', '96px'],
  que: ['Qué pasa', 'minmax(200px, 1.2fr)', true],
}
const DE_SIEMPRE = { orden: Object.keys(COLUMNAS), visibles: ['p', 't', 'para', 'tn', 'dif', 'gn', 'que'] }
export const normalizarPrefs = (raw) => normalizarPrefsDe(COLUMNAS, DE_SIEMPRE, raw)
export const alternarColumna = (prefs, col) => alternarColumnaDe(COLUMNAS, prefs, col)
export { moverColumna }
