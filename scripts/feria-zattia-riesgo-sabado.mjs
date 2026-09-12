/**
 * QUÉ SE PUEDE ETIQUETAR HOY SÁBADO SIN REGALAR LA VENTA DEL SÁBADO — Feria Zattia.
 *
 * Pedido de Bruno (12-sep, con el local abierto): la feria abre el lunes 14 a las 10 y etiquetar
 * el lunes a la mañana no llega. Se etiqueta HOY, y **si el cliente ve la etiqueta se le vende a
 * ese precio** (a mano en la caja, efectivo o transferencia). La pregunta es el ORDEN:
 *
 *     ¿qué mesa se puede etiquetar AHORA sin que moleste, y cuál conviene dejar para la tarde
 *      porque hoy todavía se vende sin problema al precio que tiene puesto?
 *
 * 🔑 **La respuesta es una plata, ⛔ no una intuición**: lo que cuesta etiquetar algo temprano es
 *
 *        riesgo = (precio que tiene HOY − precio de feria) × lo que ese modelo vende UN SÁBADO
 *
 * Las dos mitades importan y por separado engañan: una prenda que resigna $20.000 pero no vende
 * ⛔ no cuesta nada, y una que resigna $2.000 pero vende diez sí.
 *
 * De dónde sale cada número:
 *   · **precio de feria** → `decision.precioSale` de la campaña `Feria Septiembre 2026`.
 *   · **precio de hoy** → `aplicacion.precioEscrito` del **Sale Invierno Agosto 2026**, que sigue
 *     `aplicada` y sigue PUESTO en Gestión Nube; el que no está en esa campaña está a **lista**
 *     (`foto.precioNormal`). ⛔ No se usa `foto.promoPrevia`: la foto de la feria está congelada
 *     al 6-sep.
 *   · **el salón** → `inventario` del espejo, `store_name = Local`, sin Mayorista. Lo que está en
 *     el DEPÓSITO tiene riesgo CERO: nadie puede comprar lo que no está a la vista.
 *   · **un sábado** → las ventas reales de los últimos sábados en **Mi Local**, ⛔ no un promedio
 *     diario estirado: el sábado es el mejor día del local y un promedio lo subestima.
 *
 *   node scripts/feria-zattia-riesgo-sabado.mjs
 *   node scripts/feria-zattia-riesgo-sabado.mjs --json
 *
 * ⛔ No escribe nada: ni en la campaña, ni en Gestión Nube, ni en Tienda Nube.
 */
import { authKv } from './lib/kv-auth.mjs'

const H = { ...authKv(), 'content-type': 'application/json' }
const API = 'https://monitorareben.vercel.app/api/datos'
const FERIA = 'l1788656536418_tdukfi'
const SALE = 'l1785967225514_jqqfp8'
const HOY = new Date().toISOString().slice(0, 10)
// La ventana de sábados arranca con el sale PUESTO (13-ago): son los sábados cuyo precio es el
// mismo que la prenda tiene colgado hoy. ⚠️ Antes del 13-ago el precio era otro ⇒ no comparan.
const DESDE = '2026-08-13'
const json = process.argv.includes('--json')
const log = (...a) => { if (!json) console.log(...a) }
const $ = n => '$' + Math.round(n).toLocaleString('es-AR')

// ── 1. los dos precios de cada modelo ────────────────────────────────────────
const traerCamp = async liq => (await (await fetch(`${API}?recurso=liquidacion&store=zattia&liq=${liq}`, { headers: H })).json()).items
const feria = (await traerCamp(FERIA)).filter(i => i.estado !== 'descartado')
const sale = await traerCamp(SALE)
const puesto = new Map(sale.filter(i => i.estado === 'aplicado' && i.aplicacion?.precioEscrito)
  .map(i => [String(i.pid), i.aplicacion.precioEscrito]))
log(`feria: ${feria.length} modelos vivos · sale de agosto: ${puesto.size} con precio puesto en GN`)

// ── 2. dónde está cada prenda ────────────────────────────────────────────────
const L = new Map(), D = new Map()
for (let off = 0; ; off += 1000) {
  const fl = await (await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({ recurso: 'espejo', store: 'zattia', tabla: 'inventario',
    params: `select=product_id,store_name,available_quantity&order=product_id&limit=1000&offset=${off}` }) })).json()
  for (const x of fl) {
    const k = String(x.product_id), n = (x.store_name || '').toLowerCase().trim(), q = Number(x.available_quantity || 0)
    if (/mayorista/.test(n) || q <= 0) continue
    const M = n === 'local' ? L : D
    M.set(k, (M.get(k) || 0) + q)
  }
  if (fl.length < 1000) break
}

