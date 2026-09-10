/**
 * LA ORDEN DE ETIQUETADO DEL DEPÓSITO — Feria Zattia, 14→19 sep 2026.
 *
 * Pedido de Bruno (10-sep): *«necesito saber qué está en el depósito que tengo que etiquetar, pq no
 * puedo etiquetar todo, pq tampoco se va a vender todo; necesito una orden de etiquetado de depósito
 * seria, con nombre del producto, cantidad y etiqueta a colocar»*.
 *
 * 🔑 La cuenta es una resta, ⛔ no un porcentaje del stock:
 *
 *        bajar = demanda esperada de los 6 días  −  lo que YA está exhibido en el local
 *
 * y se corta arriba por lo que hay en el depósito. Lo que ya está en el salón ⛔ no se baja, y lo
 * que no se va a vender ⛔ no se etiqueta: por eso la orden es MUCHO más chica que el depósito.
 *
 * 🔴 **El reparto va por VENTA y ⛔ NUNCA por stock** — medido el 9-sep: los modelos con más de 80
 * en depósito vendieron 35 u en promedio y los de menos de 20 vendieron 70. **El stock alto es el
 * síntoma de que no se vendía** ⇒ repartir por stock le da las etiquetas justo al que no despacha.
 *
 * De dónde sale cada número:
 *   · TOTAL de la feria — **700 prendas en los 6 días**, que es el techo de la expectativa medida
 *     contra el sale de agosto (17 → 45 u/día durante el evento ⇒ 80-120 u/día en la feria).
 *   · el PESO de cada modelo — u/mes, con dos fuentes y en este orden:
 *       A) lo que vendió **con el sale puesto** (13-ago → hoy), que es la demanda viva a precio bajo;
 *       B) si el sale no dice nada, el **mejor mes de la temporada anterior** — es el caso de las
 *          2.340 de lencería, que están **ocultas y en cero en el local**: su cero ⛔ no es del
 *          producto, es de que nadie puede verlas ([[feedback_areben_cero_transitorio_no_es_el_estado]]).
 *     ⚠️ Las dos fuentes son ventanas de ~30 días, así que se suman como «u/mes», pero ⛔ no son la
 *     misma medición: A es a precio de oferta y B a precio normal. Sirve para REPARTIR, ⛔ no para
 *     prometer el volumen de cada modelo.
 *   · el PISO — 2 unidades para todo lo que está en **cero en el local**: sin eso el modelo ⛔ no
 *     está en la feria, está en una caja.
 *
 *   node scripts/feria-zattia-etiquetado.mjs           → la orden, agrupada por mesa
 *   node scripts/feria-zattia-etiquetado.mjs --json    → la misma orden, para armar el documento
 *
 * ⛔ No escribe nada: ni en la campaña, ni en Gestión Nube, ni en Tienda Nube.
 */
import { authKv } from './lib/kv-auth.mjs'

const H = { ...authKv(), 'content-type': 'application/json' }
const API = 'https://monitorareben.vercel.app/api/datos'
const LIQ = 'l1788656536418_tdukfi'
const TOTAL = 700              // el techo de la expectativa medida contra el sale
const PORTALLE = Number(process.argv.find(a => a.startsWith('--por-talle='))?.split('=')[1] || 1)
const HOY = new Date().toISOString().slice(0, 10)
const DESDE_SALE = '2026-08-13'
const json = process.argv.includes('--json')
const log = (...a) => { if (!json) console.log(...a) }

const { items } = await (await fetch(`${API}?recurso=liquidacion&store=zattia&liq=${LIQ}`, { headers: H })).json()
const vivos = items.filter(i => i.estado !== 'descartado')
const pids = vivos.map(i => i.pid)
log(`campaña: ${vivos.length} modelos vivos (${items.length - vivos.length} descartados)`)

// ── 1. dónde está cada prenda ────────────────────────────────────────────────
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

