/**
 * La UBICACIÓN del ERP (motor sql/066) de las líneas de una marca que ya cortaron (`erp_corte`). La leen Ubicaciones y Reposición
 * para pisar la `observation` del espejo de GN en esas líneas (`lib/ubicaciones/erp.core.js`). Ninguna línea cortada ⇒
 * `{ lineas: [], filas: [] }`.
 *
 *   GET /api/deposito?recurso=ubicaciones-erp&marca=bdi|zattia
 *
 * 🔴 Si la base ⛔ contesta, 503: sin saber si la línea cortó ⛔ se muestra la de GN (que desde el corte queda vieja, callada).
 * ⛔ Archivo `_`: NO es una ruta (entra por `api/deposito.js`).
 */
import { exigirUsuario, soloMismoOrigen } from './_auth.js'
import { puedeVerAlguna } from '../lib/permisos.core.js'
import { lineasEnErp } from '../lib/erp/corte.core.js'
import { conBase, cortesDe } from './_erp-corte.js'

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, OPTIONS')) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'método no permitido' })
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return
  const marca = String(req.query?.marca || '').toLowerCase()
  if (!['bdi', 'zattia'].includes(marca)) return res.status(400).json({ error: 'marca inválida (bdi o zattia)' })
  if (!puedeVerAlguna(perfil, marca, ['ubicaciones', 'reposicion'])) {
    return res.status(403).json({ error: 'Pide la sección Ubicaciones o Reposición en esta marca.' })
  }
  try {
    const r = await conBase(marca, async (db) => {
      const lineas = lineasEnErp(await cortesDe(db), marca)
      if (!lineas.length) return { lineas, filas: [] }
      const { ubicacionesDe } = await import('../motor/stock/ubicacion.mjs')
      const filas = (await ubicacionesDe(db, { lineas })).map(({ deposito, product_id, size_id, texto }) => ({ deposito, product_id, size_id, texto }))
      return { lineas, filas }
    })
    return res.status(200).json(r)
  } catch (e) {
    return res.status(503).json({ error: `No se pudo leer la ubicación del ERP: ${e instanceof Error ? e.message : String(e)}` })
  }
}
