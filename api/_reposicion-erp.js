/**
 * Reposición: el stock (Local + Depósito) y las ventas del local, DIRECTO de Areben Gestión (`lib/reposicion/erp.core.js`).
 *
 *   GET /api/deposito?recurso=reposicion-erp&marca=bdi|zattia&dias=7,60
 *   ⇒ { lineas, inventario: FilaInvRepo[], ventas: { [dias]: { pid_sid: unidades } }, leidoEn }
 *
 * 🔴 Sólo con TODAS las líneas de la base ya en el ERP (`gnSeSaltea`): con una sin cortar el libro ⛔ tiene su stock y la
 *    lista saldría con prendas de menos ⇒ 409 y la pantalla lo dice (⛔ una lista corta callada).
 * 🔴 Si la base ⛔ contesta, 503 (⛔ stock vacío que parezca «no hay nada que reponer»).
 * ⛔ Archivo `_`: NO es una ruta (entra por `api/deposito.js`).
 */
import { exigirUsuario, soloMismoOrigen } from './_auth.js'
import { puedeVerAlguna } from '../lib/permisos.core.js'
import { gnSeSaltea, lineasEnErp } from '../lib/erp/corte.core.js'
import { SQL_INVENTARIO_LINEAS } from '../lib/erp/inventario-espejo.core.js'
import { CANALES_LOCAL, SQL_VENTAS_LOCAL, inventarioDelLibro, leerDias, mapaDeVentas } from '../lib/reposicion/erp.core.js'
import { conBase, cortesDe } from './_erp-corte.js'

/** Techo de cada consulta: el libro entero de BDI se suma en ~1 s; 20 s deja margen sin pasar los 30 de la puerta. */
const TECHO_MS = 20000

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, OPTIONS')) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'método no permitido' })
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return
  const marca = String(req.query?.marca || '').toLowerCase()
  if (!['bdi', 'zattia'].includes(marca)) return res.status(400).json({ error: 'marca inválida (bdi o zattia)' })
  if (!puedeVerAlguna(perfil, marca, ['reposicion'])) return res.status(403).json({ error: 'Pide la sección Reposición en esta marca.' })
  const dias = leerDias(req.query?.dias)
  if (!dias) return res.status(400).json({ error: 'dias inválido (ej. 7,60)' })

  try {
    const r = await conBase(marca, async (db) => {
      const cortes = await cortesDe(db)
      if (!gnSeSaltea(cortes, marca)) return { status: 409 }
      const lineas = lineasEnErp(cortes, marca)
      const libro = (await db.query(SQL_INVENTARIO_LINEAS, [lineas])).rows
      const ventas = {}
      for (const d of dias) ventas[d] = mapaDeVentas((await db.query(SQL_VENTAS_LOCAL, [CANALES_LOCAL[marca], d])).rows)
      return { lineas, inventario: inventarioDelLibro(marca, lineas, libro), ventas }
    }, TECHO_MS)
    if (r.status === 409) return res.status(409).json({ error: 'Esta marca todavía tiene una línea en Gestión Nube: Reposición no puede leer todo de Areben Gestión.' })
    return res.status(200).json({ ...r, leidoEn: new Date().toISOString() })
  } catch (e) {
    return res.status(503).json({ error: `No se pudo leer Areben Gestión: ${e instanceof Error ? e.message : String(e)}` })
  }
}
