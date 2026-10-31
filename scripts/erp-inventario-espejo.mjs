// Escribe en `inventario` (el espejo de GN) el stock de las líneas que ya cortaron al ERP, desde el LIBRO del motor.
// Corre DESPUÉS del sync de GN, que ⛔ escribe esas filas. Ver `lib/erp/inventario-espejo.core.js`.
//   node scripts/erp-inventario-espejo.mjs bdi|zattia [--seco]
// Lee el libro por pg (`DATABASE_URL_<BASE>`) y escribe por supabase-js con la service key, como los syncs.
// 🔴 Cualquier cosa rara sale en rojo: un stock viejo sin avisar es peor que un job caído.
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { configPg } from '../lib/pg.core.js'
import { planInventarioErp, SQL_INVENTARIO_LINEAS } from '../lib/erp/inventario-espejo.core.js'
import { ENV_MOTOR, lineasCortadasDe } from './lib/lineas-cortadas.mjs'
import { registrarCambiosDeStock } from './lib/stock-cambios.mjs'

const base = process.argv[2]
const seco = process.argv.includes('--seco')
const ENV = {
  bdi: { url: 'SUPABASE_URL', key: 'SUPABASE_SERVICE_KEY' },
  zattia: { url: 'ZATTIA_SUPABASE_URL', key: 'ZATTIA_SUPABASE_SERVICE_KEY' },
}[base]
if (!ENV) { console.error('Uso: node scripts/erp-inventario-espejo.mjs bdi|zattia [--seco]'); process.exit(1) }
const falta = [ENV_MOTOR[base], ENV.url, ENV.key].filter((k) => !process.env[k])
if (falta.length) { console.error(`[erp-inventario] ${base}: faltan ${falta.join(', ')}.`); process.exit(1) }

const lineas = await lineasCortadasDe(base)
if (!lineas.length) {
  console.log(`[erp-inventario] ${base}: ninguna línea pasó al ERP (erp_corte): no se toca el espejo.`)
  process.exit(0)
}

const db = new pg.Client({ ...configPg(process.env[ENV_MOTOR[base]]), connectionTimeoutMillis: 10000, statement_timeout: 60000 })
let libro
try {
  await db.connect()
  libro = (await db.query(SQL_INVENTARIO_LINEAS, [lineas])).rows
} finally {
  await db.end().catch(() => {})
}

// El espejo entero de la base (paginado: PostgREST corta en 1000). El plan se queda con las filas de las líneas cortadas.
const sb = createClient(process.env[ENV.url], process.env[ENV.key])
const espejo = []
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await sb.from('inventario').select('product_id,size_id,store_name,sku,available_quantity')
    .order('product_id').order('size_id').order('store_name').range(desde, desde + 999)
  if (error) throw new Error(`leyendo inventario: ${error.message}`)
  espejo.push(...(data || []))
  if (!data || data.length < 1000) break
}

const plan = planInventarioErp(base, lineas, libro, espejo)
console.log(`[erp-inventario] ${base} · líneas: ${lineas.join(', ')} · libro: ${libro.length} filas (${plan.sinSku} salteadas: su código diría otra línea) · espejo de esas líneas: ${plan.espejoDeLineas} · a escribir ${plan.upserts.length} · a sacar ${plan.borrar.length}${seco ? ' · SECO' : ''}`)
if (plan.frenoLimpieza) {
  console.error(`[erp-inventario] ${plan.frenoLimpieza}: no se saca nada, revisar a mano.`)
  process.exitCode = 1
}
if (seco) process.exit(process.exitCode || 0)

// Historia de stock (Reposición separa lo que entra al local): ANTES del upsert, como en los syncs de GN.
const historia = await registrarCambiosDeStock(sb, plan.upserts, 'erp')
if (historia.error) { console.error(`[erp-inventario] historia de stock: ${historia.error}`); process.exitCode = 1 }
else console.log(`[erp-inventario] historia: ${historia.cambios} variante(s) cambiaron.`)

for (let i = 0; i < plan.upserts.length; i += 500) {
  const { error } = await sb.from('inventario').upsert(plan.upserts.slice(i, i + 500), { onConflict: 'product_id,size_id,store_name' })
  if (error) throw new Error(`escribiendo inventario: ${error.message}`)
}
for (const r of plan.borrar) {
  const { error } = await sb.from('inventario').delete().eq('product_id', r.product_id).eq('size_id', r.size_id).eq('store_name', r.store_name)
  if (error) throw new Error(`sacando fila colgada: ${error.message}`)
}
console.log(`[erp-inventario] ${base} OK`)
