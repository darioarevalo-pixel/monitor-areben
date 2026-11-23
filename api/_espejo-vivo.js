// El espejo EN VIVO: copia del ERP al espejo el catálogo (`productos`), el stock (`inventario`) y las ventas
// (`ventas` / `venta_detalles`) de las líneas que ya cortaron, CUANDO EL LIBRO SE MUEVE. Bruno, 23-nov: «en vivo seria ideal» y
// «¿no podemos aprovechar algún movimiento y sumarnos en esa, en vez de crear uno solo?» ⇒ ⛔ hay reloj propio: lo pide el
// MOTOR desde su vuelta de cada minuto, cuando ve movimientos nuevos en el libro de una base (motor `lib/espejo-monitor.mjs`).
// Qué se escribe y por qué sólo lo que cambió: `lib/erp/espejo-vivo.core.js`. Las copias son las MISMAS de la noche
// (`scripts/lib/erp-espejo-copias.mjs`, `scripts/lib/erp-ventas-copia.mjs`); la de la noche sigue entera.
//
//   POST ?recurso=espejo-vivo&tarea=copiar&base=bdi|zattia   (`x-erp-llave: ERP_LLAVE_MONITOR`, la llave que ya comparten)
//   GET  ?recurso=espejo-vivo&tarea=copiar[&base=…]          (`Authorization: Bearer CRON_SECRET`, a mano)
//   → { ok, bases: { <base>: … } }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js`. Sin sesión.
// 🔴 Una base que falla o frena contesta 500: el motor lo reintenta y, si sigue, abre su alerta.
import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { configPg } from '../lib/pg.core.js'
import { cortesDeFilas, lineasEnErp, SQL_CORTES } from '../lib/erp/corte.core.js'
import { diaAR } from '../lib/erp/espejo-vivo.core.js'
import { copiarInventarioErp, copiarProductosErp } from '../scripts/lib/erp-espejo-copias.mjs'
import { copiarVentasErp } from '../scripts/lib/erp-ventas-copia.mjs'

export const BASES = {
  bdi: { pg: 'DATABASE_URL_BDI', url: 'SUPABASE_URL', key: 'SUPABASE_SERVICE_KEY' },
  zattia: { pg: 'DATABASE_URL_ZATTIA', url: 'ZATTIA_SUPABASE_URL', key: 'ZATTIA_SUPABASE_SERVICE_KEY' },
}

/** Las tres copias de una base, en orden (catálogo ⇒ stock ⇒ ventas), con UNA conexión al motor. */
export async function copiarBase(base, { env = process.env, ahora = new Date() } = {}) {
  const cfg = BASES[base]
  const falta = Object.values(cfg).filter((k) => !env[k])
  if (falta.length) throw new Error(`faltan ${falta.join(', ')}`)
  const { default: pg } = await import('pg')
  // `date` como texto: pg lo convierte a Date en la zona de la máquina y el día se correría (igual que el script).
  const types = { getTypeParser: (oid, fmt) => (oid === 1082 ? (x) => x : pg.types.getTypeParser(oid, fmt)) }
  const db = new pg.Client({ ...configPg(env[cfg.pg]), types, connectionTimeoutMillis: 5000, statement_timeout: 20000 })
  const sb = createClient(env[cfg.url], env[cfg.key])
  await db.connect()
  try {
    const lineas = lineasEnErp(cortesDeFilas((await db.query(SQL_CORTES)).rows), base)
    if (!lineas.length) return { lineas, nada: true }
    const productos = await copiarProductosErp(db, sb, base, lineas, { soloCambios: true })
    if (productos.freno) return { lineas, productos, freno: productos.freno }
    const stock = await copiarInventarioErp(db, sb, base, lineas, { soloCambios: true, origen: 'erp-vivo' })
    // Ayer y hoy: una venta de anoche puede seguir cambiando de estado o de pago.
    const v = await copiarVentasErp(db, sb, { desde: diaAR(ahora, 1) })
    const ventas = { escritas: v.ventas, renglones: v.detalles, sacadas: v.sacadas.ventas }
    const freno = productos.freno || stock.frenoLimpieza || v.freno || stock.errorHistoria || null
    return { lineas, productos, stock, ventas, freno }
  } finally {
    await db.end().catch(() => {})
  }
}

const igual = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''))
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y)
}

export default async function handler(req, res, { copiar = copiarBase } = {}) {
  const q = req.query || {}
  if (!['GET', 'POST'].includes(req.method) || String(q.tarea || '') !== 'copiar') {
    return res.status(400).json({ error: 'Sólo tarea=copiar (lo pide Areben Gestión).' })
  }
  const llave = process.env.ERP_LLAVE_MONITOR || ''
  const cron = process.env.CRON_SECRET || ''
  if (!llave && !cron) return res.status(503).json({ error: 'La copia no está configurada (ERP_LLAVE_MONITOR).' })
  const h = req.headers || {}
  const ok = (llave && igual(h['x-erp-llave'], llave)) || (cron && igual(h.authorization, `Bearer ${cron}`))
  if (!ok) return res.status(401).json({ error: 'no autorizado' })
  const pedida = q.base ? String(q.base) : ''
  if (pedida && !BASES[pedida]) return res.status(400).json({ error: `base desconocida: ${pedida}` })

  const nombres = pedida ? [pedida] : Object.keys(BASES)
  const hechas = await Promise.allSettled(nombres.map((b) => copiar(b)))
  const bases = {}
  let mal = false
  hechas.forEach((r, i) => {
    if (r.status === 'fulfilled') { bases[nombres[i]] = r.value; if (r.value.freno) mal = true }
    else { bases[nombres[i]] = { error: String((r.reason && r.reason.message) || r.reason) }; mal = true }
  })
  if (mal) console.error('[espejo-vivo]', JSON.stringify(bases))
  return res.status(mal ? 500 : 200).json({ ok: !mal, bases })
}
