/**
 * La zona de Rendimiento, impresa desde la línea de comandos. **SOLO LECTURA.**
 *
 *   node scripts/medir-rendimiento-celdas.mjs --linea bdi [--dias 7] [--hasta 2026-08-24] [--json]
 *
 * # Por qué existe, y por qué NO es un duplicado de la pantalla
 *
 * Llama a `armarZona()`, **la misma función que el handler**. No recalcula nada: si esto y la
 * pantalla dijeran cosas distintas, sería un bug del transporte, no de dos cuentas que se
 * despegaron. Es el patrón de `medir-economia-bdi.mjs`, que importa el núcleo de rentabilidad en
 * vez de reimplementarlo.
 *
 * 🔴 **Y es EL ORÁCULO de la tanda.** Contra esta sección un test verde no es una medición: cuatro
 * de los defectos más caros del módulo pasaron las cuatro pruebas del CI, y dos más aparecieron
 * recién al correr el núcleo del Parte contra la pauta real con sus 24 tests en verde. Los números
 * de la semana 18→24 de agosto ya están medidos **por otro camino** (consultas sueltas a la base y
 * `psql`, sin abrir el monitor), así que sirven de vara:
 *
 *   98 pedidos · 14,0/día · $452.725 de pauta · $4.620 por pedido · marginal $7.227
 *   `AD02 GIRLHOOD COLLECTION` = 52% del gasto, en 3 cajas
 *   `GIRLHOOD FRIO` a $12.575 (185% del techo) ⇒ ALTO · `TEST 3 LOOKS` a $3.496 ⇒ OK
 *
 * ⛔ **No habla con Meta.** Todo sale de `meta_ads_snapshot_dia` y de `ventas`, así que corre con
 * el token vencido y no gasta un peso de cupo.
 */
import { leerEnv } from './lib/kv-auth.mjs'
import { armarZona, COLS_RENDIMIENTO, ultimoDiaCerrado } from '../lib/meta-ads/rendimiento.core.js'
import { calcularRentabilidad, normalizar } from '../lib/meta-ads/rentabilidad.core.js'

const args = process.argv.slice(2)
const flag = (n, def = null) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def
}
const LINEA = (flag('linea', 'bdi') || 'bdi').toLowerCase()
const DIAS = Number(flag('dias', 7))
const HASTA = flag('hasta', null)
const JSON_OUT = args.includes('--json')
// 🔑 `--techo` pisa el de la ficha. Existe para poder contestar **antes** de tocar un dato de
// producción qué pasaría si la ficha estuviera bien: el 5-sep-2026 la de BDI tenía `usaRaspa: 100`
// (asume que el 100% de los compradores usa la raspadita) y el techo real medido era $7.558 contra
// los $6.668 cargados. Mover el dato primero y mirar después es exactamente el orden que no hay
// que usar cuando el número mueve el corte de once reglas.
const TECHO_MANO = flag('techo', null) ? Number(flag('techo')) : null

const env = leerEnv()
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
  console.error('\n⛔ Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el .env\n')
  process.exit(1)
}
const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` }

/** PostgREST corta en 1000 filas sin avisar. Paginar no es opcional. */
async function sbTodo(tabla, params) {
  let out = []
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${tabla}?${params}&limit=1000&offset=${off}`, { headers: H })
    if (!r.ok) throw new Error(`Supabase ${r.status} en ${tabla}: ${(await r.text()).slice(0, 200)}`)
    const p = await r.json()
    out = out.concat(p)
    if (p.length < 1000) return out
  }
}

const money = (v) => (v == null ? '—' : `$${Math.round(v).toLocaleString('es-AR')}`)
const pct = (v) => (v == null ? '—' : `${Math.round(v)}%`)

