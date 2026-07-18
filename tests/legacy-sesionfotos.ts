import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Fase, Solicitud } from '@/lib/sesionfotos/tipos'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Extrae una función top-level del <script> de index.html balanceando llaves
 * desde `function nombre(`. A diferencia de `extraerFuncion` (tests/legacy-etl.ts),
 * este soporta las de una sola línea (sfFaltantes, sfSalio cierran en la misma
 * línea, no con `}` en columna 0). Si no encuentra el nombre en columna 0, tira
 * error en vez de comparar contra algo que no existe.
 */
function extraerBalanceado(fuente: string, nombre: string): string {
  const marca = `function ${nombre}(`
  const inicio = fuente.indexOf('\n' + marca) === -1
    ? (fuente.startsWith(marca) ? 0 : -1)
    : fuente.indexOf('\n' + marca) + 1
  if (inicio === -1) throw new Error(`No encontré '${marca}' en columna 0 de index.html`)
  const llaveAbre = fuente.indexOf('{', inicio)
  let prof = 0
  for (let i = llaveAbre; i < fuente.length; i++) {
    if (fuente[i] === '{') prof++
    else if (fuente[i] === '}') {
      prof--
      if (prof === 0) return fuente.slice(inicio, i + 1)
    }
  }
  throw new Error(`No pude balancear las llaves de ${nombre}`)
}

export type LegacySF = {
  sfFaltantes: (s: Solicitud) => Array<{ vid: string; falta: number; qty: number }>
  sfSalio: (s: Solicitud) => boolean
  sfFaseCompleta: (s: Solicitud, fase: Fase) => boolean
}

/**
 * Devuelve las funciones puras de Sesión de fotos tal como están en index.html.
 * Las tres son puras (sin DOM ni globales), así que se fabrican juntas y se
 * comparan contra casos armados a mano — no necesitan fixture del KV.
 */
export function cargarSesionFotosLegacy(): LegacySF {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = ['sfFaltantes', 'sfSalio', 'sfFaseCompleta']
    .map((n) => extraerBalanceado(html, n))
    .join('\n\n')
  const fabricar = new Function(`${fuente}\nreturn { sfFaltantes, sfSalio, sfFaseCompleta };`)
  return fabricar() as LegacySF
}

export type LegacyCombi = {
  _sfCombiAgg: (ids: string[], origen: string, fase: string) => Array<{ vid?: string; nombre: string; variante: string; sku: string; ped: number; conf: number; manual?: boolean; solId?: string }>
  sfFaseCompletaCombi: (ids: string[], fase: string) => boolean
}

/**
 * `_sfCombiAgg` y `sfFaseCompletaCombi` del legacy, que leen el global `sfData`
 * (inyectado por parámetro) y llaman a `sfFaseCompleta` (viaja en el bundle).
 */
export function cargarCombinadaLegacy(sfData: Solicitud[]): LegacyCombi {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = ['sfFaseCompleta', '_sfCombiAgg', 'sfFaseCompletaCombi']
    .map((n) => extraerBalanceado(html, n))
    .join('\n\n')
  const fabricar = new Function('sfData', `${fuente}\nreturn { _sfCombiAgg, sfFaseCompletaCombi };`)
  return fabricar(sfData) as LegacyCombi
}

/**
 * `sfBcVid` del legacy: código de barras → vid. Usa `_sfNormBc`, el global
 * `allVariantes` (inyectado) y cachea en `window._sfBc` (se le pasa un window
 * mutable de mentira). Cada variante es `{id, barcode}`.
 */
export function cargarBcVidLegacy(allVariantes: Array<{ id: string; barcode?: string | null }>): (code: string) => string | null {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = ['_sfNormBc', 'sfBcVid'].map((n) => extraerBalanceado(html, n)).join('\n\n')
  const fabricar = new Function('allVariantes', 'window', `${fuente}\nreturn sfBcVid;`)
  return fabricar(allVariantes, {}) as (code: string) => string | null
}
