#!/usr/bin/env node
/**
 * Le pone fecha de recontacto a los clientes que COMPRARON RECIÉN, y a nadie más.
 *
 * POR QUÉ EXISTE (pedido del 23-sep-2026)
 * ---------------------------------------
 * La lista del día tenía 344 vencidos y no se podía trabajar. Buena parte de esos
 * vencidos son clientes que YA COMPRARON hace pocos días: figuran en rojo como si se
 * les debiera un mensaje, y no se les debe nada. Sacarlos de la pila es lo que más
 * limpia y lo que menos riesgo tiene.
 *
 * ⚠️ NO SE USA EL RITMO DEL CLIENTE. `lib/crm/ritmo.ts` calcula cada cuánto compra cada
 * uno a partir del historial, y hoy ESE DATO ESTÁ DISTORSIONADO: hubo meses sin
 * mercadería, así que los huecos entre compras miden el faltante de stock, no la
 * costumbre del cliente. Por eso acá la regla es plana y la puso Bruno a mano.
 *
 * LA REGLA
 * --------
 *   Compró en los últimos VENTANA días (default 20)  →  próximo contacto a ~OBJETIVO
 *   días (default 15), repartido en días hábiles entre OBJETIVO-3 y OBJETIVO+3.
 *
 * 🔑 El reparto es el punto. Si a todos se les pone la MISMA fecha, dentro de 15 días
 * vuelve a haber una pila de cien en el mismo día y estamos igual que al principio. Se
 * ordenan por antigüedad de la compra: el que compró hace más tiempo cae primero.
 *
 * ⚠️ TOCA UN SOLO CAMPO: `proximo_manual`, y SÓLO en los clientes que entran en la
 * ventana. No toca notas, ni temperatura, ni `es_mayorista`, ni descartados, ni a
 * ningún cliente que quede fuera de la regla. A diferencia de `crm-agenda.mjs`, este
 * script NO limpia las fechas de los que no entran en el plan.
 *
 * ⚠️ ARRANCA EN SIMULACIÓN. Sin `--aplicar` no escribe nada.
 * ⚠️ ANTES DE APLICAR:  node scripts/crm-kv.mjs --dump
 *
 * USO
 *   node scripts/crm-recientes.mjs                      # simula
 *   node scripts/crm-recientes.mjs --ventana=20 --objetivo=15
 *   node scripts/crm-recientes.mjs --aplicar            # escribe en producción
 *   node scripts/crm-recientes.mjs --hoy=2026-09-23     # fija el día
 */

import { authKv, leerEnv } from './lib/kv-auth.mjs'
import { sumarDias } from '../lib/calendario/fechas.core.js'
import { feriadosDe, proximoHabil } from '../lib/crm/agenda.core.js'

const KV = 'https://bdi-catalogo.vercel.app/api/ingresos'
const CANAL = '10'
const CANAL_TECNICO = 12
/** Piso de seguridad: por debajo de esto la lectura salió mal y no se escribe nada. */
const PISO_FICHAS = 700

const args = process.argv.slice(2)
const flag = (n, def) => {
  const a = args.find((x) => x.startsWith(`--${n}=`))
  return a ? a.split('=')[1] : def
}
const APLICAR = args.includes('--aplicar')

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const HOY = flag('hoy', hoyISO())
const VENTANA = Number(flag('ventana', 20))
const OBJETIVO = Number(flag('objetivo', 15))
const HOLGURA = Number(flag('holgura', 3))

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const conDia = (f) => `${f} (${DOW[new Date(`${f}T00:00:00`).getDay()]})`
const plata = (n) => '$' + Math.round(n).toLocaleString('es-AR')

// ── Supabase ──────────────────────────────────────────────────────────────────

const env = leerEnv()
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
  console.error('\n⛔ Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el .env\n')
  process.exit(1)
}
const sbHeaders = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` }

/** PostgREST corta en 1000 filas sin avisar. Paginar no es opcional. */
async function sbTodo(tabla, params) {
  let out = []
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${tabla}?${params}&limit=1000&offset=${off}`, { headers: sbHeaders })
    if (!r.ok) throw new Error(`Supabase ${r.status} en ${tabla}: ${(await r.text()).slice(0, 200)}`)
    const p = await r.json()
    out = out.concat(p)
    if (p.length < 1000) return out
  }
}

// ── KV ────────────────────────────────────────────────────────────────────────

