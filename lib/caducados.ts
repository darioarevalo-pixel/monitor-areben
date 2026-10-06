/**
 * "Productos caducados" (key `caducados`): candidatos a depurar — sin stock en
 * NINGÚN depósito y con la última venta hace más de N días. Port puro de cadRender
 * (index.html:12433), sin DOM. El stock por depósito y la última venta se traen con
 * consultas propias a Supabase (más amplias que la ventana del login) en
 * `components/caducados/datosCaducados.ts`; acá sólo se cruza y se arma la lista.
 */

import type { Producto } from './etl/tipos'

/** pid → stock total + desglose por depósito (todos los depósitos, no sólo Local). */
export type StockPorDeposito = Record<string, { total: number; stores: Record<string, number> }>
/** pid → 'YYYY-MM-DD' de la última venta (ventana ~2 años). */
export type UltimaVenta = Record<string, string>

export type Caducado = {
  id: string
  name: string
  cat: string
  last: string
  stores: Record<string, number>
}

/** Días desde una fecha 'YYYY-MM-DD' hasta `now`. Port de _cadDiasDesde (index.html:12432). */
export function diasDesde(fecha: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(fecha + 'T00:00:00')) / 86400000)
}

/**
 * Nombres de depósitos ordenados: "Local" primero, el resto alfabético. Port de
 * cadStoresList (index.html:12417).
 */
export function depositosOrdenados(stock: StockPorDeposito): string[] {
  const set = new Set<string>()
  Object.values(stock).forEach((s) => Object.keys(s.stores).forEach((n) => set.add(n)))
  return [...set].sort((a, b) => (a === 'Local' ? -1 : b === 'Local' ? 1 : a.localeCompare(b, 'es')))
}

/**
 * Candidatos a depurar: stock total 0 y última venta anterior al corte de N días,
 * ordenados por última venta ascendente (los más viejos primero). Port de cadRender
 * (index.html:12435-12444).
 */
export function candidatos(
  productos: Pick<Producto, 'id' | 'name' | 'category'>[],
  stock: StockPorDeposito,
  ultimaVenta: UltimaVenta,
  dias: number,
  now: Date,
): Caducado[] {
  const corte = new Date(now.getTime() - dias * 86400000).toISOString().slice(0, 10)
  const cands: Caducado[] = []
  productos.forEach((p) => {
    const id = String(p.id)
    const st = stock[id] || { total: 0, stores: {} }
    if (st.total !== 0) return
    const lv = ultimaVenta[id]
    if (!lv || lv >= corte) return
    cands.push({ id, name: p.name || '—', cat: p.category || '—', last: lv, stores: st.stores })
  })
  cands.sort((a, b) => a.last.localeCompare(b.last))
  return cands
}

// ── Las dos pestañas: Tienda Nube y Gestión Nube ────────────────────────────────────────────────
//
// 🔑 **Cada pestaña mira SOLO su sistema.** La de GN muestra los caducados que siguen activos en
// GN; la de TN, los que siguen existiendo en la tienda, **estén activos o no en GN**. Si la de TN
// filtrara por activos en GN, desactivar en GN primero dejaría el producto olvidado en la tienda:
// el 5-oct-2026, de 194 tops caducados de Zattia, 149 ya estaban inactivos en GN y 78 de ellos
// seguían cargados (ocultos) en TN. Así el orden de la limpieza da igual.

/** Producto del espejo con su estado en GN (incluye los inactivos, que el ETL no baja). */
export type ProductoGn = { id: string; name: string; category: string | null; active: boolean }

/** Lo que se usa del payload de `tiendanube-audit?variantes=1`. */
export type TnProductoCad = {
  id: number | string
  name: string
  published?: boolean
  variantes?: { sku?: string | null; stock?: number | null }[]
}

/**
 * Nombre comparable: mayúsculas, sin tildes, espacios colapsados.
 *
 * ⛔ **Se compara EXACTO, no por palabras contenidas** como `matchTn` (`lib/tn-match.core.js`):
 * ahí "TOP BALI" encuentra "TOP BALINA". Para una lista de la que se ELIMINA, un producto que no
 * cruza queda afuera (se escapa uno), en vez de entrar uno equivocado (se elimina uno vivo).
 */
