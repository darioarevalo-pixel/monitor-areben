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
  productos: Producto[],
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