// ── 3. la orden ──────────────────────────────────────────────────────────────
const filas = vivos.map(i => {
  const k = String(i.pid)
  const local = L.get(k) || 0, depo = D.get(k) || 0
  const vSale = sale.get(k)?.tot || 0
  const mejorMes = Math.max(0, ...Object.values(hist.get(k)?.mes || { x: 0 }))
  const peso = vSale ? vSale * 30 / dias : mejorMes    // u/mes
  return { nombre: i.foto.nombre, sku: i.foto.sku, etiqueta: i.decision?.precioSale || 0,
    local, depo, talles: (TALLES.get(k) || new Set()).size, vSale, mejorMes, peso,
    fuente: vSale ? 'sale' : (mejorMes ? 'temporada' : '—') }
})
const suma = filas.reduce((a, f) => a + f.peso, 0)
for (const f of filas) {
  f.demanda = Math.round(TOTAL * f.peso / suma)
  f.falta = Math.max(0, f.demanda - f.local)
  // 🔑 El piso ⛔ no es un número redondo: es el SURTIDO. Un modelo con 6 talles y 2 unidades ⛔ no
  // está en la mesa, está roto — el cliente ve su talle vacío. Por eso el piso es N por TALLE VIVO,
  // y sólo para lo que está en CERO en el local: lo exhibido ya tiene su curva puesta.
  f.piso = f.local === 0 && f.depo > 0 ? Math.min(f.depo, f.talles * PORTALLE) : 0
  f.bajar = Math.min(f.depo, Math.max(f.falta, f.piso))
}
const orden = filas.filter(f => f.bajar > 0).sort((a, b) => a.etiqueta - b.etiqueta || b.bajar - a.bajar)

if (json) { console.log(JSON.stringify({ generado: HOY, total: TOTAL, orden }, null, 1)); process.exit(0) }

console.log('\n═══ ORDEN DE ETIQUETADO — DEPÓSITO ═══')
let mesa = null
for (const f of orden) {
  if (f.etiqueta !== mesa) { mesa = f.etiqueta
    const t = orden.filter(x => x.etiqueta === mesa)
    console.log(`\n── ETIQUETA $${mesa.toLocaleString('es-AR')} · ${t.reduce((a, x) => a + x.bajar, 0)} etiquetas · ${t.length} modelos ──`)
    console.log('   producto                       sku    bajar   (local / depósito)  vendió')
  }
  console.log(`   ${f.nombre.slice(0, 28).padEnd(28)} ${String(f.sku).padStart(6)} ${String(f.bajar).padStart(6)}   ${String(f.local).padStart(5)} / ${String(f.depo).padStart(5)}      ${f.fuente === 'sale' ? `${f.vSale} en el sale` : f.fuente === 'temporada' ? `${f.mejorMes} en su mejor mes` : 'nunca'}`)
}
const tot = orden.reduce((a, f) => a + f.bajar, 0)
const depoTot = filas.reduce((a, f) => a + f.depo, 0)
console.log(`\n═══ ${orden.length} modelos · ${tot} prendas a etiquetar · sobre ${depoTot} que hay en el depósito (${Math.round(tot / depoTot * 100)}%) ═══`)
console.log('\ntiradas de etiquetas (Etiquetas → Libre: precio + copias):')
const tir = new Map()
for (const f of orden) tir.set(f.etiqueta, (tir.get(f.etiqueta) || 0) + f.bajar)
for (const [p, c] of [...tir].sort((a, b) => a[0] - b[0])) console.log(`   $${String(p).padStart(6)}  →  ${String(c).padStart(4)} copias`)
console.log(`\nlo que queda en el depósito sin etiquetar: ${depoTot - tot} prendas — se etiqueta si la mesa se vacía.`)

// ── 4. la sensibilidad del SURTIDO, que es la única perilla ───────────────────
// 🔴 La demanda de la lencería está medida **a precio de lista** ($19.990) y la feria la pone a
// $4.990: el ritmo histórico es un PISO, ⛔ no un pronóstico. Lo que sí se puede decidir con el
// número puesto es cuántas unidades por talle salen a la mesa.
console.log('\n═══ LA ORDEN ESTÁ DIMENSIONADA PARA VENDERSE ENTERA ═══')
console.log('   Si la expectativa es correcta, la mesa de lencería termina la feria vacía. Etiquetar')
console.log('   de más es la única defensa contra reponer a mitad de feria — y cuesta trabajo, así que')
console.log('   es una decisión, ⛔ no un número. Lo que sale cada escenario:\n')
const escenario = (total, porTalle) => filas.reduce((a, f) => {
  const dem = Math.round(total * f.peso / suma)
  const piso = f.local === 0 && f.depo > 0 ? Math.min(f.depo, f.talles * porTalle) : 0
  return a + Math.min(f.depo, Math.max(Math.max(0, dem - f.local), piso))
}, 0)
console.log('   venta esperada    1 por talle   2 por talle   3 por talle')
for (const t of [700, 1050, 1400]) {
  const et = t === TOTAL ? '  ← lo medido' : t === 1050 ? '  (+50%)' : '  (el doble)'
  console.log(`   ${String(t).padStart(4)} prendas      ${String(escenario(t, 1)).padStart(11)}   ${String(escenario(t, 2)).padStart(11)}   ${String(escenario(t, 3)).padStart(11)}${et}`)
}
