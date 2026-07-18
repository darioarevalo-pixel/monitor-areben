/**
 * Lógica pura del tablero de diseños: orden, tally de la votación online y
 * saneado del import. Port de dbOrdenar/dbVotTraer(tally)/dbImportar(limpio)
 * (index.html:3510/3609/3647).
 */

import type { Diseno, EstadoDiseno, OrdenDiseno } from './tipos'

/** Copia ordenada según el criterio (no toca el orden guardado). Port de dbOrdenar. */
export function ordenar(arr: Diseno[], orden: OrdenDiseno): Diseno[] {
  const a = arr.slice()
  const nm = (x: Diseno, y: Diseno) => (x.name || '').localeCompare(y.name || '', 'es')
  if (orden === 'tildes') a.sort((x, y) => (y.up || 0) - (x.up || 0) || nm(x, y))
  else if (orden === 'cruces') a.sort((x, y) => (y.down || 0) - (x.down || 0) || nm(x, y))
  else if (orden === 'saldo') a.sort((x, y) => (y.up || 0) - (y.down || 0) - ((x.up || 0) - (x.down || 0)) || nm(x, y))
  return a
}

/** Una boleta de votación online. */
export type Boleta = { name?: string; votes?: Record<string, 'up' | 'down'> }

/** Cuenta los votos de las boletas por designId. Port del tally de dbVotTraer @3609-3610. */
export function tallyVotos(ballots: Boleta[]): Record<string, { up: number; down: number }> {
  const tally: Record<string, { up: number; down: number }> = {}
  ;(ballots || []).forEach((b) =>
    Object.entries(b.votes || {}).forEach(([did, v]) => {
      tally[did] = tally[did] || { up: 0, down: 0 }
      if (v === 'up') tally[did].up++
      else if (v === 'down') tally[did].down++
    }),
  )
  return tally
}

/** Vuelca el tally sobre los diseños (up/down). Port de dbVotTraer @3611. */
export function aplicarTally(disenos: Diseno[], tally: Record<string, { up: number; down: number }>): Diseno[] {
  return disenos.map((d) => {
    const t = tally[d.id] || { up: 0, down: 0 }
    return { ...d, up: t.up, down: t.down }
  })
}

/** Sanea un tablero importado: descarta lo inválido, normaliza estados/votos. Port de dbImportar @3647. */
export function sanearImportado(data: unknown, nuevoId: () => string): Diseno[] {
  if (!Array.isArray(data)) return []
  const estados: EstadoDiseno[] = ['revisar', 'confirmado', 'duda', 'rechazado']
  return data
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && typeof (d as { url?: unknown }).url === 'string')
    .map((d) => ({
      id: (d.id as string) || nuevoId(),
      name: (d.name as string) || '',
      url: d.url as string,
      nota: (d.nota as string) || '',
      up: +(d.up as number) || 0,
      down: +(d.down as number) || 0,
      estado: estados.includes(d.estado as EstadoDiseno) ? (d.estado as EstadoDiseno) : 'revisar',
    }))
}

export function contarPorEstado(disenos: Diseno[], estado: EstadoDiseno): number {
  return disenos.filter((d) => d.estado === estado).length
}
