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
 * UNIFICADAS (16-jul-2026). Antes `normalizeIphoneModel` tenia su propia tabla y
 * divergia en 8 talles / 1022 unidades vendidas: metia el 13 Mini adentro de
 * 'iPhone 13' y colapsaba el XS Max en 'iPhone Xs'. Ahora delega en _matchModelo,
 * que es la unica taxonomia del sistema.
 *
 * Los casos de abajo son los talles reales que ANTES divergian. Siguen aca, dados
 * vuelta: ahora exigen que las dos den lo mismo. Si alguien vuelve a duplicar la
 * tabla, estos tests lo cazan con los datos que lo destaparon.
 */
describe('normalizeIphoneModel (modulo Fundas) ya no diverge', () => {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const lineas = html.split('\n')

  const trozo = (nombre: string) => {
    const desde = lineas.findIndex((l) => l.startsWith(`function ${nombre}(`))
    const hasta = lineas.findIndex((l, i) => i > desde && l === '}')
    if (desde === -1) throw new Error(`No encontré 'function ${nombre}(' en index.html`)
    return lineas.slice(desde, hasta + 1).join('\n')
  }

  // Las dos juntas: normalizeIphoneModel delega en _matchModelo, así que sola no corre.
  // Que haga falta traer _matchModelo ES la prueba de que ya no duplica la tabla.
  const ini = lineas.findIndex((l) => l.startsWith('function normalizeIphoneModel('))
  const fin = lineas.findIndex((l, i) => i > ini && l === '}')
  const normalizeIphoneModel = new Function(
    `${trozo('_matchModelo')}\n${trozo('normalizeIphoneModel')}\nreturn normalizeIphoneModel;`,
  )() as (s: string) => string | null

  it('sigue existiendo: Fundas la llama por nombre (index.html:3270, 3302)', () => {
    expect(ini).toBeGreaterThan(-1)
  })

  // Los 8 talles reales que divergian, con las unidades que estaban mal agrupadas.
  it.each([
    ['iPhone 13 mini / 13', 'iPhone 13 Mini', 960],
    ['iPhone 13 Mini', 'iPhone 13 Mini', 18],
    ['iPhone Xs Max/11 Pro Max', 'iPhone XS Max', 14],
    ['iPhone Xs Max', 'iPhone XS Max', 12],
    ['iPhone Xs Max Amarilla', 'iPhone XS Max', 7],
    ['iPhone Xs Max/ 11 Pro Max', 'iPhone XS Max', 5],
    ['iPhone 13 mini', 'iPhone 13 Mini', 3],
    ['iPhone Xs Max Negra', 'iPhone XS Max', 3],
  ])('%s → %s en las dos (antes Fundas lo agrupaba mal: %i unidades)', (talle, esperado) => {
    expect(matchModelo(talle)).toBe(esperado)
    expect(normalizeIphoneModel(talle)).toBe(esperado)
  })

  // 'iPhone Xs' era una categoria inventada por la tabla vieja: no existe en el
  // ETL ni en el SQL, que escriben 'XS'. No puede volver.
  it("'iPhone Xs' no existe mas como categoria", () => {
    for (const t of ['iPhone Xs Max', 'Xs Max', 'iPhone Xs Max Negra']) {
      expect(normalizeIphoneModel(t)).not.toBe('iPhone Xs')
    }
  })

  it('SE y 13 Mini: los reconocen las dos', () => {
    for (const t of ['SE', 'SE 2', 'SE 3', '13 Mini', 'XS Max']) {
      expect(normalizeIphoneModel(t)).toBe(matchModelo(t))
      expect(normalizeIphoneModel(t)).not.toBeNull()
    }
  })

  it('una sola tabla: la de Fundas delega, no duplica', () => {
    const cuerpo = lineas.slice(ini, fin + 1).join('\n')
    expect(cuerpo).toContain('_matchModelo(size)')
    expect(cuerpo).not.toContain('pro max') // si vuelve una tabla propia, falla
  })
})

/**
 * El JS y el SQL tienen que conocer los MISMOS modelos, en el mismo orden.
 *
 * No es prolijidad: el ETL cruza el stock por modelo (que sale de _matchModelo,
 * sobre `inventario`) contra las ventas por modelo (que salen de la vista
 * fundas_por_modelo_mes, o sea del SQL). Un modelo que una conoce y la otra no
 * **no rompe nada**: da cero, callado. Stock con "cero ventas" es el sintoma.
 *
 * Y el orden ES la logica en las dos: '^16' antes que '^16 pro max' mandaria todos
 * los Pro Max a 'iPhone 16'.
 *
 * Este test compara las dos tablas de verdad, por eso no hace falta acordarse del
 * comentario que dice "se mueven juntas": si alguien agrega un modelo a una sola,
 * esto falla.
 */
describe('JS y SQL: la misma taxonomia', () => {
  const sql = readFileSync(join(RAIZ, 'sql', 'vistas-materializadas.sql'), 'utf8')
  const ts = readFileSync(join(RAIZ, 'lib', 'etl', 'modelos.ts'), 'utf8')

  /** `ELSIF s ~ '^15 pro' THEN RETURN 'iPhone 15 Pro';` → ['15 pro', 'iPhone 15 Pro'] */
  const reglasSql = [...(sql.split('CREATE OR REPLACE FUNCTION normalize_iphone_model')[1] ?? '')
    .split('$$;')[0]
    .matchAll(/s ~ '\^([^']+)'\s+THEN RETURN '([^']+)'/g)]
    .map((m) => [m[1], m[2]])

  /** `[/^15 pro/, 'iPhone 15 Pro'],` → ['15 pro', 'iPhone 15 Pro'] */
  const reglasTs = [...ts.matchAll(/\[\/\^([^/]+)\/, '([^']+)'\]/g)].map((m) => [m[1], m[2]])

  it('las dos tablas se parsearon (si no, el test no prueba nada)', () => {
    expect(reglasSql.length).toBeGreaterThan(40)
    expect(reglasTs.length).toBeGreaterThan(40)
  })

  it('mismos modelos, mismo orden, mismas reglas', () => {
    expect(reglasTs).toEqual(reglasSql)
  })

  it('las dos conocen el iPhone 18', () => {
    expect(matchModelo('iPhone 18 Pro Max')).toBe('iPhone 18 Pro Max')
    expect(matchModelo('18 Air')).toBe('iPhone 18 Air')
    expect(reglasSql.map((r) => r[1])).toContain('iPhone 18 Pro Max')
  })
})
