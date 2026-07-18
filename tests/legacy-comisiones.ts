import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ComCfg } from '@/lib/comisiones/tipos'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

function extraerBalanceado(fuente: string, nombre: string): string {
  let inicio = -1
  for (const marca of [`function ${nombre}(`, `async function ${nombre}(`]) {
    const i = fuente.startsWith(marca) ? 0 : fuente.indexOf('\n' + marca)
    if (i !== -1) {
      inicio = i === 0 ? 0 : i + 1
      break
    }
  }
  if (inicio === -1) throw new Error(`No encontré 'function ${nombre}(' en columna 0 de index.html`)
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

export type LegacyComisiones = {
  comCalcular: (costoNeto: number, pvp: number, forma: string, canal: string) => Record<string, number>
  comAC: (costoNeto: number, forma: string, canal: string) => { A: number; C: number; de: number }
  comBreakevenMarkup: (costoNeto: number, forma: string, canal: string) => number | null
  comPisoPvp: (costoNeto: number, m: number, forma: string, canal: string) => number | null
}

/**
 * Las 4 funciones de cálculo de Comisiones tal como están en index.html, con el
 * global `comCfg` inyectado. Son la fuente de verdad de la paridad (cálculo de plata).
 */
export function cargarComisionesLegacy(comCfg: ComCfg): LegacyComisiones {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = ['comCalcular', 'comAC', 'comBreakevenMarkup', 'comPisoPvp'].map((n) => extraerBalanceado(html, n)).join('\n\n')
  const fabricar = new Function('comCfg', `${fuente}\nreturn { comCalcular, comAC, comBreakevenMarkup, comPisoPvp };`)
  return fabricar(comCfg) as LegacyComisiones
}
