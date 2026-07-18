/**
 * Lógica pura de Ingresos proyectados. Port de las funciones `ing*` del legacy
 * (index.html:3960-4405), pero con actualizaciones INMUTABLES: cada mutación
 * devuelve un `Ingreso`/`Ingreso[]` nuevo (para el estado de React), en vez de
 * mutar en el lugar como el legacy.
 *
 * Las funciones que crean entidades reciben un generador de ids `nid` para no
 * atar este módulo a `Date.now()`/`Math.random()` (así son testeables con un
 * contador determinístico). El resto es puro sobre los datos.
 */

import { MODELOS_BASE } from './modelos'
import type { Bloque, Celdas, DisenoColumna, EstadoIngreso, GalleryItem, Ingreso, ItemDerivado, ModeloFila } from './tipos'

export type Estado = { k: EstadoIngreso; lbl: string; color: string; bg: string }

/** Los estados con su color/etiqueta. Port de ING_ESTADOS. */
export const ESTADOS: Estado[] = [
  { k: 'cotizando', lbl: 'Cotizando', color: '#6B7280', bg: '#F9FAFB' },
  { k: 'pedido', lbl: 'Pedido', color: '#7C3AED', bg: '#F5F3FF' },
  { k: 'produccion', lbl: 'En producción', color: '#0EA5E9', bg: '#F0F9FF' },
  { k: 'transito', lbl: 'En tránsito', color: '#D97706', bg: '#FFFBEB' },
  { k: 'aduana', lbl: 'En aduana', color: '#DB2777', bg: '#FDF2F8' },
  { k: 'arribado', lbl: 'Arribado ✓', color: '#16A34A', bg: '#F0FDF4' },
]

export function estadoDe(k: EstadoIngreso | string): Estado {
  return ESTADOS.find((x) => x.k === k) || ESTADOS[0]
}

// ── Fábricas (necesitan ids) ──────────────────────────────────────────────────
export function modelosBase(nid: () => string): ModeloFila[] {
  return MODELOS_BASE.map((m) => ({ id: nid(), model: m }))
}
export function disenosVacios(nid: () => string, n: number): DisenoColumna[] {
  const a: DisenoColumna[] = []
  for (let i = 0; i < n; i++) a.push({ id: nid(), nombre: '', img: '' })
  return a
}
export function nuevoBloque(nid: () => string, nombre: string, nDisenos: number): Bloque {
  return { id: nid(), nombre, modelos: modelosBase(nid), disenos: disenosVacios(nid, nDisenos), celdas: {} }
}
export function nuevoIngreso(nid: () => string): Ingreso {
  return { id: nid(), desc: '', proveedor: '', fecha: '', estado: 'cotizando', nota: '', bloques: [nuevoBloque(nid, '', 10)], gallery: [] }
}

// ── Cálculos puros ──────────────────────────────────────────────────────────────
export function celdaGet(b: Bloque, mid: string, did: string): number {
  return (b.celdas && b.celdas[mid] && +b.celdas[mid][did]) || 0
}
/** Total de unidades de un bloque. Port de ingBloqueU. */
export function bloqueU(b: Bloque): number {
  let t = 0
  const c = b.celdas || {}
  for (const m in c) for (const d in c[m]) t += +c[m][d] || 0
  return t
}
/** Total de unidades de la importación (suma de bloques). Port de ingTotalU. */
export function totalU(g: Ingreso): number {
  return (g.bloques || []).reduce((s, b) => s + bloqueU(b), 0)
}
/** Total por modelo (sumando bloques). Port de ingDerivarItems. */
export function derivarItems(g: Ingreso): ItemDerivado[] {
  const map: Record<string, number> = {}
  ;(g.bloques || []).forEach((b) => {
    ;(b.modelos || []).forEach((m) => {
      let t = 0
      const row = (b.celdas || {})[m.id] || {}
      for (const d in row) t += +row[d] || 0
      if (t) map[m.model] = (map[m.model] || 0) + t
    })
  })
  return Object.keys(map).map((model) => ({ id: model, model, cantidad: map[model] }))
}
/** Total por diseño de un bloque (suma de la columna). */
export function totalDiseno(b: Bloque, did: string): number {
  return (b.modelos || []).reduce((t, m) => t + celdaGet(b, m.id, did), 0)
}
/** Total por modelo de un bloque (suma de la fila). */
export function totalModelo(b: Bloque, mid: string): number {
  const row = (b.celdas || {})[mid] || {}
  let t = 0
  for (const d in row) t += +row[d] || 0
  return t
}

