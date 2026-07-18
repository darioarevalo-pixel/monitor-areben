import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

export type LegacyCupones = {
  cuponesEstado: (c: unknown) => string
  _cupDias: (vence: string | undefined) => number | null
  _cupDesc: (c: unknown) => string
}

/**
 * `_cupDias`/`cuponesEstado`/`_cupDesc` del legacy. `_cupDias` lee `hoyISO()`
 * global, que se inyecta fijado al "hoy" del test (así el estado es determinista).
 */
export function cargarCuponesLegacy(hoy: string): LegacyCupones {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = ['_cupDias', 'cuponesEstado', '_cupDesc'].map((n) => extraerBalanceado(html, n)).join('\n\n')
  const fabricar = new Function('hoyISO', `${fuente}\nreturn { cuponesEstado, _cupDias, _cupDesc };`)
  return fabricar(() => hoy) as LegacyCupones
}
