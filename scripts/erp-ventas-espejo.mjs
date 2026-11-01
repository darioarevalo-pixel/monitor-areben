// Copia al espejo (`ventas` / `venta_detalles`) las ventas nacidas en el ERP DESPUÉS del corte de su línea (`erp_corte`).
// Corre DESPUÉS del sync de GN (su purga ⛔ toca ids del ERP). Ver `lib/erp/ventas-espejo.core.js`.
//   node scripts/erp-ventas-espejo.mjs bdi|zattia [--seco]
// Lee el motor por pg (`DATABASE_URL_<BASE>`) y escribe por supabase-js con la service key, como los syncs.
// 🔴 Cualquier cosa rara sale en rojo: un espejo sin las ventas de una línea cortada pone la escalera de Liquidación al 30 %.
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { configPg } from '../lib/pg.core.js'
import { copiarVentasErp } from './lib/erp-ventas-copia.mjs'

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
const sb = createClient(process.env[ENV.url], process.env[ENV.key])
let r
try {
  await db.connect()
  r = await copiarVentasErp(db, sb, { seco })
} finally {
  await db.end().catch(() => {})
}
if (!r.cortes.length) console.log(`[erp-ventas] ${base}: ninguna línea cortó (erp_corte vacía): ⛔ se copia nada.`)
console.log(`[erp-ventas] ${base} · cortes: ${r.cortes.map((c) => `${c.linea} ${new Date(c.instante).toISOString()}`).join(', ') || '—'} · ERP: ${r.ventas} ventas / ${r.detalles} renglones · espejo hoy: ${r.espejo.ventas} / ${r.espejo.detalles} · a sacar: ${r.sacadas.ventas} / ${r.sacadas.detalles}${seco ? ' · SECO' : ''}`)
if (r.freno) { console.error(`[erp-ventas] ⛔ ${r.freno}: ⛔ se saca nada, revisar a mano.`); process.exitCode = 1 }
if (!seco) console.log(`[erp-ventas] ${base}: escrito.`)
