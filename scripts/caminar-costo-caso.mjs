/**
 * **Caminar en vivo lo que escribe `costo_caso`**, contra BDI de producción.
 *
 * 🔴 **Por qué existe.** El 28-ago-2026 R-0022 mostraba *«Se le devuelve $13.491»* al lado de *«Lo
 * que nos costó $20.682»*: la rama que resuelve el reclamo cuando el local contesta la oferta ⛔ no
 * recalculaba el costo, y `editar` podía mover sus entradas sin moverlo tampoco. Los tests fijan la
 * cuenta; esto ejerce **los verbos que ESCRIBEN**, que es lo que ningún test unitario toca.
 *
 * 🔑 **El handler corre EN PROCESO**, ⛔ no contra prod: el arreglo todavía no está deployado, así
 * que pegarle a `monitorareben.vercel.app` ejercería el código viejo y saldría verde diciendo
 * cualquier cosa. La base y los permisos son los de verdad.
 *
 * 🔑 **El oráculo viene por otro camino que el hecho**: se escribe llamando al handler y se lee la
 * fila cruda por PostgREST con la service key.
 *
 * ⚠️ **Siembra su propia fila y la borra al final.** Las reales ⛔ no se tocan: al terminar cuenta
 * cuántas hay y tiene que dar lo mismo que al empezar.
 *
 * Uso: node scripts/caminar-costo-caso.mjs
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

const antes = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
console.log(`\nFilas reales de BDI antes: ${antes.length}\n`)

let id = null
try {
  // La fila de R-0022 tal como estaba a las 13:30: `en_revision`, la oferta esperando respuesta, la
  // decisión soltada, y el costo de la decisión vieja con $6.500 de envío de vuelta adentro.
  const [fila] = await (await sb('devoluciones', {
    method: 'POST',
    body: JSON.stringify({
      store: 'bdi', estado: 'en_revision', motivo: 'no_esperaba', escenario: 'coincide',
      cliente: 'CAMINATA COSTO — BORRAR', orden_tn: '000000',
      items: [{ sku: 'CAM-1', producto: 'PRODUCTO DE PRUEBA', cantidad: 1, precio: '20000.00', costo: 3000 }],
      fotos: [{ url: 'https://ejemplo/foto.jpg', at: new Date().toISOString(), por: 'cliente' }],
      retencion_monto: 13491, retencion_forma: 'plata', retencion_at: new Date().toISOString(),
      retorno_decidido: true, retorno_sugerido: true, via_retorno: 'andreani', envio_costo: 6500,
      costo_caso: 20682,
      historial: [],
    }),
  })).json()
  id = fila.id
  console.log(`Sembrada la fila ${id} — costo_caso ${fila.costo_caso}, envío de vuelta ${fila.envio_costo}\n`)

  // ── 1. El local contesta que el cliente ACEPTÓ ──────────────────────────────
  console.log('1. «Aceptó» sobre la oferta de $13.491')
  const r1 = await llamar({ store: 'bdi', action: 'retencion-respuesta', id, respuesta: 'acepto' })
  chequear('contesta 200', r1.status === 200, `dio ${r1.status} ${JSON.stringify(r1.error || '')}`)
  const f1 = await leer(id)
  chequear('el reclamo queda resuelto', f1.estado === 'resuelto', f1.estado)
  chequear('el retorno queda apagado', f1.retorno_decidido === false && f1.via_retorno === null, `${f1.retorno_decidido}/${f1.via_retorno}`)
  // 🔑 El número: la plata que sale MÁS la unidad a costo, y ⛔ ningún envío.
  chequear('costo_caso recalculado a 13.491 + 3.000', f1.costo_caso === 16491, `dio ${f1.costo_caso}`)
  chequear('⛔ ya no arrastra los $6.500 del envío', f1.costo_caso !== 20682 && f1.costo_caso < 20682, `dio ${f1.costo_caso}`)

  // ── 2. Se carga el costo real del producto: el número tiene que MOVERSE ─────
  console.log('\n2. Alguien carga el costo del producto (hoy está en null en las filas reales)')
  const r2 = await llamar({
    store: 'bdi', action: 'editar', id,
    items: [{ sku: 'CAM-1', producto: 'PRODUCTO DE PRUEBA', cantidad: 1, precio: '20000.00', costo: 5000 }],
  })
  chequear('contesta 200', r2.status === 200, `dio ${r2.status}`)
  const f2 = await leer(id)
  chequear('costo_caso siguió al dato: 13.491 + 5.000', f2.costo_caso === 18491, `dio ${f2.costo_caso}`)

  // ── 3. Un envío de vuelta cargado sobre un producto que ⛔ no vuelve ─────────
  console.log('\n3. Se carga un envío de vuelta, pero el producto ⛔ no vuelve')
  const r3 = await llamar({ store: 'bdi', action: 'editar', id, envio_costo: 9000 })
  chequear('contesta 200', r3.status === 200, `dio ${r3.status}`)
  const f3 = await leer(id)
  chequear('⛔ no entra: el retorno está apagado', f3.costo_caso === 18491, `dio ${f3.costo_caso}`)

  // ── 4. Un campo que ⛔ no toca el costo ──────────────────────────────────────
  console.log('\n4. Un gesto que ⛔ no tiene nada que ver con la plata')
  const r4 = await llamar({ store: 'bdi', action: 'editar', id, cliente: 'CAMINATA COSTO — BORRAR (2)' })
  chequear('contesta 200', r4.status === 200, `dio ${r4.status}`)
  const f4 = await leer(id)
  chequear('el costo queda igual', f4.costo_caso === 18491, `dio ${f4.costo_caso}`)

  // ── 5. La venta técnica ⛔ no sale antes que la anulación ────────────────────
  console.log('\n5. «Descontar en GN» con la anulación todavía pendiente')
  chequear('la fila quedó con la anulación pendiente', f4.stock_estado === 'pendiente', String(f4.stock_estado))
  chequear('y con el producto regalado', f4.destino_prenda === 'regalada', String(f4.destino_prenda))
  const r5 = await llamar({ store: 'bdi', action: 'descontado', id })
  chequear('contesta 409', r5.status === 409, `dio ${r5.status}`)
  chequear('y dice qué hacer primero', /Anulé en GN/.test(String(r5.error)), String(r5.error))
  const f5 = await leer(id)
  chequear('⛔ no selló ninguna baja', !(f5.items || []).some((i) => i.baja_at), JSON.stringify(f5.items))

  // ── 6. Anulada, deja pasar ──────────────────────────────────────────────────
  console.log('\n6. Con «Anulé en GN» tildado')
  await sb(`devoluciones?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ stock_estado: 'hecho' }) })
  const r6 = await llamar({ store: 'bdi', action: 'descontado', id })
  chequear('contesta 200', r6.status === 200, `dio ${r6.status} ${JSON.stringify(r6.error || '')}`)
  const f6 = await leer(id)
  chequear('y ahora sí sella la baja', (f6.items || []).some((i) => i.baja_at), JSON.stringify(f6.items))
} finally {
  if (id) { await borrar(id); console.log(`\nBorrada la fila ${id}`) }
}

const despues = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
chequear(`las ${antes.length} filas reales quedaron intactas`, despues.length === antes.length, `ahora hay ${despues.length}`)

console.log(`\n${ok} de ${ok + mal}`)
process.exit(mal ? 1 : 0)
