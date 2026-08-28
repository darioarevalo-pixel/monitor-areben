/**
 * **Caminar en vivo el verbo `retencion-respuesta`** contra BDI de producción.
 *
 * 🔴 Este verbo **escribe plata**: al aceptar cambia la resolución, el monto, el destino, apaga el
 * pedido de retorno y recalcula los pendientes. Los tests fijan la regla pura; esto ejerce **el
 * camino entero** —handler, permisos, PostgREST— que es donde este módulo ya se rompió dos veces
 * con la regla en verde.
 *
 * 🔑 **El oráculo viene por OTRO camino que el hecho**: se escribe por la API y se lee la fila
 * cruda por PostgREST con la service key.
 *
 * ⚠️ **Siembra sus propias filas y las borra al final.** Las reales ⛔ no se tocan: al terminar
 * cuenta cuántas hay y tiene que dar lo mismo que al empezar.
 *
 * Uso: node scripts/caminar-contestar-oferta.mjs
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

const sembrar = async (extra) => {
  const r = await sb('devoluciones', {
    method: 'POST',
    body: JSON.stringify({
      store: 'bdi', estado: 'en_transito', motivo: 'no_esperaba', escenario: null,
      cliente: 'CAMINATA — BORRAR', orden_tn: '000000',
      items: [{ sku: 'CAM-1', producto: 'PRODUCTO DE PRUEBA', cantidad: 1, precio: '20000.00' }],
      compensacion: 'plata_total', monto_total: 20000, destino_prenda: 'stock',
      retorno_decidido: true, via_retorno: 'andreani',
      retencion_monto: 8000, retencion_forma: 'plata', retencion_at: new Date().toISOString(),
      reintegro_estado: 'pendiente', stock_estado: 'pendiente',
      ...extra,
    }),
  })
  const [fila] = await r.json()
  return fila
}

const leer = async (id) => {
  const r = await sb(`devoluciones?id=eq.${id}&select=*`)
  const [f] = await r.json()
  return f
}

const borrar = (id) => sb(`devoluciones?id=eq.${id}`, { method: 'DELETE' })

// ── Línea de base: cuántas filas REALES hay ────────────────────────────────────
const antes = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
console.log(`\nFilas reales de BDI antes: ${antes.length}\n`)

const sembradas = []
try {
  // ── 1. NO ACEPTÓ: sólo se anota la respuesta ────────────────────────────────
  console.log('1. El cliente NO acepta')
  const a = await sembrar({}); sembradas.push(a.id)
  const r1 = await postear({ action: 'retencion-respuesta', store: 'bdi', id: a.id, respuesta: 'rechazo' })
  chequear('el POST contesta 200', r1.status === 200, JSON.stringify(r1))
  const f1 = await leer(a.id)
  chequear('quedó registrado el rechazo', f1.retencion_respuesta === 'rechazo', String(f1.retencion_respuesta))
  chequear('⛔ NO pisó la resolución', f1.compensacion === 'plata_total', String(f1.compensacion))
  chequear('⛔ NO pisó el monto', Number(f1.monto_total) === 20000, String(f1.monto_total))
  chequear('⛔ NO apagó el retorno', f1.retorno_decidido === true && f1.via_retorno === 'andreani')
  chequear('⛔ NO movió el estado', f1.estado === 'en_transito', String(f1.estado))
  chequear('lo dejó en el historial', JSON.stringify(f1.historial || []).includes('NO aceptó'))

  // ── 2. Contestar dos veces se frena en el SERVIDOR ──────────────────────────
  const r2 = await postear({ action: 'retencion-respuesta', store: 'bdi', id: a.id, respuesta: 'acepto' })
  chequear('contestar de nuevo da 409', r2.status === 409, `${r2.status} ${r2.error || ''}`)
  const f2 = await leer(a.id)
  chequear('y la fila quedó igual', f2.compensacion === 'plata_total' && f2.retencion_respuesta === 'rechazo')

  // ── 3. ACEPTÓ en plata: cierra la rama ──────────────────────────────────────
  console.log('\n2. El cliente ACEPTA, en plata')
  const b = await sembrar({}); sembradas.push(b.id)
  const r3 = await postear({ action: 'retencion-respuesta', store: 'bdi', id: b.id, respuesta: 'acepto' })
  chequear('el POST contesta 200', r3.status === 200, JSON.stringify(r3))
  const f3 = await leer(b.id)
  chequear('la resolución pasó a plata_parcial', f3.compensacion === 'plata_parcial', String(f3.compensacion))
  chequear('el monto es el de la OFERTA', Number(f3.monto_total) === 8000, String(f3.monto_total))
  chequear('el retorno quedó APAGADO', f3.retorno_decidido === false && f3.via_retorno === null)
  chequear('la unidad sana que se queda es «regalada»', f3.destino_prenda === 'regalada', String(f3.destino_prenda))
  chequear('el estado pasó a resuelto', f3.estado === 'resuelto', String(f3.estado))
  chequear('sigue pendiente devolver la plata', f3.reintegro_estado === 'pendiente')
  chequear('⛔ no quedó pendiente ningún cupón', f3.cupon_estado === 'no_aplica', String(f3.cupon_estado))

  // ── 4. ACEPTÓ en CUPÓN: la otra rama ────────────────────────────────────────
  console.log('\n3. El cliente ACEPTA, en cupón')
  const c = await sembrar({ retencion_forma: 'cupon' }); sembradas.push(c.id)
  const r4 = await postear({ action: 'retencion-respuesta', store: 'bdi', id: c.id, respuesta: 'acepto' })
  chequear('el POST contesta 200', r4.status === 200, JSON.stringify(r4))
  const f4 = await leer(c.id)
  chequear('la resolución pasó a cupon', f4.compensacion === 'cupon', String(f4.compensacion))
  chequear('queda pendiente CREARLO en la tienda', f4.cupon_estado === 'pendiente', String(f4.cupon_estado))
  chequear('⛔ NO sale plata de la caja', f4.reintegro_estado === 'no_aplica', String(f4.reintegro_estado))
  chequear('⛔ sin plata acordada', f4.monto_acordado === null, String(f4.monto_acordado))

  // ── 5. Sin oferta registrada ⛔ no hay nada que contestar ────────────────────
  console.log('\n4. Una fila SIN oferta')
  const d = await sembrar({ retencion_monto: null, retencion_forma: null, retencion_at: null }); sembradas.push(d.id)
  const r5 = await postear({ action: 'retencion-respuesta', store: 'bdi', id: d.id, respuesta: 'acepto' })
  chequear('da 409 y ⛔ no escribe', r5.status === 409, `${r5.status} ${r5.error || ''}`)
  const f5 = await leer(d.id)
  chequear('la fila quedó intacta', f5.compensacion === 'plata_total' && f5.retencion_respuesta === null)
} finally {
  for (const id of sembradas) await borrar(id)
  const despues = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
  console.log(`\nFilas reales de BDI después: ${despues.length}`)
  chequear('las filas reales quedaron INTACTAS', despues.length === antes.length, `${antes.length} → ${despues.length}`)
  console.log(`\n${ok} de ${ok + mal}${mal ? '  ❌' : '  ✓'}`)
  process.exit(mal ? 1 : 0)
}
