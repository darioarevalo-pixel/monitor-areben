// CAMINATA EN VIVO de Insumos (`api/_insumos.js`) contra la base REAL de BDI.
//
//   node scripts/caminar-insumos.mjs
//
// Por qué existe: la suite prueba el núcleo con datos en memoria y el handler con una base falsa.
// Lo que ninguna de las dos toca es la cadena entera —validar, escribir, releer, derivar la regla—
// contra Postgres de verdad, que es donde viven los `check`, el `cascade` y los tipos de columna.
//
// 🔑 **El ORÁCULO es la base leída por OTRO camino** (supabase-js directo), ⛔ no la respuesta del
// handler ni la pantalla que escribió.
//
// ⚠️ SIEMBRA Y BORRA. Usa un insumo llamado `ZZ CAMINATA` que no puede chocar con uno real, y al
// final lo borra y verifica que los contadores vuelvan a donde estaban.
//
// ⛔ La SESIÓN no se ejerce acá: el perfil se stubea, como en los tests. Que el 403 salga antes de
// tocar la base lo fija `tests/handlers-autorizacion.test.ts`.
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
  }),
)
process.env.SUPABASE_URL = env.SUPABASE_URL
process.env.SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY
process.env.ZATTIA_SUPABASE_URL = env.ZATTIA_SUPABASE_URL || ''
process.env.ZATTIA_SUPABASE_SERVICE_KEY = env.ZATTIA_SUPABASE_SERVICE_KEY || env.ZATTIA_SUPABASE_KEY || ''

const PERFIL = { name: 'ZZ Caminata', admin: false, cuenta: null, acceso: { bdi: { insumos: true } }, funcion: [] }
const fetchReal = globalThis.fetch
globalThis.fetch = async (url, opts) => (String(url).includes('bdi-catalogo.vercel.app/api/usuarios')
  ? { ok: true, json: async () => ({ ok: true, perfil: PERFIL }) }
  : fetchReal(url, opts))

const { default: handler } = await import('../api/_insumos.js')
// ⛔ Lo DERIVADO no se comprueba acá: vive en `lib/insumos/core.ts`, que es TypeScript y no lo puede
// importar un script de Node. Y ⛔ no se reimplementa —una segunda versión de la regla es
// exactamente lo que este repo evita—: lo cubren `tests/insumos.test.ts` y sus siete mutantes.
// Lo que SÓLO esta caminata puede probar es la cadena contra Postgres de verdad: los `check`, el
// `cascade`, los tipos de columna y que el GET devuelva la forma que la regla necesita.
const { signoDe } = await import('../lib/insumos/core.core.js')
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const sobre = (d) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const req = (extra) => ({ method: 'GET', headers: { 'x-monitor-auth': sobre({ user: 'ZZ', pass: 'x' }) }, query: { store: 'bdi' }, body: {}, ...extra })
const post = (body) => req({ method: 'POST', body })

function res() {
  const r = { code: 0, body: null, setHeader() {}, status(c) { r.code = c; return r }, json(b) { r.body = b; return r }, end() { return r } }
  return r
}
const llamar = async (q) => { const r = res(); await handler(q, r); return r }

let ok = 0, mal = 0
const chequear = (que, cond, detalle = '') => { if (cond) { ok += 1; console.log(`✓ ${que}`) } else { mal += 1; console.log(`✗ ${que} ${detalle}`) } }

// Por si una caminata anterior murió a mitad de camino.
{
  const viejos = (await sb.from('insumo').select('id').eq('nombre', 'ZZ CAMINATA')).data ?? []
  for (const v of viejos) await sb.from('insumo').delete().eq('id', v.id)
  if (viejos.length) console.log(`(se limpiaron ${viejos.length} restos de una caminata anterior)`)
}

const antes = {
  insumos: (await sb.from('insumo').select('id')).data?.length ?? -1,
  movs: (await sb.from('insumo_movimiento').select('id')).data?.length ?? -1,
}
console.log(`base: ${antes.insumos} insumos · ${antes.movs} movimientos\n`)

