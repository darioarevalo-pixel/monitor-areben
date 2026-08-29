/**
 * **Caminar en vivo el registro de «qué se le dijo al cliente»** contra BDI de producción (D9 de
 * la auditoría del 28-ago-2026).
 *
 * 🔴 **Por qué existe, y ⛔ no alcanza con los tests.** La columna `mensajes` estaba en el `select`
 * del handler desde el día uno y ⛔ **no la escribía nadie**: nunca se le escribió un solo valor.
 * Todo lo que hay arriba —18 mutantes muertos incluidos— corre contra un Supabase de mentira, así
 * que **un tipo de columna equivocado, un default raro o un check saldrían VERDES**. Es la lección
 * de [[feedback_areben_el_cambio_es_un_mutante]] por la otra punta: el oráculo tiene que tocar la
 * base de verdad.
 *
 * 🔑 **Corre el handler EN PROCESO**: el arreglo todavía no está deployado, así que pegarle a
 * `monitorareben.vercel.app` ejercería el código VIEJO y saldría verde diciendo cualquier cosa.
 *
 * 🔑 **El oráculo viene por otro camino que el hecho**: se escribe llamando al handler y se lee la
 * fila cruda por PostgREST con la service key.
 *
 * ⚠️ **Siembra su propia fila y la borra al final.** Las reales ⛔ no se tocan: al terminar cuenta
 * cuántas hay y tiene que dar lo mismo que al empezar.
 *
 * Uso: node scripts/caminar-registro-mensajes.mjs
 */
import { leerEnv, authKv } from './lib/kv-auth.mjs'

const env = leerEnv()
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v

const URL = env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el .env'); process.exit(1) }
const auth = authKv(env)

const { default: handler } = await import('../api/_reclamos.js')
const { LARGO_MAXIMO_MENSAJE } = await import('../lib/reclamos/mensajes.core.js')

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

const leerVista = async (query) => {
  const res = resFalso()
  await handler({ method: 'GET', headers: auth, query, body: null }, res)
  return { status: res.code, ...(res.body || {}) }
}

