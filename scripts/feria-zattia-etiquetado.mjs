/**
 * LA ORDEN DE ETIQUETADO DEL DEPÓSITO — Feria Zattia, 14→19 sep 2026.
 *
 * Pedido de Bruno (10-sep): *«necesito saber qué está en el depósito que tengo que etiquetar, pq no
 * puedo etiquetar todo, pq tampoco se va a vender todo»*.
 *
 * 🔴 🔑 **Y LA CORRECCIÓN QUE LA REESCRIBIÓ, el mismo día**: *«me parece un montón etiquetar 17
 * prendas, pq si no se vende 17, se tiene que reetiquetar o sacar la etiqueta; o sea, vamos
 * reponiendo a demanda, pero necesitamos para el primer día»*. **La primera versión dimensionaba a
 * los 6 DÍAS y la pregunta era el PRIMER día.** Una etiqueta de más ⛔ no es trabajo de más: es
 * trabajo que hay que DESHACER —sacarla o reescribirla— cuando la prenda no se vendió.
 *
 * ⇒ **El horizonte es el día 1 y después se repone a demanda.** Y con ese horizonte **la orden ⛔ no
 * la manda la demanda: la manda el SURTIDO**, porque la venta esperada del día 1 repartida entre
 * 351 modelos da menos de una unidad por modelo. Lo que decide es otra cosa:
 *
 *        bajar = la CURVA DE TALLES que le falta a la mesa   (2 a 3 de CADA talle, menos lo exhibido)
 *
 * La demanda sólo mueve adentro de esa banda. Tope duro: lo que hay en el depósito.
 *
 * 🔴 **El reparto va por VENTA y ⛔ NUNCA por stock** — medido el 9-sep: los modelos con más de 80
 * en depósito vendieron 35 u en promedio y los de menos de 20 vendieron 70. **El stock alto es el
 * síntoma de que no se vendía.**
 *
 * De dónde sale cada número:
 *   · **El día 1 son ~100 prendas.** Medido, ⛔ no estimado: el sale de agosto abrió el jueves 13
 *     con **38 unidades** de estos mismos 351 modelos (la semana previa hacía 7-30), y la
 *     expectativa de la feria es ~2,6× el ritmo del sale. 🔑 **El pico es el día 2, ⛔ no el 1**:
 *     el sale hizo 58 el viernes.
 *   · el PESO de cada modelo — u/mes, con dos fuentes y en este orden:
 *       A) lo que vendió **con el sale puesto** (13-ago → hoy), que es la demanda viva a precio bajo;
 *       B) si el sale no dice nada, el **mejor mes de la temporada anterior** — es el caso de las
 *          2.340 de lencería, que están **ocultas y en cero en el local**: su cero ⛔ no es del
 *          producto, es de que nadie puede verlas.
 *     ⚠️ A es a precio de oferta y B a precio normal: sirve para REPARTIR, ⛔ no para prometer.
 *
 *   node scripts/feria-zattia-etiquetado.mjs                 → la orden del día 1, por mesa
 *   node scripts/feria-zattia-etiquetado.mjs --min-talle=3   → mover la banda
 *   node scripts/feria-zattia-etiquetado.mjs --json          → la misma orden, para el documento
 *
 * ⛔ No escribe nada: ni en la campaña, ni en Gestión Nube, ni en Tienda Nube.
 */
import { authKv } from './lib/kv-auth.mjs'

const H = { ...authKv(), 'content-type': 'application/json' }
const API = 'https://monitorareben.vercel.app/api/datos'
const LIQ = 'l1788656536418_tdukfi'
const DIA1 = 100               // la venta esperada del primer día, medida contra la apertura del sale
// 🔴 🔑 **LA UNIDAD DE LA MESA ES EL TALLE, ⛔ NO EL MODELO** (Bruno, 10-sep, corrigiéndome dos
// veces): *«el mínimo tiene que ser 2 x talle, con un máximo de 3, pq si se vende a primera hora el
// día lunes, no tengo más para ese mismo lunes»* — y después, sobre mi versión por modelo:
// *«nunca puede ser 2 por modelo, sino me quedo sin nada»*. **Tiene razón: la clienta ⛔ no compra
// «el modelo», compra SU TALLE.** Un corpiño con 3 talles y 3 unidades tiene **un solo M**: si el M
// se va a las 9, para esa clienta el modelo está agotado aunque queden dos prendas en la mesa.
// ⇒ **la curva es de 2 a 3 POR TALLE**, y la demanda sólo mueve adentro de esa banda.
const MINTALLE = Number(process.argv.find(a => a.startsWith('--min-talle='))?.split('=')[1] || 2)
const MAXTALLE = Number(process.argv.find(a => a.startsWith('--max-talle='))?.split('=')[1] || 3)
// 🔴 **LO QUE YA ESTÁ EN EL SALÓN ⛔ NO ES TRABAJO DE DEPÓSITO** (Bruno, 10-sep: *«campera rock ya
// hay allá, así que sacalo; lo mismo con campera lines, sí hay en el local»*). Se etiqueta **con lo
// exhibido, el día antes** — completarle la curva desde el depósito era mío y ⛔ no lo pidió nadie.
// ⚠️ **Y el espejo puede estar equivocado en el otro sentido**: POLLERA DOT figura en **0 en el
// local** y Bruno dice *«tiene que haber normalmente, así que se hace en el etiquetado del día»*
// ⇒ **la palabra de Bruno le gana al espejo**, y por eso la exclusión es una LISTA con nombre, ⛔ no
// un filtro que se pueda deducir del dato.
const EN_EL_LOCAL = ['POLLERA DOT']
const HOY = new Date().toISOString().slice(0, 10)
const DESDE_SALE = '2026-08-13'
const json = process.argv.includes('--json')
const log = (...a) => { if (!json) console.log(...a) }

