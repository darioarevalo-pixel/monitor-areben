#!/usr/bin/env node
/**
 * SOLO LECTURA — mide la economía REAL de un pedido de BDI contra los supuestos con los que se
 * calcula el techo de costo por compra de la pauta (`lib/meta-ads/rentabilidad.core.js`).
 *
 * ## Por qué existe
 *
 * El techo de $9.100 sale de `unidades × contribución × reparto`. El 17-ago-2026, midiendo 74
 * ventas online de 7 días a mano, aparecieron **1,76 unidades por pedido** contra las **2,6** que
 * asume el modelo ⇒ el techo real daba **$6.894**, un 24% más bajo, y había conjuntos corriendo
 * que se creían rentables y no lo estaban. Este script convierte esa medición a mano en algo que
 * se puede repetir.
 *
 * 🔑 **No decide nada y no escribe nada.** Imprime lo medido al lado de lo supuesto. Quién mueve
 * los supuestos es una persona, desde `/meta-ads/rentabilidad` — el techo lo firma alguien.
 *
 * ## Uso
 *
 *     node scripts/medir-economia-bdi.mjs                 # últimos 7 días, canal online
 *     node scripts/medir-economia-bdi.mjs --dias 30
 *     node scripts/medir-economia-bdi.mjs --dias 90 --canal todos
 *     node scripts/medir-economia-bdi.mjs --desde 2026-08-10 --hasta 2026-08-16
 *     node scripts/medir-economia-bdi.mjs --json          # para pegarlo en un informe
 *
 * Necesita `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` en el `.env`. Va por la service key y no por
 * PostgREST público, así que el revoke de `sql/migrate-columnas-pii.sql:88` (que le sacó
 * `total_cost`/`profit` a `anon`) no lo afecta y **no hay que reabrir nada**.
 *
 * ## Dos trampas del dato, ya documentadas en el repo — no las repitas
 *
 * 1. ⛔ **No se filtra por `sale_state`.** Una venta anulada se ELIMINA en Gestión Nube, no se
 *    marca; filtrar por estado fabrica un derrumbe falso porque "Compra Pendiente" arrancó en
 *    abril de 2026 (`lib/crm/metricas.ts:16-22`). La contracara conocida: el sync sólo hace
 *    upsert y nunca borra, así que una venta eliminada en GN sigue contando. Está medido aparte.
 * 2. ⛔ **PostgREST corta en 1000 filas sin avisar.** Paginar no es opcional.
 *
 * ## Y una advertencia sobre las unidades
 *
 * Se miden por DOS caminos y se comparan: `ventas.items_sold` (lo que declara Gestión Nube) y la
 * suma de `venta_detalles.quantity`. Si difieren, **el script lo canta y no elige por vos** — un
 * número sin saber qué contó no se compara con otro.
 */
import { leerEnv } from './lib/kv-auth.mjs'
import { calcularRentabilidad, normalizar } from '../lib/meta-ads/rentabilidad.core.js'

// ── Argumentos ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flag = (n, def = null) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def
}
const JSON_OUT = args.includes('--json')
const CANAL = (flag('canal', 'online') || 'online').toLowerCase()
const DIAS = Number(flag('dias', 7))

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const HASTA = flag('hasta', iso(new Date(Date.now() - 86400000))) // por defecto termina AYER: el día en curso está a medio hacer
const DESDE = flag('desde', iso(new Date(new Date(`${HASTA}T00:00:00`).getTime() - (DIAS - 1) * 86400000)))

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

/**
 * El canal por su nombre, igual que `canalDe` de `lib/liquidacion/resultado.ts:57`.
 *
 * ⚠️ Está REPLICADO a propósito y no importado: aquello es TypeScript y un `.mjs` no lo puede
 * importar sin pasar por el compilador. Si esta clasificación entra alguna vez a un handler,
 * **hay que mudarla antes** a un `.core.js` que las dos importen — es el patrón que el repo ya
 * declaró invariante para `permisos` y para `rentabilidad`.
 */
function canalDe(nombre) {
  const n = (nombre || '').toLowerCase()
  if (!n || n === 'ninguno') return 'tecnica'
  if (n.includes('mayorista')) return 'mayorista'
  if (n.includes('local') || n.includes('minorista')) return 'local'
  if (n.includes('tienda') || n.includes('nube') || n.includes('online')) return 'online'
  return 'otro'
}

