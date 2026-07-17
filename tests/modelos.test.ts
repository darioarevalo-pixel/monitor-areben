import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { matchModelo } from '@/lib/etl/modelos'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Las taxonomías de modelo de iPhone. Hay TRES implementaciones de "lo mismo":
 *
 *   1. `matchModelo` (lib/etl/modelos.ts) — port de _matchModelo (index.html:2229).
 *      Alimenta el ETL: invByProdModelo, o sea el stock por modelo.
 *   2. `normalize_iphone_model` — en SQL (sql/vistas-materializadas.sql:8).
 *      Construye la vista fundas_por_modelo_mes, que el ETL consume como vmFundas.
 *   3. `normalizeIphoneModel` (index.html:1848) — la usa el modulo Fundas (3270, 3302).
 *
 * **1 y 2 coinciden**: verificado llamando la funcion SQL real por RPC contra los
 * 1044 talles distintos de BDI. Cero divergencias. Es importante que siga asi: el
 * ETL cruza el stock (que calcula con 1) contra las ventas de vmFundas (que vienen
 * de 2). Si divergen, el cruce falla en silencio.
 *
 * **3 diverge de las otras dos, y es un bug en produccion, no deuda de migracion.**
 * Los casos de abajo salen de datos reales.
 */
describe('matchModelo: el contrato que comparte con el SQL', () => {
  it.each([
    ['iPhone 14 Pro Max - Blanco', 'iPhone 14 Pro Max'],
    ['iPhone 14 Pro Max', 'iPhone 14 Pro Max'],
    ['14 Pro Max', 'iPhone 14 Pro Max'],
    ['iphone 14 pro max', 'iPhone 14 Pro Max'],
    ['iPhone 12 / 12 Pro', 'iPhone 12'],       // combinados: gana el primero
    ['iPhone 13 mini / 13', 'iPhone 13 Mini'],
    ['iPhone 16e', 'iPhone 16e'],
    ['iPhone Xs Max', 'iPhone XS Max'],
    ['iPhone X', 'iPhone X'],
    ['iPhone XR', 'iPhone XR'],
    ['iPhone SE 3', 'iPhone SE 3'],
    ['iPhone 6s Plus', 'iPhone 6s Plus'],
  ])('%s → %s', (entrada, esperado) => {
    expect(matchModelo(entrada)).toBe(esperado)
  })

  it('lo que no nombra un modelo da null (la mayoria de los talles de Zattia son S/M/L)', () => {
    expect(matchModelo('M')).toBeNull()
    expect(matchModelo('Talle Unico')).toBeNull()
    expect(matchModelo('')).toBeNull()
    expect(matchModelo(null)).toBeNull()
    expect(matchModelo(undefined)).toBeNull()
  })

  // El orden del array ES la logica: si '^16' se evaluara antes que '^16 pro max',
  // todos los 16 Pro Max caerian en 'iPhone 16'.
  it('gana la regla mas especifica, no la primera que se parece', () => {
    expect(matchModelo('16 Pro Max')).toBe('iPhone 16 Pro Max')
    expect(matchModelo('16 Plus')).toBe('iPhone 16 Plus')
    expect(matchModelo('16')).toBe('iPhone 16')
    expect(matchModelo('X')).toBe('iPhone X')      // no 'XS' ni 'XR'
    expect(matchModelo('XS Max')).toBe('iPhone XS Max')
  })
})

/**
 * Divergencias medidas contra los 1044 talles reales de BDI (16-jul-2026):
 * 8 talles, 1022 unidades vendidas. Fundas mete el 13 Mini adentro del iPhone 13
 * y colapsa el XS Max en 'iPhone Xs' — una categoria que no existe en ninguna otra
 * parte del sistema (las otras dos escriben 'XS').
 *
 * El test NO dice cual esta bien: congela la diferencia para que unificar sea una
 * decision con numeros y no un descubrimiento a mitad del port de Fundas.
 */
