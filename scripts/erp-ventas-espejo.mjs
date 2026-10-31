// Copia al espejo (`ventas` / `venta_detalles`) las ventas nacidas en el ERP DESPUÉS del corte de su línea (`erp_corte`).
// Corre DESPUÉS del sync de GN (su purga ⛔ toca ids del ERP). Ver `lib/erp/ventas-espejo.core.js`.
//   node scripts/erp-ventas-espejo.mjs bdi|zattia [--seco]
// Lee el motor por pg (`DATABASE_URL_<BASE>`) y escribe por supabase-js con la service key, como los syncs.
// 🔴 Cualquier cosa rara sale en rojo: un espejo sin las ventas de una línea cortada pone la escalera de Liquidación al 30 %.
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { configPg } from '../lib/pg.core.js'
import { ID_DESDE_ERP, planVentasErp, SQL_COLUMNAS, SQL_DETALLES_ERP, SQL_VENTAS_ERP } from '../lib/erp/ventas-espejo.core.js'

const base = process.argv[2]
const seco = process.argv.includes('--seco')
const ENV = {
  bdi: { pg: 'DATABASE_URL_BDI', url: 'SUPABASE_URL', key: 'SUPABASE_SERVICE_KEY' },
  zattia: { pg: 'DATABASE_URL_ZATTIA', url: 'ZATTIA_SUPABASE_URL', key: 'ZATTIA_SUPABASE_SERVICE_KEY' },
}[base]
if (!ENV) { console.error('Uso: node scripts/erp-ventas-espejo.mjs bdi|zattia [--seco]'); process.exit(1) }
const falta = Object.values(ENV).filter((k) => !process.env[k])
if (falta.length) { console.error(`[erp-ventas] ${base}: faltan ${falta.join(', ')}.`); process.exit(1) }

// `date` como texto: pg lo convierte a Date en la zona de la máquina y el día se correría.
pg.types.setTypeParser(1082, (s) => s)
const db = new pg.Client({ ...configPg(process.env[ENV.pg]), connectionTimeoutMillis: 10000, statement_timeout: 120000 })
let erp, columnas, cortes
try {
  await db.connect()
  cortes = (await db.query('select linea, instante from erp_corte where instante <= now() order by linea')).rows
  if (!cortes.length) { console.log(`[erp-ventas] ${base}: ninguna línea cortó (erp_corte vacía): ⛔ se copia nada.`) }
  const [v, d, c] = await Promise.all([db.query(SQL_VENTAS_ERP), db.query(SQL_DETALLES_ERP), db.query(SQL_COLUMNAS)])
  erp = { ventas: v.rows, detalles: d.rows }
  columnas = { ventas: [], venta_detalles: [] }
  for (const f of c.rows) columnas[f.table_name].push(f.column_name)
} finally {
  await db.end().catch(() => {})
}

const sb = createClient(process.env[ENV.url], process.env[ENV.key])
async function idsDelErp(tabla) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(tabla).select('id').gte('id', ID_DESDE_ERP).order('id').range(desde, desde + 999)
    if (error) throw new Error(`leyendo ${tabla}: ${error.message}`)
    out.push(...(data || []).map((f) => Number(f.id)))
    if (!data || data.length < 1000) break
  }
  return out
}
const espejo = { ventas: await idsDelErp('ventas'), detalles: await idsDelErp('venta_detalles') }
const plan = planVentasErp(erp, espejo, columnas)
console.log(`[erp-ventas] ${base} · cortes: ${cortes.map((c) => `${c.linea} ${new Date(c.instante).toISOString()}`).join(', ') || '—'} · ERP: ${plan.ventas.length} ventas / ${plan.detalles.length} renglones · espejo hoy: ${espejo.ventas.length} / ${espejo.detalles.length} · a sacar: ${plan.sacarVentas.length} / ${plan.sacarDetalles.length}${seco ? ' · SECO' : ''}`)
if (plan.freno) { console.error(`[erp-ventas] ⛔ ${plan.freno}: ⛔ se saca nada, revisar a mano.`); process.exitCode = 1 }
if (!seco) {
  for (let i = 0; i < plan.ventas.length; i += 500) {
    const { error } = await sb.from('ventas').upsert(plan.ventas.slice(i, i + 500), { onConflict: 'id' })
    if (error) throw new Error(`escribiendo ventas: ${error.message}`)
  }
  for (let i = 0; i < plan.detalles.length; i += 1000) {
    const { error } = await sb.from('venta_detalles').upsert(plan.detalles.slice(i, i + 1000), { onConflict: 'id' })
    if (error) throw new Error(`escribiendo venta_detalles: ${error.message}`)
  }
  // Renglones primero: un renglón sin su venta ⛔ debe quedar ni un instante.
  for (const [tabla, ids] of [['venta_detalles', plan.sacarDetalles], ['ventas', plan.sacarVentas]]) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from(tabla).delete().in('id', ids.slice(i, i + 200)).gte('id', ID_DESDE_ERP)
      if (error) throw new Error(`sacando de ${tabla}: ${error.message}`)
    }
  }
  console.log(`[erp-ventas] ${base}: escrito.`)
}
