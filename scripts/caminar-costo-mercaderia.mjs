/**
 * **Caminar en vivo el costo de la mercadería** contra BDI de producción (§1.3 del plan de
 * post-venta, 30-ago-2026).
 *
 * 🔴 **Por qué ⛔ no alcanza con los tests.** Todo lo de arriba —13 mutantes muertos incluidos—
 * corre con `leerCostos` **mockeado**: comprueba que el handler *pide* el costo, ⛔ no que la
 * consulta real devuelva algo. Un `product_id` que en la práctica ⛔ no cruza contra `productos`,
 * una clave de servicio sin permiso, o un deploy que ⛔ no llegó, salen **verdes**.
 *
 * 🔑 **Le pega a PRODUCCIÓN**, ⛔ no al handler en proceso: acá el oráculo tiene que decir además
 * *«esto está deployado»*. Este commit ⛔ no agrega ningún texto nuevo al bundle, así que el
 * verificador de chunks ⛔ no sirve — el oráculo del deploy es **el comportamiento**.
 *
 * 🔑 **Y viene por otro camino que el hecho**: se escribe por la API de prod y se lee la fila cruda
 * por PostgREST con la service key.
 *
 * ⚠️ **Siembra su propia fila y la borra al final.** Las reales ⛔ no se tocan: al terminar cuenta
 * cuántas hay y tiene que dar lo mismo que al empezar.
 *
 * Uso: node scripts/caminar-costo-mercaderia.mjs
 */
import { leerEnv, authKv } from './lib/kv-auth.mjs'

const env = leerEnv()
const URL = env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_KEY
const API = 'https://monitorareben.vercel.app/api/postventa?recurso=reclamos'
const auth = authKv(env)
if (!URL || !KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el .env'); process.exit(1) }

const sb = (path, init = {}) => fetch(`${URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
})

const postear = async (body) => {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify(body) })
  return { status: r.status, ...(await r.json().catch(() => ({}))) }
}

let ok = 0, mal = 0
const chequear = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`) }
  else { mal++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
}

const leer = async (id) => (await (await sb(`devoluciones?id=eq.${id}&select=*`)).json())[0]
const borrar = (id) => sb(`devoluciones?id=eq.${id}`, { method: 'DELETE' })

// ── El producto de control: uno REAL de GN, con costo cargado ──────────────────
const [producto] = await (await sb('productos?select=id,name,unit_cost&unit_cost=not.is.null&unit_cost=gt.0&limit=1')).json()
if (!producto) { console.error('No hay ningún producto con costo en BDI: sin eso este control ⛔ no mide nada.'); process.exit(1) }
const COSTO = Number(producto.unit_cost)
console.log(`\nProducto de control: ${producto.name} (id ${producto.id}) — costo ${COSTO}`)

const antes = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
console.log(`Filas reales de BDI antes: ${antes.length}\n`)

const item = (extra = {}) => ({ sku: 'CAM-COSTO', producto: 'PRODUCTO DE PRUEBA', cantidad: 1, precio: '20000.00', product_id: String(producto.id), ...extra })

let id = null
try {
  // ── 1 · Al crear, el costo viene de GN ──────────────────────────────────────
  console.log('1 · el alta le pega el costo de Gestión Nube')
  const creado = await postear({
    action: 'crear', store: 'bdi', motivo: 'falla', cliente: 'CAMINATA — BORRAR', orden_tn: '000000',
    items: [item()],
  })
  chequear('el alta contesta 200', creado.status === 200, JSON.stringify(creado).slice(0, 200))
  id = creado.id
  if (!id) throw new Error('sin id no se puede seguir')
  const fila = await leer(id)
  chequear('🔴 el ítem quedó con el costo de GN (⛔ no en null)', Number(fila.items?.[0]?.costo) === COSTO, `costo=${fila.items?.[0]?.costo} esperado=${COSTO}`)

  // ── 2 · Un costo cargado a mano ⛔ no se pisa ────────────────────────────────
  console.log('\n2 · el costo cargado a mano manda')
  const conCero = await postear({
    action: 'crear', store: 'bdi', motivo: 'falla', cliente: 'CAMINATA — BORRAR 2', orden_tn: '000000',
    items: [item({ costo: 0 }), item({ sku: 'CAM-COSTO-2' })],
  })
  const fila2 = await leer(conCero.id)
  chequear('🔑 el 0 tipeado sobrevive', Number(fila2.items?.[0]?.costo) === 0, `costo=${fila2.items?.[0]?.costo}`)
  chequear('y el de al lado SÍ se completa', Number(fila2.items?.[1]?.costo) === COSTO, `costo=${fila2.items?.[1]?.costo}`)
  await borrar(conCero.id)

  // ── 3 · Al decidir, el costo_caso se recalcula ──────────────────────────────
  console.log('\n3 · decidir sobre un reclamo VIEJO (ítems sin costo) recalcula el número')
  const [viejo] = await (await sb('devoluciones', {
    method: 'POST',
    body: JSON.stringify({
      store: 'bdi', estado: 'en_revision', motivo: 'falla', cliente: 'CAMINATA — BORRAR 3', orden_tn: '000000',
      items: [{ sku: 'CAM-COSTO', producto: 'PRODUCTO DE PRUEBA', cantidad: 1, precio: '20000.00', product_id: String(producto.id) }],
      fotos: [{ url: 'x', at: new Date().toISOString() }],
    }),
  })).json()
  const decidido = await postear({
    action: 'decidir', store: 'bdi', id: viejo.id,
    compensacion: 'plata_total', destino_prenda: 'regalada', monto_total: 20000,
    costo_caso: 20000, // lo que calculó la pantalla, con la unidad en cero
  })
  chequear('decidir contesta 200', decidido.status === 200, JSON.stringify(decidido).slice(0, 200))
  const filaDecidida = await leer(viejo.id)
  chequear('🔴 el ítem quedó con costo', Number(filaDecidida.items?.[0]?.costo) === COSTO, `costo=${filaDecidida.items?.[0]?.costo}`)
  chequear(
    '🔴 y el costo_caso se RECALCULÓ (⛔ no quedó el de la pantalla)',
    Math.round(Number(filaDecidida.costo_caso)) === Math.round(20000 + COSTO),
    `costo_caso=${filaDecidida.costo_caso} esperado=${Math.round(20000 + COSTO)}`,
  )
  await borrar(viejo.id)
} finally {
  if (id) await borrar(id)
  const despues = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
  console.log(`\nFilas reales de BDI después: ${despues.length} ${despues.length === antes.length ? '✓ intactas' : '✗ CAMBIÓ'}`)
  console.log(`\n${ok} de ${ok + mal}`)
  process.exit(mal ? 1 : 0)
}
