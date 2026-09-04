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
  NO_APLICA as NO_APLICA_JS,
  TELA_SIN_IDENTIFICAR as TELA_SIN_IDENTIFICAR_JS,
  TELAS as TELAS_JS,
  telasDe as telasDeJs,
  sinTela as sinTelaJs,
  MAX_PROPUESTA as MAX_PROPUESTA_JS,
  atributosDe as atributosDeJs,
  atributosExtra as atributosExtraJs,
  esPalabraPropuesta as esPalabraPropuestaJs,
  normalizarPropuesta as normalizarPropuestaJs,
  propuestasDe as propuestasDeJs,
  bulletsDe as bulletsDeJs,
  cargadosDe as cargadosDeJs,
  esValor as esValorJs,
  etiquetaDeBullet as etiquetaDeBulletJs,
  familiaDe as familiaDeJs,
  fueraDeAlcance as fueraDeAlcanceJs,
  normalizarCategoria as normalizarCategoriaJs,
  opcionesDe as opcionesDeJs,
  textoDeBullet as textoDeBulletJs,
  valoresDe as valoresDeJs,
  valoresPrestados as valoresPrestadosJs,
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

/** Lo que ofrece un desplegable: la lista propia, la prestada y si va «no aplica». */
export type OpcionesAtributo = { propios: string[]; prestados: string[]; noAplica: boolean }

/** Lo que cargó el local para un producto: `{atributo: valor}`. */
export type Cargados = Partial<Record<Atributo, string>>

export type BulletAtributo = { etiqueta: string; texto: string }

export const ATRIBUTOS = ATRIBUTOS_JS as Record<Atributo, FichaAtributo>
export const ATRIBUTOS_CERRADOS = ATRIBUTOS_CERRADOS_JS as Atributo[]
export const FAMILIAS = FAMILIAS_JS as Record<Familia, FichaFamilia>
export const CATEGORIAS_FUERA_DE_ALCANCE = CATEGORIAS_FUERA_JS as string[]

/** El valor de Tela que significa «alguien lo miró y no supo». Se guarda; no sale a la ficha. */
export const TELA_SIN_IDENTIFICAR: string = TELA_SIN_IDENTIFICAR_JS

/** Las telas de la lista cerrada. Las piden los dos casilleros de tela, `tela` y `tela2`. */
export const TELAS: string[] = TELAS_JS as string[]

/** Las telas cargadas de un producto (las dos), sin las vacías ni «no identifico». */
export function telasDe(cargados: Cargados): string[] {
  return telasDeJs(cargados) as string[]
}

/**
 * ⛔ ¿Esta prenda NO tiene tela? Sin tela ⛔ no se redacta ni se publica: la tela es la que decide
 * los cuidados (decisión de Bruno, 4-sep-2026).
 */
export function sinTela(cargados: Cargados): boolean {
  return sinTelaJs(cargados) as boolean
}

/** «Esta prenda no tiene eso». Vale en todo atributo cerrado salvo Tela; se guarda y no sale. */
export const NO_APLICA: string = NO_APLICA_JS

/** El largo máximo de una palabra propuesta: es una etiqueta, no una descripción. */
export const MAX_PROPUESTA: number = MAX_PROPUESTA_JS

/** Una palabra que alguien propuso y que todavía ⛔ no está en ninguna lista. */
export type Propuesta = { atributo: Atributo; label: string; valor: string }

/** ¿Tiene FORMA de palabra del diccionario? ⛔ No dice que sea buena: eso lo decide Bruno. */
export function esPalabraPropuesta(valor: string): boolean {
  return esPalabraPropuestaJs(valor)
}

/** Minúsculas y un solo espacio: «Wide Leg» y «wide leg » ⛔ no pueden ser dos filas. */
export function normalizarPropuesta(valor: string): string {
  return normalizarPropuestaJs(valor) as string
}

/** Las palabras propuestas de un producto: las que ⛔ no están en ninguna lista. */
export function propuestasDe(familia: Familia | null, cargados: Cargados): Propuesta[] {
  return propuestasDeJs(familia, cargados) as Propuesta[]
}

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

/** Los valores que ese atributo tiene en las otras familias, sin repetir los propios. */
export function valoresPrestados(familia: Familia, atributo: Atributo): string[] {
  return valoresPrestadosJs(familia, atributo) as string[]
}

/** Lo que dibuja el desplegable: propios, prestados de otras prendas y «no aplica». */
export function opcionesDe(familia: Familia, atributo: Atributo): OpcionesAtributo {
  return opcionesDeJs(familia, atributo) as OpcionesAtributo
}

/** Los atributos que la familia NO pide, para el «+ agregar un dato». */
export function atributosExtra(familia: Familia | null): AtributoDeFamilia[] {
  return atributosExtraJs(familia) as AtributoDeFamilia[]
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
