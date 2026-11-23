// Escribe en `productos` (el espejo de GN) el catálogo, el precio y el costo de las líneas que ya cortaron al ERP, desde el
// motor. Corre DESPUÉS del sync de GN. Ver `lib/erp/productos-espejo.core.js`; la copia vive en
// `scripts/lib/erp-espejo-copias.mjs` (la misma que la vuelta de 10 minutos, `api/_espejo-vivo.js`).
//   node scripts/erp-productos-espejo.mjs bdi|zattia [--seco]
// Lee el motor por pg (`DATABASE_URL_<BASE>`) y escribe por supabase-js con la service key, como los syncs.
// 🔴 Cualquier cosa rara sale en rojo: un catálogo viejo sin avisar es peor que un job caído.
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { configPg } from '../lib/pg.core.js'
import { ENV_MOTOR, lineasCortadasDe } from './lib/lineas-cortadas.mjs'
import { copiarProductosErp } from './lib/erp-espejo-copias.mjs'

const base = process.argv[2]
const seco = process.argv.includes('--seco')
const ENV = {
  bdi: { url: 'SUPABASE_URL', key: 'SUPABASE_SERVICE_KEY' },
  zattia: { url: 'ZATTIA_SUPABASE_URL', key: 'ZATTIA_SUPABASE_SERVICE_KEY' },
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
const sb = createClient(process.env[ENV.url], process.env[ENV.key])
let r
try {
  await db.connect()
  r = await copiarProductosErp(db, sb, base, lineas, { seco })
} finally {
  await db.end().catch(() => {})
}
if (r.freno) {
  console.error(`[erp-productos] ${base}: ${r.freno}: no se escribe nada, revisar a mano.`)
  process.exit(1)
}
console.log(`[erp-productos] ${base} · líneas: ${lineas.join(', ')} · motor: ${r.motor} productos · ya en el espejo: ${r.existentes} · nuevos: ${r.nuevos} · activos sin precio: ${r.sinPrecio}${seco ? ' · SECO: no se escribe' : ''}`)
if (!seco) console.log(`[erp-productos] ${base} OK`)
