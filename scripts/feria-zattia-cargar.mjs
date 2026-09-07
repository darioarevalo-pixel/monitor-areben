/**
 * Carga los productos de la Feria Septiembre 2026 de Zattia en la campaña de Liquidación.
 *
 * 🔑 **Esto NO toca la tienda.** `sumar-items` escribe filas en `liquidacion_items` de nuestra base;
 * el único paso que le escribe a Gestión Nube es "Aplicar", que va el domingo 13. Los ítems entran
 * en `pendiente`: el precio de mesa lo pone el botón **Precios de mesa** con la escalera, que corre
 * `porEscalera` del núcleo. ⛔ Este script no reimplementa esa regla a propósito.
 *
 * 🔴 El `.env` de este repo apunta a OTRAS Supabase que las de producción (`liquidaciones` da 0
 * filas ahí). Todo entra por la API de prod con `x-monitor-auth`, el mismo camino del navegador.
 *
 *   node scripts/feria-zattia-cargar.mjs            → sólo mide y muestra (no escribe)
 *   node scripts/feria-zattia-cargar.mjs --escribir → manda las tandas
 */
import { authKv } from './lib/kv-auth.mjs'
// El cruce con Tienda Nube, IMPORTADO y no copiado: así la foto que se congela acá es la misma que
// elegiría la pantalla. Node 25 despoja los tipos del `.ts` solo.
import { indexarTn, imagenDe } from '../lib/tn.ts'
// La línea del producto. `esStunned` es EL corte por SKU —el mismo que usan el memo, Norte y
// márgenes—, y por eso se importa en vez de escribir /^STU/ acá: cuando esa regla se copia, las
// copias se despegan (lo cuenta el encabezado de `lineas.core.js`, donde ya pasó tres veces).
import { esStunned } from '../lib/lineas.core.js'

const BASE = 'https://monitorareben.vercel.app/api'
const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'
const H = { ...authKv(), 'content-type': 'application/json' }
const LIQ = 'l1788656536418_tdukfi'     // Feria Septiembre 2026
const SALE_AGO = 'l1785967225514_jqqfp8' // Sale Invierno Agosto 2026
const ESCRIBIR = process.argv.includes('--escribir')

