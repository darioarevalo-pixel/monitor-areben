/**
 * Normalización de modelos de iPhone. Port literal de _matchModelo
 * (index.html:2229), que estaba anidada dentro de computarDatos.
 *
 * ⚠️ HAY TRES TAXONOMÍAS DE MODELO Y UNA DIVERGE. Medido contra los 1044 talles
 * distintos de BDI el 16-jul-2026 (ver tests/modelos.test.ts):
 *
 *   1. Esta función — alimenta el ETL (invByProdModelo: el stock por modelo).
 *   2. `normalize_iphone_model` en SQL (sql/vistas-materializadas.sql:8) — construye
 *      la vista fundas_por_modelo_mes, que el ETL consume como vmFundas.
 *   3. `normalizeIphoneModel` (index.html:1848) — la usa el módulo Fundas (3270, 3302).
 *
 * **1 y 2 coinciden: cero divergencias sobre los 1044 talles** (verificado llamando la
 * función SQL real por RPC, no leyéndola). Que sigan coincidiendo importa: el ETL cruza
 * el stock que calcula ACÁ contra las ventas que vienen del SQL. Si divergen, el cruce
 * falla sin avisar. Tocar una es tocar la otra.
 *
 * **3 diverge: 8 talles, 1022 unidades vendidas.** Usa igualdad exacta del prefijo más
 * largo en vez de regex `^`, y su tabla no tiene `13 mini`, `se*` ni `xs max`. Resultado:
 * mete el 13 Mini adentro de 'iPhone 13' y colapsa el XS Max en 'iPhone Xs' — categoría
 * que no existe en 1 ni en 2 (las dos escriben 'XS'). **No es deuda de migración: son
 * números mal en producción hoy.** Unificar es cambiar lo que Fundas muestra, así que es
 * decisión de producto y va con su propia verificación, antes de portar Fundas (Fase 5).
 *
 * (El comentario anterior decía que a `normalizeIphoneModel` le faltaban 6/6s/6 Plus/
 * 6s Plus. Es falso, están: verificado en el test.)
 *
 * ⏰ **El SQL no conoce el iPhone 18** y la vista filtra lo que no reconoce
 * (`IS NOT NULL`, línea 141). Hoy no hay un solo talle del 18 en los datos; cuando los
 * haya, el stock va a existir y las ventas van a dar cero. Se arregla en el SQL.
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
