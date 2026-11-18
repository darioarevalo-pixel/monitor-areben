/**
 * ERP · BUSCAR UNA PRENDA por nombre, talle, SKU o código (Nueva venta, Ajustes, Mover, Reglas y la búsqueda global). Puro: la
 * lectura del espejo `inventario` vive en `stockDePrenda` (`api/_erp.js`).
 *
 * 🔴 16-nov (Bruno): «TEMPLADO 9D PREMIUM» (679953, BDI) ⛔ salía. Medido en prod 18-nov (`erp-monitor/mediciones/m86c`):
 *   · «templado premium» ⇒ 0: se buscaba la FRASE pegada (`ilike '%templado premium%'`), ⛔ cada palabra.
 *   · «templado» ⇒ el producto salía con 3 de sus 27 talles: el tope era de 60 TALLES ordenados por nombre, y un templado trae un
 *     talle por modelo de teléfono ⇒ el corte caía en el medio del producto y el modelo buscado quedaba afuera, callado.
 * ⇒ Cada palabra tiene que estar, en cualquier orden (la regla de la Caja: comienzo de una palabra del nombre o el talle;
 *   `lib/caja/buscar.core.js`), y el tope cuenta PRODUCTOS, cada uno con TODOS sus talles.
 */
import { coincide, normTexto, ordenParaLaBase, palabrasDeBusqueda } from '../caja/buscar.core.js'
import { depositoDe } from './stock.core.js'

/** Cuántos productos vuelven como mucho. Nueva venta dibuja 20. */
export const TOPE_PRODUCTOS = 20

/** Cuántas filas del espejo (variante × depósito) se leen como mucho: «templado» en BDI son 229 (18-nov). */
export const TOPE_FILAS = 3000

/**
 * Qué se le pregunta a la base. `like`: el texto entero (SKU); `palabra`: la más larga, que es la que más filtra (nombre o talle);
 * `codigo`: para el código de barras exacto. `null` si ⛔ alcanza (menos de 3 letras o números).
 * @param {unknown} q
 */
export function pedidoDeBusqueda(q) {
  const t = String(q ?? '').trim()
  if (t.length < 3) return null
  const limpio = (s) => s.replace(/[%_,()]/g, ' ')
  const palabras = palabrasDeBusqueda(t)
  return {
    texto: t,
    like: `%${limpio(t)}%`,
    palabra: palabras.length ? `%${ordenParaLaBase(palabras)[0]}%` : null,
    codigo: t.replace(/[,()]/g, ''),
    palabras,
  }
}

/** ¿La fila del espejo es lo buscado? El SKU o el código tal cual, o TODAS las palabras (nombre o talle). */
export function esLaBuscada(fila, pedido) {
  const t = pedido.texto.toLowerCase()
  if (fila.sku && String(fila.sku).toLowerCase().includes(t)) return true
  if (fila.barcode && String(fila.barcode) === pedido.codigo) return true
  if (!pedido.palabras.length) return false
  return coincide({ product_name: fila.product_name, size_name: fila.size_name }, pedido.palabras)
}

/**
 * De las filas del espejo a la respuesta: una entrada por variante (stock sumado y por depósito), agrupadas por PRODUCTO, los
 * productos por nombre, como mucho `tope` productos con TODOS sus talles. `cortado` = quedaron productos afuera.
 * @param {Array<any>} filas @param {ReturnType<typeof pedidoDeBusqueda>} pedido @param {string} marca
 */
export function prendasEncontradas(filas, pedido, marca, tope = TOPE_PRODUCTOS) {
  if (!pedido) return { variantes: [], cortado: false }
  const porVariante = new Map()
  for (const r of filas || []) {
    if (!r || !esLaBuscada(r, pedido)) continue
    const k = `${r.product_id}/${r.size_id}`
    const v = porVariante.get(k) || { producto: String(r.product_id), talle: String(r.size_id), nombre: r.product_name, talleNombre: r.size_name, sku: r.sku, barcode: r.barcode, gn: 0, porDeposito: {} }
    v.gn += Number(r.available_quantity || 0)
    // Por depósito (Nueva venta muestra el stock del lugar de donde sale): el del espejo, por `depositoDe`.
    const d = depositoDe(marca, r.store_name)
    if (d) v.porDeposito[d] = (v.porDeposito[d] || 0) + Number(r.available_quantity || 0)
    porVariante.set(k, v)
  }
  const porProducto = new Map()
  for (const v of porVariante.values()) porProducto.set(v.producto, [...(porProducto.get(v.producto) || []), v])
  const nombre = (vs) => normTexto(vs[0].nombre)
  const talle = (a, b) => String(a.talleNombre ?? '').localeCompare(String(b.talleNombre ?? ''), 'es', { numeric: true })
  const productos = [...porProducto.values()].sort((a, b) => nombre(a).localeCompare(nombre(b), 'es'))
  return { variantes: productos.slice(0, tope).flatMap((vs) => vs.sort(talle)), cortado: productos.length > tope }
}
