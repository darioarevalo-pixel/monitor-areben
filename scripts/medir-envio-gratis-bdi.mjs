#!/usr/bin/env node
/**
 * SOLO LECTURA — ¿a qué monto conviene poner el **envío gratis** de BDI?
 *
 * ## Por qué existe
 *
 * El mínimo está en **$50.000** y el pedido mediano paga **$22.274** de mercadería: son 3,3 fundas
 * cuando el comprador mediano lleva 1,5. Medido el 17-ago-2026 sobre 74 ventas: **sólo 5 de 74
 * (7%) alcanzan el mínimo**, y **la mitad compra UNA sola funda**. Un umbral que está a dos
 * productos de distancia no empuja a nadie: se lee como «no es para mí».
 *
 * 🔑 **Y por qué pesa en el plan de 100 ventas diarias.** Hoy la pauta cuesta ~$3.155 por venta,
 * que sobre 1,76 unidades son ~$1.793 por funda. Subir el pedido a 2,5 unidades reparte **el mismo
 * costo por compra entre más fundas** ⇒ **sube el techo de la pauta sin mejorar un solo anuncio**.
 * Es una palanca de MULTIPLICACIÓN contra la de SUMA, que es comprar más tráfico.
 *
 * ## 🔑 La pregunta que este script NO hace
 *
 * No pregunta «¿cuánto cuesta el envío?» —ese dato es de Bruno y no está en la base—. Pregunta
 * **cuánto PUEDE costar** para que el umbral se pague solo, y **qué fracción de los que quedan a
 * una funda tiene que agregarla**. Así el dato que falta se chequea contra un número en vez de
 * bloquear la decisión.
 *
 * ## El modelo, que es una resta
 *
 * Bajar el umbral de $50.000 a T mueve dos cosas y nada más:
 *
 *   - **REGALO** — los pedidos que hoy caen en `[T, 50.000)` **ya compran así**. Con el umbral
 *     nuevo dejan de pagar el envío y no compran ni una funda más ⇒ es costo puro: `regalo × E`.
 *   - **EMPUJE** — los pedidos que quedan **a una funda** de T. Si una fracción `p` agrega esa
 *     funda, cada uno deja una contribución `C` y se lleva un envío `E` ⇒ `p × a1 × (C − E)`.
 *
 * Se paga solo cuando `p × a1 × (C − E) ≥ regalo × E`, o sea:
 *
 *     p ≥ (regalo × E) / (a1 × (C − E))
 *
 * ⚠️ **`p` es lo único que este script no puede medir**: es comportamiento, y no pasó todavía. Por
 * eso se imprime como *lo que haría falta*, no como una predicción. Un umbral que necesita que el
 * 80% agregue una funda está muerto; uno que necesita el 15% es una apuesta razonable.
 *
 * ## Trampas del dato, ya conocidas en el repo — no las repitas
 *
 * 1. ⛔ **No se filtra por `sale_state`.** Una venta anulada se ELIMINA en Gestión Nube, no se
 *    marca. Mismo criterio que `medir-economia-bdi.mjs`.
 * 2. ⛔ **PostgREST corta en 1000 filas sin avisar.** Paginar no es opcional.
 * 3. 🔑 **La plata se mide sobre MERCADERÍA** (la suma de `venta_detalles.total`), no sobre
 *    `total_price`: adentro de `total_price` viaja el envío, y un umbral que se compara contra sí
 *    mismo más el envío se cruza solo.
 * 4. ⚠️ **El umbral vigente ($50.000) no está verificado contra el admin de Tienda Nube** — entra
 *    por `--umbral-hoy`. Si allá dice otro número, este análisis se corre de nuevo con ese.
 *
 * ## Uso
 *
 *     node scripts/medir-envio-gratis-bdi.mjs                  # últimos 30 días
 *     node scripts/medir-envio-gratis-bdi.mjs --dias 60
 *     node scripts/medir-envio-gratis-bdi.mjs --desde 2026-07-20 --hasta 2026-08-16
 *     node scripts/medir-envio-gratis-bdi.mjs --envio 4500     # fija el costo de envío y calcula p
 *     node scripts/medir-envio-gratis-bdi.mjs --json
 *
 * Necesita `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` en el `.env`, igual que su hermano.
 */
import { leerEnv } from './lib/kv-auth.mjs'
import { calcularRentabilidad, normalizar } from '../lib/meta-ads/rentabilidad.core.js'
import { canalDe } from '../lib/liquidacion/canal.core.js'

// ── Argumentos ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flag = (n, def = null) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def
}
const JSON_OUT = args.includes('--json')
const DIAS = Number(flag('dias', 30))
const UMBRAL_HOY = Number(flag('umbral-hoy', 50000))
const ENVIO_FIJO = flag('envio', null) === null ? null : Number(flag('envio'))

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const HASTA = flag('hasta', iso(new Date(Date.now() - 86400000))) // termina AYER: el día en curso está a medio hacer
const DESDE = flag('desde', iso(new Date(new Date(`${HASTA}T00:00:00`).getTime() - (DIAS - 1) * 86400000)))

