/**
 * El diccionario de prendas, con tipos.
 *
 * 🔑 **Las listas no viven acá: viven en `atributos.core.js`.** Este archivo es el re-export
 * tipado, el molde de `lib/tn-desc/formato.ts` sobre `formato.core.js`. El `.js` plano existe
 * porque el que compone el HTML que sale a la tienda es `api/_tn-desc.js`, un handler de `api/`
 * que corre en Node sin pasar por el compilador de Next y **no puede importar TypeScript**.
 *
 * ⚠️ Los tipos se declaran a mano —TS infiere `string[]` de un `.js`— y que no se separen de la
 * implementación lo cuida `tests/tn-desc-atributos.test.ts`, que recorre las listas reales. Es
 * la misma precaución que la unión `Etiqueta` de `formato.ts`: media regla en cada lado no se ve
 * mal de ningún lado.
 */

import {
  ATRIBUTOS as ATRIBUTOS_JS,
  ATRIBUTOS_CERRADOS as ATRIBUTOS_CERRADOS_JS,
  CATEGORIAS_FUERA_DE_ALCANCE as CATEGORIAS_FUERA_JS,
  FAMILIAS as FAMILIAS_JS,
  TELA_SIN_IDENTIFICAR as TELA_SIN_IDENTIFICAR_JS,
  atributosDe as atributosDeJs,
  bulletsDe as bulletsDeJs,
  cargadosDe as cargadosDeJs,
  esValor as esValorJs,
  etiquetaDeBullet as etiquetaDeBulletJs,
  familiaDe as familiaDeJs,
  fueraDeAlcance as fueraDeAlcanceJs,
  normalizarCategoria as normalizarCategoriaJs,
  textoDeBullet as textoDeBulletJs,
  valoresDe as valoresDeJs,
} from './atributos.core.js'

/** Las claves de familia. Se escriben acá para que la pantalla no acepte una inventada. */
export type Familia = 'tops' | 'abrigo' | 'faldas' | 'pantalon' | 'vestidos'

/** Las claves de atributo, en su orden canónico. */
export type Atributo = 'tela' | 'calce' | 'silueta' | 'tiro' | 'escote' | 'manga' | 'largo' | 'detalle'

export type FichaAtributo = {
  label: string
  orden: number
  /** `null` cuando la lista depende de la familia. */
  valores: string[] | null
  /** Sólo `detalle`: texto libre, fuera de todo análisis. */
  libre?: boolean
}

export type FichaFamilia = {
  label: string
  categorias: string[]
  atributos: Atributo[]
  valores?: Partial<Record<Atributo, string[]>>
}

/** Un atributo ya resuelto para una familia: con su lista puesta y listo para dibujar. */
export type AtributoDeFamilia = {
  key: Atributo
  label: string
  libre: boolean
  orden: number
  valores: string[]
}

/** Lo que cargó el local para un producto: `{atributo: valor}`. */
export type Cargados = Partial<Record<Atributo, string>>

export type BulletAtributo = { etiqueta: string; texto: string }

export const ATRIBUTOS = ATRIBUTOS_JS as Record<Atributo, FichaAtributo>
export const ATRIBUTOS_CERRADOS = ATRIBUTOS_CERRADOS_JS as Atributo[]
export const FAMILIAS = FAMILIAS_JS as Record<Familia, FichaFamilia>
export const CATEGORIAS_FUERA_DE_ALCANCE = CATEGORIAS_FUERA_JS as string[]

/** El valor de Tela que significa «alguien lo miró y no supo». Se guarda; no sale a la ficha. */
export const TELA_SIN_IDENTIFICAR: string = TELA_SIN_IDENTIFICAR_JS

export function normalizarCategoria(s: string): string {
  return normalizarCategoriaJs(s)
}

/** La familia de un producto. `null` = le falta la categoría en TiendaNube, y hay que decirlo. */
export function familiaDe(categorias: string[]): Familia | null {
  return familiaDeJs(categorias) as Familia | null
}

export function fueraDeAlcance(categorias: string[]): boolean {
  return fueraDeAlcanceJs(categorias)
}

export function valoresDe(familia: Familia, atributo: Atributo): string[] {
  return valoresDeJs(familia, atributo) as string[]
}

/** Los atributos de una familia, en el orden canónico y con su lista ya resuelta. */
export function atributosDe(familia: Familia | null): AtributoDeFamilia[] {
  return atributosDeJs(familia) as AtributoDeFamilia[]
}

export function esValor(familia: Familia, atributo: Atributo, valor: string): boolean {
  return esValorJs(familia, atributo, valor)
}

export function etiquetaDeBullet(atributo: Atributo, valor: string): string {
  return etiquetaDeBulletJs(atributo, valor)
}

export function textoDeBullet(atributo: Atributo, valor: string): string {
  return textoDeBulletJs(atributo, valor)
}

/** Los bullets de la ficha: deterministas, ordenados y sin nada que validar. */
export function bulletsDe(familia: Familia | null, cargados: Cargados): BulletAtributo[] {
  return bulletsDeJs(familia, cargados) as BulletAtributo[]
}

/** El `4/6` de la fila: cuántos atributos de su familia tiene cargados este producto. */
export function cargadosDe(familia: Familia | null, cargados: Cargados): { con: number; total: number } {
  return cargadosDeJs(familia, cargados) as { con: number; total: number }
}
