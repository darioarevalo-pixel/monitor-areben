/**
 * Cuánto bajar del depósito y etiquetar para el primer día de la Feria Zattia.
 *
 * Contesta los tres pasos que pidió Bruno, en orden:
 *   1. qué está en el LOCAL y qué no  (`inventario` del espejo, `store_name` Local / Deposito)
 *   2. qué vendió lo que NO está      (⚠️ mirando la TEMPORADA ANTERIOR, no 90 días: los 48
 *      tienen `ventas90 = 0` porque nunca estuvieron en el salón y estaban ocultos online)
 *   3. cuántas etiquetas de cada uno
 *
 * 🔴 **El reparto va por VENTA y ⛔ NUNCA por stock.** Medido: los 15 modelos con más de 80 en
 * depósito vendieron 35 u en promedio y los 15 con menos de 20 vendieron 70 — **el stock alto es
 * el síntoma de que no se vendía**. Por stock, el reparto le daba 37 etiquetas al que vendió 58 en
 * 20 meses y 1 al que vendió 126.
 *
 * ⚠️ El «mejor mes» se midió a PRECIO NORMAL: sirve para repartir entre colores, ⛔ no para el
 * volumen absoluto a precio de feria. Por eso es un PARCIAL y se repone según lo que pase.
 *
 * 📌 Lo que está en el local ⛔ no se analiza: se etiqueta lo exhibido, el día antes (Bruno).
 *
 *   node scripts/feria-zattia-parcial.mjs        → sólo mide, no escribe nada
 */
import { authKv } from './lib/kv-auth.mjs'
const H = { ...authKv(), 'content-type': 'application/json' }
const API = 'https://monitorareben.vercel.app/api/datos'
const { items } = await (await fetch(`${API}?recurso=liquidacion&store=zattia&liq=l1788656536418_tdukfi`, { headers: H })).json()
const vivos = items.filter(i => i.estado !== 'descartado')
const pids = new Set(vivos.map(i => String(i.pid)))
let inv = [], off = 0
for (;;) {
  const r = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({ recurso: 'espejo', store: 'zattia', tabla: 'inventario',
    params: `select=product_id,store_name,available_quantity&order=product_id&limit=1000&offset=${off}` }) })
  const fl = await r.json(); inv = inv.concat(fl); if (fl.length < 1000) break; off += 1000
}
const L = new Map(), D = new Map()
for (const r of inv) { const k = String(r.product_id); if (!pids.has(k)) continue
  const n = r.store_name || '', q = Number(r.available_quantity||0); if (/mayorista/i.test(n)) continue
  if (n.toLowerCase().trim() === 'local') L.set(k,(L.get(k)||0)+q); else D.set(k,(D.get(k)||0)+q) }
const sinLocal = vivos.filter(i => !(L.get(String(i.pid))||0) && (D.get(String(i.pid))||0) > 0)
console.log('modelos con cero en el local:', sinLocal.length)
// dos temporadas para atrás
const r = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({ recurso: 'liquidacion', store: 'zattia',
  action: 'ventas-campania', desde: '2024-06-01', hasta: '2026-09-09', pids: sinLocal.map(i => i.pid) }) })
