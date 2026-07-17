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
