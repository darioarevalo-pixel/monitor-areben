// CAMINATA EN VIVO de **la pregunta de la puerta**, contra la base REAL, con los DOS handlers en
// proceso: el webhook que la abre (`api/_oc-webhook.js`) y la Agenda que la contesta
// (`api/_agenda.js`).
//
//   node scripts/caminar-pregunta-puerta.mjs
//
// Por qué existe: el camino entero cruza dos handlers, dos secretos distintos y tres tablas. Los
// tests fijan cada mitad; lo que ⛔ ningún test puede fijar es que **la base real acepte** la fila
// que el webhook arma —tipos, `not null`, el `datos` jsonb— y que el `.not('datos->…','is',null)`
// que evita repreguntar lo resuelva **la base** y no un filtro nuestro: contra un Supabase de
// mentira, un filtro mal escrito sale verde.
//
// 🔴 SIEMBRA CONTRA PRODUCCIÓN Y BORRA. La OC es `bdi:999999903`, que no puede chocar con una real.
// ⚠️ **Hay una ventana de segundos** en la que la pregunta y los clones están vivos en la Agenda de
// gente de verdad. Es el precio de caminar el camino que escribe; por eso se borra en `finally` y
// **el último chequeo es que los contadores vuelvan exactamente a donde estaban**.
import { readFileSync } from 'fs'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { createClient } from '@supabase/supabase-js'
import { CAMPO } from '../lib/agenda/pregunta-ingreso.core.js'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
  }),
)
const SECRETO = Buffer.from('caminata-pregunta-puerta-secreto').toString('base64')
process.env.SUPABASE_URL = env.SUPABASE_URL
process.env.SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY
process.env.INGRESO_WEBHOOK_SECRET = SECRETO

const { default: webhook } = await import('../api/_oc-webhook.js')
const { default: agenda } = await import('../api/_agenda.js')
const { authKv } = await import('./lib/kv-auth.mjs')
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const OC = 999999903
const REF = `bdi:${OC}`
const auth = authKv(env)
let ok = 0, mal = 0
const chequeo = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log(`  ✅ ${nombre}`) }
  else { mal++; console.log(`  ❌ ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
}

const hoyMenos = (n) => new Date(Date.now() - n * 86400000).toISOString()

async function postearWebhook({ id, confirmada }) {
  const cuerpo = JSON.stringify({
    type: 'oc.confirmada',
    data: {
      negocio: { slug: 'bdi' },
      orden_compra: { id: OC, label: `OC-${OC}`, estado: 'confirmada', confirmada_at: confirmada },
      proveedor: { id: 77, nombre: 'CAMINATA' },
      lineas: [{ sku: 'SKU-CAMINATA-PUERTA', nombre: 'Renglón de caminata', cantidad_pedida: 1, cantidad_contada: 1 }],
      totales: { productos: 1, lineas: 1, unidades_pedidas: 1, unidades_contadas: 1, diferencia_unidades: 0, lineas_con_diferencia: 0 },
    },
  })
  const bytes = Buffer.from(cuerpo, 'utf8')
  const ts = Math.floor(Date.now() / 1000)
  const firma = crypto.createHmac('sha256', Buffer.from(SECRETO, 'base64'))
    .update(Buffer.concat([Buffer.from(`${id}.${ts}.`, 'utf8'), bytes])).digest('base64')
  const req = Readable.from([bytes])
  req.method = 'POST'
  req.headers = { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${firma}` }
  let status = 0, body = null
  const res = { status: (n) => { status = n; return res }, json: (o) => { body = o; return res } }
  await webhook(req, res)
  return { status, body }
}

async function postearAgenda(body) {
  let status = 0, cuerpo = null
  const res = { setHeader: () => res, status: (n) => { status = n; return res }, json: (o) => { cuerpo = o; return res }, end: () => res }
  await agenda({ method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, query: {}, body }, res)
  return { status, body: cuerpo }
}

/** La pregunta, leída POR OTRO CAMINO: supabase-js directo, ⛔ no la respuesta del handler. */
const leerPregunta = async () => {
  const { data } = await sb.from('agenda_items').select('*').not(`datos->${CAMPO}`, 'is', null)
  return (data || []).filter((i) => i.datos?.[CAMPO]?.oc === REF)
}
const contarItems = async () => (await sb.from('agenda_items').select('*', { count: 'exact', head: true })).count
const clones = async () => {
  const { data } = await sb.from('agenda_items').select('id, titulo, regla, marcas, datos').like('titulo', `OC-${OC} · %`)
  return data || []
}

const antes = { items: await contarItems() }
console.log(`Antes: ${antes.items} ítems en la Agenda\n`)

