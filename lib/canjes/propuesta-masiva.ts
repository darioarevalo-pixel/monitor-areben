/**
 * Proponerle **el mismo** canje a varias personas: misma marca, misma vitrina, mismo tope y los
 * mismos entregables. Lo único que cambia por fila es de quién es — y con eso, su link, su cantidad
 * y sus datos prellenados.
 *
 * Acá vive lo que se puede probar sin montar nada: separar a quiénes se puede proponer, y armar los
 * textos con los plurales resueltos fuera del JSX (mismo criterio que `haceCuanto` en el padrón).
 * Quien decide de verdad quién entra es el servidor.
 */

import type { CanjePersona } from './tipos'

/**
 * Cuántos canjes se pueden crear de una sola vez.
 *
 * ⚠️ Espejo de `TOPE_CANJES_LOTE` en `api/_canjes.js`, que es el que lo hace cumplir. Acá está para
 * poder avisarlo antes de mandar, no para reemplazarlo.
 */
export const TOPE_CANJES_LOTE = 25

/**
 * A quiénes se les puede proponer y a quiénes no.
 *
 * El veto se filtra acá **sólo para no mandar a alguien contra un 403 que ya sabemos**: es
 * transversal a las marcas y el servidor lo vuelve a chequear. El bloqueo por vencidos no se puede
 * anticipar desde el browser —hace falta ver los canjes de todas las marcas— y por eso el lote
 * siempre puede volver con rechazadas que la pantalla no había previsto.
 */
export function separarSeleccion<T extends Pick<CanjePersona, 'id' | 'vetada'>>(
  personas: T[],
): { aptas: T[]; vetadas: T[] } {
  return {
    aptas: personas.filter((p) => !p.vetada),
    vetadas: personas.filter((p) => p.vetada),
  }
}

export type ResumenDelLote = {
  creados: number
  rechazadas: number
  errores: number
}

/**
 * Cómo salió, en una línea. Los plurales se resuelven acá y no en el JSX: "1 canjes" es el tipo de
 * detalle que hace que una pantalla se lea como un borrador.
 */
export function textoDelResultado(r: ResumenDelLote): string {
  const partes: string[] = []
  partes.push(r.creados === 1 ? 'Se armó 1 canje' : `Se armaron ${r.creados} canjes`)
  if (r.rechazadas) partes.push(r.rechazadas === 1 ? '1 quedó afuera' : `${r.rechazadas} quedaron afuera`)
  if (r.errores) partes.push(r.errores === 1 ? '1 falló' : `${r.errores} fallaron`)
  return partes.join(' · ') + '.'
}

/** "3 personas" / "1 persona". */
export function cuantasPersonas(n: number): string {
  return n === 1 ? '1 persona' : `${n} personas`
}