const { items } = await (await fetch(`${API}?recurso=liquidacion&store=zattia&liq=${LIQ}`, { headers: H })).json()
const vivos = items.filter(i => i.estado !== 'descartado')
const pids = vivos.map(i => i.pid)
log(`campaña: ${vivos.length} modelos vivos (${items.length - vivos.length} descartados)`)

// ── 1. dónde está cada prenda, y con qué talles ──────────────────────────────
const L = new Map(), D = new Map(), TALLES = new Map()
for (let off = 0; ; off += 1000) {
  const r = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({ recurso: 'espejo', store: 'zattia', tabla: 'inventario',
    params: `select=product_id,store_name,size_name,available_quantity&order=product_id&limit=1000&offset=${off}` }) })
  const fl = await r.json()
  for (const x of fl) {
    const k = String(x.product_id), n = (x.store_name || '').toLowerCase().trim(), q = Number(x.available_quantity || 0)
    if (/mayorista/.test(n) || q <= 0) continue
    const M = n === 'local' ? L : D
    M.set(k, (M.get(k) || 0) + q)
    if (M === D) { const t = TALLES.get(k) || new Set(); t.add(x.size_name || '?'); TALLES.set(k, t) }
  }
  if (fl.length < 1000) break
}

// ── 2. qué vendió cada uno: el sale primero, la temporada anterior de reserva ─
const traer = async (desde, hasta) => {
  const r = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({ recurso: 'liquidacion', store: 'zattia', action: 'ventas-campania', desde, hasta, pids }) })
  if (!r.ok) { console.error(r.status, (await r.text()).slice(0, 300)); process.exit(1) }
  return r.json()
}
const contar = ({ ventas, detalles }) => {
  const fe = new Map(ventas.map(v => [v.id, v.date_sale])), ca = new Map(ventas.map(v => [v.id, v.channel]))
  const acc = new Map()
  for (const d of detalles) {
    if (/mayorista/i.test(ca.get(d.sale_id) || '')) continue
    const k = String(d.product_id), a = acc.get(k) || { tot: 0, mes: {} }
    const m = (fe.get(d.sale_id) || '').slice(0, 7)
    a.tot += d.quantity || 0; a.mes[m] = (a.mes[m] || 0) + (d.quantity || 0)
    acc.set(k, a)
  }
  return acc
}
const sale = contar(await traer(DESDE_SALE, HOY))
const hist = contar(await traer('2024-06-01', HOY))
const dias = Math.round((Date.parse(HOY) - Date.parse(DESDE_SALE)) / 86400e3)
log(`ventana del sale: ${DESDE_SALE} → ${HOY} (${dias} días) · modelos con venta: ${sale.size}`)

