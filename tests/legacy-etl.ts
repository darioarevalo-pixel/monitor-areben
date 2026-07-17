import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { DatosETL, EntradaETL, ContextoETL } from '@/lib/etl/tipos'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Saca una función top-level del <script> de index.html.
 *
 * No parsea JS: se apoya en que en index.html las funciones top-level abren con
 * `function nombre(` en la columna 0 y cierran con un `}` solo, también en la
 * columna 0. Contar llaves sería peor: habría que distinguir las que viven
 * adentro de strings, regex y comentarios, y el ETL tiene de las tres.
 *
 * Si el legacy se reindenta, esto tira error en vez de extraer de menos.
 */
function extraerFuncion(fuente: string, nombre: string): string {
  const lineas = fuente.split('\n')
  const inicio = lineas.findIndex((l) => l.startsWith(`function ${nombre}(`))
  if (inicio === -1) throw new Error(`No encontré 'function ${nombre}(' en columna 0 de index.html`)

  const fin = lineas.findIndex((l, i) => i > inicio && l === '}')
  if (fin === -1) throw new Error(`No encontré el cierre de ${nombre} ('}' en columna 0)`)

  return lineas.slice(inicio, fin + 1).join('\n')
}

/**
 * Devuelve el computarDatos del legacy, listo para invocar.
 *
 * Parte de sus helpers viajan anidados adentro (normalizeCat, toTitleCase,
 * extractColor). Los de afuera son estos cinco, y los únicos globales que toca
 * son TODAY y colorManualMap: por eso alcanza con pasarlos como parámetros en
 * vez de montar un DOM.
 *
 * `_matchModelo` estaba anidada y ahora es top-level: es la única taxonomía de
 * modelo del sistema, y Fundas la usa vía normalizeIphoneModel. Por eso se
 * extrae aparte — si volviera adentro de computarDatos, esto tira error en vez
 * de comparar contra una función que no existe.
 */
export function cargarComputarDatosLegacy(today: Date, colorManualMap: Record<string, string>) {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = ['_matchModelo', 'daysSince', 'lifespanDays', 'getPhase', 'lifespanDaysFromFirst', 'computarDatos']
    .map((n) => extraerFuncion(html, n))
    .join('\n\n')

  const fabricar = new Function('TODAY', 'colorManualMap', `${fuente}\nreturn computarDatos;`)
  return fabricar(today, colorManualMap) as (
    productos: unknown[], ventas: unknown[], detalles: unknown[], inventario: unknown[],
    vmMes: unknown[], vmCat: unknown[], vmFundas: unknown[], lastSync: string, syncMeta: unknown,
  ) => DatosETL
}

/** Llama al legacy con la forma nueva (EntradaETL + ContextoETL) para poder comparar peras con peras. */
export function computarLegacy(entrada: EntradaETL, ctx: ContextoETL): DatosETL {
  const legacy = cargarComputarDatosLegacy(ctx.today, ctx.colorManualMap)
  return legacy(
    entrada.productos, entrada.ventas, entrada.detalles, entrada.inventario,
    entrada.vmMes, entrada.vmCat, entrada.vmFundas,
    ctx.today.toISOString(), entrada.syncMeta,
  )
}

/**
 * Normaliza para comparar: los Sets de fmKeyPids pasan a arrays ordenados
 * (tipos.ts avisa que ese campo no es serializable) y los -0 a 0, porque
 * `Object.is(-0, 0)` es false y toEqual los distingue sin que sea un bug real.
 */
export function normalizar(v: unknown): unknown {
  if (v instanceof Set) return Array.from(v).map(normalizar).sort()
  if (Array.isArray(v)) return v.map(normalizar)
  if (v && typeof v === 'object') {
    const salida: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) salida[k] = normalizar(val)
    return salida
  }
  if (typeof v === 'number' && Object.is(v, -0)) return 0
  return v
}

export type Fixture = { entrada: EntradaETL; ctx: { colorManualMap: Record<string, string> } }

export function leerFixture(cuenta: string): Fixture | null {
  try {
    return JSON.parse(readFileSync(join(RAIZ, 'tests', 'fixtures', `etl-${cuenta}.json`), 'utf8'))
  } catch {
    return null
  }
}