// ── 3. lo que vende un sábado, en el local ───────────────────────────────────
const { ventas, detalles } = await (await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({
  recurso: 'liquidacion', store: 'zattia', action: 'ventas-campania', desde: DESDE, hasta: HOY, pids: feria.map(i => i.pid) }) })).json()
const dia = new Map(ventas.map(v => [v.id, (v.date_sale || '').slice(0, 10)]))
const can = new Map(ventas.map(v => [v.id, v.channel || '']))
const esSabado = f => new Date(f + 'T12:00:00Z').getUTCDay() === 6
// ⚠️ HOY se excluye: el sábado está a medias y contarlo lo subestima.
const sabados = [...new Set([...dia.values()].filter(f => f && esSabado(f) && f !== HOY))].sort()
const SAB = new Map()   // pid → unidades vendidas en el local en esos sábados
const LOC = new Map()   // pid → unidades vendidas en el local en toda la ventana
for (const d of detalles) {
  if (can.get(d.sale_id) !== 'Mi Local') continue
  const f = dia.get(d.sale_id), k = String(d.product_id), q = d.quantity || 0
  LOC.set(k, (LOC.get(k) || 0) + q)
  if (f && esSabado(f) && f !== HOY) SAB.set(k, (SAB.get(k) || 0) + q)
}
log(`ventana ${DESDE} → ${HOY} · ${sabados.length} sábados cerrados: ${sabados.join(', ')}`)

// ── 4. el riesgo de etiquetar temprano ───────────────────────────────────────
const filas = feria.map(i => {
  const k = String(i.pid)
  const hoy = puesto.get(k) ?? i.foto.precioNormal
  const mesa = i.decision?.precioSale || 0
  const local = L.get(k) || 0
  const uSab = (SAB.get(k) || 0) / (sabados.length || 1)
  return { pid: k, nombre: i.foto.nombre, mesa, hoy, lista: i.foto.precioNormal,
    enSale: puesto.has(k), local, depo: D.get(k) || 0,
    resigna: hoy - mesa, uSab, vLocal: LOC.get(k) || 0,
    riesgo: Math.max(0, hoy - mesa) * uSab }
})
const salon = filas.filter(f => f.local > 0)

// ── 5. el control que decide si la cuenta vale ───────────────────────────────
const prendas = a => a.reduce((s, f) => s + f.local, 0)
const baja = salon.filter(f => f.resigna > 0), igual = salon.filter(f => f.resigna === 0), sube = salon.filter(f => f.resigna < 0)
log(`\n══ CONTROL ══`)
log(`salón: ${salon.length} modelos · ${prendas(salon)} prendas   (el 11-sep daban 294 y 1.282)`)
log(`  bajan de precio: ${prendas(baja)} prendas (${baja.length} modelos)   (el 11-sep: 629)`)
log(`  a precio de LISTA hoy: ${prendas(salon.filter(f => !f.enSale))} prendas   (el 11-sep: 557)`)
log(`  SUBEN con la feria: ${prendas(sube)} prendas (${sube.length} modelos)   (el 11-sep: 41 / 6)`)
log(`  igual: ${prendas(igual)} prendas`)
log(`sábado: ${[...SAB.values()].reduce((a, b) => a + b, 0)} u en ${sabados.length} sábados ⇒ ${(([...SAB.values()].reduce((a, b) => a + b, 0)) / sabados.length).toFixed(0)} u por sábado de estos modelos`)

// ── 6. por mesa, de menor a mayor riesgo ─────────────────────────────────────
const mesas = new Map()
for (const f of salon) {
  const m = mesas.get(f.mesa) || { mesa: f.mesa, modelos: 0, prendas: 0, riesgo: 0, uSab: 0, resignaU: [], aLista: 0 }
  m.modelos++; m.prendas += f.local; m.riesgo += f.riesgo; m.uSab += f.uSab
  m.resignaU.push(f.resigna); if (!f.enSale) m.aLista += f.local
  mesas.set(f.mesa, m)
}
const orden = [...mesas.values()].map(m => ({ ...m,
  resignaProm: m.resignaU.reduce((a, b) => a + b, 0) / m.resignaU.length })).sort((a, b) => a.riesgo - b.riesgo)

if (json) { console.log(JSON.stringify({ generado: HOY, sabados, mesas: orden, salon }, null, 1)); process.exit(0) }