if (!r.ok) { console.error(r.status, (await r.text()).slice(0,300)); process.exit(1) }
const { ventas, detalles } = await r.json()
console.log('ventas en la ventana:', ventas.length, '· líneas de estos 48:', detalles.length)
const fe = new Map(ventas.map(v=>[v.id, v.date_sale])), ca = new Map(ventas.map(v=>[v.id, v.channel]))
console.log('rango real del espejo:', ventas.length ? ventas.map(v=>v.date_sale).sort()[0] + ' → ' + ventas.map(v=>v.date_sale).sort().at(-1) : '—')
const acc = new Map()
for (const d of detalles) {
  const k = String(d.product_id); const fecha = fe.get(d.sale_id) || ''; const canal = ca.get(d.sale_id) || ''
  const a = acc.get(k) || { mes: {}, tot: 0, may: 0 }
  const q = d.quantity || 0
  if (/mayorista/i.test(canal)) { a.may += q } else { a.mes[fecha.slice(0,7)] = (a.mes[fecha.slice(0,7)]||0)+q; a.tot += q }
  acc.set(k, a)
}
const rows = sinLocal.map(i => {
  const a = acc.get(String(i.pid)) || { mes: {}, tot: 0, may: 0 }
  const ver25 = ['2024-11','2024-12','2025-01','2025-02'].reduce((s,m)=>s+(a.mes[m]||0),0)
  const ver26 = ['2025-11','2025-12','2026-01','2026-02'].reduce((s,m)=>s+(a.mes[m]||0),0)
  const pico = Math.max(0, ...Object.values(a.mes))
  const picoMes = Object.entries(a.mes).sort((x,y)=>y[1]-x[1])[0]
  return { n: i.foto.nombre, depo: D.get(String(i.pid))||0, mesa: i.decision.precioSale||0,
    tot: a.tot, may: a.may, ver25, ver26, pico, picoMes: picoMes ? picoMes[0] : '—' }
}).sort((a,b)=>b.depo-a.depo)
console.log('\nproducto              |depósito| minorista total | mayorista | verano 24/25 | verano 25/26 | mejor mes')
for (const x of rows) console.log(`${x.n.slice(0,22).padEnd(22)}|${String(x.depo).padStart(7)} |${String(x.tot).padStart(16)} |${String(x.may).padStart(10)} |${String(x.ver25).padStart(13)} |${String(x.ver26).padStart(13)} | ${x.picoMes} (${x.pico})`)
console.log(`\nTOTALES: depósito ${rows.reduce((a,x)=>a+x.depo,0)} · minorista ${rows.reduce((a,x)=>a+x.tot,0)} · mayorista ${rows.reduce((a,x)=>a+x.may,0)}`)

console.log('\n═══ EL STOCK QUE QUEDA ES INVERSO A LO QUE VENDIÓ ═══')
const conV = rows.filter(x => x.tot > 0)
const alto = conV.filter(x => x.depo >= 80), bajo = conV.filter(x => x.depo <= 20)
const prom = xs => Math.round(xs.reduce((a,x)=>a+x.tot,0)/xs.length)
console.log(`  los ${alto.length} con MÁS de 80 en depósito vendieron ${prom(alto)} u en promedio`)
console.log(`  los ${bajo.length} con MENOS de 20 en depósito vendieron ${prom(bajo)} u en promedio`)
console.log('\n═══ EL PARCIAL, REPARTIDO POR VENTA Y NO POR STOCK ═══')
const OBJ = 620
const peso = x => x.pico || 0     // el mejor mes: lo que vende cuando está exhibido
const suma = rows.reduce((a,x)=>a+peso(x),0)
const porVenta = rows.map(x => {
  const ideal = Math.round(OBJ * peso(x) / suma)
  return { ...x, porVenta: Math.min(x.depo, Math.max(2, ideal)), porStock: Math.min(x.depo, Math.max(3, Math.round(x.depo*0.15))) }
}).sort((a,b)=>b.porVenta-a.porVenta)
console.log('producto              |depósito| vendió | mejor mes | POR VENTA | (por stock, el criterio viejo)')
for (const x of porVenta) console.log(`${x.n.slice(0,22).padEnd(22)}|${String(x.depo).padStart(7)} |${String(x.tot).padStart(7)} |${String(x.pico).padStart(10)} |${String(x.porVenta).padStart(10)} | ${x.porStock}`)
console.log(`\n  por VENTA: ${porVenta.reduce((a,x)=>a+x.porVenta,0)} prendas · por STOCK: ${porVenta.reduce((a,x)=>a+x.porStock,0)} prendas`)
