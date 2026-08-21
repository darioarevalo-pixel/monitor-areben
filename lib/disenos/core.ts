/**
 * Lógica pura del tablero de diseños: orden y saneado del import. Port de dbOrdenar/dbImportar
 * (index.html:3510/3647).
 *
 * ⛔ Acá **no** está la votación por link: eso es `votacion.core.js`, y a propósito no vuelca nada
 * sobre el documento del diseño. El tally que vivía acá pisaba los `up`/`down` que el equipo pone
 * a mano en la oficina cada vez que se traían los votos online — dos votaciones distintas
 * tapándose una a la otra.
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