console.log(`\n═══ LAS 17 MESAS DEL SALÓN, DE LA MÁS BARATA DE ETIQUETAR AHORA A LA MÁS CARA ═══`)
console.log(`   mesa    etiquetas  prendas   resigna/prenda   u de un sábado   riesgo del sábado`)
let acum = 0
const total = orden.reduce((a, m) => a + m.riesgo, 0)
for (const m of orden) {
  acum += m.riesgo
  console.log(`   ${('$' + m.mesa.toLocaleString('es-AR')).padStart(8)}   ${String(m.modelos).padStart(5)}   ${String(m.prendas).padStart(6)}   ${$(m.resignaProm).padStart(12)}   ${m.uSab.toFixed(1).padStart(12)}   ${$(m.riesgo).padStart(12)}   ${(acum / total * 100).toFixed(0)}% acum`)
}
console.log(`   ${'TOTAL'.padStart(8)}   ${String(orden.reduce((a, m) => a + m.modelos, 0)).padStart(5)}   ${String(prendas(salon)).padStart(6)}   ${''.padStart(12)}   ${orden.reduce((a, m) => a + m.uSab, 0).toFixed(1).padStart(12)}   ${$(total).padStart(12)}`)

console.log(`\n═══ LOS MODELOS QUE CONCENTRAN EL RIESGO — los que se dejan para el final ═══`)
const top = salon.filter(f => f.riesgo > 0).sort((a, b) => b.riesgo - a.riesgo).slice(0, 25)
console.log(`   modelo                       mesa      hoy   resigna   u/sáb   riesgo   dónde`)
for (const f of top) {
  console.log(`   ${f.nombre.slice(0, 26).padEnd(26)} ${('$' + f.mesa.toLocaleString('es-AR')).padStart(8)} ${('$' + f.hoy.toLocaleString('es-AR')).padStart(9)} ${$(f.resigna).padStart(9)} ${f.uSab.toFixed(1).padStart(7)} ${$(f.riesgo).padStart(8)}   ${f.local} en salón${f.enSale ? '' : ' · A LISTA'}`)
}
const cero = salon.filter(f => f.riesgo === 0)
console.log(`\n═══ RIESGO CERO: ${cero.length} etiquetas — su modelo ⛔ no vendió NI UNA un sábado ═══`)
console.log(`   (se pueden etiquetar ahora, con el local abierto, sin resignar nada)`)

// ── 7. las dos olas ──────────────────────────────────────────────────────────
// 🔑 El corte ⛔ no es por mesa: el riesgo está concentrado en MODELOS sueltos, y el perchero
// tampoco ordena por mesa. La orden operativa es «etiquetá todo salvo esta lista».
const N = Number(process.argv.find(a => a.startsWith('--dejar='))?.split('=')[1] || 20)
const conRiesgo = salon.filter(f => f.riesgo > 0).sort((a, b) => b.riesgo - a.riesgo)
const T = conRiesgo.reduce((a, f) => a + f.riesgo, 0)
const tarde = conRiesgo.slice(0, N)
const ahora = salon.filter(f => !tarde.includes(f))
// 🔴 🔑 **LA UNIDAD DEL LOCAL ES LA ETIQUETA, ⛔ NO LA PRENDA** (Bruno, 12-sep: *«del local sólo se
// va a etiquetar lo exhibido, una sola unidad por color»*). El pid de Gestión Nube **ya es el
// color** —el color está adentro del nombre, y en el salón ⛔ no hay un solo nombre con dos pids—
// ⇒ **una etiqueta por modelo del salón**, ⛔ no una por prenda. Mi primera cuenta decía 1.149.
console.log(`\n═══ LAS DOS OLAS ═══`)
console.log(`AHORA  · salón: ${ahora.length} etiquetas (una por color exhibido) sobre ${prendas(ahora)} prendas ⇒ riesgo ${$(T - tarde.reduce((a, f) => a + f.riesgo, 0))} en un sábado entero`)
console.log(`AL CIERRE · ${tarde.length} etiquetas · ${prendas(tarde)} prendas atrás ⇒ se ahorra ${$(tarde.reduce((a, f) => a + f.riesgo, 0))} (${Math.round(tarde.reduce((a, f) => a + f.riesgo, 0) / T * 100)}% del riesgo)`)
console.log(`📌 El DEPÓSITO es otra cuenta y otra gente: 2 por talle por color ⇒ 48 modelos · 274 etiquetas,`)
console.log(`   3 tiradas ($4.990 → 176 · $12.990 → 70 · $14.990 → 28). Sale de feria-zattia-etiquetado.mjs --min-talle=2 --max-talle=2.`)
console.log(`\n   LOS ${N} QUE NO SE ETIQUETAN HASTA CERRAR:`)
for (const f of tarde) console.log(`     ☐ ${f.nombre.slice(0, 26).padEnd(26)} ${String(f.local).padStart(3)} en el salón · hoy ${('$' + f.hoy.toLocaleString('es-AR')).padStart(8)} → feria ${('$' + f.mesa.toLocaleString('es-AR')).padStart(8)}`)
console.log(`\n⚠️ El «riesgo cero» de ${cero.length} modelos es «⛔ no vendió NI UNA en los ${sabados.length} sábados medidos»,`)
console.log(`   ⛔ no «no se puede vender». Con 4 observaciones sirve para ORDENAR, ⛔ no para prometer.`)
