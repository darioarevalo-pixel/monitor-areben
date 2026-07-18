/**
 * Armado de una solicitud interna (el "borrador"). Port de siNuevoDraft/
 * siDraftDesdeProductos/siDraftScan/siAddProductoPrompt/siProcesar
 * (index.html:10864-10928), sin DOM y con actualizaciones INMUTABLES (cada
 * función devuelve un borrador nuevo, para el estado de React).
 *
 * El inventario de origen es `allVariantes` del ETL, que ya trae el split
 * local/deposito por variante — ES el `repoInv` que el legacy arma aparte (se usa
 * `v.id` como vid). Es el mismo inventario que consume Sesión de fotos.
 *
 * A diferencia de Sesión de fotos, acá NO hay ítems "nuevo" (sin código en GN) ni
 * "a mano": si el escaneo no encuentra la variante en el inventario, es un error,
 * no un pendiente. Todo lo que entra en una solicitud interna existe en GN y puede
 * descontar stock. Por eso el borrador es más chico.
 */

import type { Producto, Variante } from '../etl/tipos'
import { vidDeBarcode } from '../sesionfotos/escaneo'
import type { ItemSI, Origen, SolicitudInterna, TipoSol } from './tipos'

export type SIDraftVar = {
  vid: string
  sid: string | null
  size: string
  sku: string
  local: number
  deposito: number
  sel: boolean
  qty: number
  /** Origen fijado por escaneo (el operario sabe de dónde lo sacó). */
  origenManual?: Origen
}
export type SIDraftProd = { pid: string; name: string; variantes: SIDraftVar[] }
export type SIDraft = {
  motivo: string
  tipo: TipoSol
  descripcion: string
  /** Ubicación elegida para el escáner ("sacando de…"). */
  origen: Origen
  prods: SIDraftProd[]
}

/** Borrador vacío. Port de siNuevoDraft: origen arranca en la prioridad de retiro. */
export function draftVacio(motivo: string, prioridad: Origen): SIDraft {
  return { motivo, tipo: 'retornable', descripcion: '', origen: prioridad, prods: [] }
}

const stockVar = (v: Variante) => (v.local || 0) + (v.deposito || 0)
const ordenarPorTalle = <T extends { size: string }>(a: T, b: T) =>
  String(a.size).localeCompare(String(b.size), 'es', { numeric: true })

/**
 * Agrega al borrador uno o más productos, cada uno con sus variantes CON stock
 * (sin tildar). Port de siDraftDesdeProductos. No duplica un producto ya presente.
 */
export function expandirProductos(draft: SIDraft, pids: string[], variantes: Variante[], productos: Producto[]): SIDraft {
  const prodById: Record<string, Producto> = {}
  productos.forEach((p) => (prodById[String(p.id)] = p))
  let prods = draft.prods
  for (const raw of pids) {
    const pid = String(raw)
    if (prods.some((p) => p.pid === pid)) continue
    const vars: SIDraftVar[] = variantes
      .filter((v) => String(v.pid) === pid && stockVar(v) > 0)
      .map((v) => ({ vid: v.id, sid: v.sid, size: v.size || '—', sku: v.sku || '', local: v.local || 0, deposito: v.deposito || 0, sel: false, qty: 1 }))
      .sort(ordenarPorTalle)
    if (!vars.length) continue
    const p = prodById[pid]
    const name = (p && p.name) || variantes.find((v) => String(v.pid) === pid)?.name || '—'
    prods = [...prods, { pid, name, variantes: vars }]
  }
  return { ...draft, prods }
}

/**
 * pids únicos con stock cuyo nombre o SKU matchea la búsqueda. Port del filtro de
 * siAddProductoPrompt (index.html:10907): el llamador pasa el texto del prompt.
 */
export function pidsQueMatchean(variantes: Variante[], q: string): string[] {
  const qq = String(q || '').trim().toLowerCase()
  if (!qq) return []
  const set = new Set<string>()
  for (const v of variantes) {
    if (stockVar(v) <= 0) continue
    if (String(v.name || '').toLowerCase().includes(qq) || String(v.sku || '').toLowerCase().includes(qq)) set.add(String(v.pid))
  }
  return [...set]
}

export type ResultadoSIDraftScan =
  | { tipo: 'no-encontrado'; code: string }
  | { tipo: 'variante'; nombre: string; size: string; qty: number; origen: Origen }

/**
 * Escaneo dentro del borrador. Busca la variante por vid (mapa de barcode) y luego
 * por SKU; si no está, error (no crea pendientes). Cada escaneo suma 1 y fija la
 * ubicación elegida. Port de siDraftScan.
 */