/** Resumen del encabezado: importaciones en camino (no arribadas) + sus unidades. */
export function resumen(ingresos: Ingreso[]): { enCamino: number; unidades: number } {
  const camino = ingresos.filter((g) => g.estado !== 'arribado')
  return { enCamino: camino.length, unidades: camino.reduce((s, g) => s + totalU(g), 0) }
}

/** Orden por fecha de llegada ascendente; sin fecha al final. Port del sort de ingRender. */
export function ordenarPorFecha(ingresos: Ingreso[]): Ingreso[] {
  return ingresos.slice().sort((a, b) => {
    if (!a.fecha && !b.fecha) return 0
    if (!a.fecha) return 1
    if (!b.fecha) return -1
    return a.fecha.localeCompare(b.fecha)
  })
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
/** "Julio 2025" a partir de "2025-07". Port de _ingMes. */
export function mesLabel(fecha: string): string {
  const p = String(fecha).split('-')
  return (MESES[parseInt(p[1]) - 1] || '') + ' ' + p[0]
}
/** El encabezado de mes de un ingreso (o "Sin fecha estimada"). */
export function mesDe(g: Ingreso): string {
  return g.fecha ? mesLabel(g.fecha) : 'Sin fecha estimada'
}

// ── Media (galería) ──────────────────────────────────────────────────────────────
export function ytId(u: string): string | null {
  const m = String(u).match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/)
  return m ? m[1] : null
}
export function driveId(u: string): string | null {
  const m = String(u).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/)
  return m ? m[1] : null
}
/** ¿El link es de video? Port del test de ingLinkAdd. */
export function esVideoUrl(url: string): boolean {
  return /youtube\.com|youtu\.be|vimeo\.com|drive\.google\.com|\.mp4(\?|$)/i.test(url)
}

// ── Normalización / migración de formato viejo (port de ingNormalizar) ──────────
export function normalizar(g: Ingreso, nid: () => string): Ingreso {
  if (!g || typeof g !== 'object') return g
  const gallery = Array.isArray(g.gallery) ? g.gallery : []
  let bloques = g.bloques
  if (!Array.isArray(bloques)) {
    let modelos: ModeloFila[]
    let disenos: DisenoColumna[]
    let celdas: Celdas
    if (Array.isArray(g.modelos)) {
      modelos = g.modelos
      disenos = Array.isArray(g.disenos) ? g.disenos : []
      celdas = g.celdas && typeof g.celdas === 'object' ? g.celdas : {}
    } else {
      const its = (Array.isArray(g.items) ? g.items : []) as { id?: string; model?: string; cantidad?: number }[]
      modelos = its.map((it) => ({ id: it.id || nid(), model: it.model || '' }))
      disenos = []
      celdas = {}
      const conCant = its.filter((it) => (+(it.cantidad || 0) || 0) > 0)
      if (conCant.length) {
        const did = nid()
        disenos.push({ id: did, nombre: 'General', img: '' })
        its.forEach((it) => {
          const c = +(it.cantidad || 0) || 0
          if (c > 0) (celdas[it.id || ''] = celdas[it.id || ''] || {})[did] = c
        })
      }
    }
    bloques = [{ id: nid(), nombre: '', modelos, disenos, celdas }]
  }
  bloques = bloques.map((b) => ({
    id: b.id,
    nombre: b.nombre,
    modelos: Array.isArray(b.modelos) ? b.modelos : [],
    disenos: Array.isArray(b.disenos) ? b.disenos : [],
    celdas: b.celdas && typeof b.celdas === 'object' ? b.celdas : {},
  }))
  const out: Ingreso = { ...g, gallery, bloques }
  delete out.modelos
  delete out.disenos
  delete out.celdas
  return out
}

