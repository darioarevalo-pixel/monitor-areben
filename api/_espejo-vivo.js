// El espejo EN VIVO: cada 10 minutos copia del ERP al espejo el catálogo (`productos`), el stock (`inventario`) y las ventas
// (`ventas` / `venta_detalles`) de las líneas que ya cortaron. Bruno, 23-nov: «en vivo seria ideal». Qué se escribe y por
// qué sólo lo que cambió: `lib/erp/espejo-vivo.core.js`. Las copias son las MISMAS de la noche (`scripts/lib/erp-espejo-copias.mjs`,
// `scripts/lib/erp-ventas-copia.mjs`); la de la noche sigue entera y arregla lo que esta se pierda.
//
//   GET ?recurso=espejo-vivo&tarea=copiar   → { ok, bases: { bdi, zattia } }   (el cron de vercel.json, cada 10 min)
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js`. Sin sesión: lo llama el cron de Vercel y se defiende con
// `CRON_SECRET`, igual que el vigía. ⛔ Por GitHub Actions: sus crons llegan con horas de atraso.
// 🔴 Una base que falla o frena contesta 500 (queda en los logs de Vercel); la otra se copia igual.
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

export default async function handler(req, res, { copiar = copiarBase } = {}) {
  if (req.method !== 'GET' || String((req.query || {}).tarea || '') !== 'copiar') {
    return res.status(400).json({ error: 'Sólo GET con tarea=copiar (lo llama el cron).' })
  }
  const esperado = process.env.CRON_SECRET || ''
  if (!esperado) return res.status(503).json({ error: 'La copia no está configurada (CRON_SECRET).' })
  if (String(req.headers.authorization || '') !== `Bearer ${esperado}`) return res.status(401).json({ error: 'no autorizado' })

  const nombres = Object.keys(BASES)
  const hechas = await Promise.allSettled(nombres.map((b) => copiar(b)))
  const bases = {}
  let mal = false
  hechas.forEach((h, i) => {
    if (h.status === 'fulfilled') { bases[nombres[i]] = h.value; if (h.value.freno) mal = true }
    else { bases[nombres[i]] = { error: String((h.reason && h.reason.message) || h.reason) }; mal = true }
  })
  if (mal) console.error('[espejo-vivo]', JSON.stringify(bases))
  return res.status(mal ? 500 : 200).json({ ok: !mal, bases })
}
