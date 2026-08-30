// CAMINATA EN VIVO de **B3 — qué borra «Volver a decidir»**, contra la base REAL de BDI.
//
//   node scripts/caminar-soltar-decision.mjs           (el handler EN PROCESO — antes de pushear)
//   node scripts/caminar-soltar-decision.mjs --prod     (contra la API deployada — después)
//
// 🔴 **Por qué existe, y por qué el chunk ⛔ no alcanza**: `camposAlSoltarLaDecision` tiene sus
// tests y sus mutantes, pero lo que ⛔ ningún test puede fijar es que **la base real acepte** este
// UPDATE — `devolver_envio` es `not null default false`, así que un `null` ahí es un 500 que sale
// verde contra un Supabase de mentira— y que el jsonb vuelva **sin** el destino por unidad. Y el
// bundle y la función serverless **deployan por separado**: el chunk ⛔ no dice nada del verbo.
//
// 🔴 SIEMBRA CONTRA PRODUCCIÓN Y BORRA. El oráculo viene **por otro camino que el hecho**: se
// escribe por el handler y se lee la fila cruda por PostgREST con la service key.
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
  }),
)
const URL = env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY
process.env.SUPABASE_URL = URL
process.env.SUPABASE_SERVICE_KEY = KEY
if (!URL || !KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1) }

const PROD = process.argv.includes('--prod')
const API = 'https://monitorareben.vercel.app/api/postventa?recurso=reclamos'
const { default: reclamos } = await import('../api/_reclamos.js')
const { authKv } = await import('./lib/kv-auth.mjs')
const auth = authKv(env)
console.log(PROD ? '\n⚠️  Modo PROD: se le pega a la API deployada' : '\n   Modo local: el handler corre EN PROCESO')

const sb = (path, init = {}) => fetch(`${URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
})
const postear = async (body) => {
  if (PROD) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify(body) })
    return { status: r.status, ...(await r.json().catch(() => ({}))) }
  }
  let status = 0, cuerpo = null
  const res = { setHeader: () => res, status: (n) => { status = n; return res }, json: (o) => { cuerpo = o; return res }, end: () => res }
  await reclamos({ method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, query: {}, body }, res)
  return { status, ...(cuerpo || {}) }
}
let ok = 0, mal = 0
const chequear = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`) }
  else { mal++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
}

/**
 * Un reclamo DECIDIDO, con todo lo que la decisión escribe: los cuatro montos, el costo, el
 * destino de la fila **y el de la unidad en el jsonb**, la vía, el cupón y una oferta rechazada.
 * ⚠️ Los pendientes van en `no_aplica`: con uno tildado, `loEjecutado` frena el soltar a propósito.
 */
const sembrar = async () => {
  const r = await sb('devoluciones', {
    method: 'POST',
    body: JSON.stringify({
      store: 'bdi', estado: 'resuelto', motivo: 'falla', escenario: 'llego_fallado',
      cliente: 'CAMINATA B3 — BORRAR', orden_tn: '000000',
      items: [{ sku: 'CAM-B3', producto: 'PRODUCTO DE PRUEBA', cantidad: 1, precio: '20000.00', pvp_feria: 3500, destino: 'stock' }],
      compensacion: 'plata_total',
      monto_total: 13491, monto_producto: 12000, monto_acordado: 13491, monto_envio_devuelto: 1491,
      costo_caso: 20682, retorno_sugerido: true, retorno_decidido: true, devolver_envio: true,
      destino_prenda: 'falla', via_retorno: 'andreani', cupon_codigo: 'BDI-CAMINATA',
      envio_costo: 6000,
      retencion_monto: 5000, retencion_forma: 'plata', retencion_respuesta: 'rechazo',
      reintegro_estado: 'no_aplica', stock_estado: 'no_aplica', reingreso_estado: 'no_aplica',
      cobro_estado: 'no_aplica', envio_nuevo_estado: 'no_aplica', cupon_estado: 'no_aplica',
    }),
  })
  const [fila] = await r.json()
  if (!fila) { console.error('no se pudo sembrar:', await r.text?.().catch(() => '')); process.exit(1) }
  return fila
}
const leer = async (id) => (await (await sb(`devoluciones?id=eq.${id}&select=*`)).json())[0]
const borrar = (id) => sb(`devoluciones?id=eq.${id}`, { method: 'DELETE' })

