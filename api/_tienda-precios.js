/**
 * Las REGLAS DE PRECIO de la tienda mayorista (bdi-catalogo) para la hoja del pedido del panel (Darío 18-nov). Se leen de lo
 * que el catálogo ya publica para cualquiera (`/api/config` pública, `/cyber.json`, `/lotes.json`): ⛔ hace falta llave para
 * leer. La cuenta en sí es pura: `lib/erp/precio-tienda.core.js`.
 *
 * Packs vendidos desde el panel: se descuentan de los packs a la venta de la tienda (`lotes:vendidos`, Darío 18-nov) por
 * `POST /api/config?accion=packs-panel` del catálogo con la llave compartida `PANEL_LLAVE_CATALOGO` (la misma variable en los
 * dos proyectos de Vercel). Sin la llave, el pedido se guarda igual y avisa que el pack ⛔ se descontó de la tienda.
 */
import { reglasDeTienda } from '../lib/erp/precio-tienda.core.js'

const TIENDA = () => (process.env.TIENDA_MAYORISTA_URL || 'https://bdi-catalogo.vercel.app').replace(/\/$/, '')
const VIDA_MS = 60_000
let memo = null

async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'cache-control': 'no-cache' } })
  if (!r.ok) throw new Error(`${url} contestó ${r.status}`)
  return r.json()
}

/**
 * Las reglas vigentes (1 min en memoria; `fresco` las vuelve a leer: al GUARDAR, para que los packs que quedan estén al día).
 * Si la tienda ⛔ contesta, tira: la puerta ⛔ guarda un pedido con precios que no son los de la tienda.
 * @param {{ fresco?: boolean, leer?: (url: string) => Promise<any> }} [o]
 */
export async function reglasVigentes({ fresco = false, leer = json } = {}) {
  if (!fresco && memo && Date.now() - memo.en < VIDA_MS) return memo.reglas
  const base = TIENDA()
  const [config, cyber, lotesArchivo] = await Promise.all([
    leer(`${base}/api/config`),
    leer(`${base}/cyber.json`).catch(() => ({})),
    leer(`${base}/lotes.json`).catch(() => ({})),
  ])
  if (!config || typeof config !== 'object' || !config.updatedAt) throw new Error('La tienda no devolvió su configuración')
  const reglas = reglasDeTienda({ config, cyber, lotesArchivo })
  memo = { en: Date.now(), reglas }
  return reglas
}

/**
 * Suma (o resta) packs vendidos de un producto en la tienda. ⛔ tira: devuelve si se pudo, para avisar.
 * @param {string|number} productId @param {number} delta @returns {Promise<boolean>}
 */
export async function anotarPacksEnTienda(productId, delta) {
  const llave = process.env.PANEL_LLAVE_CATALOGO
  if (!llave || !delta) return !delta
  try {
    const r = await fetch(`${TIENDA()}/api/config?accion=packs-panel`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-panel-llave': llave },
      body: JSON.stringify({ id: String(productId), delta }), signal: AbortSignal.timeout(5000),
    })
    if (r.ok) memo = null
    return r.ok
  } catch (e) {
    console.warn('[tienda-precios] no se pudo anotar el pack vendido:', e?.message)
    return false
  }
}