let ok = 0, mal = 0
const chequear = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`) }
  else { mal++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
}

const leer = async (id) => (await (await sb(`devoluciones?id=eq.${id}&select=*`)).json())[0]
const borrar = (id) => sb(`devoluciones?id=eq.${id}`, { method: 'DELETE' })
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const antes = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
console.log(`\nFilas reales de BDI antes: ${antes.length}\n`)

let id = null
try {
  const [fila] = await (await sb('devoluciones', {
    method: 'POST',
    body: JSON.stringify({
      store: 'bdi', estado: 'en_revision', motivo: 'falla',
      cliente: 'CAMINATA MENSAJES — BORRAR', orden_tn: '000000',
      items: [{ sku: 'CAM-1', producto: 'PRODUCTO DE PRUEBA', cantidad: 1, precio: '20000.00' }],
      stock_estado: 'no_aplica', reintegro_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
      historial: [],
    }),
  })).json()
  id = fila.id
  console.log(`Sembrada la fila ${id}\n`)

  // ── 0. Cómo nace la columna ────────────────────────────────────────────────
  console.log('0. La columna, antes de que nadie escriba')
  const f0 = await leer(id)
  chequear('nace vacía o nula (⛔ nunca con algo adentro)', !f0.mensajes || f0.mensajes.length === 0, JSON.stringify(f0.mensajes))
  const antesUpdated = f0.updated_at

  // ── 1. El primer mensaje ───────────────────────────────────────────────────
  console.log('\n1. Se le copia el mensaje de apertura')
  const TEXTO1 = 'Hola Ana,\n\nMandanos fotos por acá: https://ejemplo/reclamo/abc\n\n¡Gracias!'
  const r1 = await llamar({ store: 'bdi', action: 'mensaje', id, tipo: 'pedir_fotos', texto: TEXTO1 })
  chequear('contesta 200', r1.status === 200, JSON.stringify(r1))
  const f1 = await leer(id)
  chequear('la base tiene UNA entrada', (f1.mensajes || []).length === 1, JSON.stringify(f1.mensajes))
  chequear('con el momento', f1.mensajes?.[0]?.tipo === 'pedir_fotos', f1.mensajes?.[0]?.tipo)
  chequear('con el TEXTO entero, saltos de línea incluidos', f1.mensajes?.[0]?.texto === TEXTO1, JSON.stringify(f1.mensajes?.[0]?.texto))
  chequear('con quién lo mandó', !!f1.mensajes?.[0]?.por, JSON.stringify(f1.mensajes?.[0]?.por))
  chequear('y con la fecha', !!Date.parse(f1.mensajes?.[0]?.at || ''), f1.mensajes?.[0]?.at)

  // 🔴 La regla que más cuesta ver: dos alertas cuentan desde `updated_at`.
  chequear('🔴 ⛔ NO movió `updated_at`: el reloj de lo que falta hacer sigue donde estaba',
    f1.updated_at === antesUpdated, `${antesUpdated} → ${f1.updated_at}`)
  chequear('⛔ ni apiló un evento en el historial', (f1.historial || []).length === 0, `${(f1.historial || []).length} eventos`)

  // ── 2. El segundo, arriba del primero ──────────────────────────────────────
  console.log('\n2. Después se le copia la resolución')
  const TEXTO2 = 'Hola Ana,\n\nTe devolvemos $13.491.\n\n¡Gracias!'
  await llamar({ store: 'bdi', action: 'mensaje', id, tipo: 'resolucion', texto: TEXTO2 })
  const f2 = await leer(id)
  chequear('quedan las DOS, en orden', (f2.mensajes || []).map((m) => m.tipo).join(',') === 'pedir_fotos,resolucion', JSON.stringify((f2.mensajes || []).map((m) => m.tipo)))
  chequear('y el primero quedó intacto', f2.mensajes?.[0]?.texto === TEXTO1)

  // ── 3. El doble click ──────────────────────────────────────────────────────
  console.log('\n3. El doble click sobre el mismo botón')
  const r3 = await llamar({ store: 'bdi', action: 'mensaje', id, tipo: 'resolucion', texto: TEXTO2 })
  chequear('contesta 200 y dice que es repetido', r3.status === 200 && r3.repetido === true, JSON.stringify(r3))
  const f3 = await leer(id)
  chequear('⛔ y no lo duplicó en la base', (f3.mensajes || []).length === 2, `${(f3.mensajes || []).length}`)

  // ── 4. Lo que ⛔ no se registra ────────────────────────────────────────────
  console.log('\n4. Lo que el servidor rechaza')
  const r4a = await llamar({ store: 'bdi', action: 'mensaje', id, tipo: 'resolución', texto: 'hola' })
  chequear('un momento que ⛔ no existe: 400', r4a.status === 400, JSON.stringify(r4a))
  const r4b = await llamar({ store: 'bdi', action: 'mensaje', id, tipo: 'resolucion', texto: '   ' })
  chequear('sin texto: 400', r4b.status === 400, JSON.stringify(r4b))
  const r4c = await llamar({ store: 'bdi', action: 'mensaje', id, tipo: 'resolucion', texto: 'x'.repeat(LARGO_MAXIMO_MENSAJE + 1) })
  chequear('pasado el tope: 400 (⛔ no se recorta)', r4c.status === 400, JSON.stringify(r4c))
  const f4 = await leer(id)
  chequear('y la base quedó igual', (f4.mensajes || []).length === 2, `${(f4.mensajes || []).length}`)

  const r4d = await llamar({ store: 'bdi', action: 'mensaje', id: 99999999, tipo: 'resolucion', texto: 'hola' })
  chequear('un reclamo que no existe: 404', r4d.status === 404, JSON.stringify(r4d))

  // ── 5. El texto más largo que arma el módulo entra cómodo ──────────────────
  console.log('\n5. Un mensaje de los de verdad (436 bytes es el más largo que arma el módulo)')
  await dormir(1100)
  const r5 = await llamar({ store: 'bdi', action: 'mensaje', id, tipo: 'propuesta', texto: 'á'.repeat(500) })
  chequear('entra sin problemas', r5.status === 200, JSON.stringify(r5))
  const f5 = await leer(id)
  chequear('y vuelve con los acentos enteros', f5.mensajes?.[2]?.texto === 'á'.repeat(500), `largo ${f5.mensajes?.[2]?.texto?.length}`)

  // ── 6. La vista que lo lee ─────────────────────────────────────────────────
  console.log('\n6. `vista=mensajes`, que es por donde lo lee la pantalla')
  const v6 = await leerVista({ store: 'bdi', vista: 'mensajes', id: String(id) })
  chequear('contesta 200 con los tres', v6.status === 200 && (v6.mensajes || []).length === 3, JSON.stringify(v6).slice(0, 200))
  chequear('con el texto adentro', v6.mensajes?.[1]?.texto === TEXTO2)

  const v6b = await leerVista({ store: 'bdi', vista: 'mensajes', id: '99999999' })
  chequear('un reclamo que no existe: 404', v6b.status === 404, JSON.stringify(v6b))

  // 🔑 El listado ⛔ NO los trae: pesan, y el oráculo es que la columna no está en la respuesta.
  console.log('\n7. El listado ⛔ no los baja (pesan)')
  const v7 = await leerVista({ store: 'bdi' })
  const mia = (v7.devoluciones || []).find((d) => d.id === id)
  chequear('la fila viene en el listado', !!mia, `${(v7.devoluciones || []).length} filas`)
  chequear('🔑 y ⛔ SIN la columna `mensajes`', mia && !('mensajes' in mia), JSON.stringify(Object.keys(mia || {})).slice(0, 200))
} finally {
  if (id) { await borrar(id); console.log(`\nBorrada la fila ${id}`) }
}

const despues = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
chequear(`las ${antes.length} filas reales quedaron intactas`, despues.length === antes.length, `ahora hay ${despues.length}`)

console.log(`\n${ok} de ${ok + mal}`)
process.exit(mal ? 1 : 0)
