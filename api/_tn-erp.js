// La app propia de Tienda Nube «Areben ERP» (id 46412, Partner Portal; escribe productos y órdenes en las 3
// tiendas desde el ERP): las 3 URLs de PRIVACIDAD que TN exige a toda app (LGPD/GDPR). TN las llama cuando
// una tienda desinstala la app (`store-redact`) o una clienta pide sus datos o que se borren
// (`customers-data-request`, `customers-redact`).
//
// 🔴 SE MUDARON (29-oct, sql/059 del motor): desde que el ERP guarda el comprador de TN como ficha, las 3 URLs BORRAN y
// DEVUELVEN datos de verdad y exigen la firma de TN sobre el cuerpo CRUDO, que acá (`api/datos.js`) ⛔ hay ⇒ viven en
// `https://erp.arebensrl.com/api/tn-privacidad?accion=…` (repo del motor). Esto queda hasta cambiarlas en el portal de
// socios: contesta 200 como antes y lo dice FUERTE en el log, para que una llamada vieja ⛔ pase callada.
// ⛔ Se guarda el cuerpo (trae datos de la clienta): sólo la acción y la tienda.
//
// Sin sesión: lo llama Tienda Nube. Entra por `api/datos.js?recurso=tn-erp&accion=…` (⛔ una ruta nueva:
// el plan Hobby admite 12 funciones). ⛔ Archivo `_`: NO es una ruta.
//
// `accion=pedido` (15-oct) se SACÓ el 17-oct: los avisos de pedido de TN van a la puerta propia del ERP
// (`erp.arebensrl.com/api/tn-aviso`, repo del motor) y los webhooks que apuntaban acá se borraron.

export const ACCIONES_TN_ERP = ['store-redact', 'customers-redact', 'customers-data-request']

export default async function handler(req, res) {
  const accion = String(req.query?.accion || '')
  if (!ACCIONES_TN_ERP.includes(accion)) return res.status(404).json({ error: `acción desconocida (usá ${ACCIONES_TN_ERP.join(', ')})` })
  if (req.method === 'GET') return res.status(200).json({ ok: true, accion, mudada: `https://erp.arebensrl.com/api/tn-privacidad?accion=${accion}` })
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' })
  const tienda = req.body && (req.body.store_id ?? req.body.storeId)
  console.error(`[tn-erp] ${accion} · tienda ${tienda ?? '¿?'} · 🔴 llegó a la URL VIEJA: no se borró ni devolvió nada. Cambiar la URL en el portal de socios a erp.arebensrl.com/api/tn-privacidad`)
  return res.status(200).json({ ok: true })
}
