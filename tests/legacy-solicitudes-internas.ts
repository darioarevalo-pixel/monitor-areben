import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Extrae una función top-level del <script> de index.html balanceando llaves desde
 * `function nombre(` (o `async function nombre(`) en columna 0. Copiado de
 * tests/legacy-sesionfotos.ts: la técnica es la misma (fabricar la función legacy
 * con `new Function`, inyectándole los globales, y correrla contra casos armados).
 */
function extraerBalanceado(fuente: string, nombre: string): string {
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

function html(): string {
  return readFileSync(join(RAIZ, 'index.html'), 'utf8')
}

/**
 * `siProcesar` del legacy: corre sobre un `siDraft` inyectado y devuelve los items
 * de la solicitud creada (lo que importa para la paridad: la asignación de origen y
 * el estado inicial según el tipo). id/fecha/creado salen de globales ignorados.
 */
export function cargarProcesarLegacy(siDraft: unknown, prioridad: string, currentUser: string): { items: unknown[]; estado: string; tipo: string; motivo: string } | null {
  const fuente = extraerBalanceado(html(), 'siProcesar')
  const fabricar = new Function(
    'siDraft', 'siData', 'repoCfg', 'currentUser', 'siNuevoId', 'hoyISO', '_siPendientes', 'siGuardar', 'siRender', '_siRefrescarAvisos', 'alert',
    `let siPendientesCount = 0, siViendo = null;\n${fuente}\nsiProcesar();\nreturn siData[0] || null;`,
  )
  const noop = () => {}
  const sol = fabricar(
    siDraft, [], { prioridadRetiro: prioridad }, currentUser, () => 'si_test', () => '2026-07-18', () => [], noop, noop, noop, noop,
  ) as { items: unknown[]; estado: string; tipo: string; motivo: string } | null
  return sol
}

/**
 * `siDraftDesdeProductos` del legacy: corre sobre `repoInv`/`allProductos`
 * inyectados y devuelve `siDraft.prods` tras expandir los pids pedidos.
 */
export function cargarExpandirLegacy(repoInv: unknown[], allProductos: unknown[]): (pids: string[]) => unknown[] {
  const fuente = extraerBalanceado(html(), 'siDraftDesdeProductos')
  const siDraft = { prods: [] as unknown[] }
  const fabricar = new Function(
    'repoInv', 'allProductos', 'siDraft',
    `${fuente}\nreturn (pids) => { siDraftDesdeProductos(pids); return siDraft.prods; };`,
  )
  return fabricar(repoInv, allProductos, siDraft) as (pids: string[]) => unknown[]
}

/**
 * `siCrearVentas` del legacy: corre sobre la solicitud dada con `fetch` mockeado
 * (cero POST real) y devuelve los BODIES que hubiera mandado a /api/crear-venta.
 * Es la fuente de verdad de la paridad de payload (toca stock/plata en GN).
 */
export function cargarCrearVentasBodies(s: unknown, store: string, user: string, pass: string): Promise<unknown[]> {
  const fuente = extraerBalanceado(html(), 'siCrearVentas')
  const capturados: unknown[] = []
  const fetchMock = async (_url: string, opts: { body: string }) => {
    capturados.push(JSON.parse(opts.body))
    return { json: async () => ({ ok: true, venta: { id: 1, number: 1 } }) }
  }
  const fabricar = new Function(
    'siData', '_cuentaKey', 'currentUser', '_getAdminPass', 'document', 'SF_CREAR_VENTA_API', 'fetch', 'alert', 'confirm', 'siGuardar', 'siRender',
    `${fuente}\nreturn siCrearVentas;`,
  )
  const noop = () => {}
  const siCrearVentas = fabricar(
    [s], () => store, user, () => pass, { getElementById: () => null }, 'https://x/api/crear-venta', fetchMock, noop, () => true, noop, noop,
  ) as (id: string) => Promise<void>
  return siCrearVentas((s as { id: string }).id).then(() => capturados)
}