async function post(body) {
  const r = await fetch(`${BASE}/datos`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return JSON.parse(t)
}
async function get(qs) {
  const r = await fetch(`${BASE}/datos?${qs}`, { headers: H })
  const t = await r.text()
  if (!r.ok) throw new Error(`${qs} → ${r.status} ${t.slice(0, 300)}`)
  return JSON.parse(t)
}
async function espejo(tabla, params) {
  const out = []
  for (let off = 0; ; off += 1000) {
    const j = await post({ recurso: 'espejo', store: 'zattia', tabla, params: `${params}&limit=1000&offset=${off}` })
    const filas = Array.isArray(j) ? j : j.filas || j.data || j.rows
    out.push(...filas)
    if (filas.length < 1000) break
  }
  return out
}

const hoy = new Date()
const diaMenos = (n) => new Date(hoy.getTime() - n * 864e5).toISOString().slice(0, 10)

// 🔴 `foto.imagen` es un campo CONGELADO: la pantalla dibuja `item.foto.imagen` y nada más
// (`Liquidacion.tsx:1286`, `DefinirPrecio.tsx:518`). Cargar con `null` deja la campaña sin fotos
// para siempre aunque Tienda Nube las tenga — pasó el 6-sep con los 376 de la feria.
const [prods, inv, ventas, det, costosR, cat] = await Promise.all([
  espejo('productos', 'select=id,name,category,sku,retailer_price,created_at,active&active=eq.true'),
  espejo('inventario', 'select=product_id,store_name,available_quantity'),
  espejo('ventas', `select=id,date_sale&date_sale=gte.${diaMenos(120)}`),
  espejo('venta_detalles', 'select=sale_id,product_id,quantity'),
  post({ recurso: 'costos', store: 'zattia' }),
  fetch(`${AUDIT}?store=zattia`, { headers: H }).then((r) => r.json()),
])
const costos = costosR.costos || {}
const idxTn = indexarTn(cat.products || [])

// ── Las ventas por producto, en las tres ventanas que congela la foto ──────────────────────────
const fechaDe = new Map(ventas.map((v) => [v.id, String(v.date_sale).slice(0, 10)]))
const v7 = {}, v30 = {}, v90 = {}, ultima = {}
const c7 = diaMenos(7), c30 = diaMenos(30), c90 = diaMenos(90)
for (const d of det) {
  const f = fechaDe.get(d.sale_id)
  if (!f) continue
  const q = d.quantity || 0
  const pid = d.product_id
  if (f > (ultima[pid] || '')) ultima[pid] = f
  if (f >= c90) v90[pid] = (v90[pid] || 0) + q
  if (f >= c30) v30[pid] = (v30[pid] || 0) + q
  if (f >= c7) v7[pid] = (v7[pid] || 0) + q
}

const stock = {}
for (const i of inv) stock[i.product_id] = (stock[i.product_id] || 0) + (i.available_quantity || 0)

// El precio que HOY está puesto en Gestión Nube por el sale de agosto. Es la `promoPrevia` real:
// 179 de los modelos de la feria están también en esa campaña, con su precio escrito y vivo.
const itemsAgo = await get(`recurso=liquidacion&store=zattia&liq=${SALE_AGO}`)
const promo = {}
for (const i of itemsAgo?.items || []) {
  if (i.estado === 'aplicado' && i.aplicacion?.precioEscrito > 0) promo[String(i.pid)] = i.aplicacion.precioEscrito
}

// ── El lote ───────────────────────────────────────────────────────────────────────────────────
// El corte es por fecha de alta en GN: hasta julio-2026 va, agosto y septiembre quedan afuera
// enteros —son la temporada nueva— salvo el abrigo, que aunque se haya cargado en septiembre es
// invierno que termina. Es la corrección de Bruno del 5-sep.
const ABRIGO = /\b(SWEATER|CAMPERA|BUZO|CARDIGAN|CHALECO|SAQUITO|BLAZER)\b/i
const dias = (f) => (f ? Math.round((hoy - new Date(f)) / 864e5) : 9999)

const lote = []
for (const p of prods) {
  const u = stock[p.id] || 0
  if (u <= 0) continue
  if (p.created_at >= '2026-08-01' && !ABRIGO.test(p.name)) continue
  // 🔴 **Stunned comparte la base y el Gestión Nube de Zattia, pero NO es de esta feria**: nunca
  // entró a una liquidación —el sale de agosto tiene 0 de sus productos— y vende por su propia
  // Tienda Nube. Sin este corte se colaron 25 (182 prendas, $2,9M) el 6-sep, y se notaron porque
  // eran los únicos sin foto: sus fotos viven en la TN de Stunned, no en la de Zattia.
  // ⚠️ El separador es el SKU y un producto de Stunned sin SKU se contaría como Zattia.
  if (esStunned(p.sku)) continue
  const costo = Number(costos[p.id]) || 0
  lote.push({
    pid: String(p.id),
    estado: 'pendiente',
    foto: {
      nombre: p.name, sku: p.sku || null,
      costo, sinCosto: !(costo > 0),
      precioNormal: p.retailer_price || 0,
      promoPrevia: promo[String(p.id)] || null,
      stock: u,
      ventas7: v7[p.id] || 0, ventas30: v30[p.id] || 0, ventas90: v90[p.id] || 0,
      vidaUtil: null,
      ultimaVenta: ultima[p.id] || null,
      diasSinVender: dias(ultima[p.id]),
      imagen: imagenDe({ sku: p.sku, name: p.name }, idxTn),
    },
    decision: { precioSale: null, pctDesc: null, markup: null, margen: null, nota: null, porQuien: null, cuando: null },
    revision: { porQuien: null, cuando: null, objecion: null, precioAnterior: null },
    aplicacion: { aplicadoEn: null, precioEscrito: null, variantesEscritas: null, categoriaSaleAgregada: false },
  })
}

const ya = await get(`recurso=liquidacion&store=zattia&liq=${LIQ}`)
const yaPids = new Set((ya.items || []).map((i) => String(i.pid)))
const faltan = lote.filter((i) => !yaPids.has(i.pid))

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0)
const pesos = (n) => '$' + Math.round(n).toLocaleString('es-AR')
console.log(`lote: ${lote.length} modelos · ${sum(lote, x => x.foto.stock)} prendas · ${pesos(sum(lote, x => x.foto.stock * x.foto.costo))} al costo`)
console.log(`ya en la campaña: ${yaPids.size} · faltan cargar: ${faltan.length}`)
console.log(`sin costo (no les toca mesa): ${lote.filter(x => x.foto.sinCosto).length}`)
console.log(`con precio de sale vivo en GN (promoPrevia): ${lote.filter(x => x.foto.promoPrevia).length}`)
const conVenta = lote.filter(x => x.foto.ventas90 > 0).length
console.log(`con ventas en 90 días: ${conVenta} de ${lote.length}`)
const AYLA = lote.filter(x => /\b(AYLA|NYA|GAIA)\b/i.test(x.foto.nombre))
console.log(`⚠️ AYLA/NYA/GAIA (la decisión abierta): ${AYLA.length} modelos · ${sum(AYLA, x => x.foto.stock)} prendas · ${pesos(sum(AYLA, x => x.foto.stock * x.foto.costo))}`)

if (!ESCRIBIR) { console.log('\n(sin --escribir: no se mandó nada)'); process.exit(0) }

for (let i = 0; i < faltan.length; i += 200) {
  const tanda = faltan.slice(i, i + 200)
  const r = await post({ recurso: 'liquidacion', store: 'zattia', action: 'sumar-items', id: LIQ, items: tanda })
  console.log(`tanda ${i / 200 + 1}: ${tanda.length} mandados → sumados ${r.sumados}, ya estaban ${r.yaEstaban}`)
}