async function leerSeg() {
  const r = await fetch(`${KV}?kind=crmseg&store=bdi&nc=${Date.now()}`, { headers: authKv() })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d || d.ok !== true) {
    console.error(`\n⛔ No se pudo leer crm:seg del KV (HTTP ${r.status}). Sin eso no se hace nada:`)
    console.error('   escribir sobre una lectura fallida es lo que vacía la clave.\n')
    process.exit(1)
  }
  return d.map && typeof d.map === 'object' ? d.map : {}
}

async function guardarSeg(mapa) {
  const r = await fetch(`${KV}?kind=crmseg&store=bdi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authKv() },
    body: JSON.stringify({ map: mapa }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d || d.ok !== true) {
    console.error(`\n✗ Falló el guardado: HTTP ${r.status} ${JSON.stringify(d).slice(0, 200)}\n`)
    process.exit(1)
  }
  return d.total
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nClientes que compraron hace ${VENTANA} días o menos → fecha a ~${OBJETIVO} días`)
console.log(`Hoy: ${conDia(HOY)}\n`)

const crmSeg = await leerSeg()
const totalFichas = Object.keys(crmSeg).length
console.log(`Seguimiento leído del KV: ${totalFichas} fichas.`)
if (totalFichas < PISO_FICHAS) {
  console.error(`\n⛔ Vinieron ${totalFichas} fichas y el piso es ${PISO_FICHAS}. La lectura salió mal: no se escribe nada.\n`)
  process.exit(1)
}

// Mismo criterio que lib/crm/datos.ts: canal 10, MÁS todas las ventas de los marcados ★.
const marcados = Object.keys(crmSeg).filter((id) => crmSeg[id] && crmSeg[id].es_mayorista)
const SEL = 'select=id,date_sale,total_price,client_id,channel_id'
let ventas = await sbTodo('ventas', `${SEL}&channel_id=eq.${CANAL}&client_id=not.is.null`)
for (let i = 0; i < marcados.length; i += 150) {
  const lote = marcados.slice(i, i + 150).join(',')
  ventas = ventas.concat(await sbTodo('ventas', `${SEL}&client_id=in.(${lote})&client_id=not.is.null`))
}
const porId = new Map()
for (const v of ventas) if (Number(v.channel_id) !== CANAL_TECNICO) porId.set(v.id, v)
ventas = [...porId.values()]

const acc = new Map()
for (const v of ventas) {
  const a = acc.get(v.client_id) || { id: v.client_id, ultima: null, total: 0, n: 0 }
  a.total += parseFloat(String(v.total_price)) || 0
  a.n += 1
  if (v.date_sale && (!a.ultima || v.date_sale > a.ultima)) a.ultima = v.date_sale
  acc.set(v.client_id, a)
}

const dias = (d) => (d ? Math.floor((new Date(`${HOY}T12:00:00`) - new Date(d)) / 86400000) : null)
const descartados = new Set(Object.keys(crmSeg).filter((k) => crmSeg[k] && crmSeg[k].descartado))

// Los que entran: compraron dentro de la ventana y no están descartados.
const elegidos = [...acc.values()]
  .map((c) => ({ ...c, diasUltimo: dias(c.ultima) }))
  .filter((c) => c.diasUltimo !== null && c.diasUltimo >= 0 && c.diasUltimo <= VENTANA)
  .filter((c) => !descartados.has(String(c.id)))
  // El que compró hace MÁS tiempo va primero: es el que antes vuelve a necesitar aire.
  .sort((a, b) => b.diasUltimo - a.diasUltimo || b.total - a.total)

console.log(`Clientes con compra en los últimos ${VENTANA} días: ${elegidos.length}  (descartados afuera: ${descartados.size})\n`)

if (!elegidos.length) {
  console.log('No hay nadie en la ventana. Nada que hacer.\n')
  process.exit(0)
}

// Días hábiles de la franja [OBJETIVO-HOLGURA, OBJETIVO+HOLGURA].
const franja = []
for (let d = OBJETIVO - HOLGURA; d <= OBJETIVO + HOLGURA; d++) {
  const f = proximoHabil(sumarDias(HOY, d), feriadosDe([Number(HOY.slice(0, 4)), Number(HOY.slice(0, 4)) + 1]))
  if (!franja.includes(f)) franja.push(f)
}
franja.sort()

// Reparto parejo, en orden.
const porDia = Math.ceil(elegidos.length / franja.length)
const asignaciones = elegidos.map((c, i) => ({ ...c, fecha: franja[Math.min(Math.floor(i / porDia), franja.length - 1)] }))

console.log(`Se reparten en ${franja.length} días hábiles, ~${porDia} por día:\n`)
console.log('Fecha                cuántos   compraron hace')
const agrupado = new Map()
for (const a of asignaciones) {
  const g = agrupado.get(a.fecha) || []
  g.push(a)
  agrupado.set(a.fecha, g)
}
for (const [f, g] of [...agrupado.entries()].sort()) {
  const dd = g.map((x) => x.diasUltimo)
  console.log(`  ${conDia(f).padEnd(20)} ${String(g.length).padStart(5)}     ${Math.max(...dd)} a ${Math.min(...dd)} días`)
}

// ── Qué cambia exactamente ────────────────────────────────────────────────────

const nuevo = { ...crmSeg }
let sinFecha = 0
let vencidaPisada = 0
let futuraPisada = 0
const ejemplos = []

for (const a of asignaciones) {
  const k = String(a.id)
  const antes = crmSeg[k] || {}
  const previa = antes.proximo_manual || null
  if (!previa) sinFecha++
  else if (previa < HOY) vencidaPisada++
  else futuraPisada++
  if (ejemplos.length < 12) ejemplos.push({ id: k, previa, fecha: a.fecha, diasUltimo: a.diasUltimo, total: a.total, n: a.n })
  nuevo[k] = { ...antes, proximo_manual: a.fecha }
}

console.log(`\nDe los ${asignaciones.length}:`)
console.log(`  ${vencidaPisada} tenían una fecha VENCIDA (salen de la pila de rojos)`)
console.log(`  ${futuraPisada} tenían una fecha futura (se les corre)`)
console.log(`  ${sinFecha} no tenían fecha (ahora la tienen)`)

console.log('\nMuestra de 12, para mirar antes de aplicar:')
console.log('  cliente     compró hace   fecha antes      fecha nueva     pedidos   total')
for (const e of ejemplos) {
  console.log(
    `  #${e.id.padEnd(10)} ${String(e.diasUltimo + 'd').padStart(6)}      ${String(e.previa || '— sin fecha').padEnd(15)} ${e.fecha}      ${String(e.n).padStart(3)}   ${plata(e.total)}`,
  )
}

// Control duro: nada más que `proximo_manual` puede haber cambiado, y sólo en los elegidos.
// 🔑 El mapa PUEDE crecer: un cliente que compró y que nadie tocó nunca no tiene ficha
// (`crm:seg` son "los que alguien ya tocó", no "los clientes"). Se le crea una, pero la
// ficha nueva no puede traer NADA más que la fecha — si trae otra cosa, algo se inventó.
const idsTocados = new Set(asignaciones.map((a) => String(a.id)))
let otrosCampos = 0
let fueraDePlan = 0
const nuevas = []
for (const k of Object.keys(nuevo)) {
  const existia = Object.prototype.hasOwnProperty.call(crmSeg, k)
  const a = crmSeg[k] || {}
  const b = nuevo[k]
  if (!idsTocados.has(k)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) fueraDePlan++
    continue
  }
  if (!existia) {
    nuevas.push(k)
    const campos = Object.keys(b)
    if (campos.length !== 1 || campos[0] !== 'proximo_manual') otrosCampos++
    continue
  }
  for (const campo of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (campo === 'proximo_manual') continue
    if (JSON.stringify(a[campo]) !== JSON.stringify(b[campo])) otrosCampos++
  }
}
const borradas = Object.keys(crmSeg).filter((k) => !Object.prototype.hasOwnProperty.call(nuevo, k))