// ── 3. la orden del día 1 ────────────────────────────────────────────────────
const filas = vivos.map(i => {
  const k = String(i.pid)
  const local = L.get(k) || 0, depo = D.get(k) || 0
  const t = [...(TALLES.get(k) || new Set())]
  const vSale = sale.get(k)?.tot || 0
  const mejorMes = Math.max(0, ...Object.values(hist.get(k)?.mes || { x: 0 }))
  const peso = vSale ? vSale * 30 / dias : mejorMes    // u/mes
  return { pid: String(i.pid), nombre: i.foto.nombre, etiqueta: i.decision?.precioSale || 0,
    local, depo, talles: t.length, listaTalles: t, vSale, mejorMes, peso,
    fuente: vSale ? 'sale' : (mejorMes ? 'temporada' : '—') }
})
const suma = filas.reduce((a, f) => a + f.peso, 0)
for (const f of filas) {
  // la banda de la mesa: entre MINTALLE y MAXTALLE de CADA talle, descontando lo exhibido
  f.piso = Math.max(0, f.talles * MINTALLE - f.local)
  f.techo = Math.max(0, f.talles * MAXTALLE - f.local)
  // la demanda del día 1: sólo mueve adentro de la banda
  f.demanda1 = Math.round(DIA1 * f.peso / suma)
  f.porDemanda = Math.max(0, f.demanda1 - f.local) > f.piso
  f.bajar = Math.min(f.depo, Math.min(f.techo, Math.max(f.piso, Math.max(0, f.demanda1 - f.local))))
}
const orden = filas
  .filter(f => f.bajar > 0 && f.local === 0 && !EN_EL_LOCAL.includes(f.nombre))
  .sort((a, b) => a.etiqueta - b.etiqueta || b.bajar - a.bajar)
const fuera = filas.filter(f => f.bajar > 0 && (f.local > 0 || EN_EL_LOCAL.includes(f.nombre)))

if (json) { console.log(JSON.stringify({ generado: HOY, dia1: DIA1, minTalle: MINTALLE, maxTalle: MAXTALLE, orden }, null, 1)); process.exit(0) }

console.log(`\n═══ ORDEN DE ETIQUETADO — DEPÓSITO, DÍA 1 (${MINTALLE} a ${MAXTALLE} por talle) ═══`)
let mesa = null
for (const f of orden) {
  if (f.etiqueta !== mesa) { mesa = f.etiqueta
    const t = orden.filter(x => x.etiqueta === mesa)
    console.log(`\n── ETIQUETA $${mesa.toLocaleString('es-AR')} · ${t.reduce((a, x) => a + x.bajar, 0)} etiquetas · ${t.length} modelos ──`)
  }
  console.log(`   ${f.nombre.slice(0, 26).padEnd(26)} ${String(f.bajar).padStart(3)}  talles ${f.listaTalles.join('/').padEnd(14)} salón ${String(f.local).padStart(3)} · depósito ${String(f.depo).padStart(3)}${f.porDemanda ? '   ← por demanda, arriba del piso' : ''}${f.bajar === f.depo && f.depo < f.piso ? '   ← no hay más en el depósito' : ''}`)
}
const tot = orden.reduce((a, f) => a + f.bajar, 0)
const depoTot = filas.reduce((a, f) => a + f.depo, 0)
console.log(`\n═══ ${orden.length} modelos · ${tot} prendas · sobre ${depoTot} del depósito (${Math.round(tot / depoTot * 100)}%) ═══`)
console.log(`la venta esperada del día 1 son ${DIA1} prendas ⇒ la mesa arranca con ${tot} bajadas + ${filas.reduce((a, f) => a + f.local, 0)} ya exhibidas.`)
console.log('\ntiradas de etiquetas (Etiquetas → Libre: precio + copias):')
const tir = new Map()
for (const f of orden) tir.set(f.etiqueta, (tir.get(f.etiqueta) || 0) + f.bajar)
for (const [p, c] of [...tir].sort((a, b) => a[0] - b[0])) console.log(`   $${String(p).padStart(6)}  →  ${String(c).padStart(4)} copias`)

// ── 4. qué cuesta cada elección de curva ─────────────────────────────────────
console.log('\n═══ LA ÚNICA PERILLA ES LA CURVA ═══')
console.log('   Etiquetar de más ⛔ no es trabajo de más: es trabajo que hay que DESHACER.\n')
const cuenta = n => filas.reduce((a, f) => a + Math.min(f.depo, Math.max(0, f.talles * n - f.local)), 0)
for (const n of [1, 2, 3]) {
  console.log(`   ${n} de cada talle  →  ${String(cuenta(n)).padStart(4)} etiquetas${n === MINTALLE ? '   ← el piso de la orden de arriba' : ''}`)
}
if (fuera.length) {
  console.log('\n📌 Fuera de la orden porque YA ESTÁN EN EL SALÓN — se etiquetan con lo exhibido, el día antes:')
  for (const f of fuera) console.log(`     ${f.nombre.padEnd(26)} ${f.local ? `${f.local} en el salón` : 'el espejo dice 0, pero Bruno dice que hay'}`)
}
const cortos = orden.filter(f => f.depo < f.piso)
if (cortos.length) {
  console.log(`\n🔴 ${cortos.length} modelos ⛔ no llegan al piso de ${MINTALLE} por talle porque NO HAY MÁS en el depósito:`)
  for (const f of cortos) console.log(`     ${f.nombre.padEnd(24)} ${f.talles} talles · sólo ${f.depo} en el depósito`)
}
