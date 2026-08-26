/**
 * ¿Cuánto tiene que caer un CTR para que sea DESGASTE y no ruido?
 *
 * La regla de fatiga confirma con `despues < antes` a secas: cualquier caída, por chica que sea,
 * la deja decir «Está quemado». El 26-ago-2026 eso disparó sobre `AD02 - GIRLHOOD COLLECTION` con
 * **3,9% → 3,8%** —un 2,6% relativo—, que es ruido de una semana.
 *
 * Esto imprime, para cada aviso con gasto, la caída relativa del CTR entre las dos mitades de la
 * ventana: la distribución contra la que hay que elegir el corte, en vez de inventarlo.
 *
 *   node scripts/medir-ctr-fatiga.mjs [--dias 7] [--linea bdi]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { COLS_REGLA, leerSnapshot } from '../lib/meta-ads/leer-snapshot.core.js'
import { agrupar, compararCtr, ventanaDe } from '../lib/meta-ads/reglas.core.js'
import { isoDia } from '../lib/meta-ads/snapshot.core.js'

for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const t = line.trim()
  const eq = t.indexOf('=')
  if (!t || t.startsWith('#') || eq === -1) continue
  const k = t.slice(0, eq).trim()
  if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
}

const argv = process.argv.slice(2)
const valor = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const DIAS = Math.max(2, parseInt(valor('--dias'), 10) || 7)
const LINEAS = valor('--linea') ? [valor('--linea')] : ['bdi', 'zattia', 'stunned']
const HASTA = valor('--hasta') || isoDia(new Date())

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const desde = ventanaDe(HASTA, 90).at(-1)
const snap = await leerSnapshot(sb, { cols: COLS_REGLA, desde, lineas: LINEAS })
if (snap.error) { console.error(snap.error); process.exit(1) }

const fechas = ventanaDe(HASTA, DIAS)
console.log(`Caída del CTR entre las dos mitades de ${DIAS} días · hasta ${HASTA}\n`)
const filas = []
for (const linea of LINEAS) {
  const suyas = snap.filas.filter((f) => f.linea === linea)
  for (const g of agrupar(suyas, 'aviso', fechas)) {
    if (g.spend <= 0 || g.impresiones <= 0) continue
    const c = compararCtr(g.filas)
    if (!c) continue
    filas.push({
      linea,
      nombre: g.nombre,
      spend: g.spend,
      frec: g.frecuenciaPico,
      antes: c.antes,
      despues: c.despues,
      // Negativo = cayó. Es la magnitud RELATIVA, que es la comparable entre avisos con CTR distinto.
      pct: ((c.despues - c.antes) / c.antes) * 100,
    })
  }
}
filas.sort((a, b) => a.pct - b.pct)
for (const f of filas) {
  console.log(`${String(Math.round(f.pct)).padStart(5)}%  ctr ${f.antes.toFixed(2)}→${f.despues.toFixed(2)}  frec ${f.frec.toFixed(2)}  $${Math.round(f.spend).toLocaleString('es-AR').padStart(9)}  ${f.linea} · ${f.nombre}`)
}
const cae = filas.filter((f) => f.pct < 0)
console.log(`\n${filas.length} avisos con CTR comparable · ${cae.length} caen`)
for (const corte of [5, 10, 15, 20, 30, 40]) {
  console.log(`  caída > ${String(corte).padStart(2)}%: ${filas.filter((f) => f.pct < -corte).length} avisos`)
}
