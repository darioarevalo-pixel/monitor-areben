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

/** `_etiVariantes` del legacy: `allVariantes` filtradas por barcode y ordenadas. */
export function cargarVariantesLegacy(allVariantes: unknown[]): unknown[] {
  const fuente = extraerBalanceado(html(), '_etiVariantes')
  const fabricar = new Function('allVariantes', `${fuente}\nreturn _etiVariantes();`)
  return fabricar(allVariantes) as unknown[]
}

/**
 * `_etiBuildPrecios` del legacy: corre sobre `allProductos` + `window._mktTNData`
 * (vía `_mktIndexTN`/`_mktFindTN`) y devuelve los mapas de precio y promo.
 */
export function cargarPreciosLegacy(allProductos: unknown[], tnProducts: unknown[]): { precios: Record<string, number>; promos: Record<string, { normal: number; promo: number }> } {
  const fuente = ['_mktIndexTN', '_mktFindTN', '_etiBuildPrecios'].map((n) => extraerBalanceado(html(), n)).join('\n\n')
  const fabricar = new Function(
    'allProductos', 'window',
    `let _etiPrecioMap={},_etiPromoMap={};\n${fuente}\n_etiBuildPrecios();\nreturn { precios: _etiPrecioMap, promos: _etiPromoMap };`,
  )
  return fabricar(allProductos, { _mktTNData: tnProducts }) as { precios: Record<string, number>; promos: Record<string, { normal: number; promo: number }> }
}
