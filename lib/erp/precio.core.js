/**
 * ERP › Precios (paso 5, sólo lectura por ahora): el precio de un producto en cada LISTA (local, online, mayorista) y su
 * COSTO, como los tiene el motor (`precio_vigente` / `costo_vigente`, sql/009), con de dónde salió cada uno, y al lado
 * lo que dicen GN (el espejo `productos`) y Tienda Nube (`tn_variante`). Puro: el handler lee las filas.
 *
 * 🔑 Bruno, 14-oct: el precio del LOCAL sale de TN **o** de una lista PROPIA (conviven); el COSTO lo trae la importación
 * de TN. Mientras GN vive, el motor COPIA precio y costo de GN (`fuente = 'gn'`); lo que se cargue en el ERP (`carga`/`oc`)
 * ⛔ lo pisa la copia. Por eso la ficha avisa cuando TN y el ERP no dicen lo mismo: es lo que hay que mirar al cortar.
 * Precio y costo son POR PRODUCTO (⛔ variante): medido 14-oct, 0 productos con precios distintos por variante en TN.
 */

/** Las listas en el orden en que se muestran (las que la base tenga de más van al final). */
export const ORDEN_LISTAS = ['local', 'online', 'mayorista']

/** De dónde salió un precio o un costo, para la pantalla. */
export const NOMBRE_FUENTE = { gn: 'Copia de GN', carga: 'Cargado en el ERP', tn: 'Tienda Nube', oc: 'Orden de compra' }

const num = (x) => (x == null || x === '' ? null : Number(x))
const distinto = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) > 1

/** El valor que más se repite (y si hubo más de uno): el producto de TN puede tener una variante con otro precio. */
function elQueMas(valores) {
  const n = new Map()
  for (const v of valores) if (v != null) n.set(v, (n.get(v) || 0) + 1)
  const [valor = null] = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([v]) => v)
  return { valor, distintos: n.size > 1 }
}

/**
 * @param {{ listas: Array<{ id: string, nombre: string }>, vigentes: any[], costo: any | null, historialPrecio?: any[],
 *   historialCosto?: any[], gn?: { retailer_price?: any, wholesaler_price?: any, unit_cost?: any } | null,
 *   tn?: Array<{ tienda: string, precio: any, precio_promocional: any, costo: any }> }} x
 */
export function armarPrecioDeProducto({ listas, vigentes, costo, historialPrecio = [], historialCosto = [], gn = null, tn = [] }) {
  const orden = (id) => { const i = ORDEN_LISTAS.indexOf(id); return i < 0 ? ORDEN_LISTAS.length : i }
  const porLista = new Map(vigentes.map((v) => [v.lista, v]))
  const filas = [...listas].sort((a, b) => orden(a.id) - orden(b.id) || a.id.localeCompare(b.id)).map((l) => {
    const v = porLista.get(l.id)
    return { lista: l.id, nombre: l.nombre, precio: num(v?.precio), fuente: v?.fuente ?? null, desde: v?.vigente_desde ?? null, usuario: v?.usuario ?? null, motivo: v?.motivo ?? null }
  })
  const precioTN = elQueMas(tn.map((v) => num(v.precio)))
  const promoTN = elQueMas(tn.map((v) => num(v.precio_promocional)))
  const costoTN = elQueMas(tn.map((v) => num(v.costo)))
  const tnResumen = tn.length
    ? { tienda: tn[0].tienda, variantes: tn.length, precio: precioTN.valor, promocional: promoTN.valor, costo: costoTN.valor, distintos: precioTN.distintos || costoTN.distintos }
    : null
  const c = costo ? { costo: num(costo.costo), proveedor: costo.proveedor ?? null, fuente: costo.fuente, desde: costo.vigente_desde, usuario: costo.usuario, motivo: costo.motivo ?? null } : null

  const avisos = []
  const local = filas.find((f) => f.lista === 'local')?.precio ?? null
  if (!tnResumen) avisos.push('No está en Tienda Nube (ningún SKU del producto cruza).')
  if (distinto(local, tnResumen?.precio)) avisos.push(`El precio del local ($${local}) no es el de Tienda Nube ($${tnResumen.precio}).`)
  if (!c) avisos.push('Sin costo en el ERP.')
  if (distinto(c?.costo, tnResumen?.costo)) avisos.push(`El costo de Tienda Nube ($${tnResumen.costo}) no es el del ERP ($${c.costo}).`)
  if (tnResumen?.distintos) avisos.push('En Tienda Nube las variantes tienen precios o costos distintos: se muestra el que más se repite.')

  const historial = [
    ...historialPrecio.map((h) => ({ que: 'precio', lista: h.lista, valor: num(h.precio), fuente: h.fuente, desde: h.vigente_desde, usuario: h.usuario, motivo: h.motivo ?? null })),
    ...historialCosto.map((h) => ({ que: 'costo', lista: null, valor: num(h.costo), fuente: h.fuente, desde: h.vigente_desde, usuario: h.usuario, motivo: h.motivo ?? null, proveedor: h.proveedor ?? null })),
  ].sort((a, b) => Date.parse(b.desde) - Date.parse(a.desde))

  return {
    listas: filas, costo: c,
    gn: gn ? { precio: num(gn.retailer_price), mayorista: num(gn.wholesaler_price), costo: num(gn.unit_cost) } : null,
    tn: tnResumen, avisos, historial,
  }
}
