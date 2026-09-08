/**
 * Re-export TIPADO de `prosa.core.js`. La lógica vive en el `.js` porque la necesitan `api/` y
 * `scripts/`, que ⛔ no pueden importar TypeScript; acá sólo viven los tipos. ⛔ No agregar lógica.
 */
import {
  desescapar as desescaparJs,
  prosaDe as prosaDeJs,
  sacarWrappers as sacarWrappersJs,
  sinTablas as sinTablasJs,
  tieneProsa as tieneProsaJs,
} from './prosa.core.js'

export { LARGO_OK, PROSA_INI, PROSA_FIN, ubicarWrapper } from './prosa.core.js'

/** En qué banda cae una ficha. `corta` son las «6 o 7 palabras» que escribe el local. */
export type BandaProsa = 'nada' | 'corta' | 'ok'

export type Prosa = { texto: string; largo: number; banda: BandaProsa }

/** La prosa de una ficha: lo que la clienta lee como descripción, sin la tabla. */
export function prosaDe(raw: string | null | undefined): Prosa {
  return prosaDeJs(raw) as Prosa
}

/** ¿La ficha tiene prosa? El reemplazo honesto de `has_desc` para «¿tiene descripción?». */
export function tieneProsa(raw: string | null | undefined): boolean {
  return tieneProsaJs(raw) as boolean
}

export function desescapar(s: string): string {
  return desescaparJs(s) as string
}

export function sacarWrappers(html: string): string {
  return sacarWrappersJs(html) as string
}

export function sinTablas(raw: string): string {
  return sinTablasJs(raw) as string
}
