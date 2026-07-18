/**
 * Armado de una solicitud (el "borrador"). Port de las funciones sfDraft* del
 * legacy (index.html:9831-10165), sin DOM y con actualizaciones INMUTABLES (cada
 * función devuelve un borrador nuevo, para el estado de React).
 *
 * El inventario de origen es `allVariantes` del ETL, que ya trae el split
 * local/deposito por variante — ES el `repoInv` que el legacy arma aparte. Se usa
 * `v.id` como vid (en el ETL la variante se llama `id`, no `vid`).
 *
 * La lógica que de verdad importa (y va testeada contra el legacy): la asignación
 * de origen en `procesarDraft` (prioridad + fallback por stock, salvo que el
 * escaneo haya fijado el origen a mano) y la resolución del escaneo del borrador.
 */

import type { Producto, Variante } from '../etl/tipos'
import { normBc, vidDeBarcode } from './escaneo'
import type { ItemSolicitud, Origen, Solicitud } from './tipos'

export type DraftVar = {
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
export type DraftProd = { pid: string; name: string; cat: string; variantes: DraftVar[] }
export type DraftPendiente = { barcode: string; qty: number; origenManual: Origen }
export type DraftManual = { mid: string; desc: string; qty: number }
export type Draft = { desc: string; prods: DraftProd[]; pendientes: DraftPendiente[]; manuales: DraftManual[] }

export function draftVacio(): Draft {
  return { desc: '', prods: [], pendientes: [], manuales: [] }
}

const stockVar = (v: Variante) => (v.local || 0) + (v.deposito || 0)
const ordenarPorTalle = <T extends { size: string }>(a: T, b: T) =>
  String(a.size).localeCompare(String(b.size), 'es', { numeric: true })

/**
 * Agrega al borrador uno o más productos, cada uno con sus variantes CON stock
 * (sin tildar). Port de sfDraftDesdeProductos. No duplica un producto ya presente.
 */
export function expandirProductos(draft: Draft, pids: string[], variantes: Variante[], productos: Producto[]): Draft {
  const prodById: Record<string, Producto> = {}
  productos.forEach((p) => (prodById[String(p.id)] = p))
  let prods = draft.prods
  for (const raw of pids) {
    const pid = String(raw)
    if (prods.some((p) => p.pid === pid)) continue
    const vars: DraftVar[] = variantes
      .filter((v) => String(v.pid) === pid && stockVar(v) > 0)
      .map((v) => ({ vid: v.id, sid: v.sid, size: v.size || '—', sku: v.sku || '', local: v.local || 0, deposito: v.deposito || 0, sel: false, qty: 1 }))
      .sort(ordenarPorTalle)
    if (!vars.length) continue
    const p = prodById[pid]
    const name = (p && p.name) || variantes.find((v) => String(v.pid) === pid)?.name || '—'
    prods = [...prods, { pid, name, cat: (p && p.category) || '', variantes: vars }]
  }
  return { ...draft, prods }
}

/** Resultado agrupado del buscador incremental. Port de la data de sfAddBuscar. */
export type ResultadoBusqueda = {
  pid: string
  name: string
  yaEsta: boolean
  vars: { vid: string; size: string; sku: string; stock: number }[]
}

/**
 * Buscador incremental: agrupa por producto las variantes con stock y devuelve
 * los productos cuyo nombre o SKU matchea (máx. 25). < 2 letras → nada.
 */
export function buscarProductos(variantes: Variante[], q: string, yaEn: Set<string>): ResultadoBusqueda[] {
  const qq = String(q || '').trim().toLowerCase()
  if (qq.length < 2) return []
  const byPid = new Map<string, { pid: string; name: string; match: boolean; vars: { vid: string; size: string; sku: string; stock: number }[] }>()
  for (const v of variantes) {
    const stock = stockVar(v)
    if (stock <= 0) continue
    const pid = String(v.pid)
    let e = byPid.get(pid)
    if (!e) {
      e = { pid, name: v.name || '—', match: false, vars: [] }
      byPid.set(pid, e)
    }
    e.vars.push({ vid: v.id, size: v.size || '—', sku: v.sku || '', stock })
    if (String(v.name || '').toLowerCase().includes(qq) || String(v.sku || '').toLowerCase().includes(qq)) e.match = true
  }
  return [...byPid.values()]
    .filter((e) => e.match)
    .slice(0, 25)
    .map((e) => ({ pid: e.pid, name: e.name, yaEsta: yaEn.has(e.pid), vars: e.vars.slice().sort(ordenarPorTalle) }))
}

/** "Traer producto" del buscador: agrega el producto entero (variantes sin tildar). Port de sfAddProducto. */
export function traerProducto(draft: Draft, pid: string, variantes: Variante[], productos: Producto[]): Draft {
  return expandirProductos(draft, [pid], variantes, productos)
}

/**
 * "Traer variante" (chip del buscador): agrega el producto y deja UNA variante
 * tildada con cantidad ≥ 1. Port de sfAddProductoVariante.
 */
export function traerVariante(draft: Draft, pid: string, vid: string, variantes: Variante[], productos: Producto[]): Draft {
  const d = expandirProductos(draft, [pid], variantes, productos)
  return {
    ...d,
    prods: d.prods.map((p) =>
      p.pid !== pid ? p : { ...p, variantes: p.variantes.map((v) => (v.vid === vid ? { ...v, sel: true, qty: v.qty > 0 ? v.qty : 1 } : v)) },
    ),
  }
}

export type ResultadoDraftScan =
  | { tipo: 'nuevo'; barcode: string; qty: number; origen: Origen }
  | { tipo: 'variante'; nombre: string; size: string; qty: number; origen: Origen }

/**
 * Escaneo dentro del borrador. Busca la variante en el inventario (por vid, luego
 * por SKU); si no está, la guarda como "nuevo" por código de barras. Cada escaneo
 * suma 1 y fija la ubicación elegida. Port de sfDraftScan.
 */
export function escanearDraft(
  draft: Draft,
  code: string,
  mapaBc: Record<string, string>,
  variantes: Variante[],
  origenSel: Origen,
  productos: Producto[],
): { draft: Draft; resultado: ResultadoDraftScan } {
  const c = String(code || '').trim()
  const vid = vidDeBarcode(c, mapaBc)
  let it = vid ? variantes.find((v) => v.id === vid) ?? null : null
  if (!it && c) it = variantes.find((v) => String(v.sku || '').toLowerCase() === c.toLowerCase()) ?? null

  if (!it) {
    // Producto NUEVO (aún no en GN): se guarda solo el código de barras.
    const norm = normBc(c)
    const existe = (draft.pendientes || []).some((x) => normBc(x.barcode) === norm)
    const pendientes = existe
      ? draft.pendientes.map((x) => (normBc(x.barcode) === norm ? { ...x, qty: (Number(x.qty) || 0) + 1, origenManual: origenSel } : x))
      : [...(draft.pendientes || []), { barcode: c, qty: 1, origenManual: origenSel }]
    const qty = pendientes.find((x) => normBc(x.barcode) === norm)!.qty
    return { draft: { ...draft, pendientes }, resultado: { tipo: 'nuevo', barcode: c, qty, origen: origenSel } }
  }

  // Variante existente: asegurar el producto (trae las de stock) y la variante.
  const pid = String(it.pid)
  let d = draft
  if (!d.prods.some((p) => p.pid === pid)) d = expandirProductos(d, [pid], variantes, productos)
  let prods = d.prods
  if (!prods.some((p) => p.pid === pid)) {
    // Stock 0 en sistema pero físicamente presente → igual se carga con prod vacío.
    prods = [...prods, { pid, name: it.name || '—', cat: '', variantes: [] }]
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

/** Total de unidades del borrador (para el botón "Procesar (N u.)"). */
export function totalDraft(draft: Draft): number {
  const enProds = draft.prods.reduce((s, p) => s + p.variantes.filter((v) => v.sel).reduce((a, v) => a + (Number(v.qty) || 1), 0), 0)
  const enPend = (draft.pendientes || []).reduce((a, p) => a + (Number(p.qty) || 1), 0)
  const enMan = (draft.manuales || []).reduce((a, m) => a + (Number(m.qty) || 1), 0)
  return enProds + enPend + enMan
}

export type MetaSolicitud = { id: string; fecha: string; creado: number; creadoPor: string }

/**
 * Convierte el borrador en una solicitud. Asigna el origen de cada variante:
 * el fijado por escaneo si lo hay; si no, por prioridad con fallback por stock
 * (prioridad='local' → local si alcanza, si no depósito; y al revés). Los "nuevos"
 * y los "a mano" no generan venta. Devuelve null si no hay nada que procesar.
 * Port de sfProcesar.
 */
export function procesarDraft(draft: Draft, prioridad: Origen, meta: MetaSolicitud): Solicitud | null {
  const items: ItemSolicitud[] = []
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
  ;(draft.pendientes || []).forEach((pn) => {
    const qty = Math.max(1, Number(pn.qty) || 1)
    items.push({ vid: 'bc_' + pn.barcode, pid: null, sid: null, nombre: '(nuevo sin cargar)', variante: '', sku: '', barcode: pn.barcode, qty, origen: pn.origenManual || 'deposito', nuevo: true, pendiente: true })
  })
  ;(draft.manuales || []).forEach((mn) => {
    const desc = String(mn.desc || '').trim()
    if (!desc) return
    const qty = Math.max(1, Number(mn.qty) || 1)
    items.push({ vid: 'man_' + mn.mid, pid: null, sid: null, nombre: desc, variante: '', sku: '', qty, origen: 'deposito', nuevo: true, manual: true })
  })
  if (!items.length) return null
  return { id: meta.id, fecha: meta.fecha, creado: meta.creado, creadoPor: meta.creadoPor, descripcion: draft.desc || '', estado: 'pendiente', items }
}

// ── Actualizaciones inmutables pequeñas (para el estado de React) ────────────────

export function toggleVar(draft: Draft, pid: string, vid: string, sel: boolean): Draft {
  return mapVar(draft, pid, vid, (v) => ({ ...v, sel }))
}
export function setVarQty(draft: Draft, pid: string, vid: string, val: string | number): Draft {
  return mapVar(draft, pid, vid, (v) => ({ ...v, qty: Math.max(1, parseInt(String(val)) || 1) }))
}
export function quitarProd(draft: Draft, pid: string): Draft {
  return { ...draft, prods: draft.prods.filter((p) => p.pid !== pid) }
}
export function quitarPendiente(draft: Draft, barcode: string): Draft {
  return { ...draft, pendientes: (draft.pendientes || []).filter((x) => normBc(x.barcode) !== normBc(barcode)) }
}
export function agregarManual(draft: Draft, mid: string, desc: string, qty: number): Draft {
  return { ...draft, manuales: [...(draft.manuales || []), { mid, desc, qty: Math.max(1, qty || 1) }] }
}
export function setManualQty(draft: Draft, mid: string, val: string | number): Draft {
  return { ...draft, manuales: (draft.manuales || []).map((m) => (m.mid === mid ? { ...m, qty: Math.max(1, parseInt(String(val)) || 1) } : m)) }
}
export function quitarManual(draft: Draft, mid: string): Draft {
  return { ...draft, manuales: (draft.manuales || []).filter((m) => m.mid !== mid) }
}

function mapVar(draft: Draft, pid: string, vid: string, fn: (v: DraftVar) => DraftVar): Draft {
  return {
    ...draft,
    prods: draft.prods.map((p) => (p.pid === pid ? { ...p, variantes: p.variantes.map((v) => (v.vid === vid ? fn(v) : v)) } : p)),
  }
}