export function normNombre(s: string | null | undefined): string {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type PendienteTn = {
  tnId: string
  nombre: string
  visible: boolean
  /** Suma del stock de las variantes en TN; null si TN no lo informa. */
  stockTn: number | null
  /** La última venta más nueva entre los productos de GN que le corresponden. */
  last: string
  cat: string
  /** Los productos de GN que cruzan con éste (por código de variante o por nombre). */
  gn: { id: string; name: string; active: boolean }[]
}

/**
 * Los caducados que siguen en la tienda, uno por producto de TN.
 *
 * Cruce: código de variante exacto (sku del `inventario`) → si no, nombre exacto normalizado.
 * Los productos borrados en GN ya no tienen filas de inventario, así que para ellos queda sólo
 * el nombre — por eso el cruce por nombre mira TODOS los productos de GN, activos o no.
 *
 * 🔴 **Gemelos**: GN tiene productos distintos con el mismo nombre (una temporada y la
 * siguiente). Si el producto de TN cruza con alguno VIGENTE, la publicación puede ser del
 * vigente y **no se lista** — se cuenta en `gemelos`. Vigente = no caducado, salvo la basura:
 * desactivado, sin stock y sin una sola venta (los duplicados de carga, que en Zattia hay de a
 * dos y tres por nombre). Un ACTIVO sin ventas sí bloquea: puede ser el alta de lo que viene.
 * Medido el 5-oct-2026: los 8 "visibles" de los tops eran gemelos con stock, y TOP LOLA/LAZY/
 * INDY/LAYER/ALO tenían un gemelo vendido dentro de los 30 días — dentro del plazo de cambio.
 */
export function pendientesTn(
  tn: TnProductoCad[],
  productosGn: ProductoGn[],
  caducados: Caducado[],
  skusPorProducto: Record<string, string[]>,
  stock: StockPorDeposito,
  ultimaVenta: UltimaVenta,
): { filas: PendienteTn[]; gemelos: number } {
  const cad = new Map(caducados.map((c) => [c.id, c]))
  const gnPorId = new Map(productosGn.map((p) => [p.id, p]))
  const basura = (id: string) => !gnPorId.get(id)?.active && !(stock[id]?.total ?? 0) && !ultimaVenta[id]
  const porNombre = new Map<string, string[]>()
  productosGn.forEach((p) => {
    const k = normNombre(p.name)
    if (!k) return
    const l = porNombre.get(k)
    if (l) l.push(p.id)
    else porNombre.set(k, [p.id])
  })
  const porSku = new Map<string, Set<string>>()
  Object.entries(skusPorProducto).forEach(([pid, skus]) =>
    skus.forEach((s) => {
      const k = s.trim().toUpperCase()
      if (!k) return // '' matchea todo
      const set = porSku.get(k) ?? new Set<string>()
      set.add(pid)
      porSku.set(k, set)
    }),
  )

  const filas: PendienteTn[] = []
  let gemelos = 0
  tn.forEach((t) => {
    const ids = new Set<string>()
    ;(t.variantes || []).forEach((v) => {
      const k = String(v.sku || '').trim().toUpperCase()
      if (k) porSku.get(k)?.forEach((id) => ids.add(id))
    })
    if (!ids.size) (porNombre.get(normNombre(t.name)) || []).forEach((id) => ids.add(id))
    if (!ids.size) return
    const deGn = [...ids]
    const cads = deGn.filter((id) => cad.has(id))
    if (!cads.length) return
    if (deGn.some((id) => !cad.has(id) && !basura(id))) {
      gemelos++
      return
    }
    const vars = t.variantes
    const stockTn = vars && vars.length ? vars.reduce((a, v) => a + (Number(v.stock) || 0), 0) : null
    const last = cads.map((id) => cad.get(id)!.last).sort().pop()!
    filas.push({
      tnId: String(t.id),
      nombre: t.name,
      visible: t.published !== false,
      stockTn,
      last,
      cat: cad.get(cads[0])!.cat,
      gn: cads.map((id) => ({ id, name: gnPorId.get(id)?.name || cad.get(id)!.name, active: !!gnPorId.get(id)?.active })),
    })
  })
  filas.sort((a, b) => a.last.localeCompare(b.last))
  return { filas, gemelos }
}

/** Filtro por palabra sobre nombre y categoría (normalizado, contiene). Vacío = todo. */
export function coincide(texto: string, ...campos: (string | null | undefined)[]): boolean {
  const q = normNombre(texto)
  if (!q) return true
  return campos.some((c) => normNombre(c).includes(q))
}
