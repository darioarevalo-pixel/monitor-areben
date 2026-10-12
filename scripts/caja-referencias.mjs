// SOLO LECTURA — lo que la Caja necesita de Gestión Nube para habilitar una marca (V4, BDI, 12-oct):
// las CUENTAS de cobro (id y nombre, ⛔ el saldo) y los MODOS DE VENTA de `GET /ventas/referencias`,
// donde está el modo «Local» (consumidor final, canal, tipo, estado, depósito) con que se escribe la venta.
//
// Uso:  node scripts/caja-referencias.mjs bdi     (o zattia)
// Lee el token de lectura del .env (GN_TOKEN = BDI, GN_TOKEN_ZATTIA = Zattia). No escribe nada.
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
  }),
)
const marca = String(process.argv[2] || 'bdi').toLowerCase()
const token = { bdi: env.GN_TOKEN_VENTAS_BDI || env.GN_TOKEN, zattia: env.GN_TOKEN_VENTAS || env.GN_TOKEN_ZATTIA }[marca]
if (!token) { console.error(`Falta el token de GN de ${marca} en el .env`); process.exit(1) }

const r = await fetch('https://www.gestionnube.com/api/v1/ventas/referencias', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
if (!r.ok) { console.error(`GN contestó ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(1) }
const d = await r.json()

console.log(`\n══ ${marca.toUpperCase()} — cuentas de cobro ══`)
for (const c of d.cuentas || []) console.log(`  ${c.id}\t${c.name}`)
console.log(`\n══ ${marca.toUpperCase()} — modos de venta ══`)
// 🔴 Lista blanca: ⛔ se imprime nada con saldos.
for (const m of d.modos_venta || []) console.log(' ', JSON.stringify(m))
console.log(`\n══ claves de la respuesta: ${Object.keys(d).join(', ')}`)
