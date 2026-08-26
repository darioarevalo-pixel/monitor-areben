/**
 * El reloj de las automatizaciones: evalúa las reglas activas y deja hallazgos.
 *
 * Uso:
 *   node scripts/evaluar-reglas-meta.mjs                  # la corrida diaria
 *   node scripts/evaluar-reglas-meta.mjs --simulacro      # no escribe: dice qué escribiría
 *   node scripts/evaluar-reglas-meta.mjs --calibrar       # corre TODOS los presets hacia atrás
 *   node scripts/evaluar-reglas-meta.mjs --calibrar --dias 30
 *   node scripts/evaluar-reglas-meta.mjs --linea bdi
 *   node scripts/evaluar-reglas-meta.mjs --hasta 2026-08-07
 *
 * # 🔑 Este script NO habla con Meta
 *
 * Lee `meta_ads_snapshot_dia` de Supabase y nada más. No importa `graph.core.js`, no necesita
 * `META_ADS_TOKEN` y no consume cupo de Graph. La consecuencia práctica: **el día que Meta se caiga
 * o el token venza, las automatizaciones siguen andando** y el Panel sigue contestando qué hay que
 * decidir. Es la misma razón por la que los GET de reglas se despachan antes del guard del token.
 *
 * # `--calibrar` es la verificación que más rinde, y es la misma función que la corrida real
 *
 * Corre cada preset hacia atrás sobre los 90 días que ya están en la tabla, con los umbrales que
 * haya, y dice cuántas veces habría saltado y a cuántas cosas distintas. Sirve para dos cosas:
 * elegir un umbral mirando en vez de adivinando, y **probar los detectores contra la pauta de
 * verdad sin escribir una fila**. Ver `feedback_areben_ensayo_verde_con_defecto`: 38 tests en verde
 * no son una corrida sobre datos reales.
 *
 * # Un paso que falla se junta y el script sale con código 1
 *
 * Misma regla que `snapshot-meta.mjs` y `sync-diario.js`: con `console.warn` y salida 0 el workflow
 * queda VERDE con el trabajo roto adentro. Ya pasó con el refresco de vistas y estuvo así una semana.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { plata, roas as roasTxt } from '../lib/meta-ads/formato.core.js'
import { indexar, porQueCallado } from '../lib/meta-ads/decisiones.core.js'
import { COLS_REGLA, leerDecisiones, leerSnapshot, leerTechos, leerUmbrales, techoDe } from '../lib/meta-ads/leer-snapshot.core.js'
import { isoDia } from '../lib/meta-ads/snapshot.core.js'
import {
  calibrar, CLAVES_PRESET, contextoUmbrales, evaluarRegla, PRESETS,
} from '../lib/meta-ads/reglas.core.js'

const problemas = []
const anotar = (que, detalle) => { problemas.push(`${que}: ${detalle}`); console.log(`  ⚠️  ${que}: ${detalle}`) }

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const k = t.slice(0, eq).trim()
      if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    }
  } catch { /* usa las variables del sistema */ }
}
loadEnv()

// ── Argumentos ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const valor = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }

const SIMULACRO = flag('--simulacro')
const CALIBRAR = flag('--calibrar')
const LINEA_UNICA = valor('--linea')
const DIAS = Math.max(1, parseInt(valor('--dias'), 10) || 90)
const HASTA = valor('--hasta') || isoDia(new Date())

// ── Entorno ──────────────────────────────────────────────────────────────────

// La base de BDI: las tres tablas son cross-marca por el mismo motivo que el snapshot (las cuentas
// publicitarias son compartidas). Ver el SQL.
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY (la base de BDI).')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Lecturas ─────────────────────────────────────────────────────────────────

/**
 * Las filas del snapshot desde una fecha.
 *
 * ⚠️ El paginado —y el porqué— vive en `leerSnapshot()`. Sin él las reglas mirarían un pedazo del
 * pasado creyendo que es todo, y una regla que mira menos días encuentra menos, en silencio.
 */