const antes = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
console.log(`\nFilas reales de BDI antes: ${antes.length}\n`)

const sembradas = []
try {
  console.log('1. Soltar una decisión tomada')
  const a = await sembrar(); sembradas.push(a.id)
  // 🔑 EL CONTROL: la fila sembrada TIENE que llegar con todo puesto. Sin esto, un "quedó en null"
  // ⛔ no distingue «el handler lo borró» de «nunca se escribió».
  const cero = await leer(a.id)
  chequear('CONTROL · la fila nace con la decisión puesta',
    cero.monto_total !== null && cero.costo_caso !== null && cero.destino_prenda === 'falla' && cero.items[0].destino === 'stock',
    JSON.stringify({ m: cero.monto_total, c: cero.costo_caso, d: cero.destino_prenda, u: cero.items[0].destino }))

  const r1 = await postear({ action: 'liberar-decision', store: 'bdi', id: a.id })
  chequear('el POST contesta 200 — la base ACEPTÓ el UPDATE entero', r1.status === 200, JSON.stringify(r1))

  const f = await leer(a.id)
  console.log('\n2. Lo que se DECIDIÓ: se fue')
  for (const c of ['compensacion', 'monto_total', 'monto_producto', 'monto_acordado', 'monto_envio_devuelto',
    'costo_caso', 'retorno_sugerido', 'retorno_decidido', 'destino_prenda', 'via_retorno', 'cupon_codigo']) {
    chequear(`${c} quedó en null`, f[c] === null, String(f[c]))
  }
  // ⚠️ `not null default false`: acá un null habría sido un 500, ⛔ no un null.
  chequear('devolver_envio quedó en false (la columna es not null)', f.devolver_envio === false, String(f.devolver_envio))
  chequear('el destino POR UNIDAD del jsonb también se fue', f.items[0].destino === undefined, JSON.stringify(f.items[0]))
  chequear('el reclamo volvió a «Para revisar»', f.estado === 'en_revision', String(f.estado))

  console.log('\n3. Lo que se MIDIÓ: se quedó')
  chequear('el flete sigue cargado (⛔ no hay que tipearlo de nuevo)', Number(f.envio_costo) === 6000, String(f.envio_costo))
  chequear('el PVP de feria de la unidad sigue en el jsonb', Number(f.items[0].pvp_feria) === 3500, JSON.stringify(f.items[0]))
  chequear('el escenario sigue', f.escenario === 'llego_fallado', String(f.escenario))
  console.log('   …y la oferta de retención, que es B1:')
  chequear('el monto de la oferta sigue', Number(f.retencion_monto) === 5000, String(f.retencion_monto))
  chequear('la respuesta del cliente sigue', f.retencion_respuesta === 'rechazo', String(f.retencion_respuesta))

  console.log('\n4. El historial dejó rastro de qué se soltó')
  const ultimo = (Array.isArray(f.historial) ? f.historial : []).slice(-1)[0]
  chequear('el evento dice que era plata_total', /era: plata_total/.test(ultimo?.nota || ''), String(ultimo?.nota))

  console.log('\n5. Soltar dos veces ⛔ no se puede: ya no hay decisión')
  const r2 = await postear({ action: 'liberar-decision', store: 'bdi', id: a.id })
  chequear('el segundo POST contesta 400 y lo dice', r2.status === 400 && /todavía no está decidido/.test(r2.error || ''), JSON.stringify(r2))
} finally {
  for (const id of sembradas) await borrar(id)
  const despues = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
  console.log(`\nFilas reales de BDI después: ${despues.length} ${despues.length === antes.length ? '✓ intactas' : '❌ NO COINCIDE'}`)
}
console.log(`\n${ok} de ${ok + mal}`)
process.exit(mal ? 1 : 0)
