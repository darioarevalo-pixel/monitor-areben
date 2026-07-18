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

function html(): string {
  return readFileSync(join(RAIZ, 'index.html'), 'utf8')
}

/**
 * `genTallesHTML` del legacy: se le inyecta el tipo (plantilla), los talles y el
 * gtData; devuelve el HTML que se pega en TN. Es la fuente de verdad de la paridad
 * BYTE-IDÉNTICA. `_gtTipo`/`_gtTalles` se reemplazan por closures sobre los datos
 * inyectados (en el legacy leen el DOM); `esc` viaja en el bundle.
 */
export function genTallesHTMLLegacy(plantilla: unknown, talles: string[], gtData: Record<string, string>): string {
  const fuente = extraerBalanceado(html(), 'genTallesHTML')
  const fabricar = new Function(
    '_gtTipo', '_gtTalles', 'gtData', 'esc',
    `${fuente}\nreturn genTallesHTML();`,
  )
  return fabricar(() => plantilla, () => talles, gtData, escFn()) as string
}

/**
 * `_gtTipoDesdeNombre` del legacy: detecta el tipo por nombre. Usa el global
 * GEN_TALLES_PLANTILLAS (se inyecta el objeto de plantillas real, extraído aparte).
 */
export function tipoDesdeNombreLegacy(name: string, plantillas: Record<string, unknown>): string | null {
  const fuente = extraerBalanceado(html(), '_gtTipoDesdeNombre')
  const fabricar = new Function('GEN_TALLES_PLANTILLAS', 'name', `${fuente}\nreturn _gtTipoDesdeNombre(name);`)
  return fabricar(plantillas, name) as string | null
}

function escFn(): (s: unknown) => string {
  return new Function('s', `return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');`) as (s: unknown) => string
}