// ── Estadística mínima ────────────────────────────────────────────────────────

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
const suma = (a) => a.reduce((x, y) => x + y, 0)
const media = (a) => (a.length ? suma(a) / a.length : 0)
const pct = (a, p) => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}
const money = (v) => (v === null ? '—' : `$${Math.round(v).toLocaleString('es-AR')}`)
const dec = (v, n = 2) => (v === null ? '—' : v.toFixed(n))

// ── Lo que se mide ────────────────────────────────────────────────────────────

async function main() {
  const campos = 'id,date_sale,channel,channel_id,total_price,total_cost,profit,items_sold,payment_method'
  // ⛔ Sin filtro de sale_state, a propósito. Ver el docblock de arriba.
  const crudas = await sbTodo('ventas', `select=${campos}&date_sale=gte.${DESDE}&date_sale=lte.${HASTA}&order=date_sale.asc`)

  const porCanal = {}
  for (const v of crudas) {
    const c = canalDe(v.channel)
    porCanal[c] = (porCanal[c] || 0) + 1
  }
  const ventas = CANAL === 'todos' ? crudas.filter((v) => canalDe(v.channel) !== 'tecnica') : crudas.filter((v) => canalDe(v.channel) === CANAL)

  if (!ventas.length) {
    console.error(`\n⛔ Cero ventas de canal "${CANAL}" entre ${DESDE} y ${HASTA}. Canales en la ventana: ${JSON.stringify(porCanal)}\n`)
    process.exit(1)
  }

  const ids = ventas.map((v) => v.id)
  const detalles = []
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200)
    detalles.push(...(await sbTodo('venta_detalles', `select=sale_id,quantity,unit_price,total&sale_id=in.(${lote.join(',')})`)))
  }

  // Unidades por los DOS caminos. Si difieren, se canta y no se elige.
  const unidPorDetalle = {}
  const descuentoPorVenta = {}
  const mercaderiaPorVenta = {}
  for (const d of detalles) {
    unidPorDetalle[d.sale_id] = (unidPorDetalle[d.sale_id] || 0) + (num(d.quantity) || 0)
    const lista = (num(d.unit_price) || 0) * (num(d.quantity) || 0)
    const cobrado = num(d.total) ?? lista
    descuentoPorVenta[d.sale_id] = (descuentoPorVenta[d.sale_id] || 0) + (lista - cobrado)
    mercaderiaPorVenta[d.sale_id] = (mercaderiaPorVenta[d.sale_id] || 0) + cobrado
  }

  const uGN = ventas.map((v) => num(v.items_sold)).filter((x) => x !== null)
  const uDet = ventas.map((v) => unidPorDetalle[v.id]).filter((x) => x !== undefined)
  const tickets = ventas.map((v) => num(v.total_price) || 0)
  const cogs = ventas.map((v) => num(v.total_cost)).filter((x) => x !== null)
  const profits = ventas.map((v) => num(v.profit)).filter((x) => x !== null)
  const descuentos = ventas.map((v) => descuentoPorVenta[v.id] || 0)
  const mercaderias = ventas.map((v) => mercaderiaPorVenta[v.id]).filter((x) => x !== undefined)

  const mix = {}
  for (const v of ventas) {
    const k = (v.payment_method || '(sin dato)').trim()
    mix[k] = (mix[k] || 0) + 1
  }

  // ── El contraste contra el modelo ───────────────────────────────────────────
  // 🔑 Se lee la FILA GUARDADA de BDI, no los DEFAULTS. `normalizar()` arranca en DEFAULTS y pisa
  // con cada clave presente en la fila ⇒ para BDI, que tiene fila, los DEFAULTS del código NO son
  // lo que rige. Confundirlos es leer un techo que nadie está usando.
  const filas = await sbTodo('meta_ads_rentabilidad', 'select=linea,supuestos,por,updated_at&linea=eq.bdi')
  const guardado = filas[0] || null
  const supuestos = normalizar(guardado ? guardado.supuestos : {})
  const modelo = calcularRentabilidad(supuestos)

  const unidadesMedidas = uDet.length ? media(uDet) : media(uGN)
  const recal = calcularRentabilidad({ ...supuestos, unidades: unidadesMedidas })
  // El costo del producto también es medible: `total_cost` es el COGS que declara Gestión Nube.
  // Se divide por las unidades para compararlo con `costo`, que en el modelo es POR UNIDAD.
  const costoMedido = cogs.length && unidadesMedidas ? media(cogs) / unidadesMedidas : null
  const recal2 = costoMedido ? calcularRentabilidad({ ...supuestos, unidades: unidadesMedidas, costo: costoMedido }) : null

  const out = {
    ventana: { desde: DESDE, hasta: HASTA, canal: CANAL, n: ventas.length, canalesEnLaVentana: porCanal },
    unidades: {
      porItemsSold: uGN.length ? { n: uGN.length, media: media(uGN), mediana: pct(uGN, 0.5), p90: pct(uGN, 0.9) } : null,
      porDetalles: uDet.length ? { n: uDet.length, media: media(uDet), mediana: pct(uDet, 0.5), p90: pct(uDet, 0.9) } : null,
      coinciden: uGN.length && uDet.length ? Math.abs(media(uGN) - media(uDet)) < 0.01 : null,
    },
    ticket: { media: media(tickets), mediana: pct(tickets, 0.5) },
    costo: {
      cogsPorPedido: cogs.length ? media(cogs) : null,
      margenPorPedido: profits.length ? media(profits) : null,
      sinCosto: ventas.length - cogs.length,
    },
    descuentoPorPedido: media(descuentos),
    mixDePago: mix,
    modelo: {
      guardado: Boolean(guardado),
      por: guardado?.por || null,
      actualizado: guardado?.updated_at || null,
      unidadesSupuestas: supuestos.unidades,
      ticket: modelo.ticket,
      contribPedido: modelo.contribPedido,
      costoMax: modelo.costoMax,
      roasBE: modelo.roasBE,
    },
    recalculado: { unidades: unidadesMedidas, ticket: recal.ticket, contribPedido: recal.contribPedido, costoMax: recal.costoMax, roasBE: recal.roasBE },
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(out, null, 2))
    return
  }

  const L = (s = '') => console.log(s)
  L(`\n════════ ECONOMÍA REAL DE UN PEDIDO DE BDI ════════`)
  L(`  ventana: ${DESDE} → ${HASTA}  ·  canal: ${CANAL}  ·  ${ventas.length} ventas`)
  L(`  canales en la ventana: ${Object.entries(porCanal).map(([k, v]) => `${k} ${v}`).join(' · ')}`)

  L(`\n── UNIDADES POR PEDIDO ──`)
  if (out.unidades.porItemsSold) L(`  según items_sold (GN):   media ${dec(out.unidades.porItemsSold.media)}  mediana ${out.unidades.porItemsSold.mediana}  p90 ${out.unidades.porItemsSold.p90}  (n=${out.unidades.porItemsSold.n})`)
  if (out.unidades.porDetalles) L(`  según venta_detalles:    media ${dec(out.unidades.porDetalles.media)}  mediana ${out.unidades.porDetalles.mediana}  p90 ${out.unidades.porDetalles.p90}  (n=${out.unidades.porDetalles.n})`)
  if (out.unidades.coinciden === false) {
    L(`  🔴 LOS DOS CAMINOS NO COINCIDEN. No elijo por vos: averiguá QUÉ contó cada uno antes de usar el número.`)
  }

  const mercPedido = media(mercaderias)
  const precioEfectivo = unidadesMedidas ? mercPedido / unidadesMedidas : null
  const descEfectivo = supuestos.precio ? (1 - precioEfectivo / supuestos.precio) * 100 : null
  // Lo que el modelo cree que descuenta: raspadita y, encima, transferencia según el mix.
  const descSupuesto = supuestos.precio ? (1 - (calcularRentabilidad(supuestos).ticket / supuestos.unidades) / supuestos.precio) * 100 : null

  L(`\n── PLATA POR PEDIDO ──`)
  L(`  total_price:       ${money(out.ticket.media)}   (mediana ${money(out.ticket.mediana)})`)
  L(`  mercadería:        ${money(mercPedido)}   ← es lo que el modelo llama "ticket"`)
  L(`  la diferencia:     ${money(out.ticket.media - mercPedido)}   (envío y/o recargos dentro de total_price)`)
  L(`  COGS:              ${money(out.costo.cogsPorPedido)}${out.costo.sinCosto ? `   ⚠️ ${out.costo.sinCosto} ventas SIN total_cost` : ''}`)
  L(`  margen (profit):   ${money(out.costo.margenPorPedido)}   ⚠️ es BRUTO: GN no descuenta IVA, IIBB ni comisiones`)
  L(`  descuento de línea:${' '.repeat(1)}${money(out.descuentoPorPedido)}   (unit_price×qty − total)`)

  L(`\n── DESCUENTOS: LO SUPUESTO CONTRA LO COBRADO ──`)
  L(`  precio de lista (supuesto):   ${money(supuestos.precio)}`)
  L(`  precio efectivo cobrado:      ${money(precioEfectivo)}   (mercadería / unidades)`)
  L(`  descuento efectivo:           ${dec(descEfectivo, 1)}%`)
  L(`  descuento que asume el modelo:${' '.repeat(1)}${dec(descSupuesto, 1)}%   (raspa ${supuestos.raspa}% × uso ${supuestos.usaRaspa}%${supuestos.acumulan ? ' + transf ' + supuestos.transf + '% acumulado' : ''}, mix ${supuestos.mix}%)`)
  if (descEfectivo !== null && descSupuesto !== null && Math.abs(descEfectivo - descSupuesto) > 3) {
    L(`  🔴 Difieren ${dec(Math.abs(descEfectivo - descSupuesto), 1)} puntos. El modelo está descontando ${descSupuesto > descEfectivo ? 'MÁS' : 'MENOS'} de lo que la caja descuenta.`)
    L(`     ⚠️ Ojo: el descuento de línea da $0 ⇒ si se aplica, viaja YA dentro de unit_price y este`)
    L(`     cálculo lo ve como "precio más bajo", no como descuento. No permite separar raspa de transferencia.`)
  }

  L(`\n── MIX DE FORMA DE PAGO ── (el supuesto \`mix\` del modelo es ${supuestos.mix}% transferencia)`)
  for (const [k, v] of Object.entries(mix).sort((a, b) => b[1] - a[1])) {
    L(`  ${String(Math.round((100 * v) / ventas.length)).padStart(3)}%  ${String(v).padStart(4)}  ${k}`)
  }

  L(`\n── EL MODELO CONTRA LO MEDIDO ──`)
  if (!guardado) {
    L(`  ⚠️ BDI NO tiene fila guardada en meta_ads_rentabilidad: rigen los DEFAULTS del código.`)
  } else {
    L(`  fila guardada por ${guardado.por || '?'} el ${String(guardado.updated_at || '').slice(0, 10)}`)
  }
  L(`                        supuesto        + unidades      + unidades y costo`)
  L(`  unidades/pedido       ${String(dec(supuestos.unidades)).padEnd(15)} ${String(dec(unidadesMedidas)).padEnd(15)} ${dec(unidadesMedidas)}`)
  L(`  costo por unidad      ${money(supuestos.costo).padEnd(15)} ${'—'.padEnd(15)} ${money(costoMedido)}`)
  L(`  ticket                ${money(modelo.ticket).padEnd(15)} ${money(recal.ticket).padEnd(15)} ${money(recal2?.ticket)}`)
  L(`  contrib./pedido       ${money(modelo.contribPedido).padEnd(15)} ${money(recal.contribPedido).padEnd(15)} ${money(recal2?.contribPedido)}`)
  L(`  TECHO por compra      ${money(modelo.costoMax).padEnd(15)} ${money(recal.costoMax).padEnd(15)} ${money(recal2?.costoMax)}`)
  L(`  ROAS break-even       ${dec(modelo.roasBE).padEnd(15)} ${dec(recal.roasBE).padEnd(15)} ${dec(recal2 ? recal2.roasBE : null)}`)

  const delta = modelo.costoMax ? (recal.costoMax / modelo.costoMax - 1) * 100 : 0
  if (Math.abs(delta) >= 5) {
    L(`\n  🔴 El techo vigente está ${delta < 0 ? 'SOBRESTIMADO' : 'subestimado'} un ${dec(Math.abs(delta), 1)}%.`)
    L(`     Se corrige guardando \`unidades\` desde /meta-ads/rentabilidad — tocar DEFAULTS en el código NO`)
    L(`     mueve el techo de BDI, porque la fila guardada pisa cada clave que trae.`)
  }

  // El chequeo cruzado que validó esto a mano el 17-ago-2026: mover SOLO `unidades` tiene que
  // dejar el ticket del modelo pegado al realmente cobrado. Si queda lejos, el supuesto que se
  // movió no era el único malo — y ahí no alcanza con recalibrar las unidades.
  const brecha = mercPedido ? Math.abs(recal.ticket / mercPedido - 1) * 100 : null
  if (brecha !== null) {
    L(`\n  chequeo cruzado: ticket del modelo recalculado ${money(recal.ticket)} vs MERCADERÍA cobrada ${money(mercPedido)} → ${dec(brecha, 1)}% de brecha`)
    if (brecha > 10) L(`  ⚠️ Más de 10%: hay OTRO supuesto movido además de las unidades — mirá el bloque de descuentos.`)
    else L(`  ✅ Debajo del 10%: las unidades explican casi toda la diferencia.`)
  }
  L()
}

main().catch((e) => {
  console.error(`\n⛔ ${e.message}\n`)
  process.exit(1)
})