async function traerFilas(desde, hasta) {
  const { filas, error } = await leerSnapshot(supabase, { cols: COLS_REGLA, desde, hasta })
  if (error) anotar('leer snapshots', error)
  return filas || []
}

// El `select` vive en `leer-snapshot.core.js`: lo piden este script, `api/_meta-reglas.js` y el
// guardarraíl de los escalones, y tres copias de una lectura son tres filtros que se despegan.
async function traerUmbrales() {
  const { mapa, error } = await leerUmbrales(supabase)
  if (error) anotar('leer umbrales', error)
  return mapa
}

/**
 * Los techos de costo por compra, de la ficha de rentabilidad de cada marca.
 *
 * 🔑 Sin esto, `cpa_maximo` queda en `null` y **el corte principal —el que apaga lo que compra muy
 * arriba del techo— no corre**, sin que nadie lo note: la regla se imprime como «apagada» y una
 * línea apagada entre siete se lee como una decisión, no como un cable suelto. Era exactamente el
 * estado del módulo hasta el 26-ago-2026.
 */
async function traerTechos() {
  const { mapa, error } = await leerTechos(supabase, LINEA_UNICA ? [LINEA_UNICA] : null)
  if (error) anotar('leer las fichas de rentabilidad', error)
  return mapa
}

/**
 * Las decisiones humanas vigentes, ya indexadas por objeto.
 *
 * ⚠️ Un error de lectura **no** frena la corrida: se anota y se sigue con el índice vacío, o sea
 * gritando de más. Es la dirección barata del error — una alarma repetida molesta, una alarma que
 * no aparece porque no se pudo leer la tabla de silencios es una que nadie va a echar de menos.
 */
async function traerDecisiones() {
  const { filas, error } = await leerDecisiones(supabase, LINEA_UNICA ? [LINEA_UNICA] : null)
  if (error) anotar('leer decisiones', error)
  return { indice: indexar(filas), cuantas: filas.length }
}

async function traerReglas() {
  let q = supabase.from('meta_ads_regla').select('*').eq('activa', true)
  if (LINEA_UNICA) q = q.eq('linea', LINEA_UNICA)
  const { data, error } = await q
  if (error) { anotar('leer reglas', error.message); return [] }
  return data || []
}

// ── Escritura ────────────────────────────────────────────────────────────────

/**
 * Guarda los hallazgos de una regla.
 *
 * 🔑 **`ignoreDuplicates: true`, y es la decisión que evita el ruido.** El `unique(regla_id, fecha,
 * objeto_id)` hace que el cron pueda correr dos veces el mismo día sin duplicar; pero además, un
 * hallazgo que alguien ya marcó como IGNORADO no tiene que volver a ponerse en `nuevo` porque la
 * regla lo detectó de nuevo. Con `upsert` normal el `ON CONFLICT DO UPDATE` lo resucitaría, y la
 * misma propuesta rechazada reaparecería todos los días hasta que alguien la accione — que es
 * exactamente la forma en que se aprende a no mirar los avisos.
 */
async function guardar(reglaId, hallazgos) {
  if (!hallazgos.length) return 0
  const filas = hallazgos.map((h) => ({ ...h, regla_id: reglaId }))
  if (SIMULACRO) return filas.length
  const { error, data } = await supabase
    .from('meta_ads_hallazgo')
    .upsert(filas, { onConflict: 'regla_id,fecha,objeto_id', ignoreDuplicates: true })
    .select('id')
  if (error) { anotar(`guardar hallazgos de la regla ${reglaId}`, error.message); return 0 }
  return (data || []).length
}

async function marcarCorrida(reglaId, detalle) {
  if (SIMULACRO) return
  const { error } = await supabase
    .from('meta_ads_regla')
    .update({ ultima_corrida: new Date().toISOString(), detalle })
    .eq('id', reglaId)
  if (error) anotar(`marcar la corrida de la regla ${reglaId}`, error.message)
}

