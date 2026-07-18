import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Fase, Solicitud } from '@/lib/sesionfotos/tipos'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Extrae una función top-level del <script> de index.html balanceando llaves
 * desde `function nombre(`. A diferencia de `extraerFuncion` (tests/legacy-etl.ts),
 * este soporta las de una sola línea (sfFaltantes, sfSalio cierran en la misma
 * línea, no con `}` en columna 0). Si no encuentra el nombre en columna 0, tira
 * error en vez de comparar contra algo que no existe.
 */
function extraerBalanceado(fuente: string, nombre: string): string {
  // Soporta `function nombre(` y `async function nombre(`, en columna 0.
  let inicio = -1
  for (const marca of [`function ${nombre}(`, `async function ${nombre}(`]) {
    const i = fuente.startsWith(marca) ? 0 : fuente.indexOf('\n' + marca)
    if (i !== -1) {
      inicio = i === 0 ? 0 : i + 1
      break
    }
  }
  if (inicio === -1) throw new Error(`No encontré 'function ${nombre}(' (ni async) en columna 0 de index.html`)
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

export type LegacySF = {
  sfFaltantes: (s: Solicitud) => Array<{ vid: string; falta: number; qty: number }>
  sfSalio: (s: Solicitud) => boolean
  sfFaseCompleta: (s: Solicitud, fase: Fase) => boolean
}

/**
 * Devuelve las funciones puras de Sesión de fotos tal como están en index.html.
 * Las tres son puras (sin DOM ni globales), así que se fabrican juntas y se
 * comparan contra casos armados a mano — no necesitan fixture del KV.
 */
export function cargarSesionFotosLegacy(): LegacySF {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = ['sfFaltantes', 'sfSalio', 'sfFaseCompleta']
    .map((n) => extraerBalanceado(html, n))
    .join('\n\n')
  const fabricar = new Function(`${fuente}\nreturn { sfFaltantes, sfSalio, sfFaseCompleta };`)
  return fabricar() as LegacySF
}

export type LegacyCombi = {
  _sfCombiAgg: (ids: string[], origen: string, fase: string) => Array<{ vid?: string; nombre: string; variante: string; sku: string; ped: number; conf: number; manual?: boolean; solId?: string }>
  sfFaseCompletaCombi: (ids: string[], fase: string) => boolean
}

/**
 * `_sfCombiAgg` y `sfFaseCompletaCombi` del legacy, que leen el global `sfData`
 * (inyectado por parámetro) y llaman a `sfFaseCompleta` (viaja en el bundle).
 */
export function cargarCombinadaLegacy(sfData: Solicitud[]): LegacyCombi {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = ['sfFaseCompleta', '_sfCombiAgg', 'sfFaseCompletaCombi']
    .map((n) => extraerBalanceado(html, n))
    .join('\n\n')
  const fabricar = new Function('sfData', `${fuente}\nreturn { _sfCombiAgg, sfFaseCompletaCombi };`)
  return fabricar(sfData) as LegacyCombi
}

/**
 * `sfBcVid` del legacy: código de barras → vid. Usa `_sfNormBc`, el global
 * `allVariantes` (inyectado) y cachea en `window._sfBc` (se le pasa un window
 * mutable de mentira). Cada variante es `{id, barcode}`.
 */
export function cargarBcVidLegacy(allVariantes: Array<{ id: string; barcode?: string | null }>): (code: string) => string | null {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = ['_sfNormBc', 'sfBcVid'].map((n) => extraerBalanceado(html, n)).join('\n\n')
  const fabricar = new Function('allVariantes', 'window', `${fuente}\nreturn sfBcVid;`)
  return fabricar(allVariantes, {}) as (code: string) => string | null
}

/**
 * `sfProcesar` del legacy: corre sobre un `sfDraft` inyectado y devuelve los items
 * de la solicitud creada (lo que importa para la paridad: la asignación de origen).
 * El id/fecha/creado salen de globales que se ignoran en la comparación.
 */
export function cargarProcesarLegacy(sfDraft: unknown, prioridad: string, currentUser: string): unknown[] | null {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = extraerBalanceado(html, 'sfProcesar')
  const fabricar = new Function(
    'sfDraft', 'sfData', 'repoCfg', 'currentUser', 'sfNuevoId', 'sfGuardar', 'sfRender', 'alert',
    `${fuente}\nsfProcesar();\nreturn sfData[0] ? sfData[0].items : null;`,
  )
  const noop = () => {}
  return fabricar(sfDraft, [], { prioridadRetiro: prioridad }, currentUser, () => 's_test', noop, noop, noop) as unknown[] | null
}

/**
 * `sfCrearVentas` del legacy: corre sobre la solicitud dada con `fetch` mockeado
 * (cero POST real) y devuelve los BODIES que hubiera mandado a /api/crear-venta.
 * Es la fuente de verdad de la paridad de payload.
 */
export function cargarCrearVentasBodies(s: Solicitud, store: string, user: string, pass: string): Promise<unknown[]> {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = extraerBalanceado(html, 'sfCrearVentas')
  const capturados: unknown[] = []
  const fetchMock = async (_url: string, opts: { body: string }) => {
    capturados.push(JSON.parse(opts.body))
    return { json: async () => ({ ok: true, venta: { id: 1, number: 1 } }) }
  }
  const fabricar = new Function(
    'sfData', '_cuentaKey', 'currentUser', '_getAdminPass', 'document', 'SF_CREAR_VENTA_API', 'fetch', 'alert', 'confirm', 'sfGuardar', 'sfRender',
    `${fuente}\nreturn sfCrearVentas;`,
  )
  const noop = () => {}
  const sfCrearVentas = fabricar(
    [s], () => store, user, () => pass, { getElementById: () => null }, 'https://x/api/crear-venta', fetchMock, noop, () => true, noop, noop,
  ) as (id: string) => Promise<void>
  return sfCrearVentas(s.id).then(() => capturados)
}

/**
 * `sfDraftDesdeProductos` del legacy: corre sobre `repoInv`/`allProductos`
 * inyectados y devuelve `sfDraft.prods` tras expandir los pids pedidos.
 */
export function cargarExpandirLegacy(
  repoInv: unknown[],
  allProductos: unknown[],
): (pids: string[]) => unknown[] {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const fuente = extraerBalanceado(html, 'sfDraftDesdeProductos')
  const sfDraft = { desc: '', prods: [] as unknown[] }
  const fabricar = new Function(
    'repoInv', 'allProductos', 'sfDraft',
    `${fuente}\nreturn (pids) => { sfDraftDesdeProductos(pids); return sfDraft.prods; };`,
  )
  return fabricar(repoInv, allProductos, sfDraft) as (pids: string[]) => unknown[]
}