try {
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('1 · Una OC confirmada HOY abre exactamente UNA pregunta')
  const r1 = await postearWebhook({ id: 'cam-puerta-1', confirmada: hoyMenos(0) })
  chequeo('el webhook contesta 200', r1.status === 200, JSON.stringify(r1))
  chequeo('y DICE lo que hizo con la pregunta', String(r1.body?.agenda).includes('pregunta abierta'), String(r1.body?.agenda))
  const p1 = await leerPregunta()
  chequeo('quedó UNA pregunta en la base', p1.length === 1, `${p1.length}`)
  const q = p1[0] || {}
  chequeo('el título nombra la OC y el proveedor', String(q.titulo).includes(`OC-${OC}`) && String(q.titulo).includes('CAMINATA'), q.titulo)
  chequeo('va a Administración por ROL', q.destino?.tipo === 'roles' && q.destino?.roles?.[0] === 'administracion', JSON.stringify(q.destino))
  chequeo('nace en la marca de la OC', JSON.stringify(q.marcas) === '["bdi"]', JSON.stringify(q.marcas))
  chequeo('ARRASTRA', q.datos?.arrastra === true)
  chequeo('la cargó «Ingresos», ⛔ no una persona', q.autor === 'Ingresos', String(q.autor))
  chequeo('⛔ NO es una plantilla (se clonaría a sí misma)', !q.datos?.plantilla)

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n2 · El mismo hecho otra vez ⛔ no repregunta — y el filtro lo resuelve LA BASE')
  const r2 = await postearWebhook({ id: 'cam-puerta-2', confirmada: hoyMenos(0) })
  chequeo('contesta 200 y dice que ya tiene', String(r2.body?.agenda).includes('ya tiene'), String(r2.body?.agenda))
  chequeo('sigue habiendo UNA sola', (await leerPregunta()).length === 1)

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n3 · El freno del BACKFILL, contra la base de verdad')
  await sb.from('agenda_items').delete().eq('id', q.id)
  const r3 = await postearWebhook({ id: 'cam-puerta-3', confirmada: '2026-06-17T10:00:00.000Z' })
  chequeo('una OC de junio ⛔ no abre nada', (await leerPregunta()).length === 0)
  chequeo('y el motivo viaja', String(r3.body?.agenda).includes('no se pregunta por lo viejo'), String(r3.body?.agenda))

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n4 · Contestarla siembra los pasos del ingreso — un click')
  const r4 = await postearWebhook({ id: 'cam-puerta-4', confirmada: hoyMenos(0) })
  chequeo('la pregunta se vuelve a abrir', String(r4.body?.agenda).includes('pregunta abierta'), String(r4.body?.agenda))
  const q2 = (await leerPregunta())[0]

  const mal1 = await postearAgenda({ action: 'ingreso-puerta', id: q2.id, puerta: 'la-de-atras' })
  chequeo('una puerta inventada → 400 y ⛔ no siembra', mal1.status === 400 && (await clones()).length === 0, JSON.stringify(mal1.body))
  const sin = await postearAgenda({ action: 'ingreso-puerta', id: q2.id })
  chequeo('sin puerta → 400 que la nombra', sin.status === 400 && /puerta/i.test(String(sin.body?.error)), JSON.stringify(sin.body))

  const r5 = await postearAgenda({ action: 'ingreso-puerta', id: q2.id, puerta: 'importacion' })
  chequeo('contesta 200', r5.status === 200, JSON.stringify(r5))
  const cl = await clones()
  chequeo(`sembró los moldes de importación (${cl.length})`, cl.length > 0 && cl.length === Number(r5.body?.creados), `${cl.length} vs ${r5.body?.creados}`)
  chequeo('los clones nacen en la marca de la OC', cl.every((c) => JSON.stringify(c.marcas) === '["bdi"]'))
  chequeo('todos arrastran', cl.every((c) => c.datos?.arrastra === true))
  chequeo('todos llevan la puerta elegida', cl.every((c) => c.datos?.puerta === 'importacion'))
  chequeo('ninguno quedó marcado como molde', cl.every((c) => !c.datos?.plantilla))

  const { data: tilde } = await sb.from('agenda_hechos').select('*').eq('item_id', q2.id)
  chequeo('la pregunta quedó TILDADA y ⛔ no borrada', (tilde || []).length === 1 && (await leerPregunta()).length === 1, JSON.stringify(tilde))
  chequeo('el tilde va a la fecha del hecho', tilde?.[0]?.fecha === q2.regla?.fecha, `${tilde?.[0]?.fecha} vs ${q2.regla?.fecha}`)

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n5 · Contestarla dos veces ⛔ no duplica')
  const r6 = await postearAgenda({ action: 'ingreso-puerta', id: q2.id, puerta: 'importacion' })
  chequeo('la segunda contesta `ya`', r6.body?.ya === true, JSON.stringify(r6.body))
  chequeo('y no aparecieron clones nuevos', (await clones()).length === cl.length)
} finally {
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n6 · Se borra todo lo sembrado')
  for (const c of await clones()) await sb.from('agenda_items').delete().eq('id', c.id)
  for (const p of await leerPregunta()) await sb.from('agenda_items').delete().eq('id', p.id)
  await sb.from('recepcion_linea').delete().eq('oc_ref', REF)
  await sb.from('recepcion_oc').delete().eq('id', REF)
  await sb.from('recepcion_evento').delete().like('webhook_id', 'cam-puerta-%')
  const despues = await contarItems()
  chequeo('la Agenda volvió a donde estaba', despues === antes.items, `${antes.items} → ${despues}`)
  chequeo('no quedó ninguna pregunta ni ningún clon', (await leerPregunta()).length === 0 && (await clones()).length === 0)
}

console.log(`\n${ok} de ${ok + mal}${mal ? ` — ❌ ${mal} EN ROJO` : ''}`)
process.exit(mal ? 1 : 0)
