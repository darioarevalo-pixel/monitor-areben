/**
 * **Caminar en vivo el verbo `despachado`** contra BDI de producción.
 *
 * 🔴 **Por qué existe.** El 28-ago-2026 se descubrió que el botón «Despaché» de la bandeja de
 * Retornos le contestaba **403 a Depósito**: `despachado` ⛔ no estaba en `ACCIONES_DE_LA_BANDEJA`,
 * y el andén se había construido justamente porque Depósito ⛔ no puede abrir Reclamos. Al abrirle
 * la puerta, este verbo pasó a ser alcanzable por un perfil cuya ÚNICA sección es `retornos`, así
 * que se le agregó el guard que faltaba: **sólo sella el pendiente si el pendiente está**.
 *
 * 🔑 **Corre el handler EN PROCESO, ⛔ no contra prod**, y ésa es la diferencia que importa: el
 * arreglo todavía no está deployado, así que pegarle a `monitorareben.vercel.app` ejercería el
 * código VIEJO y saldría verde diciendo cualquier cosa. Acá se importa `api/_reclamos.js` del árbol
 * de trabajo y se le pasa un `req`/`res` de mentira; la base y los permisos son los de verdad.
 *
 * 🔑 **El oráculo viene por otro camino que el hecho**: se escribe llamando al handler y se lee la
 * fila cruda por PostgREST con la service key.
 *
 * ⚠️ **Siembra su propia fila y la borra al final.** Las reales ⛔ no se tocan: al terminar cuenta
 * cuántas hay y tiene que dar lo mismo que al empezar.
 *
 * Uso: node scripts/caminar-despacho-deposito.mjs
 */
import { leerEnv, authKv } from './lib/kv-auth.mjs'

const env = leerEnv()
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v

const URL = env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el .env'); process.exit(1) }
const auth = authKv(env)

const { default: handler } = await import('../api/_reclamos.js')

const sb = (path, init = {}) => fetch(`${URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
})

/** Un `res` de mentira, igual que el de `tests/handlers-autorizacion.test.ts`. */
function resFalso() {
  const r = {
    code: 0, body: null,
    setHeader() {}, status(c) { r.code = c; return r }, json(b) { r.body = b; return r }, end() { return r },
  }
  return r
}

const llamar = async (body) => {
  const res = resFalso()
  await handler({ method: 'POST', headers: auth, query: {}, body }, res)
  return { status: res.code, ...(res.body || {}) }
}

let ok = 0, mal = 0
const chequear = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`) }
  else { mal++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
}

const leer = async (id) => (await (await sb(`devoluciones?id=eq.${id}&select=*`)).json())[0]
const borrar = (id) => sb(`devoluciones?id=eq.${id}`, { method: 'DELETE' })

// ── Línea de base: cuántas filas REALES hay ────────────────────────────────────
const antes = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
console.log(`\nFilas reales de BDI antes: ${antes.length}\n`)

let id = null
try {
  const [fila] = await (await sb('devoluciones', {
    method: 'POST',
    body: JSON.stringify({
      store: 'bdi', estado: 'resuelto', motivo: 'faltante',
      cliente: 'CAMINATA DESPACHO — BORRAR', orden_tn: '000000',
      items: [{ sku: 'CAM-1', producto: 'PRODUCTO DE PRUEBA', cantidad: 1, precio: '20000.00' }],
      compensacion: 'reenvio', envio_nuevo_estado: 'no_aplica',
      stock_estado: 'no_aplica', reintegro_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
      historial: [],
    }),
  })).json()
  id = fila.id
  console.log(`Sembrada la fila ${id}\n`)

  // ── 1. Sin pendiente: el cero afirma, y el guard lo frena ───────────────────
  console.log('1. Sin nada para despachar')
  const r1 = await llamar({ store: 'bdi', action: 'despachado', id })
  chequear('contesta 409', r1.status === 409, `dio ${r1.status}`)
  chequear('y NOMBRA lo que falta', /pendiente de despachar/.test(String(r1.error)), String(r1.error))
  const f1 = await leer(id)
  chequear('⛔ no selló nada', f1.envio_nuevo_estado === 'no_aplica', f1.envio_nuevo_estado)
  chequear('⛔ ni apiló un evento', (f1.historial || []).length === 0, `${(f1.historial || []).length} eventos`)

  // ── 2. Con el pendiente puesto: sella ───────────────────────────────────────
  console.log('\n2. Con el paquete pendiente')
  await sb(`devoluciones?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ envio_nuevo_estado: 'pendiente' }) })
  const r2 = await llamar({ store: 'bdi', action: 'despachado', id })
  chequear('contesta 200', r2.status === 200, `dio ${r2.status}`)
  const f2 = await leer(id)
  chequear('el pendiente queda HECHO', f2.envio_nuevo_estado === 'hecho', f2.envio_nuevo_estado)
  chequear('y queda el evento en el historial', (f2.historial || []).some((h) => /despachado/.test(h.nota || '')), JSON.stringify(f2.historial))

  // ── 3. Dos veces: idempotente, y ⛔ sin duplicar el historial ────────────────
  console.log('\n3. Dos personas mirando la misma caja')
  const r3 = await llamar({ store: 'bdi', action: 'despachado', id })
  chequear('contesta 200 y dice que ya estaba', r3.status === 200 && r3.yaEstaba === true, JSON.stringify(r3))
  const f3 = await leer(id)
  chequear('⛔ no duplicó el evento', (f3.historial || []).length === (f2.historial || []).length, `${(f3.historial || []).length} vs ${(f2.historial || []).length}`)

  // ── 4. Un id que no existe ──────────────────────────────────────────────────
  console.log('\n4. Un reclamo que no existe')
  const r4 = await llamar({ store: 'bdi', action: 'despachado', id: 99999999 })
  chequear('contesta 404', r4.status === 404, `dio ${r4.status}`)
} finally {
  if (id) { await borrar(id); console.log(`\nBorrada la fila ${id}`) }
}

// ── Las reales, intactas ───────────────────────────────────────────────────────
const despues = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
chequear(`las ${antes.length} filas reales quedaron intactas`, despues.length === antes.length, `ahora hay ${despues.length}`)

console.log(`\n${ok} de ${ok + mal}`)
process.exit(mal ? 1 : 0)