/** Deriva `items` (compat) y devuelve el ingreso normalizado para guardar. Port del forEach de ingGuardar. */
export function conItemsDerivados(g: Ingreso): Ingreso {
  return { ...g, items: derivarItems(g) }
}

// ── Mutaciones inmutables (para el estado de React) ─────────────────────────────
function mapIngreso(list: Ingreso[], id: string, fn: (g: Ingreso) => Ingreso): Ingreso[] {
  return list.map((g) => (g.id === id ? fn(g) : g))
}
function mapBloque(g: Ingreso, bid: string, fn: (b: Bloque) => Bloque): Ingreso {
  return { ...g, bloques: (g.bloques || []).map((b) => (b.id === bid ? fn(b) : b)) }
}

export function setCampo(list: Ingreso[], id: string, campo: 'desc' | 'proveedor' | 'fecha' | 'estado' | 'nota', val: string): Ingreso[] {
  return mapIngreso(list, id, (g) => ({ ...g, [campo]: val }))
}
export function agregarIngreso(list: Ingreso[], g: Ingreso): Ingreso[] {
  return [...list, g]
}
export function quitarIngreso(list: Ingreso[], id: string): Ingreso[] {
  return list.filter((g) => g.id !== id)
}

export function agregarBloque(list: Ingreso[], id: string, bloque: Bloque): Ingreso[] {
  return mapIngreso(list, id, (g) => ({ ...g, bloques: [...(g.bloques || []), bloque] }))
}
export function quitarBloque(list: Ingreso[], id: string, bid: string): Ingreso[] {
  return mapIngreso(list, id, (g) => ({ ...g, bloques: (g.bloques || []).filter((b) => b.id !== bid) }))
}
export function setBloqueNombre(list: Ingreso[], id: string, bid: string, val: string): Ingreso[] {
  return mapIngreso(list, id, (g) => mapBloque(g, bid, (b) => ({ ...b, nombre: val })))
}

export function agregarModelo(list: Ingreso[], id: string, bid: string, mid: string): Ingreso[] {
  return mapIngreso(list, id, (g) => mapBloque(g, bid, (b) => ({ ...b, modelos: [...(b.modelos || []), { id: mid, model: '' }] })))
}
export function setModelo(list: Ingreso[], id: string, bid: string, mid: string, val: string): Ingreso[] {
  return mapIngreso(list, id, (g) => mapBloque(g, bid, (b) => ({ ...b, modelos: (b.modelos || []).map((m) => (m.id === mid ? { ...m, model: val } : m)) })))
}
export function quitarModelo(list: Ingreso[], id: string, bid: string, mid: string): Ingreso[] {
  return mapIngreso(list, id, (g) =>
    mapBloque(g, bid, (b) => {
      const celdas = { ...b.celdas }
      delete celdas[mid]
      return { ...b, modelos: (b.modelos || []).filter((m) => m.id !== mid), celdas }
    }),
  )
}

export function agregarDiseno(list: Ingreso[], id: string, bid: string, did: string): Ingreso[] {
  return mapIngreso(list, id, (g) => mapBloque(g, bid, (b) => ({ ...b, disenos: [...(b.disenos || []), { id: did, nombre: '', img: '' }] })))
}
export function setDisenoNombre(list: Ingreso[], id: string, bid: string, did: string, val: string): Ingreso[] {
  return mapIngreso(list, id, (g) => mapBloque(g, bid, (b) => ({ ...b, disenos: (b.disenos || []).map((d) => (d.id === did ? { ...d, nombre: val } : d)) })))
}
export function setDisenoImg(list: Ingreso[], id: string, bid: string, did: string, url: string): Ingreso[] {
  return mapIngreso(list, id, (g) => mapBloque(g, bid, (b) => ({ ...b, disenos: (b.disenos || []).map((d) => (d.id === did ? { ...d, img: url } : d)) })))
}
export function quitarDiseno(list: Ingreso[], id: string, bid: string, did: string): Ingreso[] {
  return mapIngreso(list, id, (g) =>
    mapBloque(g, bid, (b) => {
      const celdas: Celdas = {}
      for (const m in b.celdas || {}) {
        const row = { ...b.celdas[m] }
        delete row[did]
        celdas[m] = row
      }
      return { ...b, disenos: (b.disenos || []).filter((d) => d.id !== did), celdas }
    }),
  )
}

