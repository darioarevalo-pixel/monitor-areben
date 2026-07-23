// PRUEBA: ¿GN acepta una venta MIXTA (producto nuevo +1 y producto devuelto −1) en la MISMA venta?
// Si sí, el reingreso del devuelto se hace SOLO dentro de la venta del cambio (no manual).
// Distinto del test-reingreso (que mandaba SOLO un renglón negativo, y GN lo rechazaba).
//
// Uso (Bruno, con MONITOR_PASS en .env):
//   node scripts/test-cambio-venta.mjs <marca> <origen> <sku_nuevo> <sku_devuelto>
//     ej: node scripts/test-cambio-venta.mjs zattia deposito RFA-0022 STU-REM-0009-M
//   Efecto si GN acepta: baja 1 del nuevo, sube 1 del devuelto (total 0). Usar SKUs de poca importancia.
import { readFileSync } from 'fs'
import pg from 'pg'

const [, , marca, origen, skuNuevo, skuDevuelto] = process.argv
if (!['bdi', 'zattia'].includes(marca) || !['local', 'deposito'].includes(origen) || !skuNuevo || !skuDevuelto) {
  console.error('Uso: node scripts/test-cambio-venta.mjs <bdi|zattia> <local|deposito> <sku_nuevo> <sku_devuelto>')
  process.exit(1)
}
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const user = process.env.MONITOR_USER || env.MONITOR_USER || 'Bruno Arevalo'
const pass = process.env.MONITOR_PASS || env.MONITOR_PASS
if (!pass) { console.error('Falta MONITOR_PASS en .env'); process.exit(1) }
function parse(raw) { const a = raw.slice(raw.indexOf('://') + 3), at = a.lastIndexOf('@'); const up = a.slice(0, at), hp = a.slice(at + 1), ci = up.indexOf(':'), s = hp.indexOf('/'); return { user: up.slice(0, ci), password: up.slice(ci + 1), host: hp.slice(0, s).split(':')[0], port: Number(hp.slice(0, s).split(':')[1]) || 5432, database: hp.slice(s + 1).split('?')[0] } }

const c = new pg.Client({ ...parse(marca === 'zattia' ? env.DATABASE_URL_ZATTIA : env.DATABASE_URL_BDI), ssl: { rejectUnauthorized: false } })
await c.connect()
async function resolver(sku) {
  const r = await c.query('select distinct product_id, size_id, product_name from inventario where sku=$1 limit 1', [sku])
  return r.rows[0]
}
const nuevo = await resolver(skuNuevo), dev = await resolver(skuDevuelto)
await c.end()
if (!nuevo) { console.error(`No encontré ${skuNuevo}`); process.exit(1) }
if (!dev) { console.error(`No encontré ${skuDevuelto}`); process.exit(1) }
console.log(`Nuevo (+1): ${nuevo.product_name} · Devuelto (−1): ${dev.product_name}`)
console.log('Posteando venta MIXTA (nuevo +1, devuelto −1) a GN...')

const resp = await fetch('https://monitorareben.vercel.app/api/crear-venta', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    store: marca, accion: 'reingreso', origen,
    items: [
      { product_id: String(nuevo.product_id), size_id: String(nuevo.size_id), quantity: 1 },
      { product_id: String(dev.product_id), size_id: String(dev.size_id), quantity: -1 },
    ],
    comments: 'TEST venta mixta cambio (nuevo +1, devuelto −1)', solicitudId: 'test-cambio', user, pass,
  }),
})
const d = await resp.json().catch(() => null)
console.log('\nHTTP', resp.status)
console.log('Respuesta GN:', JSON.stringify(d, null, 2))
if (d?.ok) console.log(`\n✅ GN ACEPTÓ la venta mixta (id ${d.venta?.id}). ⇒ el reingreso puede ir DENTRO de la venta del cambio (automático).`)
else console.log('\n❌ GN rechazó la venta mixta → el reingreso del devuelto sigue MANUAL.')
