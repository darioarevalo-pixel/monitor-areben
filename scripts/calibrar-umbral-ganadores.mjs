#!/usr/bin/env node
/**
 * SOLO LECTURA — ¿con cuántas unidades minoristas por modelo el ranking minorista de una tanda ya
 * es mejor que el anticipo mayorista?
 *
 * Calibra `UMBRAL_MIN_POR_MODELO` de `lib/ganadores/core.js`. Para cada tanda de BDI con historia
 * (≥ 10 modelos dados de alta el mismo día, y ≥ `REF` días de ventas minoristas):
 *
 *   - **la verdad** = el ranking minorista a `REF` días de su primera venta minorista;
 *   - día por día, qué tan cerca está de esa verdad el ranking **minorista acumulado** y el
 *     **mayorista acumulado** (el anticipo), medido como coincidencias en el top 5 y rho de Spearman.
 *
 * El umbral es el punto (en u minoristas por modelo) desde el cual el minorista le gana al mayorista
 * y no vuelve a perder.
 *
 * ⚠️ La verdad a 30 días también es una muestra: si una tanda tiene pocas ventas a 30 días, lo que se
 * mide es cuán parecido es el ruido a sí mismo. Por eso se imprime el n de la referencia.
 *
 * Uso: node --env-file=.env scripts/calibrar-umbral-ganadores.mjs [REF=30]
 */
import { rankingDeTanda } from '../lib/ganadores/core.js'
import { esVentaTecnica } from '../lib/etl/tecnica.core.js'
import { canalDe, ladoDeCanal } from '../lib/liquidacion/canal.core.js'

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
if (!URL || !KEY) throw new Error('faltan SUPABASE_URL / SUPABASE_SERVICE_KEY (BDI)')
const REF = Number(process.argv[2] || 30)
const MIN_MODELOS = 10

async function get(path, intento = 1) {
  try {
    const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
    if (!r.ok) throw new Error(`${r.status} ${path.slice(0, 120)}: ${await r.text()}`)
    return await r.json()
  } catch (e) {
    // La red de acá corta lecturas largas con ETIMEDOUT; un reintento con pausa alcanza.
    if (intento >= 4) throw e
    await new Promise((ok) => setTimeout(ok, 2000 * intento))
    return get(path, intento + 1)
  }
}

async function todo(path) {
  const out = []
  for (let off = 0; ; off += 1000) {
    const page = await get(`${path}&order=id&offset=${off}&limit=1000`)
    out.push(...page)
    if (page.length < 1000) return out
  }
}

const dia = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)

function spearman(a, b) {
  const n = a.length
  const ma = a.reduce((s, x) => s + x, 0) / n
  const mb = b.reduce((s, x) => s + x, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2 }
  return da && db ? num / Math.sqrt(da * db) : 0
}

const top5 = (filas, clave) => new Set([...filas].sort((x, y) => y[clave] - x[clave] || String(x.name).localeCompare(y.name)).slice(0, 5).map((f) => f.id))

const productos = await todo('productos?select=id,name,created_at,retailer_price&created_at=gte.2025-01-01')
const porFecha = new Map()
for (const p of productos) {
  const f = (p.created_at || '').slice(0, 10)
  if (!f) continue
  if (!porFecha.has(f)) porFecha.set(f, [])
  porFecha.get(f).push(p)
}
const tandas = [...porFecha.entries()].filter(([, ps]) => ps.length >= MIN_MODELOS).sort(([a], [b]) => a.localeCompare(b))

const hoy = new Date().toISOString().slice(0, 10)
const resumen = []