// ── Los dos modos ────────────────────────────────────────────────────────────

/**
 * `--calibrar`: corre TODOS los presets de TODAS las líneas hacia atrás, sin escribir nada.
 *
 * No mira `meta_ads_regla`: la gracia es poder ver qué haría un preset **antes** de crear la regla.
 * Es el mismo camino que alimenta el dial de la pantalla.
 */
async function modoCalibrar(filas, umbrales, decisiones, techos) {
  const lineas = LINEA_UNICA
    ? [LINEA_UNICA]
    : [...new Set(filas.map((f) => f.linea).filter(Boolean))].sort()

  if (!lineas.length) {
    console.log('\nNo hay ninguna línea con filas en la ventana. ¿Están las campañas asignadas a una marca?')
    return
  }

  for (const linea of lineas) {
    const suyas = filas.filter((f) => f.linea === linea)
    const ctx = contextoUmbrales(suyas)
    const techo = techoDe(techos, linea)
    console.log(`\n━━ ${linea.toUpperCase()} ━━ ${ctx.dias} días con gasto · ${ctx.campanias} campañas · ${plata(ctx.gastoTotal)}`)
    console.log(`   ROAS medio ${roasTxt(ctx.roasMedio)} · CPA medio ${ctx.cpaMedio ? plata(ctx.cpaMedio) : '—'} · frecuencia pico ${ctx.frecuenciaPico.toFixed(1)}`)
    // El techo de la ficha va al lado del CPA medido a propósito: los dos juntos son el diagnóstico
    // de la marca en un renglón. Un CPA medio arriba del techo es una pauta que pierde plata.
    console.log(`   Techo de la ficha ${techo ? plata(techo) : '— (sin ficha de rentabilidad cargada)'}`)

    for (const preset of CLAVES_PRESET) {
      const def = PRESETS[preset]
      const r = calibrar(
        { preset, linea, parametros: {} },
        { filas: suyas, umbralLinea: umbrales.get(linea) || null, hasta: HASTA, dias: DIAS, decisiones, techo },
      )
      if (!r.ok) { anotar(`calibrar ${preset} de ${linea}`, r.error); continue }
      if (r.apagada) {
        // No es un error: es la regla diciendo por qué no puede correr. Se imprime igual para que
        // la corrida deje claro qué falta definir.
        console.log(`   ○ ${def.rotulo.padEnd(26)} apagada — ${r.detalle}`)
        continue
      }
      const marca = r.total === 0 ? '·' : '●'
      const saltos = `${r.total} salto${r.total === 1 ? '' : 's'}`
      console.log(`   ${marca} ${def.rotulo.padEnd(26)} ${saltos.padStart(10)} sobre ${r.objetos} objeto${r.objetos === 1 ? '' : 's'} en ${DIAS} días`)
      for (const e of r.ejemplos.slice(0, 3)) {
        console.log(`       · ${(e.objeto_nombre || e.objeto_id).slice(0, 62)}  (${e.veces}×)`)
        console.log(`         ${e.motivo}`)
      }
    }
  }
}