async function main() {
  // Un colchón generoso hacia atrás: el desgaste compara dos ventanas y el marginal, dos más.
  const atras = Math.max(40, DIAS * 4 + 2)
  const hoyish = new Date().toISOString().slice(0, 10)
  const desdeCrudo = new Date(Date.parse(`${hoyish}T00:00:00Z`) - atras * 86400000).toISOString().slice(0, 10)

  const filas = await sbTodo(
    'meta_ads_snapshot_dia',
    `select=${COLS_RENDIMIENTO}&fecha=gte.${desdeCrudo}&linea=eq.${LINEA}&order=fecha.asc`,
  )
  if (!filas.length) {
    console.error(`\n⛔ La foto no tiene ni una fila de "${LINEA}" desde ${desdeCrudo}.\n`)
    process.exit(1)
  }

  const cierre = HASTA || ultimoDiaCerrado(filas)
  if (!cierre) {
    console.error('\n⛔ Ningún día de la foto figura CERRADO (ninguna fila tiene una captura posterior a su fecha).\n')
    process.exit(1)
  }

  // El techo, de la fila guardada. Sin fila NO hay techo: ⛔ no se inventa un default.
  const rent = await sbTodo('meta_ads_rentabilidad', `select=linea,supuestos,updated_at&linea=eq.${LINEA}`)
  let techo = 0
  let techoCaja = null
  let techoDe = null
  if (rent[0]) {
    const r = calcularRentabilidad(normalizar(rent[0].supuestos || {}))
    techo = r.costoMax
    techoCaja = r.costoMaxCaja !== r.costoMax ? r.costoMaxCaja : null
    techoDe = rent[0].updated_at
  }
  if (TECHO_MANO != null) {
    techo = TECHO_MANO
    techoCaja = null
    techoDe = null
  }

  // Los pedidos REALES de la tienda. ⛔ Sin filtro de estado: una venta anulada se ELIMINA en
  // Gestión Nube, no se marca, así que filtrar fabrica un derrumbe falso.
  const ventas = await sbTodo(
    'ventas',
    `select=id,date_sale,channel&date_sale=gte.${desdeCrudo}&channel=eq.Tienda%20Nube&order=id.asc`,
  )
  const pedidosPorDia = {}
  for (const v of ventas) {
    const f = String(v.date_sale || '').slice(0, 10)
    if (!f) continue
    pedidosPorDia[f] = (pedidosPorDia[f] || 0) + 1
  }

  const z = armarZona({ filas, techo, techoCaja, pedidosPorDia, hasta: cierre, ventana: DIAS })

  if (JSON_OUT) {
    console.log(JSON.stringify(z, null, 2))
    return
  }

  console.log(`\nZONA DE RENDIMIENTO · línea ${LINEA} · ${z.desde} → ${z.hasta} (${DIAS} días CERRADOS)`)
  console.log(`Sale de la FOTO diaria, ⛔ no de Meta. El día en curso no entra.`)
  console.log(
    `Techo por compra: ${money(techo)}${techoCaja ? ` · de caja ${money(techoCaja)}` : ''}` +
      `${techoDe ? ` · ficha cargada el ${String(techoDe).slice(0, 10)}` : ' · ⛔ SIN FILA GUARDADA'}`,
  )

  // 🔴 El contraste que faltaba: el ticket con el que está cargada la ficha contra el ticket REAL
  // de la ventana. El 25-ago-2026 el monitor imprimía «zattia 6046» con cara de certeza y estaba
  // cargado a precio de LISTA con la tienda en liquidación. Una regla no protege de una ficha mal
  // cargada: hay que contrastar la ficha.
  if (rent[0]) {
    const s = normalizar(rent[0].supuestos || {})
    const r = calcularRentabilidad(s)
    const t = z.totales
    const ticketReal = t.compras ? t.revenue / t.compras : 0
    if (ticketReal > 0 && r.ticket > 0) {
      const dif = ((ticketReal - r.ticket) / r.ticket) * 100
      const alarma = Math.abs(dif) >= 15 ? '  🔴' : ''
      console.log(`Ticket de la ficha ${money(r.ticket)} · ticket REAL de la ventana ${money(ticketReal)} (${dif >= 0 ? '+' : ''}${Math.round(dif)}%)${alarma}`)
    }
  }

  const t = z.totales
  console.log(
    `\nTOTALES  gasto ${money(t.spend)} · pedidos ${t.pedidos} (${t.pedidosDia.toFixed(1)}/día) · ` +
      `costo por pedido REAL ${money(t.costoPedidoReal)} = ${pct(t.pctTechoPedidoReal)} del techo`,
  )
  console.log(
    `         ⚠️ esos pedidos son de TODOS los canales. LA VARA de cada fila es la de abajo:`,
  )
  console.log(
    `         compras que Meta se atribuye ${Math.round(t.compras)} · su costo ${money(t.costoMeta)}` +
      ` = ${pct(t.pctTechoMeta)} del techo`,
  )

  const m = z.marginal
  if (m.marginal) {
    console.log(
      `MARGINAL ${money(m.marginal)} por pedido incremental  (${m.a.desde}→${m.a.hasta} vs ${m.b.desde}→${m.b.hasta})` +
        (techo && m.marginal > techo ? '  🔴 EL PEDIDO SIGUIENTE CUESTA MÁS DE LO QUE VALE' : ''),
    )
  } else {
    console.log(`MARGINAL no se puede calcular — ${m.motivo}`)
  }

  const c = z.concentracion
  if (c.mayor) {
    console.log(
      `CONCENTRACIÓN la pieza más grande es «${c.mayor.pieza}»: ${money(c.mayor.gasto)} = ` +
        `${c.mayor.pct.toFixed(0)}% del gasto, en ${c.mayor.cajas} caja${c.mayor.cajas === 1 ? '' : 's'}`,
    )
  }

  console.log(`\nCELDAS (${z.celdas.length})`)
  console.log('veredicto  | celda                                    | gasto     | comp | costo   | %techo | %diario | CTRΔ  | CPMΔ  | firma')
  for (const cel of z.celdas) {
    const v = cel.veredicto
    const d = cel.desgaste
    console.log(
      [
        (v.clase.toUpperCase() + '          ').slice(0, 10),
        (cel.nombre + ' '.repeat(40)).slice(0, 40),
        (money(cel.spend) + '          ').slice(0, 9),
        String(Math.round(cel.compras)).padStart(4),
        (money(cel.compras ? cel.costo : null) + '        ').slice(0, 7),
        pct(v.pctTecho).padStart(6),
        pct(v.pctDiario).padStart(7),
        (d.ctrDelta == null ? '  —  ' : `${d.ctrDelta >= 0 ? '+' : ''}${Math.round(d.ctrDelta)}%`).padStart(5),
        (d.cpmDelta == null ? '  —  ' : `${d.cpmDelta >= 0 ? '+' : ''}${Math.round(d.cpmDelta)}%`).padStart(5),
        d.firma,
      ].join(' | '),
    )
    for (const p of v.porque) console.log(`             · ${p}`)
  }

  console.log('\nPEDIDOS REALES vs META')
  console.log('fecha      | pedidos | gasto     | costo REAL | compras Meta | costo Meta | atrib%')
  for (const d of z.caja) {
    console.log(
      [
        d.fecha,
        String(d.pedidos).padStart(7),
        (money(d.gasto) + '          ').slice(0, 9),
        (d.pedidos ? money(d.costoPedidoReal) : '—').padStart(10),
        String(Math.round(d.comprasMeta)).padStart(12),
        (d.comprasMeta ? money(d.costoCompraMeta) : '—').padStart(10),
        (d.atrib == null ? '—' : `${Math.round(d.atrib)}%`).padStart(6),
      ].join(' | '),
    )
  }
  console.log('# 🔴 Si atrib% SUBE mientras el costo por compra de Meta BAJA, la mejora es de ATRIBUCIÓN')
  console.log('#    y no hay una sola venta nueva.\n')
}

main().catch((e) => {
  console.error(`\n⛔ ${e.message}\n`)
  process.exit(1)
})
