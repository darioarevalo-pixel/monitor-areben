/**
 * Normalización de modelos de iPhone. Port literal de _matchModelo
 * (index.html:2229), que estaba anidada dentro de computarDatos.
 *
 * ⚠️ HAY DOS TAXONOMÍAS DE MODELO EN EL LEGACY Y NO COINCIDEN.
 *
 * `normalizeIphoneModel` (index.html:1848) hace lo mismo con otra tabla y otro
 * algoritmo (igualdad exacta del prefijo más largo, en vez de regex `^`). Difieren:
 *
 *   - a normalizeIphoneModel le faltan: 13 Mini, SE / SE 2 / SE 3, XS Max, 6, 6s,
 *     6 Plus, 6s Plus → devuelve null donde esta función devuelve el modelo;
 *   - escribe 'iPhone Xs' donde esta escribe 'iPhone XS'.
 *
 * Cuál es la correcta es una pregunta abierta, y contestarla es cambiar números
 * en producción. Este archivo porta SOLO _matchModelo, que es la que alimenta el
 * ETL (invByProdModelo). normalizeIphoneModel sigue viva en el legacy y se
 * unifica cuando se migre la sección que la usa, con su propia verificación.
 */

/**
 * Reglas en orden de más específico a más general: gana la primera que matchea,
 * así `^18 pro max` se evalúa antes que `^18`. El orden ES la lógica — no ordenar
 * este array por ningún criterio.
 */
const REGLAS: readonly (readonly [RegExp, string])[] = [
  [/^18 pro max/, 'iPhone 18 Pro Max'], [/^18 air/, 'iPhone 18 Air'], [/^18 pro/, 'iPhone 18 Pro'], [/^18/, 'iPhone 18'],
  [/^17 pro max/, 'iPhone 17 Pro Max'], [/^17 air/, 'iPhone 17 Air'], [/^17 pro/, 'iPhone 17 Pro'], [/^17/, 'iPhone 17'],
  [/^16 pro max/, 'iPhone 16 Pro Max'], [/^16 plus/, 'iPhone 16 Plus'], [/^16 pro/, 'iPhone 16 Pro'], [/^16e/, 'iPhone 16e'], [/^16/, 'iPhone 16'],
  [/^15 pro max/, 'iPhone 15 Pro Max'], [/^15 plus/, 'iPhone 15 Plus'], [/^15 pro/, 'iPhone 15 Pro'], [/^15/, 'iPhone 15'],
  [/^14 pro max/, 'iPhone 14 Pro Max'], [/^14 plus/, 'iPhone 14 Plus'], [/^14 pro/, 'iPhone 14 Pro'], [/^14/, 'iPhone 14'],
  [/^13 pro max/, 'iPhone 13 Pro Max'], [/^13 mini/, 'iPhone 13 Mini'], [/^13 pro/, 'iPhone 13 Pro'], [/^13/, 'iPhone 13'],
  [/^12 pro max/, 'iPhone 12 Pro Max'], [/^12 mini/, 'iPhone 12 Mini'], [/^12 pro/, 'iPhone 12 Pro'], [/^12/, 'iPhone 12'],
  [/^11 pro max/, 'iPhone 11 Pro Max'], [/^11 pro/, 'iPhone 11 Pro'], [/^11/, 'iPhone 11'],
  [/^xs max/, 'iPhone XS Max'], [/^xs/, 'iPhone XS'], [/^xr/, 'iPhone XR'], [/^x(\s|$)/, 'iPhone X'],
  [/^se 3/, 'iPhone SE 3'], [/^se 2/, 'iPhone SE 2'], [/^se/, 'iPhone SE'],
  [/^8 plus/, 'iPhone 8 Plus'], [/^8/, 'iPhone 8'], [/^7 plus/, 'iPhone 7 Plus'], [/^7/, 'iPhone 7'],
  [/^6s plus/, 'iPhone 6s Plus'], [/^6s/, 'iPhone 6s'], [/^6 plus/, 'iPhone 6 Plus'], [/^6/, 'iPhone 6'],
]

/**
 * "iPhone 14 Pro Max - Blanco" → "iPhone 14 Pro Max". Devuelve null si el talle
 * no nombra ningún modelo conocido (es lo normal: la mayoría de los talles de
 * Zattia son S/M/L, no modelos).
 */
export function matchModelo(sizeName: string | null | undefined): string | null {
  if (!sizeName) return null
  let s = sizeName.trim().replace(/^i?phone\s*/i, '')
  s = s.split(' - ')[0].split('/')[0].trim().toLowerCase()
  for (const [re, name] of REGLAS) {
    if (re.test(s)) return name
  }
  return null
}
