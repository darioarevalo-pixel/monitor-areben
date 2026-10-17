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
// `accion=pedido` (15-oct) se SACÓ el 17-oct: los avisos de pedido de TN van a la puerta propia del ERP
// (`erp.arebensrl.com/api/tn-aviso`, repo del motor) y los webhooks que apuntaban acá se borraron.

export const ACCIONES_TN_ERP = ['store-redact', 'customers-redact', 'customers-data-request']

export default async function handler(req, res) {
  const accion = String(req.query?.accion || '')
  if (!ACCIONES_TN_ERP.includes(accion)) return res.status(404).json({ error: `acción desconocida (usá ${ACCIONES_TN_ERP.join(', ')})` })
  if (req.method === 'GET') return res.status(200).json({ ok: true, accion, guarda: 'nada: la app no guarda datos personales' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' })
  const tienda = req.body && (req.body.store_id ?? req.body.storeId)
  console.log(`[tn-erp] ${accion} · tienda ${tienda ?? '¿?'} · sin datos personales guardados`)
  return res.status(200).json({ ok: true })
}
