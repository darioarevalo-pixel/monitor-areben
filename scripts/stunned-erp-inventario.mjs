// Escribe en `inventario` (espejo de Zattia) las filas STU desde el LIBRO del motor. Corre DESPUÉS del sync de GN,
// sólo con `LECTURAS_STUNNED_ERP=1` (el día del corte). Ver `lib/stunned/inventario-erp.core.js`.
// Lee el libro por pg (`DATABASE_URL_ZATTIA`) y escribe por supabase-js con la service key, como los syncs.
// 🔴 Cualquier cosa rara sale en rojo: un stock de Stunned viejo sin avisar es peor que un job caído.
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { configPg } from '../lib/pg.core.js'
import { lecturasStunnedErp } from '../lib/stunned/ventas-erp.core.js'
import { esFilaStunned, planDeInventario, SQL_INVENTARIO_STUNNED } from '../lib/stunned/inventario-erp.core.js'

if (!lecturasStunnedErp()) {
  console.log('LECTURAS_STUNNED_ERP apagada: no se toca el stock de Stunned del espejo.')
  process.exit(0)
}
const { DATABASE_URL_ZATTIA, ZATTIA_SUPABASE_URL, ZATTIA_SUPABASE_SERVICE_KEY } = process.env
if (!DATABASE_URL_ZATTIA || !ZATTIA_SUPABASE_URL || !ZATTIA_SUPABASE_SERVICE_KEY) {
  console.error('Faltan DATABASE_URL_ZATTIA / ZATTIA_SUPABASE_URL / ZATTIA_SUPABASE_SERVICE_KEY.')
  process.exit(1)
}
const sb = createClient(ZATTIA_SUPABASE_URL, ZATTIA_SUPABASE_SERVICE_KEY)

const db = new pg.Client({ ...configPg(DATABASE_URL_ZATTIA), connectionTimeoutMillis: 10000, statement_timeout: 30000 })
let libro
try {
  await db.connect()
  libro = (await db.query(SQL_INVENTARIO_STUNNED)).rows
} finally {
  await db.end().catch(() => {})
}

// Las filas STU que hoy tiene el espejo (paginado: PostgREST corta en 1000).
const espejo = []
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await sb.from('inventario').select('product_id,size_id,store_name,sku').ilike('sku', 'STU%').range(desde, desde + 999)
  if (error) throw new Error(`leyendo inventario: ${error.message}`)
  espejo.push(...(data || []))
  if (!data || data.length < 1000) break
}
const espejoStu = espejo.filter(esFilaStunned)

const plan = planDeInventario(libro, espejoStu)
console.log(`[stunned-erp] libro: ${libro.length} filas (${plan.sinSku} sin SKU, salteadas) · espejo STU: ${espejoStu.length} · a escribir ${plan.upserts.length} · a sacar ${plan.borrar.length}`)
if (plan.frenoBorrado) {
  console.error(`[stunned-erp] ⛔ ${plan.frenoBorrado}: no se borra nada, revisar a mano.`)
  process.exitCode = 1
}
for (let i = 0; i < plan.upserts.length; i += 500) {
  const { error } = await sb.from('inventario').upsert(plan.upserts.slice(i, i + 500), { onConflict: 'product_id,size_id,store_name' })
  if (error) throw new Error(`escribiendo inventario: ${error.message}`)
}
for (const r of plan.borrar) {
  const { error } = await sb.from('inventario').delete().eq('product_id', r.product_id).eq('size_id', r.size_id).eq('store_name', r.store_name)
  if (error) throw new Error(`sacando fila colgada: ${error.message}`)
}
console.log('[stunned-erp] OK')
