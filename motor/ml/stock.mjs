/**
 * Empujar stock a Mercado Libre (paso 8, sólo BDI): qué stock le pondría el libro a cada publicación activa, al lado de lo
 * que ML tiene. Puro. Mismo molde que `lib/tn/stock.mjs`; escribe sólo donde «el libro MANDA» (`mandaEnML`).
 *
 * 🔑 El nivel es el del libro en `DEPOSITOS_ML` (Depósito Minorista, medido 18-oct: igual que TN de BDI). ML ⛔ resta
 * reservas como TN: el libro va entero. Negativo ⇒ 0. Se saltan (y se cuentan): FULL (el stock está en el depósito de
 * ML), sin SKU, SKU que el ERP ⛔ conoce y la misma variante en dos publicaciones (`repetida`: ⛔ se escribe).
 * 🔑 ML al llegar a 0 (docs de ML, 28-oct): la publicación pasa a `paused` con `sub_status` `out_of_stock` y se REACTIVA
 * SOLA cuando le suben el stock; la pausada por el vendedor (`paused_by_seller`) ⛔ vuelve sola ⇒ el empuje lee también las
 * pausadas POR STOCK (si leyera sólo `active`, la que llegó a 0 quedaba pausada para siempre) y ⛔ toca las pausadas a mano.
 */
import { DEPOSITOS_ML, variantesML } from '../conciliacion.mjs'
import { nivelDe } from '../tn/stock.mjs'

/** Sólo BDI vende en ML. */
export const TIENDAS_ML = ['bdi']

/**
 * 🔑 La llave de «el libro MANDA» en ML: `STOCK_ML_MANDA=bdi`. Sin la variable, ninguna: el empuje sigue SECO. Va con el
 * corte de BDI, junto con `STOCK_TN_MANDA`. Una tienda que ⛔ vende en ML hace fallar (un typo ⛔ deja la llave apagada callada).
 */
export function mandaEnML(tienda, env = process.env) {
  const lista = String(env.STOCK_ML_MANDA ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  for (const t of lista) if (!TIENDAS_ML.includes(t)) throw new Error(`STOCK_ML_MANDA: tienda desconocida «${t}»`)
  return lista.includes(tienda)
}

/** Los `status` de ML que lee el empuje: las activas y las pausadas (de esas, sólo las que pausó ML por stock). */
export const ESTADOS_EMPUJE_ML = ['active', 'paused']

/** Si una publicación entra al empuje: activa, o pausada por ML por falta de stock (⛔ la pausada por el vendedor). */
export function entraAlEmpujeML(item) {
  if (item?.status === 'active') return true
  return item?.status === 'paused' && (item.sub_status ?? []).includes('out_of_stock') && !(item.sub_status ?? []).includes('paused_by_seller')
}

/**
 * @param {{ items: object[], indice: object, libro: Map<string, number>, depositos?: string[] }} p
 *   `items` = publicaciones de ML que entran al empuje (`entraAlEmpujeML`; crudo, con `variations`); `libro` = nivel por 'pid:sid:deposito'.
 */
export function planStockML({ items, indice, libro, depositos = DEPOSITOS_ML }) {
  const deLibro = nivelDe(libro, depositos)
  const cuenta = { variantes: 0, full: 0, sin_sku: 0, sin_variante: 0, repetidas: 0, iguales: 0 }
  const cambios = []
  const vistas = new Map()
  for (const item of items) {
    for (const mv of variantesML(item)) {
      cuenta.variantes++
      if (mv.full) { cuenta.full++; continue }
      if (!mv.sku) { cuenta.sin_sku++; continue }
      const v = indice.porSku?.(mv.sku.toUpperCase()) ?? null
      if (!v) { cuenta.sin_variante++; continue }
      const k = `${v.product_id}:${v.size_id}`
      vistas.set(k, (vistas.get(k) || 0) + 1)
      const libroN = deLibro(v.product_id, v.size_id)
      if (libroN === mv.stock) { cuenta.iguales++; continue }
      cambios.push({ item_id: mv.item_id, variation_id: mv.variation_id, sku: mv.sku, product_id: v.product_id, size_id: v.size_id, ml: mv.stock, libro: libroN })
    }
  }
  for (const c of cambios) if (vistas.get(`${c.product_id}:${c.size_id}`) > 1) c.repetida = true
  cuenta.repetidas = [...vistas.values()].filter((n) => n > 1).length
  return { cuenta, cambios }
}

/** Los cambios que SÍ se escriben: sin las variantes en dos publicaciones. */
export const aEscribirML = (cambios) => cambios.filter((c) => !c.repetida)

/** Si el plan quiere cambiar más que esto de lo comparado, el libro está mal: ⛔ se escribe. Mismo 15% que TN. */
export const FRENO_STOCK_ML = 0.15

export function frenoStockML({ cuenta, cambios }, max = FRENO_STOCK_ML) {
  const empujables = cuenta.variantes - cuenta.full - cuenta.sin_sku - cuenta.sin_variante
  if (!empujables) return null
  const parte = cambios.length / empujables
  return parte > max ? `el libro cambiaría ${cambios.length} de ${empujables} variantes de ML (${Math.round(parte * 100)}%, el freno es ${Math.round(max * 100)}%)` : null
}

/**
 * Lo que se le manda a ML: UN pedido por publicación. Con variaciones, todas las que cambian van juntas
 * (`PUT /items/{id}` con `variations`); sin variaciones, `available_quantity` directo.
 */
export function pedidosDeStockML(cambios) {
  const porItem = new Map()
  for (const c of aEscribirML(cambios)) porItem.set(c.item_id, [...(porItem.get(c.item_id) ?? []), c])
  return [...porItem].map(([id, cs]) => ({
    item_id: id,
    method: 'PUT',
    path: `/items/${id}`,
    body: cs[0].variation_id == null
      ? { available_quantity: cs[0].libro }
      : { variations: cs.map((c) => ({ id: Number(c.variation_id), available_quantity: c.libro })) },
    cambios: cs.length,
  }))
}