/**
 * Los umbrales que vale la pena comparar, más el vigente para que se vea al lado.
 *
 * 🔴 **La grilla es fina alrededor de $29.980 a propósito**: dos fundas de $14.990 dan exactamente
 * eso, y es el valor más repetido de la muestra después de una funda sola. Un umbral de $30.000
 * lo deja afuera **por $20** — y ése es justo el pedido que se quiere provocar.
 */
const CANDIDATOS = [25000, 27000, 28000, 29000, 29500, 30000, 32000, 35000, 40000, UMBRAL_HOY]
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort((a, b) => a - b)

// ── Supabase ──────────────────────────────────────────────────────────────────

const env = leerEnv()
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
  console.error('\n⛔ Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el .env\n')
  process.exit(1)
}
const sbHeaders = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` }

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

// ── Estadística mínima ────────────────────────────────────────────────────────

const suma = (a) => a.reduce((x, y) => x + y, 0)
const mediana = (a) => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const money = (v) => (v === null || !Number.isFinite(v) ? '—' : `$${Math.round(v).toLocaleString('es-AR')}`)
const pctS = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—')

// ── Lo que se mide ────────────────────────────────────────────────────────────

async function main() {
  const ventasCrudas = await sbTodo(
    'ventas',
    `select=id,date_sale,channel,total_price,items_sold&date_sale=gte.${DESDE}&date_sale=lte.${HASTA}&order=date_sale.asc`,
  )
  const ventas = ventasCrudas.filter((v) => canalDe(v.channel) === 'online')
  if (!ventas.length) {
    console.error(`\n⛔ Cero ventas online entre ${DESDE} y ${HASTA}\n`)
    process.exit(1)
  }

  const ids = ventas.map((v) => v.id)
  const detalles = []
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200)
    detalles.push(...(await sbTodo('venta_detalles', `select=sale_id,quantity,total&sale_id=in.(${lote.join(',')})`)))
  }

  // Un pedido = mercadería (lo que se compara contra el umbral) + unidades + su precio unitario.
  const porVenta = {}
  for (const d of detalles) {
    const p = (porVenta[d.sale_id] ||= { merca: 0, unid: 0 })
    p.merca += Number(d.total) || 0
    p.unid += Number(d.quantity) || 0
  }
  const pedidos = ventas
    .map((v) => porVenta[v.id])
    .filter((p) => p && p.unid > 0 && p.merca > 0)
    .map((p) => ({ ...p, precioUnit: p.merca / p.unid }))

  const N = pedidos.length
  const unidades = suma(pedidos.map((p) => p.unid)) / N
  const mercaMediana = mediana(pedidos.map((p) => p.merca))
  const precioUnitMediano = mediana(pedidos.map((p) => p.precioUnit))

  // La contribución de UNA funda, con la economía guardada de BDI. `unidades: 1` la deja por unidad.
  const supuestos = normalizar({ ...(await filaGuardada()), unidades: 1 })
  const C = calcularRentabilidad(supuestos).unidad.contrib

  // Reparto por cantidad de fundas.
  const histo = {}
  for (const p of pedidos) histo[p.unid] = (histo[p.unid] || 0) + 1

  // Para cada umbral: quién ya lo cruza, quién queda a una funda, quién a dos, quién lejos.
  const filas = CANDIDATOS.map((T) => {
    let cruzanHoy = 0
    let regalo = 0
    let a1 = 0
    let a2 = 0
    let lejos = 0
    for (const p of pedidos) {
      if (p.merca >= UMBRAL_HOY) {
        cruzanHoy++
        continue // ya tiene envío gratis: el umbral nuevo no le cambia nada
      }
      if (p.merca >= T) regalo++
      else if (p.merca + p.precioUnit >= T) a1++
      else if (p.merca + 2 * p.precioUnit >= T) a2++
      else lejos++
    }
    return { T, cruzanHoy, regalo, a1, a2, lejos }
  })

  if (JSON_OUT) {
    console.log(JSON.stringify({ desde: DESDE, hasta: HASTA, N, unidades, mercaMediana, precioUnitMediano, C, histo, filas }, null, 2))
    return
  }

  // ── Salida ──────────────────────────────────────────────────────────────────

  console.log('\n════════ ENVÍO GRATIS DE BDI: A QUÉ MONTO ════════')
  console.log(`  ventana: ${DESDE} → ${HASTA}  ·  canal online  ·  ${N} pedidos`)
  console.log(`  umbral vigente: ${money(UMBRAL_HOY)}  ⚠️ sin verificar contra el admin de Tienda Nube`)

  console.log('\n── CÓMO COMPRA LA GENTE ──')
  console.log(`  unidades por pedido:    ${unidades.toFixed(2)}  (mediana ${mediana(pedidos.map((p) => p.unid))})`)
  console.log(`  mercadería por pedido:  ${money(suma(pedidos.map((p) => p.merca)) / N)}  (mediana ${money(mercaMediana)})`)
  console.log(`  precio efectivo por funda: ${money(precioUnitMediano)} (mediana)`)
  console.log('')
  for (const u of Object.keys(histo).sort((a, b) => a - b)) {
    const n = histo[u]
    const barra = '█'.repeat(Math.round((n / N) * 40))
    console.log(`  ${String(u).padStart(2)} funda${u === '1' ? ' ' : 's'}  ${String(n).padStart(3)}  ${String(Math.round((n / N) * 100)).padStart(3)}%  ${barra}`)
  }

  console.log('\n── LA DISTANCIA AL UMBRAL ──')
  console.log('  (quién queda a UNA funda de cruzarlo: es el único grupo al que el umbral le habla)')
  console.log('')
  console.log('  umbral      ya lo cruza   REGALO   a 1 funda   a 2   lejos')
  for (const f of filas) {
    const marca = f.T === UMBRAL_HOY ? ' ← hoy' : ''
    console.log(
      `  ${money(f.T).padEnd(10)}  ${String(f.cruzanHoy).padStart(8)}   ${String(f.regalo).padStart(6)}   ${String(f.a1).padStart(9)}   ${String(f.a2).padStart(3)}   ${String(f.lejos).padStart(5)}${marca}`,
    )
  }
  console.log('')
  console.log(`  🔑 contribución de UNA funda más: ${money(C)}  (economía guardada de BDI, por unidad)`)

  console.log('\n── QUÉ HARÍA FALTA PARA QUE SE PAGUE SOLO ──')
  console.log('  p = fracción de los "a 1 funda" que tiene que agregar una para cubrir el regalo.')
  console.log('  ⚠️ p es COMPORTAMIENTO: es lo que haría falta, no lo que va a pasar.')
  console.log('')
  const envios = ENVIO_FIJO !== null ? [ENVIO_FIJO] : [3000, 4500, 6000, 7500]
  console.log(`  umbral      ${envios.map((e) => `envío ${money(e)}`.padStart(14)).join('')}`)
  for (const f of filas) {
    if (f.T >= UMBRAL_HOY) continue // el vigente no tiene nada que pagar: es la línea de base
    const celdas = envios.map((E) => {
      if (E >= C) return 'imposible'.padStart(14) // el envío se come la funda entera
      const p = (f.regalo * E) / (f.a1 * (C - E))
      return (f.a1 === 0 ? '—' : pctS(p)).padStart(14)
    })
    console.log(`  ${money(f.T).padEnd(10)}  ${celdas.join('')}`)
  }
  console.log('')
  console.log(`  ⛔ "imposible" = el envío cuesta más que la contribución de la funda que se agrega:`)
  console.log(`     a ese costo NINGÚN umbral se paga solo y lo que hay que mover es el costo de envío.`)

  console.log('\n── Y QUÉ LE HACE AL TECHO DE LA PAUTA ──')
  const conUnidades = (u) => {
    const s = normalizar({ ...supuestos, unidades: u })
    const r = calcularRentabilidad(s)
    return { unidades: u, ticket: r.ticket, techo: r.costoMax }
  }
  console.log('  (el techo por compra sale de contribución × unidades × reparto: más fundas por pedido,')
  console.log('   más se puede pagar por esa MISMA compra — sin tocar un anuncio)')
  console.log('')
  console.log('  unidades/pedido    ticket       TECHO por compra')
  for (const u of [unidades, 2.0, 2.25, 2.5]) {
    const r = conUnidades(u)
    const marca = Math.abs(u - unidades) < 0.001 ? '  ← lo medido hoy' : ''
    console.log(`  ${u.toFixed(2).padStart(11)}      ${money(r.ticket).padEnd(12)} ${money(r.techo).padStart(10)}${marca}`)
  }
  console.log('')
}

/** La fila guardada de BDI, que pisa a los `DEFAULTS`. Si no está, se avisa y se sigue con los defaults. */
async function filaGuardada() {
  try {
    const filas = await sbTodo('meta_ads_rentabilidad', 'select=linea,supuestos&linea=eq.bdi')
    if (filas.length && filas[0].supuestos) return filas[0].supuestos
    console.log('\n⚠️  BDI no tiene fila en `meta_ads_rentabilidad`: se usan los DEFAULTS del código.')
  } catch (e) {
    console.log(`\n⚠️  No se pudo leer \`meta_ads_rentabilidad\` (${e.message.slice(0, 60)}): se usan los DEFAULTS.`)
  }
  return {}
}

main().catch((e) => {
  console.error(`\n⛔ ${e.message}\n`)
  process.exit(1)
})
