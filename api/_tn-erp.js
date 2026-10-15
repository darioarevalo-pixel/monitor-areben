// La app propia de Tienda Nube «Areben ERP» (id 46412, Partner Portal; escribe productos y órdenes en las 3
// tiendas desde el ERP): las 3 URLs de PRIVACIDAD que TN exige a toda app (LGPD/GDPR). TN las llama cuando
// una tienda desinstala la app (`store-redact`) o una clienta pide sus datos o que se borren
// (`customers-data-request`, `customers-redact`).
//
// 🔑 La app ⛔ guarda datos personales: lee órdenes y productos y los escribe en el libro del ERP por
// `product_id`/`size_id`, sin nombre ni contacto de la clienta ⇒ no hay nada que entregar ni que eliminar, y
// cada pedido se contesta 200. ⛔ Se guarda el cuerpo (trae datos de la clienta): sólo la acción y la tienda.
// El día que el ERP guarde clientas de TN (`cliente` del motor), esto pasa a eliminarlas de verdad.
//
// Sin sesión: lo llama Tienda Nube. Entra por `api/datos.js?recurso=tn-erp&accion=…` (⛔ una ruta nueva:
// el plan Hobby admite 12 funciones). ⛔ Archivo `_`: NO es una ruta.
//
// `accion=pedido` (15-oct, paso 4 del ERP): el webhook `order/paid` / `order/cancelled` de la misma app ⇒
// dispara el workflow del motor para esa tienda (`lib/tn-erp/pedido.core.js`). Éste SÍ se defiende con la
// firma HMAC de TN sobre el cuerpo CRUDO (ver `_oc-webhook.js` por qué del stream y ⛔ de `req.body`).
// 🔴 Sin `TN_ERP_CLIENT_SECRET` o `MOTOR_DISPATCH_TOKEN` contesta 503: TN reintenta, y el cron de 2 h cubre.
import { disparoDe, firmaValida, queHacer } from '../lib/tn-erp/pedido.core.js'

export const ACCIONES_TN_ERP = ['store-redact', 'customers-redact', 'customers-data-request']
const LIMITE_CRUDO = 256 * 1024

function leerCrudo(req) {
  return new Promise((resolve, reject) => {
    const partes = []
    let total = 0
    req.on('data', (c) => {
      const b = Buffer.isBuffer(c) ? c : Buffer.from(c)
      total += b.length
      if (total > LIMITE_CRUDO) { reject(new Error('cuerpo demasiado grande')); return }
      partes.push(b)
    })
    req.on('end', () => resolve(Buffer.concat(partes)))
    req.on('error', reject)
  })
}

async function pedido(req, res, { env = process.env, fetchImpl = fetch } = {}) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' })
  let crudo
  try { crudo = await leerCrudo(req) } catch { return res.status(413).json({ error: 'cuerpo demasiado grande' }) }
  if (!env.TN_ERP_CLIENT_SECRET) { console.error('[tn-erp] pedido: falta TN_ERP_CLIENT_SECRET'); return res.status(503).json({ error: 'sin configurar' }) }
  if (!firmaValida(crudo, req.headers?.['x-linkedstore-hmac-sha256'], env.TN_ERP_CLIENT_SECRET)) return res.status(401).json({ error: 'firma inválida' })
  let cuerpo
  try { cuerpo = JSON.parse(crudo.toString('utf8')) } catch { return res.status(400).json({ error: 'JSON inválido' }) }
  const q = queHacer(cuerpo)
  if (!q.disparar) { console.log(`[tn-erp] pedido: ${q.motivo}`); return res.status(200).json({ ok: true, disparado: false, motivo: q.motivo }) }
  if (!env.MOTOR_DISPATCH_TOKEN) { console.error('[tn-erp] pedido: falta MOTOR_DISPATCH_TOKEN'); return res.status(503).json({ error: 'sin configurar' }) }
  const { url, init } = disparoDe(q.tienda, env.MOTOR_DISPATCH_TOKEN)
  let r
  try { r = await fetchImpl(url, init) } catch { r = null }
  // GitHub contesta 204 sin cuerpo. ⛔ se loguea su respuesta: podría devolver el token en un error.
  if (!r || r.status !== 204) {
    console.error(`[tn-erp] pedido ${q.tienda} #${q.pedido} ${q.evento}: GitHub ${r ? r.status : 'sin respuesta'}`)
    return res.status(503).json({ error: 'no se pudo disparar' })
  }
  console.log(`[tn-erp] pedido ${q.tienda} #${q.pedido} ${q.evento}: disparado`)
  return res.status(200).json({ ok: true, disparado: true, tienda: q.tienda })
}

export default async function handler(req, res, deps) {
  const accion = String(req.query?.accion || '')
  if (accion === 'pedido') return pedido(req, res, deps)
  if (!ACCIONES_TN_ERP.includes(accion)) return res.status(404).json({ error: `acción desconocida (usá ${[...ACCIONES_TN_ERP, 'pedido'].join(', ')})` })
  if (req.method === 'GET') return res.status(200).json({ ok: true, accion, guarda: 'nada: la app no guarda datos personales' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' })
  const tienda = req.body && (req.body.store_id ?? req.body.storeId)
  console.log(`[tn-erp] ${accion} · tienda ${tienda ?? '¿?'} · sin datos personales guardados`)
  return res.status(200).json({ ok: true })
}
