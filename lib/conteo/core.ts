/**
 * Lógica pura del Conteo de local. Port de conteoInit(mapeo)/conteoScan/conteoRender
 * (grupos)/conteoAjusteGN (index.html:11368-11548), sin DOM. El completado del Excel
 * es la superficie sensible (ajusta stock al subirlo a GN) → va con tests.
 */

import { grupoDe, ordenarModelo } from '../reposicion/grupos'
import type { ConteoCount, ConteoVar, FilaInvLocal } from './tipos'

export function normBc(b: unknown): string {
  return String(b || '').trim().toUpperCase()
}

/**
 * Arma las variantes contables desde el inventario del Local, cruzando con los
 * productos activos (los inactivos/borrados se descartan) y agrupando por modelo/
 * categoría. Incluye TODAS las variantes activas (aunque tengan 0) para poder
 * detectar sobrantes. Port de conteoInit @11372-11396.
 */
export function construirVars(
  inventario: FilaInvLocal[],
  prodById: Record<string, { category?: string | null }>,
  catsOff: string[],
): { vars: ConteoVar[]; byBc: Record<string, string> } {
  const map: Record<string, ConteoVar> = {}
  ;(inventario || []).forEach((r) => {
    const pid = String(r.product_id)
    const sid = String(r.size_id)
    const vid = pid + '_' + sid
    const p = prodById[pid]
    if (!p) return
    const q = r.available_quantity || 0
    if (!map[vid]) {
      map[vid] = { vid, pid, name: r.product_name || '—', size: r.size_name || '', barcode: normBc(r.barcode), grupo: grupoDe(r.size_name || '', p.category || '', catsOff), esperado: 0 }
    }
    map[vid].esperado += q
  })
  const vars = Object.values(map)
  const byBc: Record<string, string> = {}
  vars.forEach((v) => {
    if (v.barcode) byBc[v.barcode] = v.vid
  })
  return { vars, byBc }
}

/** vid de un código escaneado (o null). */
export function resolverScan(byBc: Record<string, string>, code: string): string | null {
  return byBc[normBc(code)] || null
}

/** ¿La variante se muestra? (tiene stock de sistema o fue escaneada). Port del filtro `visible`. */
export function visible(v: ConteoVar, count: ConteoCount): boolean {
  return v.esperado > 0 || (count[v.vid] || 0) > 0
}

/** Los grupos visibles, con los iPhone primero (ordenados por modelo). Port del sort de conteoRender @11423. */
export function gruposOrdenados(vars: ConteoVar[], count: ConteoCount): string[] {
  return [...new Set(vars.filter((v) => visible(v, count)).map((v) => v.grupo))].sort((a, b) => {
    const ai = /^iphone/i.test(a)
    const bi = /^iphone/i.test(b)
    if (ai && bi) return ordenarModelo(a, b)
    if (ai) return -1
    if (bi) return 1
    return a.localeCompare(b, 'es')
  })
}

/** Variantes visibles de un grupo (o todas), ordenadas por nombre+talle. Port de la lista de conteoRender @11437. */
export function filtrarVars(vars: ConteoVar[], count: ConteoCount, grupoSel: string): ConteoVar[] {
  return (grupoSel === '__todos__' ? vars : vars.filter((v) => v.grupo === grupoSel))
    .filter((v) => visible(v, count))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es') || (a.size || '').localeCompare(b.size || '', 'es', { numeric: true }))
}

export type ResultadoCompletar =
  | { ok: false; motivo: 'vacio' | 'columnas' | 'sin-filas' }
  | { ok: true; outRows: unknown[][]; ajustadas: number; enGrupos: number }

/**
 * Completa el Excel "Inventario Actual" de GN: para cada fila del Local cuyo barcode
 * matchee una variante de un grupo MARCADO, setea `nuevo_stock = contado` (absoluto)
 * y la conserva; el resto se descarta (GN no toca lo que no está en el archivo). Port
 * BYTE-FIEL de conteoAjusteGN @11505-11533. `aoa` es la hoja ya parseada (header + filas).
 */
export function completarExcel(aoa: unknown[][], vars: ConteoVar[], count: ConteoCount, gruposListos: string[]): ResultadoCompletar {
  if (!aoa.length) return { ok: false, motivo: 'vacio' }
  const hdr = (aoa[0] as unknown[]).map((h) => String(h || '').trim())
  const ci = (n: string) => hdr.indexOf(n)
  const cBc = ci('codigo_barras')
  const cUbi = ci('ubicacion')
  const cNuevo = ci('nuevo_stock')
  const cActual = ci('stock_actual')
  if (cBc < 0 || cUbi < 0 || cNuevo < 0) return { ok: false, motivo: 'columnas' }
  const listos = new Set(gruposListos)
  const byBc: Record<string, ConteoVar> = {}
  vars.forEach((v) => {
    if (v.barcode) byBc[v.barcode] = v
  })
  let ajustadas = 0
  let enGrupos = 0
  const outRows: unknown[][] = [aoa[0]]
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i]
    if (!row) continue
    if (String(row[cUbi] || '').trim().toLowerCase() !== 'local') continue
    const v = byBc[normBc(row[cBc])]
    if (!v) continue
    if (!listos.has(v.grupo)) continue
    enGrupos++
    const contado = count[v.vid] || 0
    const actual = Number(row[cActual] || 0)
    row[cNuevo] = contado
    if (contado !== actual) ajustadas++
    outRows.push(row)
  }
  if (enGrupos === 0) return { ok: false, motivo: 'sin-filas' }
  return { ok: true, outRows, ajustadas, enGrupos }
}

/** Las variantes con diferencia (para el PDF), ordenadas por grupo+nombre. Port de conteoExportPDF @11447. */
export function difsReporte(vars: ConteoVar[], count: ConteoCount): { v: ConteoVar; con: number; dif: number }[] {
  return vars
    .map((v) => ({ v, con: count[v.vid] || 0 }))
    .filter((x) => x.con - x.v.esperado !== 0)
    .map((x) => ({ v: x.v, con: x.con, dif: x.con - x.v.esperado }))
    .sort((a, b) => a.v.grupo.localeCompare(b.v.grupo, 'es') || a.v.name.localeCompare(b.v.name, 'es'))
}