export function escanearDraft(
  draft: SIDraft,
  code: string,
  mapaBc: Record<string, string>,
  variantes: Variante[],
  productos: Producto[],
): { draft: SIDraft; resultado: ResultadoSIDraftScan } {
  const c = String(code || '').trim()
  const vid = vidDeBarcode(c, mapaBc)
  let it = vid ? variantes.find((v) => v.id === vid) ?? null : null
  if (!it && c) it = variantes.find((v) => String(v.sku || '').toLowerCase() === c.toLowerCase()) ?? null
  if (!it) return { draft, resultado: { tipo: 'no-encontrado', code: c } }

  const origenSel = draft.origen
  const pid = String(it.pid)
  let d = draft
  if (!d.prods.some((p) => p.pid === pid)) d = expandirProductos(d, [pid], variantes, productos)
  let prods = d.prods
  if (!prods.some((p) => p.pid === pid)) {
    // Stock 0 en sistema pero físicamente presente → igual se carga con prod vacío.
    prods = [...prods, { pid, name: it.name || '—', variantes: [] }]
  }
  prods = prods.map((p) => {
    if (p.pid !== pid) return p
    const tiene = p.variantes.some((v) => v.vid === it!.id)
    let vs = tiene
      ? p.variantes
      : [...p.variantes, { vid: it!.id, sid: it!.sid, size: it!.size || '—', sku: it!.sku || '', local: it!.local || 0, deposito: it!.deposito || 0, sel: false, qty: 0 }]
    vs = vs.map((v) => (v.vid === it!.id ? { ...v, sel: true, qty: (Number(v.qty) || 0) + 1, origenManual: origenSel } : v))
    return { ...p, variantes: vs }
  })
  const prod = prods.find((p) => p.pid === pid)!
  const v = prod.variantes.find((x) => x.vid === it!.id)!
  return { draft: { ...d, prods }, resultado: { tipo: 'variante', nombre: prod.name, size: v.size, qty: v.qty, origen: origenSel } }
}

/** Total de unidades tildadas (para el botón "Crear solicitud (N u.)"). */
export function totalDraft(draft: SIDraft): number {
  return draft.prods.reduce((s, p) => s + p.variantes.filter((v) => v.sel).reduce((a, v) => a + (Number(v.qty) || 1), 0), 0)
}

export type MetaSolicitud = { id: string; fecha: string; creado: number; creadoPor: string }

/**
 * Convierte el borrador en una solicitud. Asigna el origen de cada variante: el
 * fijado por escaneo si lo hay; si no, por prioridad con fallback por stock
 * (prioridad='local' → local si alcanza, si no depósito; y al revés). El estado
 * inicial depende del tipo: `consumo` → `pendiente` (espera aprobación),
 * `retornable` → `aprobada`. Devuelve null si no hay nada tildado. Port de siProcesar.
 */
export function procesarDraft(draft: SIDraft, prioridad: Origen, meta: MetaSolicitud): SolicitudInterna | null {
  const items: ItemSI[] = []
  draft.prods.forEach((p) =>
    p.variantes
      .filter((v) => v.sel)
      .forEach((v) => {
        const qty = Math.max(1, Number(v.qty) || 1)
        const origen: Origen = v.origenManual
          ? v.origenManual
          : prioridad === 'local'
            ? v.local >= qty
              ? 'local'
              : 'deposito'
            : v.deposito >= qty
              ? 'deposito'
              : 'local'
        items.push({ vid: v.vid, pid: p.pid, sid: v.sid, nombre: p.name, variante: v.size, sku: v.sku, qty, stockDep: v.deposito, stockLoc: v.local, origen })
      }),
  )
  if (!items.length) return null
  const estado = draft.tipo === 'consumo' ? 'pendiente' : 'aprobada'
  return {
    id: meta.id,
    fecha: meta.fecha,
    creado: meta.creado,
    creadoPor: meta.creadoPor,
    motivo: draft.motivo || 'Otro',
    tipo: draft.tipo || 'retornable',
    descripcion: draft.descripcion || '',
    estado,
    items,
    devuelto: {},
  }
}

// ── Actualizaciones inmutables pequeñas (para el estado de React) ────────────────

export function toggleVar(draft: SIDraft, pid: string, vid: string, sel: boolean): SIDraft {
  return mapVar(draft, pid, vid, (v) => ({ ...v, sel }))
}
export function setVarQty(draft: SIDraft, pid: string, vid: string, val: string | number): SIDraft {
  return mapVar(draft, pid, vid, (v) => ({ ...v, qty: Math.max(1, parseInt(String(val)) || 1) }))
}
export function quitarProd(draft: SIDraft, pid: string): SIDraft {
  return { ...draft, prods: draft.prods.filter((p) => p.pid !== pid) }
}

function mapVar(draft: SIDraft, pid: string, vid: string, fn: (v: SIDraftVar) => SIDraftVar): SIDraft {
  return {
    ...draft,
    prods: draft.prods.map((p) => (p.pid === pid ? { ...p, variantes: p.variantes.map((v) => (v.vid === vid ? fn(v) : v)) } : p)),
  }
}
