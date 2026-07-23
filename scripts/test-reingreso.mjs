// PRUEBA B.0 — ¿Gestión Nube acepta una venta de cantidad NEGATIVA (reingreso) y SUMA stock?
// De esto depende todo el reingreso de Cambios/Devoluciones (GN no tiene API de ingreso de stock).
//
// Uso (lo corre Bruno, con su usuario/contraseña del Monitor):
//   MONITOR_USER="Bruno Arevalo" MONITOR_PASS="tu-contraseña" node scripts/test-reingreso.mjs <marca> <origen> <sku>
//     marca:  bdi | zattia
//     origen: local | deposito   (de qué ubicación suma el stock)
//     sku:    ej. STU-REM-0009-M  (un producto de POCA importancia, porque le va a SUMAR 1 real)
//
// Resuelve el SKU → product_id/size_id del mirror, postea 1 "venta" de cantidad -1 al crear-venta de PROD,
// e imprime la respuesta de GN. DESPUÉS verificá en la web de GN que el stock de ese producto SUBIÓ 1.
import { readFileSync } from 'fs'
import pg from 'pg'

const [, , marca, origen, sku] = process.argv
if (!['bdi', 'zattia'].includes(marca) || !['local', 'deposito'].includes(origen) || !sku) {
  console.error('Uso: node scripts/test-reingreso.mjs <bdi|zattia> <local|deposito> <sku>')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
  }),
)
// Usuario/contraseña del Monitor: de .env (MONITOR_PASS obligatoria; MONITOR_USER default "Bruno Arevalo").
const user = process.env.MONITOR_USER || env.MONITOR_USER || 'Bruno Arevalo'
const pass = process.env.MONITOR_PASS || env.MONITOR_PASS
if (!pass) { console.error('Falta MONITOR_PASS en el .env (agregá la línea MONITOR_PASS=tu-contraseña).'); process.exit(1) }
function parse(raw) {
  const a = raw.slice(raw.indexOf('://') + 3), at = a.lastIndexOf('@')
  const up = a.slice(0, at), hp = a.slice(at + 1), ci = up.indexOf(':'), s = hp.indexOf('/')
  return { user: up.slice(0, ci), password: up.slice(ci + 1), host: hp.slice(0, s).split(':')[0], port: Number(hp.slice(0, s).split(':')[1]) || 5432, database: hp.slice(s + 1).split('?')[0] }
}

// 1) Resolver el SKU a product_id/size_id desde el mirror.
const url = marca === 'zattia' ? env.DATABASE_URL_ZATTIA : env.DATABASE_URL_BDI
const c = new pg.Client({ ...parse(url), ssl: { rejectUnauthorized: false } })
await c.connect()
const r = await c.query('select distinct product_id, size_id, product_name from inventario where sku = $1 limit 1', [sku])
if (!r.rows.length) { await c.end(); console.error(`No encontré el SKU ${sku} en el inventario de ${marca}.`); process.exit(1) }
const { product_id, size_id, product_name } = r.rows[0]
// Precio real del producto (para el renglón; el descuento lo lleva a total 0).
const pr = await c.query('select retailer_price from productos where id = $1 limit 1', [product_id])
await c.end()
const precio = Number(pr.rows[0]?.retailer_price) || 1
console.log(`Producto: ${product_name} · product_id=${product_id} size_id=${size_id} · precio ${precio}`)
console.log(`Posteando reingreso (quantity -1, precio ${precio}, descuento 100% → total 0) a GN vía crear-venta de PROD...`)

// 2) Postear el reingreso (cantidad negativa) al crear-venta de PROD.
const resp = await fetch('https://monitorareben.vercel.app/api/crear-venta', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    store: marca, accion: 'reingreso', origen,
    items: [{ product_id: String(product_id), size_id: String(size_id), quantity: -1, unit_price: precio }],
    comments: 'TEST reingreso B.0 (qty -1) — Monitor', solicitudId: 'test-reingreso', user, pass,
  }),
})
const d = await resp.json().catch(() => null)
console.log('\nHTTP', resp.status)
console.log('Respuesta GN:', JSON.stringify(d, null, 2))
if (d?.ok) {
  console.log(`\n✅ GN ACEPTÓ la venta negativa (venta id ${d.venta?.id}). Ahora verificá en la web de GN que el stock de ${product_name} SUBIÓ 1.`)
} else {
  console.log('\n❌ GN rechazó la venta negativa. Ver el detalle arriba → el reingreso va por el fallback (Monitor + Excel de conteo).')
}
