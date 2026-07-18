/**
 * Listas de modelos de iPhone para Ingresos. Port de ING_MODELOS_BASE
 * (index.html:3970, la base fija que carga cada bloque nuevo) y de FM_MODELOS
 * (index.html:4498, el datalist de autocompletado del input de modelo — el mismo
 * `fm-sim-modelos` que reusa el legacy en la grilla de ingresos).
 */

/** Base fija que trae cada bloque nuevo (iPhone 13 → 17 Pro Max, sin Plus/mini/Air). */
export const MODELOS_BASE = [
  'iPhone 13', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
  'iPhone 14', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
  'iPhone 15', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
  'iPhone 16', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
  'iPhone 17', 'iPhone 17 Pro', 'iPhone 17 Pro Max',
]

/** Lista amplia para el autocompletado (datalist) del input de modelo. */
export const MODELOS_AUTOCOMPLETE = [
  'iPhone 18', 'iPhone 18 Air', 'iPhone 18 Pro', 'iPhone 18 Pro Max',
  'iPhone 17', 'iPhone 17 Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max',
  'iPhone 16', 'iPhone 16e', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
  'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
  'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
  'iPhone 13', 'iPhone 13 Mini', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
  'iPhone 12', 'iPhone 12 Mini', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
  'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max',
  'iPhone XR', 'iPhone XS Max', 'iPhone XS', 'iPhone X',
  'iPhone SE 3', 'iPhone SE 2', 'iPhone 8 Plus', 'iPhone 8',
]
