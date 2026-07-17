import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { DatosDemanda, ResultadoDemanda } from '@/lib/fundas/tipos'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Extrae una función top-level del <script> de index.html. Misma técnica que
 * `tests/legacy-etl.ts`: se apoya en que las funciones abren con `function nombre(`
 * en la columna 0 y cierran con un `}` solo, también en columna 0. Si el legacy se
 * reindenta, tira error en vez de extraer de menos.
 */
function extraerFuncion(fuente: string, nombre: string): string {
  const lineas = fuente.split('\n')
  const inicio = lineas.findIndex((l) => l.startsWith(`function ${nombre}(`))
  if (inicio === -1) throw new Error(`No encontré 'function ${nombre}(' en columna 0 de index.html`)
  const fin = lineas.findIndex((l, i) => i > inicio && l === '}')
  if (fin === -1) throw new Error(`No encontré el cierre de ${nombre} ('}' en columna 0)`)
  return lineas.slice(inicio, fin + 1).join('\n')
}

/**
 * Devuelve el `fmDemandaPorModelo` del legacy, listo para invocar.
 *
 * Toca 5 globales por `window.*` (allVentas, allDetalles, _invDepoMin, _prodMeta,
 * _fmKeyPids) y `Date.now()`. Los globales viajan por el `window` inyectado; el
 * reloj lo congela el test con fake timers, así el legacy (Date.now) y el port
 * (today) miran el mismo instante.
 *
 * Trae también las funciones que llama: `_esMayorista`, `normalizeIphoneModel` y
 * `_matchModelo` (la taxonomía, que `normalizeIphoneModel` aliasea). Si alguna
 * dejara de estar en columna 0, esto tira error en vez de comparar contra algo
 * que no existe.
 */
export function cargarDemandaLegacy(window: Record<string, unknown>) {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = ['_matchModelo', '_esMayorista', 'normalizeIphoneModel', 'fmDemandaPorModelo']
    .map((n) => extraerFuncion(html, n))
    .join('\n\n')
  const fabricar = new Function('window', `${fuente}\nreturn fmDemandaPorModelo;`)
  return fabricar(window) as (cutoff: string, K: number, corte: unknown) => ResultadoDemanda
}

/** Arma el `window` que el legacy espera a partir del `DatosDemanda` del port. */
export function windowDeLegacy(datos: DatosDemanda): Record<string, unknown> {
  return {
    allVentas: datos.allVentas,
    allDetalles: datos.allDetalles,
    _invDepoMin: datos.invDepoMin,
    _prodMeta: datos.prodMeta,
    _fmKeyPids: datos.fmKeyPids,
  }
}

/**
 * Devuelve `fmSimRepartir` y `fmComputeFrom` del legacy. Son puras (sin DOM ni
 * globales; fmComputeFrom llama a fmSimRepartir, que viaja en el mismo bundle).
 * No necesitan fixture: se comparan con casos armados a mano.
 */
export function cargarSimLegacy(): {
  fmSimRepartir: (total: number, pcts: number[]) => number[]
  fmComputeFrom: (total: number, rows: unknown[], vars: unknown[], varOn: boolean) => unknown[]
} {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = ['fmSimRepartir', 'fmComputeFrom'].map((n) => extraerFuncion(html, n)).join('\n\n')
  const fabricar = new Function(`${fuente}\nreturn { fmSimRepartir, fmComputeFrom };`)
  return fabricar()
}
