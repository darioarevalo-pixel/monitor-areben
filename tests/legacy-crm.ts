import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ClienteCRM, FilaDetalle, FilaVenta, MapaSeguimiento, MapaTelefonos, Seg } from '@/lib/crm/tipos'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Mismo truco que tests/legacy-etl.ts: sacar funciones top-level del <script> de
 * index.html apoyándose en que abren con `function nombre(` en la columna 0 y
 * cierran con un `}` solo, también en columna 0. Si el legacy se reindenta, esto
 * tira error en vez de extraer de menos.
 */
function extraerFuncion(fuente: string, nombre: string): string {
  const lineas = fuente.split('\n')
  const inicio = lineas.findIndex((l) => l.startsWith(`function ${nombre}(`))
  if (inicio === -1) throw new Error(`No encontré 'function ${nombre}(' en columna 0 de index.html`)

  // Las de una sola línea (esDescartado, 13035) abren y cierran en la misma. Sin
  // este caso, el buscador del `}` se va hasta el cierre de OTRA función y se
  // traga todo lo del medio — incluidas las declaraciones de los globales, que
  // después chocan con los parámetros del closure.
  if (lineas[inicio].trimEnd().endsWith('}')) return lineas[inicio]

  const fin = lineas.findIndex((l, i) => i > inicio && l === '}')
  if (fin === -1) throw new Error(`No encontré el cierre de ${nombre} ('}' en columna 0)`)
  return lineas.slice(inicio, fin + 1).join('\n')
}

/** Las constantes de negocio, sacadas del legacy y no copiadas: si allá cambian, el test las ve. */
function extraerConstantes(fuente: string): string {
  const nombres = ['CADENCIA_DIAS', 'RIESGO_MIN_DAYS', 'RIESGO_MAX_DAYS', 'DORMIDO_DAYS', 'NUEVO_DAYS', 'ACTIVO_MIN_PED', 'TOP_LIMIT']
  const lineas = fuente.split('\n')
  return nombres
    .map((n) => {
      const l = lineas.find((x) => x.startsWith(`const ${n} `) || x.startsWith(`const ${n}=`) || x.startsWith(`const ${n}  `))
      if (!l) throw new Error(`No encontré la constante ${n} en columna 0 de index.html`)
      return l
    })
    .join('\n')
}

export type LegacyCRM = {
  estadoSeguimiento: (id: number | string) => Seg
  calcularAgregadoCRM: () => ClienteCRM[]
  /** El global que calcularAgregadoCRM escribe de costado. */
  leerDescartados: () => ClienteCRM[]
  segmentoCliente: (c: ClienteCRM) => string
  normalizeArgPhone: (p: string) => string
  diasDesde: (d: string | null) => number | null
  addDiasISO: (iso: string, n: number) => string
  diasHasta: (iso: string | null) => number | null
  renderResumenCompras: (c: { ventas: FilaVenta[] }, det: FilaDetalle[]) => string
}

export type CtxLegacy = {
  today: Date
  crmRows: FilaVenta[]
  crmClientes: Record<string | number, unknown>
  crmSeg: MapaSeguimiento
  crmTelOverride: MapaTelefonos
}

/**
 * Monta el CRM del legacy con sus globales inyectados como variables locales del
 * closure, sin DOM.
 *
 * Las funciones del CRM leen 5 globales (TODAY, crmRows, crmClientes, crmSeg,
 * crmTelOverride) y `crmDescartados`, que calcularAgregadoCRM **escribe**: esa
 * escritura es justo lo que el port reemplaza por devolver `{activos,
 * descartados}`, así que acá se expone con un getter para poder compararla.
 *
 * `escapeHtml` y `fmtMonto`/`fmtFecha` hacen falta solo para renderResumenCompras,
 * que devuelve HTML. Del HTML el test compara la sustancia (qué productos y qué
 * números), no el markup.
 */
export function cargarCRMLegacy(ctx: CtxLegacy): LegacyCRM {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')

  const fuente = [
    extraerConstantes(html),
    ...['fmtMonto', 'fmtFecha', 'diasDesde', 'normalizeArgPhone', 'hoyISO', 'addDiasISO', 'diasHasta',
      'estadoSeguimiento', 'paraContactar', 'esDescartado', 'calcularAgregadoCRM', 'segmentoCliente',
      'escapeHtml', 'renderResumenCompras'].map((n) => extraerFuncion(html, n)),
  ].join('\n')

  const fabricar = new Function(
    'TODAY', 'crmRows', 'crmClientes', 'crmSeg', 'crmTelOverride',
    `let crmDescartados = [];
     ${fuente}
     return {
       estadoSeguimiento, calcularAgregadoCRM, segmentoCliente, normalizeArgPhone,
       diasDesde, addDiasISO, diasHasta, renderResumenCompras,
       leerDescartados: () => crmDescartados,
     };`,
  )

  return fabricar(ctx.today, ctx.crmRows, ctx.crmClientes, ctx.crmSeg, ctx.crmTelOverride) as LegacyCRM
}

/** El fixture de scripts/crm-fixture.mjs. Devuelve null si no está bajado. */
export function leerFixtureCRM() {
  const p = join(RAIZ, 'tests', 'fixtures', 'crm', 'crm-bdi.json')
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}
