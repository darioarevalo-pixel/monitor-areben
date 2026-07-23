// SOLO LECTURA — lista las FORMAS DE PAGO (payment_methods) y los CANALES DE VENTA (channels) de GN
// para BDI y ZATTIA. Sirve para completar la config de la venta REAL de Cambios (Fase B.4):
//   - payment_method_id de "Tarjeta" y "Transferencia" (por cuenta)
//   - channel_id del canal REAL a usar (NO el 12 "Ninguno", para que la venta CUENTE en la analítica)
//
// Uso:  node scripts/gn-formas-pago.mjs
// Lee los tokens de lectura del .env (GN_TOKEN = BDI, GN_TOKEN_ZATTIA = Zattia). No escribe nada.
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
  }),
)
const GN = 'https://www.gestionnube.com/api/v1'
const CUENTAS = [
  { marca: 'bdi', token: env.GN_TOKEN },
  { marca: 'zattia', token: env.GN_TOKEN_ZATTIA },
]

async function traer(token, path) {
  const r = await fetch(`${GN}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  if (!r.ok) return { err: `HTTP ${r.status} ${(await r.text()).slice(0, 120)}` }
  const d = await r.json().catch(() => null)
  return { data: Array.isArray(d) ? d : d?.data || [] }
}

for (const { marca, token } of CUENTAS) {
  console.log(`\n════════════ ${marca.toUpperCase()} ════════════`)
  if (!token) { console.log('  (falta token en .env)'); continue }

  const fp = await traer(token, '/payment_methods?per_page=100')
  console.log('\n  ── Formas de pago (payment_methods) ──')
  if (fp.err) console.log('   ', fp.err)
  else (fp.data || []).forEach((m) => console.log(`    id ${m.id}  ·  ${m.name || m.description || '(sin nombre)'}`))

  const ch = await traer(token, '/channels?per_page=100')
  console.log('\n  ── Canales de venta (channels) ──')
  if (ch.err) console.log('   ', ch.err)
  else (ch.data || []).forEach((c) => console.log(`    id ${c.id}  ·  ${c.name || c.description || '(sin nombre)'}`))
}
console.log('\n> Pasame: payment_method_id de Tarjeta y Transferencia (por cuenta) + el channel_id real que querés que use el cambio.\n')
