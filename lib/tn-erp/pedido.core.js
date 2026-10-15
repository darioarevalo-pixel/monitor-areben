// El pedido de Tienda Nube ⇒ la venta del motor AL INSTANTE (paso 4 del ERP). Puro.
//
// TN avisa (webhook de la app «Areben ERP») y el monitor ⛔ procesa nada: verifica la firma y DISPARA el
// workflow `tn.yml` del motor (`areben-motor`) sólo para esa tienda, con el comando `pedidos` (trae las
// órdenes que cambiaron y registra/anula sus ventas; idempotente por pedido). El cron de cada 2 h queda
// como red: GitHub descarta ~la mitad de las corridas programadas (medido 14/15-oct: 6 de 12 por día),
// pero un `workflow_dispatch` arranca en segundos.
//
// 🔴 La firma viene en HEXADECIMAL (HMAC-SHA256 del cuerpo CRUDO con el client secret de la app; la doc de
// TN la arma con `hash_hmac` de PHP). El mailer comparó contra base64 un mes y rechazó TODOS los webhooks
// reales ⇒ el test fija la firma con un vector de `openssl`, ⛔ con esta misma función.
import crypto from 'node:crypto'

/** Las 3 tiendas, por `store_id` (las mismas de `lib/tn/orden.mjs` del motor). */
export const TIENDA_DE_STORE = { 1096065: 'bdi', 4445369: 'zattia', 7516263: 'stunned' }

/** Lo que cambia la venta: el pago la crea, la cancelación la anula (una devolución la ve el cron). */
export const EVENTOS_PEDIDO = ['order/paid', 'order/cancelled']

export const MOTOR_REPO = 'brunoarevalo-arbn/areben-motor'
export const MOTOR_WORKFLOW = 'tn.yml'

/** @param {Buffer|string} crudo @param {string|null|undefined} firma @param {string|undefined} secreto */
export function firmaValida(crudo, firma, secreto) {
  if (!secreto || !firma) return false
  const esperada = crypto.createHmac('sha256', secreto).update(crudo).digest('hex')
  const a = Buffer.from(esperada)
  const b = Buffer.from(String(firma).trim().toLowerCase())
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * Qué hacer con un aviso ya verificado.
 * @returns {{ disparar: false, motivo: string } | { disparar: true, tienda: string, evento: string, pedido: string }}
 */
export function queHacer(cuerpo) {
  const evento = String(cuerpo?.event ?? '')
  const tienda = TIENDA_DE_STORE[String(cuerpo?.store_id ?? '')]
  if (!tienda) return { disparar: false, motivo: `tienda desconocida (${cuerpo?.store_id ?? '¿?'})` }
  if (!EVENTOS_PEDIDO.includes(evento)) return { disparar: false, motivo: `evento ignorado (${evento || '¿?'})` }
  return { disparar: true, tienda, evento, pedido: String(cuerpo?.id ?? '') }
}

/** El pedido a la API de GitHub que dispara el workflow del motor para una tienda. */
export function disparoDe(tienda, token) {
  return {
    url: `https://api.github.com/repos/${MOTOR_REPO}/actions/workflows/${MOTOR_WORKFLOW}/dispatches`,
    init: {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' },
      body: JSON.stringify({ ref: 'main', inputs: { comando: 'pedidos', tienda } }),
    },
  }
}
