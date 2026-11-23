// Escribe en `inventario` (el espejo de GN) el stock de las líneas que ya cortaron al ERP, desde el LIBRO del motor.
// Corre DESPUÉS del sync de GN, que ⛔ escribe esas filas. Ver `lib/erp/inventario-espejo.core.js`; la copia vive en
// `scripts/lib/erp-espejo-copias.mjs` (la misma que la vuelta de 10 minutos, `api/_espejo-vivo.js`).
//   node scripts/erp-inventario-espejo.mjs bdi|zattia [--seco]
// Lee el libro por pg (`DATABASE_URL_<BASE>`) y escribe por supabase-js con la service key, como los syncs.
// 🔴 Cualquier cosa rara sale en rojo: un stock viejo sin avisar es peor que un job caído.
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { configPg } from '../lib/pg.core.js'
import { ENV_MOTOR, lineasCortadasDe } from './lib/lineas-cortadas.mjs'
import { copiarInventarioErp } from './lib/erp-espejo-copias.mjs'

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
const sb = createClient(process.env[ENV.url], process.env[ENV.key])
let r
try {
  await db.connect()
  r = await copiarInventarioErp(db, sb, base, lineas, { seco })
} finally {
  await db.end().catch(() => {})
}
console.log(`[erp-inventario] ${base} · líneas: ${lineas.join(', ')} · libro: ${r.libro} filas (${r.sinSku} salteadas: su código diría otra línea) · espejo de esas líneas: ${r.espejoDeLineas} · a escribir ${r.escritas} · a sacar ${r.sacadas}${seco ? ' · SECO' : ''}`)
if (r.frenoLimpieza) {
  console.error(`[erp-inventario] ${r.frenoLimpieza}: no se saca nada, revisar a mano.`)
  process.exitCode = 1
}
if (seco) process.exit(process.exitCode || 0)
if (r.errorHistoria) { console.error(`[erp-inventario] historia de stock: ${r.errorHistoria}`); process.exitCode = 1 }
else console.log(`[erp-inventario] historia: ${r.historia} variante(s) cambiaron.`)
console.log(`[erp-inventario] ${base} OK`)
