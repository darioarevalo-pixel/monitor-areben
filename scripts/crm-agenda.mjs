#!/usr/bin/env node
/**
 * Reparte los recontactos del CRM en días hábiles: activos primero, tibios después y los
 * fríos a goteo, todo esquivando fines de semana y feriados.
 *
 * ⚠️ **ARRANCA EN SIMULACIÓN.** Sin `--aplicar` no escribe nada: baja los datos, arma el
 * plan y lo imprime día por día. El número se mira PRIMERO y se aplica después.
 *
 * ⚠️ **ESCRIBE EL DATO SIN BACKUP DEL MONITOR.** `crm:seg` son las cadencias, las marcas
 * de mayorista y las notas escritas a mano, y no hay copia en ningún lado. Antes de
 * aplicar, sacá el respaldo:
 *
 *     node scripts/crm-kv.mjs --dump
 *
 * Este script NO toca `ultimo_contacto` ni `notas`: solo escribe `proximo_manual`. Y a
 * los descartados ("ya no se dedica") ni los mira.
 *
 * USO
 *   node scripts/crm-agenda.mjs                    # simula (no toca nada)
 *   node scripts/crm-agenda.mjs --aplicar          # escribe en producción
 *   node scripts/crm-agenda.mjs --hoy=2026-08-13   # fija el día (default: hoy)
 *   node scripts/crm-agenda.mjs --activos=48 --tibios=25 --frios=25
 *   node scripts/crm-agenda.mjs --frios-desde=2026-08-24
 *
 * REPARTO POR DEFECTO (el pedido del 13-ago-2026)
 *   activos (<60 días)   → 48/día desde hoy
 *   tibios  (60-180)     → 25/día desde el primer hábil tras el fin de semana largo
 *   fríos   (>180)       → 25/día desde hoy, a goteo, ordenados por lo que compraron
 *
 * Necesita `MONITOR_PASS` en el `.env` (ver scripts/lib/kv-auth.mjs).
 */

import { authKv, leerEnv } from './lib/kv-auth.mjs'
import { sumarDias } from '../lib/calendario/fechas.core.js'
import { feriadosDe, planificarAgenda, aplicarAgenda, proximoHabil } from '../lib/crm/agenda.core.js'

const KV = 'https://bdi-catalogo.vercel.app/api/ingresos'
/** El canal "Mayorista", igual que en lib/crm/datos.ts. */
const CANAL = '10'
/** Ventas técnicas de GN ("Sesión de fotos", "Falla", "Cambio"): no son clientes. */
const CANAL_TECNICO = 12

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
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const conDia = (f) => `${f} (${DOW[new Date(`${f}T00:00:00`).getDay()]})`

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
    console.error('   escribir sobre una lectura fallida es exactamente lo que borra los 305 clientes.')
    console.error(`   ${JSON.stringify(d).slice(0, 200)}\n`)
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

const crmSeg = await leerSeg()
console.log(`\nSeguimiento leído del KV: ${Object.keys(crmSeg).length} fichas.`)

// El orden importa: la marca ★ sale del KV y decide qué ventas se traen. Mismo criterio
// que lib/crm/datos.ts — canal 10, MÁS todas las ventas de los marcados como mayorista.
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

// Agregado por cliente: última compra y total gastado.
const acc = new Map()
for (const v of ventas) {
  const a = acc.get(v.client_id) || { id: v.client_id, ultima: null, total: 0 }
  a.total += parseFloat(String(v.total_price)) || 0
  if (v.date_sale && (!a.ultima || v.date_sale > a.ultima)) a.ultima = v.date_sale
  acc.set(v.client_id, a)
}

const dias = (d) => (d ? Math.floor((new Date(`${HOY}T12:00:00`) - new Date(d)) / 86400000) : null)
const descartados = new Set(Object.keys(crmSeg).filter((k) => crmSeg[k] && crmSeg[k].descartado))
const clientes = [...acc.values()]
  .filter((c) => !descartados.has(String(c.id)))
  .map((c) => ({ id: c.id, diasUltimo: dias(c.ultima), total: c.total }))

const anio = Number(HOY.slice(0, 4))
const feriados = feriadosDe([anio, anio + 1])
// El default de los tibios: el primer hábil DESPUÉS de mañana, o sea salteando el fin de
// semana largo. No se escribe "18 de agosto": se deduce, como todo lo demás acá.
const trasManana = proximoHabil(sumarDias(HOY, 2), feriados)
const config = {
  activo: { desde: flag('activos-desde', HOY), porDia: Number(flag('activos', 48)) },
  tibio: { desde: flag('tibios-desde', trasManana), porDia: Number(flag('tibios', 25)) },
  frio: { desde: flag('frios-desde', HOY), porDia: Number(flag('frios', 25)) },
}

const { asignaciones, porFecha, porGrupo } = planificarAgenda({ clientes, feriados, config })

console.log(`Clientes en el circuito: ${clientes.length}  (descartados afuera: ${descartados.size})`)
console.log(`  activos (<60d): ${porGrupo.activo}   tibios (60-180d): ${porGrupo.tibio}   fríos (>180d): ${porGrupo.frio}\n`)
console.log('Fecha             activos  tibios  fríos   TOTAL')
for (const [f, n] of porFecha) {
  console.log(
    `  ${conDia(f).padEnd(17)} ${String(n.activo).padStart(5)} ${String(n.tibio).padStart(7)} ${String(n.frio).padStart(6)} ${String(n.total).padStart(7)}`,
  )
}
const ultimo = [...porFecha.keys()].pop()
console.log(`\n${asignaciones.length} recontactos repartidos en ${porFecha.size} días hábiles. Termina el ${conDia(ultimo)}.`)

const nuevo = aplicarAgenda(crmSeg, asignaciones, HOY)
const limpiadas = Object.keys(nuevo).filter(
  (k) => crmSeg[k] && crmSeg[k].proximo_manual && !nuevo[k].proximo_manual,
).length
console.log(`Fechas vencidas que se limpian (clientes fuera del plan): ${limpiadas}`)
console.log(`El mapa pasa de ${Object.keys(crmSeg).length} a ${Object.keys(nuevo).length} fichas.`)

if (!APLICAR) {
  console.log('\n— SIMULACIÓN: no se tocó nada. Para aplicarlo, volvé a correrlo con --aplicar.')
  console.log('  Antes de aplicar, sacá el respaldo: node scripts/crm-kv.mjs --dump\n')
  process.exit(0)
}

console.log('\nEscribiendo en producción…')
const total = await guardarSeg(nuevo)
console.log(`✓ Listo. El servidor confirma ${total} fichas.\n`)