// 1) Alta
let r = await llamar(post({ action: 'guardar-insumo', insumo: { nombre: 'ZZ CAMINATA', tipo: 'comercial', unidad: 'unidad', marcas: [], minimo: 2, consumo: {}, activo: true } }))
chequear('el alta contesta 200', r.code === 200, JSON.stringify(r.body))
const id = r.body?.id
const leerFila = async () => (await sb.from('insumo').select('*').eq('id', id).maybeSingle()).data
chequear('la fila existe en la base, leída por otro camino', !!(await leerFila()))

// 2) Lo que la base rechaza aunque el handler lo dejara pasar
r = await llamar(post({ action: 'guardar-insumo', insumo: { nombre: 'ZZ CAMINATA 2', tipo: 'inventado', unidad: 'unidad', marcas: [], minimo: 2 } }))
chequear('un tipo que no existe se frena con 400 y su motivo', r.code === 400 && /tipo/.test(String(r.body?.error)), JSON.stringify(r.body))

// 3) Compra, traslado y recuento
r = await llamar(post({ action: 'guardar-movimiento', movimiento: { insumoId: id, tipo: 'compra', ubicacion: 'deposito', cantidad: 100, fecha: '2026-08-01', precioTotal: 5000 } }))
chequear('la compra entra', r.code === 200, JSON.stringify(r.body))
r = await llamar(post({ action: 'trasladar', insumoId: id, origen: 'deposito', destino: 'local-bdi', cantidad: 30, fecha: '2026-08-02' }))
chequear('el traslado entra', r.code === 200, JSON.stringify(r.body))
const patas = (await sb.from('insumo_movimiento').select('*').eq('insumo_id', id)).data.filter((m) => m.tipo === 'traslado')
chequear('el traslado dejó DOS filas con el mismo grupo', patas.length === 2 && patas[0].grupo === patas[1].grupo)
r = await llamar(post({ action: 'guardar-movimiento', movimiento: { insumoId: id, tipo: 'consumo', ubicacion: 'local-bdi', cantidad: 30, fecha: '2026-08-11' } }))
chequear('el consumo entra', r.code === 200, JSON.stringify(r.body))

// 4) El GET, y la regla sobre lo que trajo el GET
r = await llamar(req())
const insumo = (r.body?.insumos || []).find((x) => x.id === id)
const movs = (r.body?.movimientos || []).filter((m) => m.insumoId === id)
chequear('el GET trae el insumo y sus 4 movimientos', !!insumo && movs.length === 4, `movs=${movs.length}`)
const compra = movs.find((m) => m.tipo === 'compra')
chequear('el precio vuelve como NÚMERO y no como texto (numeric de Postgres)', typeof compra.precioTotal === 'number' && compra.precioTotal === 5000, String(compra.precioTotal))
chequear('la pata del traslado sobrevive al viaje por el jsonb', movs.filter((m) => m.pata === 'salida').length === 1 && movs.filter((m) => m.pata === 'entrada').length === 1)
// La suma con el signo del núcleo, sobre lo que devolvió el GET: 100 − 30 + 30 − 30 = 70.
const porLugar = {}
for (const m of movs) porLugar[m.ubicacion] = (porLugar[m.ubicacion] ?? 0) + signoDe(m) * m.cantidad
chequear('el stock quedó 70 en depósito y 0 en el local', porLugar.deposito === 70 && porLugar['local-bdi'] === 0, JSON.stringify(porLugar))

// 5) Borrar una pata se lleva las dos
r = await llamar(post({ action: 'borrar-movimiento', id: patas[0].id }))
const quedan = (await sb.from('insumo_movimiento').select('id').eq('insumo_id', id)).data.length
chequear('borrar una pata se llevó las DOS', r.code === 200 && quedan === 2, `quedan ${quedan}`)

// 6) Borrar el insumo se lleva su libro (cascade)
r = await llamar(post({ action: 'borrar-insumo', id }))
chequear('el insumo se borró', r.code === 200 && !(await leerFila()))
const despues = {
  insumos: (await sb.from('insumo').select('id')).data.length,
  movs: (await sb.from('insumo_movimiento').select('id')).data.length,
}
chequear('los contadores volvieron a donde estaban', despues.insumos === antes.insumos && despues.movs === antes.movs, JSON.stringify({ antes, despues }))

console.log(`\n${ok} de ${ok + mal}`)
process.exitCode = mal ? 1 : 0