for (const [alta, ps] of tandas) {
  const ids = ps.map((p) => p.id)
  const lineas = await todo(
    `venta_detalles?select=id,product_id,quantity,ventas!inner(date_sale,channel,channel_id)&product_id=in.(${ids.join(',')})`,
  )
  const reales = lineas.filter((l) => !esVentaTecnica(l.ventas))
  const minFechas = reales.filter((l) => ladoDeCanal(l.ventas.channel) === 'minorista').map((l) => l.ventas.date_sale).sort()
  if (!minFechas.length) continue
  const inicio = minFechas[0]
  if (dia(inicio, REF - 1) >= hoy) {
    console.log(`\n· ${alta} (${ps.length} modelos): todavía no tiene ${REF} días minoristas — se salta`)
    continue
  }

  // Los productos «a la fecha X»: sólo cuentan las líneas hasta X inclusive.
  const aLaFecha = (hasta) =>
    ps.map((p) => {
      const mias = reales.filter((l) => l.product_id === p.id && l.ventas.date_sale <= hasta)
      const suma = (lado) => mias.filter((l) => ladoDeCanal(l.ventas.channel) === lado).reduce((s, l) => s + (l.quantity || 1), 0)
      const primera = mias.filter((l) => ladoDeCanal(l.ventas.channel) === 'minorista').map((l) => l.ventas.date_sale).sort()[0] || null
      return {
        id: p.id,
        name: p.name,
        retailer_price: +p.retailer_price,
        stock: 0,
        ingresoFecha: alta,
        ventasMin: { total: suma('minorista'), first: primera },
        ventasMay: { total: suma('mayorista'), first: null },
        minOnline: mias.filter((l) => canalDe(l.ventas.channel) === 'online').reduce((s, l) => s + (l.quantity || 1), 0),
        minLocal: mias.filter((l) => canalDe(l.ventas.channel) === 'local').reduce((s, l) => s + (l.quantity || 1), 0),
      }
    })

  const opts = (f) => ({ umbralMinPorModelo: 1, hoy: new Date(f + 'T12:00:00') })
  const fRef = dia(inicio, REF - 1)
  const ref = rankingDeTanda(aLaFecha(fRef), opts(fRef))
  const refPuesto = new Map(ref.filas.map((f) => [f.id, f.puestoMin]))
  const refTop = top5(ref.filas, 'uMin')

  console.log(`\n== tanda ${alta} · ${ps.length} modelos · 1ª venta minorista ${inicio} · verdad a ${REF} d = ${ref.uMin} u min (${(ref.uMin / ps.length).toFixed(1)}/modelo)`)
  console.log('día  u.min/mod  top5 min  top5 may   rho min  rho may')
  for (let d = 1; d < REF; d++) {
    const f = dia(inicio, d - 1)
    const r = rankingDeTanda(aLaFecha(f), opts(f))
    const verdad = r.filas.map((x) => refPuesto.get(x.id))
    const tMin = [...top5(r.filas, 'uMin')].filter((id) => refTop.has(id)).length
    const tMay = [...top5(r.filas, 'uMay')].filter((id) => refTop.has(id)).length
    const rMin = spearman(r.filas.map((x) => x.puestoMin), verdad)
    const rMay = spearman(r.filas.map((x) => x.puestoMay), verdad)
    const upm = r.uMin / ps.length
    resumen.push({ alta, d, upm, rMin, rMay, tMin, tMay })
    console.log(`${String(d).padStart(3)}  ${upm.toFixed(1).padStart(9)}  ${String(tMin).padStart(8)}  ${String(tMay).padStart(8)}   ${rMin.toFixed(2).padStart(7)}  ${rMay.toFixed(2).padStart(7)}`)
  }
}

// El cruce: para cada tanda, desde cuántas u/modelo el minorista gana al mayorista y no vuelve a perder.
console.log('\n== cruce (rho minorista ≥ rho mayorista desde acá hasta el final)')
for (const alta of [...new Set(resumen.map((r) => r.alta))]) {
  const rs = resumen.filter((r) => r.alta === alta)
  let desde = null
  for (let i = rs.length - 1; i >= 0; i--) {
    if (rs[i].rMin >= rs[i].rMay) desde = rs[i]
    else break
  }
  console.log(`${alta}: ${desde ? `día ${desde.d}, ${desde.upm.toFixed(1)} u/modelo (rho min ${desde.rMin.toFixed(2)} vs may ${desde.rMay.toFixed(2)})` : 'nunca'}`)
}