/** Setea una celda (n>0 la guarda, si no la borra). Port de ingCelda. */
export function setCelda(list: Ingreso[], id: string, bid: string, mid: string, did: string, val: string | number): Ingreso[] {
  const n = Math.max(0, parseInt(String(val)) || 0)
  return mapIngreso(list, id, (g) =>
    mapBloque(g, bid, (b) => {
      const row = { ...(b.celdas[mid] || {}) }
      if (n > 0) row[did] = n
      else delete row[did]
      return { ...b, celdas: { ...b.celdas, [mid]: row } }
    }),
  )
}

/** Copia la 1ª cantidad cargada de la fila al resto de los diseños. Port de ingFilaIgualar. Devuelve null si no hay ninguna. */
export function filaIgualar(list: Ingreso[], id: string, bid: string, mid: string): Ingreso[] | null {
  const g = list.find((x) => x.id === id)
  const b = g?.bloques.find((x) => x.id === bid)
  if (!b) return null
  const disenos = b.disenos || []
  if (!disenos.length) return null
  let val = 0
  for (const d of disenos) {
    const v = celdaGet(b, mid, d.id)
    if (v > 0) {
      val = v
      break
    }
  }
  if (val <= 0) return null
  return mapIngreso(list, id, (gg) =>
    mapBloque(gg, bid, (bb) => {
      const row: Record<string, number> = {}
      disenos.forEach((d) => (row[d.id] = val))
      return { ...bb, celdas: { ...bb.celdas, [mid]: row } }
    }),
  )
}

/** Misma cantidad en todos los modelos × diseños del bloque (n=0 los borra). Port de ingBloqueIgualar. */
export function bloqueIgualar(list: Ingreso[], id: string, bid: string, n: number): Ingreso[] {
  const q = Math.max(0, n || 0)
  return mapIngreso(list, id, (g) =>
    mapBloque(g, bid, (b) => {
      const celdas: Celdas = {}
      ;(b.modelos || []).forEach((m) => {
        const row: Record<string, number> = {}
        ;(b.disenos || []).forEach((d) => {
          if (q > 0) row[d.id] = q
        })
        celdas[m.id] = row
      })
      return { ...b, celdas }
    }),
  )
}

/** Trae los modelos base que falten al bloque. Port de ingCargarBase. `nid` para los nuevos. */
export function cargarBase(list: Ingreso[], id: string, bid: string, nid: () => string): Ingreso[] {
  return mapIngreso(list, id, (g) =>
    mapBloque(g, bid, (b) => {
      const have = new Set((b.modelos || []).map((m) => (m.model || '').toLowerCase().trim()))
      const faltan = MODELOS_BASE.filter((m) => !have.has(m.toLowerCase())).map((m) => ({ id: nid(), model: m }))
      return { ...b, modelos: [...(b.modelos || []), ...faltan] }
    }),
  )
}

// ── Galería ──────────────────────────────────────────────────────────────────────
export function agregarGaleria(list: Ingreso[], id: string, item: GalleryItem): Ingreso[] {
  return mapIngreso(list, id, (g) => ({ ...g, gallery: [...(g.gallery || []), item] }))
}
export function quitarGaleria(list: Ingreso[], id: string, fid: string): Ingreso[] {
  return mapIngreso(list, id, (g) => ({ ...g, gallery: (g.gallery || []).filter((x) => x.id !== fid) }))
}
