// SOLO LECTURA: valores de descuento/totales de una venta de GN (para entender el formato del descuento).
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const GN = 'https://www.gestionnube.com/api/v1'
const tok = env.GN_TOKEN
const id = process.argv[2] || '1354830'
const r = await fetch(`${GN}/ventas/${id}`, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' } })
if (!r.ok) { console.log('HTTP', r.status, (await r.text()).slice(0, 120)); process.exit(1) }
const d = await r.json(); const v = d?.data || d
console.log('VENTA', v.id, 'nº', v.number)
console.log('  total_price:', v.total_price, '· net_price:', v.net_price, '· discount:', v.discount, '· is_exchange:', v.is_exchange, '· direct_sale_no_inventory:', v.direct_sale_no_inventory)
const it = (v.items || [])[0]
if (it) console.log('  item[0]: qty', it.quantity, '· unit_price', it.unit_price, '· discount', it.discount, '· subtotal', it.subtotal, '· total', it.total)