console.log(`\nVerificación del diff:`)
console.log(`  fichas que cambian: ${idsTocados.size}`)
console.log(`  campos distintos de proximo_manual que cambian: ${otrosCampos}  (tiene que ser 0)`)
console.log(`  fichas tocadas fuera del plan: ${fueraDePlan}  (tiene que ser 0)`)
console.log(`  fichas BORRADAS: ${borradas.length}  (tiene que ser 0)`)
console.log(`  fichas nuevas (clientes que compraron y no tenían ficha): ${nuevas.length}`)
console.log(`  el mapa pasa de ${totalFichas} a ${Object.keys(nuevo).length} fichas`)

if (otrosCampos || fueraDePlan || borradas.length) {
  console.error('\n⛔ El diff no es el esperado. No se escribe nada.\n')
  process.exit(1)
}

if (!APLICAR) {
  console.log('\n— SIMULACIÓN: no se tocó nada.')
  console.log('  Para aplicarlo: node scripts/crm-recientes.mjs --aplicar')
  console.log('  Respaldo antes: node scripts/crm-kv.mjs --dump\n')
  process.exit(0)
}

console.log('\nEscribiendo en producción…')
const total = await guardarSeg(nuevo)
console.log(`✓ Listo. El servidor confirma ${total} fichas.\n`)