/** La corrida diaria: las reglas activas, un día, y a la base. */
async function modoDiario(filas, umbrales, decisiones, techos) {
  const reglas = await traerReglas()
  if (!reglas.length) {
    console.log('\nNo hay ninguna regla activa. Se prenden desde /meta-ads/automatizaciones.')
    return
  }

  let total = 0
  for (const regla of reglas) {
    const def = PRESETS[regla.preset]
    const nombre = `${def ? def.rotulo : regla.preset} · ${regla.linea}`
    const r = evaluarRegla(regla, {
      filas,
      umbralLinea: umbrales.get(regla.linea) || null,
      hasta: HASTA,
      decisiones,
      techo: techoDe(techos, regla.linea),
    })
    if (!r.ok) { anotar(nombre, r.error); continue }
    if (r.apagada) {
      console.log(`  ○ ${nombre}: apagada — ${r.detalle}`)
      await marcarCorrida(regla.id, r.detalle)
      continue
    }
    const nuevos = await guardar(regla.id, r.hallazgos)
    total += nuevos
    // ⚠️ «Nada que reportar» y «todo callado por una decisión» son cosas distintas y la pantalla lee
    // esta frase: sin la segunda mitad, una regla enteramente silenciada se vería igual que una que
    // no encontró nada, y nadie sabría que hay una decisión vieja tapándola.
    const callados = r.silenciados.length
      ? ` ${r.silenciados.length} callado${r.silenciados.length === 1 ? '' : 's'} por una decisión.`
      : ''
    const detalle = (r.hallazgos.length === 0
      ? 'Nada que reportar.'
      : `${r.hallazgos.length} detectado${r.hallazgos.length === 1 ? '' : 's'}, ${nuevos} nuevo${nuevos === 1 ? '' : 's'}.`) + callados
    console.log(`  ${r.hallazgos.length ? '●' : '·'} ${nombre}: ${detalle}`)
    for (const h of r.hallazgos.slice(0, 5)) {
      console.log(`      · ${(h.objeto_nombre || h.objeto_id).slice(0, 62)} — ${h.motivo}`)
    }
    // 🔑 Lo callado se imprime SIEMPRE. Un silencio que no se ve en el log es exactamente el
    // agujero negro que la tabla de decisiones está pensada para no ser: si mañana algo real deja de
    // avisar, el rastro tiene que estar acá.
    for (const s of r.silenciados) {
      console.log(`      ⊘ ${(s.objeto_nombre || s.objeto_id).slice(0, 62)}`)
      console.log(`        ${porQueCallado(s.decision)}`)
    }
    await marcarCorrida(regla.id, detalle)
  }
  console.log(`\n${total} hallazgo${total === 1 ? '' : 's'} nuevo${total === 1 ? '' : 's'}.`)
}

// ── El trabajo ───────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now()
  // El modo diario sólo necesita la ventana más larga de los presets, pero traer los mismos 90 días
  // que el calibrador cuesta una consulta igual y hace que **los umbrales derivados sean los mismos
  // en los dos modos**. Si el CPA se dedujera de 7 días en la corrida y de 90 en el calibrador, el
  // dial mostraría un número y la regla usaría otro.
  const d = new Date(`${HASTA}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - (DIAS - 1))
  const desde = d.toISOString().slice(0, 10)

  console.log(`Reglas de Meta · ventana ${desde} → ${HASTA}${SIMULACRO ? '  [SIMULACRO: no escribe nada]' : ''}${CALIBRAR ? '  [CALIBRADOR]' : ''}`)

  const [filas, umbrales, decisiones, techos] = await Promise.all([
    traerFilas(desde, HASTA), traerUmbrales(), traerDecisiones(), traerTechos(),
  ])
  // «decisión» pierde la tilde en plural: la palabra entera va en el ternario, no el sufijo.
  const dec = decisiones.cuantas === 1 ? '1 decisión vigente' : `${decisiones.cuantas} decisiones vigentes`
  console.log(`${filas.length} filas de snapshot · ${umbrales.size} línea${umbrales.size === 1 ? '' : 's'} con umbrales cargados · ${techos.size} con ficha de rentabilidad · ${dec}`)
  if (!filas.length) {
    anotar('snapshots', 'no hay ninguna fila en la ventana: ¿corrió `snapshot-meta.mjs`?')
  } else if (CALIBRAR) {
    // Las mismas decisiones en los dos modos: el dial tiene que decir lo que va a decir el Panel.
    await modoCalibrar(filas, umbrales, decisiones.indice, techos)
  } else {
    await modoDiario(filas, umbrales, decisiones.indice, techos)
  }

  console.log(`\nListo en ${((Date.now() - t0) / 1000).toFixed(1)} s.`)
  if (problemas.length) {
    console.log(`\n${problemas.length} problema${problemas.length === 1 ? '' : 's'}:`)
    for (const p of problemas) console.log(`  - ${p}`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
