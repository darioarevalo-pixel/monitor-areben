/**
 * ¿Meta reparte el presupuesto entre los avisos de un mismo conjunto?
 *
 * El 26-ago-2026 se midió *«la pieza #1 se lleva el 80%»* sobre 8 conjuntos y con eso se
 * desaconsejó testear varios avisos juntos. **Bruno lo objetó el 28-ago**: *«esos testeos los
 * hicimos luego de tener aprendizaje en el CDA, no los arrancamos al mismo momento»*. Tenía razón:
 * la muestra mezclaba dos gestos que se portan al revés, y el 80% era el promedio de los dos — no
 * describía a ninguno. Este script es la partición, para que no haya que volver a discutirlo de
 * memoria.
 *
 * 🔑 **Parte por el GESTO, no por el resultado**: un aviso cuyo primer día de gasto cae junto con
 * el del conjunto arrancó **a la par**; uno que aparece después se **sumó** a un conjunto que ya
 * gastaba. Son poblaciones distintas y hay que mirarlas separadas.
 *
 * ⚠️ **Descarta los conjuntos CENSURADOS**: los que ya gastaban el primer día de la foto no dicen
 * cuándo arrancaron de verdad, y meterlos los cuenta a todos como «arrancaron juntos».
 *
 * Lo medido el 28-ago (15 conjuntos útiles de 23, ventana de 2 días): escalonado **100%** al
 * incumbente en 10 de 10 · arrancados juntos **79%** (mín. 62%). La regla que salió de acá vive en
 * «La FORMA del test» del `PENDIENTES.md`.
 *
 *   node scripts/medir-reparto-conjunto.mjs [--dias 2] [--linea bdi]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { leerSnapshot, primeraFecha } from '../lib/meta-ads/leer-snapshot.core.js'

for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const t = line.trim()
  const eq = t.indexOf('=')
  if (!t || t.startsWith('#') || eq === -1) continue
  const k = t.slice(0, eq).trim()
  if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
}

const argv = process.argv.slice(2)
const valor = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
// 2 días es la ventana de la regla del test. A 7 la concentración se AGRAVA (79% → 83%), así que
// el default no es neutral: es el número con el que se decide.
const DIAS = Math.max(1, parseInt(valor('--dias'), 10) || 2)
const LINEA = valor('--linea')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY (la base de BDI).')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

const suma = (xs) => xs.reduce((t, x) => t + x, 0)
const win = (mapa, desde, hasta) => suma([...mapa.entries()].filter(([d]) => d >= desde && d <= hasta).map(([, v]) => v))
const addDias = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const pct = (x) => `${(100 * x).toFixed(0)}%`
const plata = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

const { fecha: fotoDesde, error: eF } = await primeraFecha(sb, 'aviso')
if (eF) { console.error('No se pudo leer el primer día de la foto:', eF); process.exit(1) }

const { filas, error } = await leerSnapshot(sb, {
  nivel: 'aviso',
  lineas: LINEA ? [LINEA] : null,
  cols: 'fecha,objeto_id,adset_id,nombre,linea,spend,impresiones,clicks,compras',
})
if (error) { console.error('No se pudo leer la foto:', error); process.exit(1) }
console.log(`foto de avisos desde ${fotoDesde} · ${filas.length} filas · ventana de ${DIAS} día(s)${LINEA ? ` · línea ${LINEA}` : ''}\n`)

// ── Por aviso: cuándo gastó por PRIMERA vez, y sus series por día ────────────
const avisos = new Map()
for (const f of filas) {
  const s = Number(f.spend) || 0
  if (!avisos.has(f.objeto_id)) {
    avisos.set(f.objeto_id, {
      adset: f.adset_id, nombre: f.nombre, linea: f.linea, primerGasto: null,
      porDia: new Map(), imprDia: new Map(), clickDia: new Map(),
    })
  }
  const a = avisos.get(f.objeto_id)
  a.adset ||= f.adset_id; a.nombre ||= f.nombre; a.linea ||= f.linea
  a.porDia.set(f.fecha, (a.porDia.get(f.fecha) || 0) + s)
  a.imprDia.set(f.fecha, (a.imprDia.get(f.fecha) || 0) + (Number(f.impresiones) || 0))
  a.clickDia.set(f.fecha, (a.clickDia.get(f.fecha) || 0) + (Number(f.clicks) || 0))
  // ⚠️ El primer día CON GASTO, ⛔ no el primero que aparece: un aviso puede figurar en la foto
  // creado y sin entrega, y esa fecha diría que arrancó cuando en realidad nunca salió al aire.
  if (s > 0 && (!a.primerGasto || f.fecha < a.primerGasto)) a.primerGasto = f.fecha
}

// ── Por conjunto: partido por el gesto ───────────────────────────────────────
const conjuntos = new Map()
for (const a of avisos.values()) {
  if (!a.adset || !a.primerGasto) continue
  if (!conjuntos.has(a.adset)) conjuntos.set(a.adset, [])
  conjuntos.get(a.adset).push(a)
}

const juntos = []; const escalonados = []; let censurados = 0
for (const [adset, avs] of conjuntos) {
  if (avs.length < 2) continue
  const inicio = avs.map((a) => a.primerGasto).sort()[0]
  // Un día de gracia: el aviso creado a la tarde entrega recién al otro día, y eso ⛔ no lo vuelve
  // un incumbente.
  const cohorte = avs.filter((a) => a.primerGasto <= addDias(inicio, 1))
  const tardios = avs.filter((a) => a.primerGasto > addDias(inicio, 1))
  const caso = { adset, inicio, avs, cohorte, tardios, linea: avs[0].linea }
  if (inicio <= addDias(fotoDesde, 1)) { censurados++; continue }
  if (cohorte.length >= 2) juntos.push(caso)
  else if (tardios.length) escalonados.push(caso)
}

function informe(titulo, casos, usarCohorte) {
  console.log(`\n${'='.repeat(78)}\n${titulo}  —  ${casos.length} conjuntos\n${'='.repeat(78)}`)
  const cuotas = []
  for (const c of casos.sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const grupo = usarCohorte ? c.cohorte : c.avs
    const desde = c.inicio; const hasta = addDias(c.inicio, DIAS - 1)
    const filas = grupo
      .map((a) => ({ a, s: win(a.porDia, desde, hasta), im: win(a.imprDia, desde, hasta), cl: win(a.clickDia, desde, hasta) }))
      .sort((x, y) => y.s - x.s)
    const tot = suma(filas.map((x) => x.s))
    // ⚠️ Un conjunto que casi no gastó ⛔ no dice nada del reparto: la cuota es una división por un
    // número chico y se va a los extremos sola.
    if (tot < 1000) continue
    cuotas.push(filas[0].s / tot)
    console.log(`\n  ${c.linea || '?'} · conjunto ${c.adset} · arrancó ${c.inicio} · ${grupo.length} avisos${usarCohorte ? ' en la cohorte' : ''}`)
    console.log(`  ${plata(tot)} en ${DIAS} día(s) · la #1 se lleva ${pct(filas[0].s / tot)}`)
    for (const { a, s, im, cl } of filas) {
      const ctr = im ? `${(100 * cl / im).toFixed(2)}%` : '--'
      console.log(`     ${pct(s / tot).padStart(4)}  ${plata(s).padStart(10)}  impr ${String(im).padStart(7)}  CTR ${ctr.padStart(6)}  ${a.primerGasto}  ${(a.nombre || '').slice(0, 40)}`)
    }
    if (usarCohorte && c.tardios.length) console.log(`     (+${c.tardios.length} sumados después, fuera de la cohorte)`)
  }
  if (!cuotas.length) { console.log('\n  (ningún conjunto con gasto suficiente)'); return }
  const ord = [...cuotas].sort((a, b) => a - b)
  console.log(`\n  ▸ ${cuotas.length} conjuntos con gasto · cuota de la #1: mediana ${pct(ord[Math.floor(ord.length / 2)])} · min ${pct(ord[0])} · max ${pct(ord[ord.length - 1])}`)
  console.log(`  ▸ con la #1 ≥90%: ${cuotas.filter((x) => x >= 0.9).length}/${cuotas.length}`)
}

informe('ARRANCARON JUNTOS — misma cohorte inicial', juntos, true)
informe('ESCALONADOS — se sumó un aviso a un conjunto que ya gastaba', escalonados, false)

console.log(`\n\nCensurados y descartados (ya gastaban el 1er día de la foto): ${censurados}`)
console.log(`Conjuntos con 2+ avisos en total: ${[...conjuntos.values()].filter((v) => v.length >= 2).length}`)
console.log('\n▶️ Lo que este script ⛔ NO contesta: si la que Meta elige temprano es la que más vende.')
console.log('   Elige con señal de clicks, no de compras. Se mide anotando a quién eligió en cada')
console.log('   tanda y comparándolo con el costo por compra que esa pieza saca después, aislada.')
