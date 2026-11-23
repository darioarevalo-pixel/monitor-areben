// Escribe en `productos` (el espejo de GN) el catálogo, el precio y el costo de las líneas que ya cortaron al ERP, desde el
// motor. Corre DESPUÉS del sync de GN. Ver `lib/erp/productos-espejo.core.js`.
//   node scripts/erp-productos-espejo.mjs bdi|zattia [--seco]
// Lee el motor por pg (`DATABASE_URL_<BASE>`) y escribe por supabase-js con la service key, como los syncs.
// 🔴 Cualquier cosa rara sale en rojo: un catálogo viejo sin avisar es peor que un job caído.
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { configPg } from '../lib/pg.core.js'
import { planProductosErp, SQL_PRODUCTOS_LINEAS } from '../lib/erp/productos-espejo.core.js'
import { ENV_MOTOR, lineasCortadasDe } from './lib/lineas-cortadas.mjs'

const base = process.argv[2]
const seco = process.argv.includes('--seco')
const ENV = {
  bdi: { url: 'SUPABASE_URL', key: 'SUPABASE_SERVICE_KEY', conProveedor: false },
  zattia: { url: 'ZATTIA_SUPABASE_URL', key: 'ZATTIA_SUPABASE_SERVICE_KEY', conProveedor: true },
}[base]
if (!ENV) { console.error('Uso: node scripts/erp-productos-espejo.mjs bdi|zattia [--seco]'); process.exit(1) }
const falta = [ENV_MOTOR[base], ENV.url, ENV.key].filter((k) => !process.env[k])
if (falta.length) { console.error(`[erp-productos] ${base}: faltan ${falta.join(', ')}.`); process.exit(1) }

const lineas = await lineasCortadasDe(base)
if (!lineas.length) {
  console.log(`[erp-productos] ${base}: ninguna línea pasó al ERP (erp_corte): no se toca el espejo.`)
  process.exit(0)
}

const db = new pg.Client({ ...configPg(process.env[ENV_MOTOR[base]]), connectionTimeoutMillis: 10000, statement_timeout: 60000 })
let motor
try {
  await db.connect()
  motor = (await db.query(SQL_PRODUCTOS_LINEAS, [lineas])).rows
} finally {
  await db.end().catch(() => {})
}

// Los ids del espejo (paginado: PostgREST corta en 1000).
const sb = createClient(process.env[ENV.url], process.env[ENV.key])
const espejo = []
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await sb.from('productos').select('id').order('id').range(desde, desde + 999)
  if (error) throw new Error(`leyendo productos: ${error.message}`)
  espejo.push(...(data || []))
  if (!data || data.length < 1000) break
}

const plan = planProductosErp(lineas, motor, espejo, { conProveedor: ENV.conProveedor })
if (plan.freno) {
  console.error(`[erp-productos] ${base}: ${plan.freno}: no se escribe nada, revisar a mano.`)
  process.exit(1)
}
const sinPrecio = [...plan.existentes, ...plan.nuevos].filter((r) => r.active && !(r.retailer_price > 0)).length
console.log(`[erp-productos] ${base} · líneas: ${lineas.join(', ')} · motor: ${motor.length} productos · ya en el espejo: ${plan.existentes.length} · nuevos: ${plan.nuevos.length} · activos sin precio: ${sinPrecio}${seco ? ' · SECO: no se escribe' : ''}`)
if (seco) process.exit(0)

// Dos tandas: un upsert de PostgREST pisa las columnas que manda, y los existentes ⛔ mandan `created_at` ni `sku`.
const LOTE = 500
for (const filas of [plan.existentes, plan.nuevos]) {
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await sb.from('productos').upsert(filas.slice(i, i + LOTE), { onConflict: 'id' })
    if (error) throw new Error(`escribiendo productos: ${error.message}`)
  }
}
console.log(`[erp-productos] ${base} OK`)
