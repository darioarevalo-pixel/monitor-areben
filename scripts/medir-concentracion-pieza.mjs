/**
 * ¿Cuánto de la plata se lleva UNA pieza, y cuánto de eso se estaba perdiendo por el nombre?
 *
 * La zona de Rendimiento agrupaba los avisos por **nombre exacto** y decía que la pieza más grande
 * de BDI era el 32% del gasto, en 1 caja. Lo real —el mismo video corriendo en tres cajas— es el
 * 52%. La diferencia no es una imprecisión: la tarjeta se pinta de aviso a partir del 40%, así que
 * con el 32% **la marca de riesgo más grande de la cuenta se dibujaba neutra**.
 *
 * 🔑 **El CONTROL va adentro.** Antes de medir nada nuevo, el script reproduce la medición vieja
 * —32% en 1 caja para BDI, 18→24-ago-2026— y si ⛔ no le da, para. Un instrumento nuevo que no
 * puede repetir el número viejo ⛔ no está midiendo lo que dice medir.
 *
 * ⚠️ **El control ⛔ NO es una segunda fuente**: sale de la misma foto que la medición nueva. Lo que
 * prueba es que la lectura y la ventana son las mismas, ⛔ no que el 32% fuera cierto.
 *
 * 🔴 **Lo que sale de acá sigue siendo un PISO.** La firma sale del NOMBRE porque la foto ⛔ no
 * guarda quién es el creativo; el identificador estable es el del creativo (`video_id`,
 * `image_hash`, `effective_object_story_id`), que `lib/meta-ads/creativos.core.js` ya trae vivo de
 * Graph para la Biblioteca y que **falta guardar en la foto**. ⚠️ `creative{id}` a secas ⛔ no
 * alcanza: duplicar un aviso le crea un creativo nuevo con id nuevo.
 *
 *   node scripts/medir-concentracion-pieza.mjs [--linea bdi] [--desde 2026-08-18] [--hasta 2026-08-24]
 *
 * Sin fechas mide la foto entera. Imprime, por línea, los grupos que FUSIONAN más de un nombre con
 * su plata desglosada — que es lo que hay que mirar para vetar una fusión equivocada.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { leerSnapshot } from '../lib/meta-ads/leer-snapshot.core.js'
import { concentracionDe, firmaDePieza } from '../lib/meta-ads/rendimiento.core.js'

for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const t = line.trim()
  const eq = t.indexOf('=')
  if (!t || t.startsWith('#') || eq === -1) continue
  const k = t.slice(0, eq).trim()
  if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
}

const argv = process.argv.slice(2)
const valor = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const LINEA = valor('--linea')
const DESDE = valor('--desde')
const HASTA = valor('--hasta')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY (la base de BDI).')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

const plata = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
const pct = (n) => `${n.toFixed(1)}%`
/** Agrupar por nombre exacto es la medición VIEJA: la firma es la identidad. */
const exacto = (n) => n

const COLS = 'fecha,linea,nivel,nombre,objeto_id,adset_id,spend,compras'

// ── El control: la medición vieja, tal cual quedó publicada ──────────────────
const CONTROL = { linea: 'bdi', desde: '2026-08-18', hasta: '2026-08-24', pct: 32, cajas: 1 }
{
  const { filas, error } = await leerSnapshot(sb, {
    cols: COLS, nivel: 'aviso', lineas: [CONTROL.linea], desde: CONTROL.desde, hasta: CONTROL.hasta,
  })
  if (error) { console.error('No se pudo leer la foto:', error); process.exit(1) }
  const c = concentracionDe(filas, exacto)
  const m = c.mayor
  const ok = m && Math.round(m.pct) === CONTROL.pct && m.cajas === CONTROL.cajas
  console.log(`CONTROL — ${CONTROL.linea} ${CONTROL.desde}→${CONTROL.hasta}, por nombre EXACTO`)
  console.log(`  esperado: ${CONTROL.pct}% en ${CONTROL.cajas} caja`)
  console.log(`  medido:   ${m ? `${pct(m.pct)} en ${m.cajas} caja(s) — «${m.pieza}»` : 'no hay piezas'}`)
  if (!ok) {
    console.error('\n⛔ El control ⛔ NO reproduce la medición vieja. La foto cambió o la ventana ⛔ no es')
    console.error('   la misma: el resto de este script mediría otra cosa. Parando.')
    process.exit(1)
  }
  console.log('  ✅ reproduce.\n')
}

// ── La medición ──────────────────────────────────────────────────────────────
const { filas, error } = await leerSnapshot(sb, {
  cols: COLS, nivel: 'aviso', lineas: LINEA ? [LINEA] : null, desde: DESDE, hasta: HASTA,
})
if (error) { console.error('No se pudo leer la foto:', error); process.exit(1) }

const ventana = `${DESDE || 'el principio'} → ${HASTA || 'el último día'}`
const porLinea = new Map()
for (const f of filas) {
  const L = f.linea || 'sin-linea'
  if (!porLinea.has(L)) porLinea.set(L, [])
  porLinea.get(L).push(f)
}

for (const [L, suyas] of [...porLinea.entries()].sort()) {
  const piso = concentracionDe(suyas, exacto)
  const firmado = concentracionDe(suyas, firmaDePieza)
  console.log(`===== ${L} — ${ventana} — ${plata(firmado.total)} en ${suyas.length} filas de aviso =====`)
  if (!firmado.mayor) { console.log('  (sin gasto de avisos)\n'); continue }
  console.log(`  por nombre exacto: ${pct(piso.mayor.pct)} en ${piso.mayor.cajas} caja(s) — «${piso.mayor.pieza}»`)
  console.log(`  por FIRMA:         ${pct(firmado.mayor.pct)} en ${firmado.mayor.cajas} caja(s), ${firmado.mayor.nombres} nombre(s) — «${firmado.mayor.pieza}»`)
  const fusiones = firmado.piezas.filter((p) => p.nombres > 1)
  if (!fusiones.length) {
    console.log('  ⚠️ la firma ⛔ no fusionó NADA acá: los dos números son el mismo y el piso es el techo.\n')
    continue
  }
  // 🔑 Las fusiones se imprimen con el desglose por nombre para poder VETARLAS de un vistazo: la
  // firma sale del nombre y puede juntar dos videos distintos que compartan la base.
  const gastoPorNombre = new Map()
  for (const f of suyas) {
    const n = f.nombre || '(sin nombre)'
    gastoPorNombre.set(n, (gastoPorNombre.get(n) || 0) + (Number(f.spend) || 0))
  }
  console.log(`  ${fusiones.length} grupo(s) fusionan más de un nombre:`)
  for (const p of fusiones) {
    console.log(`    «${p.pieza}» +${p.nombres - 1} → ${plata(p.gasto)} (${pct(p.pct)}) en ${p.cajas} caja(s)`)
    for (const [n, g] of [...gastoPorNombre.entries()]
      .filter(([n]) => firmaDePieza(n) === firmaDePieza(p.pieza))
      .sort((a, b) => b[1] - a[1])) {
      console.log(`        ${plata(g).padStart(12)}  ${n}`)
    }
  }
  console.log()
}