describe('normalizeIphoneModel (modulo Fundas) diverge — casos reales', () => {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const lineas = html.split('\n')
  const ini = lineas.findIndex((l) => l.startsWith('function normalizeIphoneModel('))
  const fin = lineas.findIndex((l, i) => i > ini && l === '}')
  const normalizeIphoneModel = new Function(
    `${lineas.slice(ini, fin + 1).join('\n')}\nreturn normalizeIphoneModel;`,
  )() as (s: string) => string | null

  it('sigue existiendo en el legacy (si esto falla, alguien ya la unifico)', () => {
    expect(ini).toBeGreaterThan(-1)
  })

  it.each([
    ['iPhone 13 mini / 13', 'iPhone 13 Mini', 'iPhone 13', 960],
    ['iPhone 13 Mini', 'iPhone 13 Mini', 'iPhone 13', 18],
    ['iPhone Xs Max/11 Pro Max', 'iPhone XS Max', 'iPhone Xs', 14],
    ['iPhone Xs Max', 'iPhone XS Max', 'iPhone Xs', 12],
    ['iPhone Xs Max Amarilla', 'iPhone XS Max', 'iPhone Xs', 7],
    ['iPhone Xs Max/ 11 Pro Max', 'iPhone XS Max', 'iPhone Xs', 5],
    ['iPhone 13 mini', 'iPhone 13 Mini', 'iPhone 13', 3],
    ['iPhone Xs Max Negra', 'iPhone XS Max', 'iPhone Xs', 3],
  ])('%s: ETL dice %s, Fundas dice %s (%i unidades)', (talle, etl, fundas) => {
    expect(matchModelo(talle)).toBe(etl)
    expect(normalizeIphoneModel(talle)).toBe(fundas)
  })

  // El comentario del port decia que a esta tabla le faltaban 6/6s/6 Plus/6s Plus.
  // No es cierto: estan. Lo que falta de verdad es 13 Mini, SE* y XS Max.
  it('los 6 NO son una divergencia: las dos tablas los tienen', () => {
    for (const t of ['6', '6s', '6 Plus', '6s Plus']) {
      expect(normalizeIphoneModel(t)).toBe(matchModelo(t))
    }
  })

  it('SE: el ETL lo reconoce y Fundas no (sin datos hoy, pero la tabla difiere)', () => {
    expect(matchModelo('SE 2')).toBe('iPhone SE 2')
    expect(normalizeIphoneModel('SE 2')).toBeNull()
  })
})

/**
 * ⏰ BUG LATENTE CON FECHA: el SQL no conoce el iPhone 18.
 *
 * matchModelo y normalizeIphoneModel tienen las 4 reglas del 18; la funcion SQL
 * (sql/vistas-materializadas.sql:8) no. Y la vista filtra con
 * `AND normalize_iphone_model(d.size) IS NOT NULL` (linea 141): lo que el SQL no
 * reconoce, **no entra en fundas_por_modelo_mes**.
 *
 * Hoy no molesta — no hay un solo talle de iPhone 18 en los datos (verificado). El
 * dia que BDI cargue fundas del 18, el stock va a existir (lo calcula el JS) y las
 * ventas van a valer cero (el SQL las filtra): fundas nuevas que parecen no
 * venderse nunca. No falla nada, solo miente.
 *
 * Se arregla agregando las 4 reglas del 18 a la funcion SQL y refrescando la vista.
 */
describe('el iPhone 18 y el SQL', () => {
  it('el JS ya conoce el 18', () => {
    expect(matchModelo('iPhone 18 Pro Max')).toBe('iPhone 18 Pro Max')
    expect(matchModelo('18 Air')).toBe('iPhone 18 Air')
  })

  it('la funcion SQL no: si esto falla, alguien la actualizo y este test sobra', () => {
    const sql = readFileSync(join(RAIZ, 'sql', 'vistas-materializadas.sql'), 'utf8')
    const cuerpo = sql.split('CREATE OR REPLACE FUNCTION normalize_iphone_model')[1]?.split('$$;')[0] ?? ''
    expect(cuerpo).toContain("'^17 pro max'")
    expect(cuerpo).not.toContain("'^18")
  })
})
