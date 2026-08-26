// CAMINATA EN VIVO del receptor del webhook de Ingresos (`api/_oc-webhook.js`), contra la base REAL
// de BDI, con un secreto de prueba propio.
//
//   node scripts/caminar-oc-webhook.mjs
//
// Por qué existe: hasta hoy el camino que ESCRIBE nunca corrió contra una base. En producción sólo
// se pudo ejercer el borde (503 sin secreto, 400 por el techo del cuerpo) porque el secreto real es
// del emisor. Acá se invoca el handler tal cual —firma incluida— con `INGRESO_WEBHOOK_SECRET` de
// prueba, y el ORÁCULO es la base leída por otro camino (supabase-js directo), no la respuesta.
//
// ⚠️ SIEMBRA Y BORRA. Usa una OC de id 999999901 (`bdi:999999901`), que no puede chocar con una
// real, y al final borra lo que sembró y verifica que los contadores vuelvan a donde estaban.
import { readFileSync } from 'fs'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
  }),
)
const SECRETO = Buffer.from('caminata-oc-webhook-secreto-de-prueba').toString('base64')
process.env.SUPABASE_URL = env.SUPABASE_URL
process.env.SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY
process.env.INGRESO_WEBHOOK_SECRET = SECRETO

const { default: handler } = await import('../api/_oc-webhook.js')
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const OC = 999999901
const REF = `bdi:${OC}`
let ok = 0, mal = 0
const chequeo = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log(`  ✅ ${nombre}`) }
  else { mal++; console.log(`  ❌ ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
}

/** Invoca el handler como lo invoca Vercel: cuerpo por el stream, cabeceras Standard Webhooks. */
async function postear({ id, cuerpo, ts = Math.floor(Date.now() / 1000), secreto = SECRETO, firmaRota = false }) {
  const bytes = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo, 'utf8')
  const contenido = Buffer.concat([Buffer.from(`${id}.${ts}.`, 'utf8'), bytes])
  const clave = Buffer.from(String(secreto).replace(/^whsec_/, ''), 'base64')
  const firma = crypto.createHmac('sha256', clave).update(contenido).digest('base64')
  const req = Readable.from([bytes])
  req.method = 'POST'
  req.headers = {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(ts),
    'webhook-signature': `v1,${firmaRota ? 'x'.repeat(firma.length) : firma}`,
  }
  let status = 0, cuerpoRes = null
  const res = { status: (n) => { status = n; return res }, json: (o) => { cuerpoRes = o; return res } }
  await handler(req, res)
  return { status, body: cuerpoRes }
}

const evento = ({ lineas, totales, tipo = 'oc.confirmada', slug = 'bdi', ocId = OC }) => ({
  type: tipo,
  data: {
    negocio: { slug },
    orden_compra: { id: ocId, label: `OC-${ocId}`, estado: 'confirmada', fecha_compra: '2026-08-01', fecha_ingreso: '2026-08-25T14:00:00Z' },
    proveedor: { id: 77, nombre: 'Proveedor de caminata' },
    lineas,
    totales,
  },
})

// ── El SKU vivo del espejo: sin él no se puede probar que el cruce ENCUENTRA (sólo que no rompe).
const { data: vivos } = await sb.from('inventario').select('sku, barcode, product_id').not('sku', 'is', null).not('product_id', 'is', null).limit(1)
const vivo = (vivos || [])[0]
if (!vivo) { console.error('No hay filas en el espejo de BDI: la caminata no puede probar el cruce.'); process.exit(1) }
console.log(`Espejo: SKU vivo ${vivo.sku} → product_id ${vivo.product_id}\n`)

const contar = async (t, filtro) => {
  let q = sb.from(t).select('*', { count: 'exact', head: true })
  if (filtro) q = filtro(q)
  const { count } = await q
  return count
}
const antes = {
  evento: await contar('recepcion_evento'),
  oc: await contar('recepcion_oc'),
  linea: await contar('recepcion_linea'),
}
console.log(`Antes: eventos ${antes.evento} · oc ${antes.oc} · líneas ${antes.linea}\n`)

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('1 · La OC confirmada entra y escribe las tres tablas')
const cuerpo1 = JSON.stringify(evento({
  lineas: [
    { sku: vivo.sku, codigo_barras: vivo.barcode, nombre: 'La que SÍ está en GN', talle: 'M', color: 'Negro', cantidad_pedida: 10, cantidad_contada: 8, diferencia: 999, observaciones: 'faltaron dos' },
    { sku: 'SKU-QUE-NO-EXISTE-CAMINATA', nombre: 'La que NO está en GN', cantidad_pedida: 5, cantidad_contada: 7, es_nuevo: true },
  ],
  totales: { productos: 2, lineas: 2, unidades_pedidas: 15, unidades_contadas: 15, diferencia_unidades: 0, lineas_con_diferencia: 2 },
}))
const r1 = await postear({ id: 'caminata-1', cuerpo: cuerpo1 })
chequeo('contesta 200', r1.status === 200, JSON.stringify(r1))
chequeo('dice qué OC y cuántas líneas', r1.body?.oc === REF && r1.body?.lineas === 2, JSON.stringify(r1.body))

const { data: oc1 } = await sb.from('recepcion_oc').select('*').eq('id', REF).maybeSingle()
chequeo('la OC quedó en la base', Boolean(oc1))
chequeo('proveedor y label viajaron', oc1?.proveedor_nombre === 'Proveedor de caminata' && oc1?.oc_label === `OC-${OC}`)
chequeo('fecha_ingreso quedó como fecha, no como ISO largo', oc1?.fecha_ingreso === '2026-08-25', String(oc1?.fecha_ingreso))
chequeo('faltantes y sobrantes por separado (2 y 2), no un neto en cero', oc1?.unidades_faltantes === 2 && oc1?.unidades_sobrantes === 2, `${oc1?.unidades_faltantes}/${oc1?.unidades_sobrantes}`)
chequeo('cumplimiento = 15/15', Number(oc1?.cumplimiento) === 1, String(oc1?.cumplimiento))
chequeo('totales_coinciden = true', oc1?.totales_coinciden === true)
chequeo('el espejo se consultó de verdad', oc1?.espejo_consultado === true)
chequeo('y contó 1 SKU sin espejo', oc1?.skus_sin_espejo === 1, String(oc1?.skus_sin_espejo))
chequeo('lineas_nuevas = 1', oc1?.lineas_nuevas === 1, String(oc1?.lineas_nuevas))

const { data: l1 } = await sb.from('recepcion_linea').select('*').eq('oc_ref', REF).order('orden')
chequeo('quedaron las 2 líneas', l1?.length === 2, String(l1?.length))
chequeo('la diferencia se RECALCULÓ (−2), no se copió el 999 del emisor', l1?.[0]?.diferencia === -2, String(l1?.[0]?.diferencia))
chequeo('el SKU vivo cruzó con GN', l1?.[0]?.en_gn === true && String(l1?.[0]?.producto_id) === String(vivo.product_id), JSON.stringify([l1?.[0]?.en_gn, l1?.[0]?.producto_id]))
chequeo('el SKU inventado NO cruzó', l1?.[1]?.en_gn === false && l1?.[1]?.producto_id === null)

const { data: e1 } = await sb.from('recepcion_evento').select('*').eq('webhook_id', 'caminata-1').maybeSingle()
chequeo('el evento quedó procesado', e1?.estado === 'procesado', String(e1?.estado))
chequeo('y guardó el payload entero para reprocesar', e1?.payload?.data?.orden_compra?.id === OC)
chequeo('enviado_en salió de la cabecera timestamp', Boolean(e1?.enviado_en))

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n2 · La misma entrega otra vez no duplica nada')
const r2 = await postear({ id: 'caminata-1', cuerpo: cuerpo1 })
chequeo('contesta 200 repetido', r2.status === 200 && r2.body?.repetido === true, JSON.stringify(r2))
chequeo('las líneas siguen siendo 2', (await contar('recepcion_linea', (q) => q.eq('oc_ref', REF))) === 2)

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n3 · Un conteo posterior de la MISMA OC pisa, no acumula')
const cuerpo3 = JSON.stringify(evento({
  lineas: [{ sku: vivo.sku, nombre: 'Único renglón del conteo final', cantidad_pedida: 10, cantidad_contada: 10 }],
  totales: { productos: 1, lineas: 1, unidades_pedidas: 10, unidades_contadas: 9, diferencia_unidades: -1, lineas_con_diferencia: 1 },
}))
const r3 = await postear({ id: 'caminata-2', cuerpo: cuerpo3 })
chequeo('contesta 200', r3.status === 200, JSON.stringify(r3))
chequeo('quedó UNA sola línea (se reemplazaron, no se sumaron)', (await contar('recepcion_linea', (q) => q.eq('oc_ref', REF))) === 1)
const { data: oc3 } = await sb.from('recepcion_oc').select('*').eq('id', REF).maybeSingle()
chequeo('totales_coinciden = false: el emisor dice 9 contadas y los renglones dicen 10', oc3?.totales_coinciden === false, String(oc3?.totales_coinciden))
chequeo('y sigue habiendo UNA sola OC', (await contar('recepcion_oc', (q) => q.eq('id', REF))) === 1)

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n4 · Lo que no es para nosotros se acepta y no escribe')
const r4 = await postear({ id: 'caminata-3', cuerpo: JSON.stringify(evento({ tipo: 'oc.borrador', lineas: [], totales: {} })) })
chequeo('tipo desconocido → 200 ignorado', r4.status === 200 && r4.body?.ignorado === 'tipo', JSON.stringify(r4))
const r5 = await postear({ id: 'caminata-4', cuerpo: JSON.stringify(evento({ slug: 'otra-marca', lineas: [], totales: {} })) })
chequeo('marca desconocida → 200 ignorado', r5.status === 200 && r5.body?.ignorado === 'store', JSON.stringify(r5))
const { data: e45 } = await sb.from('recepcion_evento').select('webhook_id, estado, oc_id').in('webhook_id', ['caminata-3', 'caminata-4'])
chequeo('los dos quedaron anotados como ignorados', (e45 || []).length === 2 && (e45 || []).every((e) => e.estado === 'ignorado'))
chequeo('y no crearon OC', (await contar('recepcion_oc', (q) => q.eq('id', REF))) === 1)

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Los tres rechazos, cada uno con su código')
const r6 = await postear({ id: 'caminata-5', cuerpo: cuerpo1, firmaRota: true })
chequeo('firma inválida → 401', r6.status === 401, JSON.stringify(r6))
const r7 = await postear({ id: 'caminata-6', cuerpo: cuerpo1, ts: Math.floor(Date.now() / 1000) - 3600 })
chequeo('mensaje viejo → 400 (reintentar no lo arregla)', r7.status === 400, JSON.stringify(r7))
process.env.INGRESO_WEBHOOK_SECRET = ''
const r8 = await postear({ id: 'caminata-7', cuerpo: cuerpo1 })
chequeo('sin secreto → 503 (reintentar SÍ lo arregla)', r8.status === 503, JSON.stringify(r8))
process.env.INGRESO_WEBHOOK_SECRET = SECRETO
const r9 = await postear({ id: 'caminata-8', cuerpo: 'esto no es json' })
chequeo('cuerpo firmado pero no JSON → 400', r9.status === 400, JSON.stringify(r9))
chequeo('ninguno de los rechazados escribió un evento', (await contar('recepcion_evento', (q) => q.in('webhook_id', ['caminata-5', 'caminata-6', 'caminata-7', 'caminata-8']))) === 0)

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n6 · Se borra lo sembrado')
await sb.from('recepcion_linea').delete().eq('oc_ref', REF)
await sb.from('recepcion_oc').delete().eq('id', REF)
await sb.from('recepcion_evento').delete().like('webhook_id', 'caminata-%')
const despues = {
  evento: await contar('recepcion_evento'),
  oc: await contar('recepcion_oc'),
  linea: await contar('recepcion_linea'),
}
chequeo('los contadores volvieron a donde estaban', despues.evento === antes.evento && despues.oc === antes.oc && despues.linea === antes.linea, JSON.stringify({ antes, despues }))

console.log(`\n${ok} de ${ok + mal}${mal ? ` — ❌ ${mal} EN ROJO` : ''}`)
process.exit(mal ? 1 : 0)
