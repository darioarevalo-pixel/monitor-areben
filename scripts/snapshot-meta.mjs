/**
 * La foto diaria de la pauta de Meta → `meta_ads_snapshot_dia` (base de BDI).
 *
 * Uso:
 *   node scripts/snapshot-meta.mjs                      # corrida diaria: relee los últimos días
 *   node scripts/snapshot-meta.mjs --backfill 90        # trae 90 días hacia atrás, de una
 *   node scripts/snapshot-meta.mjs --desde 2026-05-01 --hasta 2026-08-08
 *   node scripts/snapshot-meta.mjs --simular            # no escribe: dice qué escribiría
 *   node scripts/snapshot-meta.mjs --cuenta 1145878766790149   # una sola cuenta
 *
 * # Por qué corre acá y no en una función de Vercel
 *
 * Vercel Hobby corta a los 10 s y ya hay 9 de las 12 funciones usadas. Esto son decenas de
 * llamadas paginadas a Graph por cuenta: no entra, y no tiene por qué — es un trabajo de fondo.
 * Por eso `lib/meta-ads/graph.core.js` vive en `lib/` y no en `api/_graph.js`, y por eso
 * `tokenMeta()` lee el env en cada llamada en vez de capturarlo al importar.
 *
 * # Un paso que falla se junta y el script sale con código 1
 *
 * Misma regla que `scripts/sync-diario.js`: los pasos que fallan sin frenar el trabajo se acumulan
 * en `problemas[]` y deciden el código de salida. Con `console.warn` y salida 0, el workflow queda
 * VERDE con la carga rota adentro — ya pasó con el refresco de vistas y estuvo así una semana.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { graph, insightsTodas, mensajeError, tokenMeta } from '../lib/meta-ads/graph.core.js'
import { CAMPOS_INSIGHTS, ATTR, num } from '../lib/meta-ads/metricas.core.js'
import {
  DIAS_RELECTURA, estadoRealDe, filaSnapshot, isoDia, NIVELES_SNAPSHOT, tramosDe,
} from '../lib/meta-ads/snapshot.core.js'

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

const SIMULAR = flag('--simular')
const CUENTA_UNICA = valor('--cuenta')
const BACKFILL = valor('--backfill') ? Math.max(1, parseInt(valor('--backfill'), 10) || 0) : null
const DESDE_ARG = valor('--desde')
const HASTA_ARG = valor('--hasta')

// ── Entorno ──────────────────────────────────────────────────────────────────

// La base de BDI: la tabla es cross-marca por el mismo motivo que `meta_ads_accion` (las cuentas
// publicitarias son compartidas, así que el gasto de un día es un hecho único). Ver el SQL.
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY (la base de BDI).')
  process.exit(1)
}
if (!tokenMeta()) {
  // ⚠️ Este es el error del día uno: `META_ADS_TOKEN` vive sólo en Vercel y hay que sumarlo como
  // secret de GitHub Actions. Sin este chequeo el workflow terminaría en verde sin traer nada.
  console.error('Falta META_ADS_TOKEN. Vive sólo en Vercel: hay que sumarlo como secret de Actions.')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Lecturas de Graph ────────────────────────────────────────────────────────

const rango = (t) => `time_range=${encodeURIComponent(JSON.stringify({ since: t.since, until: t.until }))}`

/** Los campos de identidad que hay que pedir por nivel (insights no los manda si no se piden). */
const CAMPOS_ID = {
  cuenta: 'account_id,account_name,account_currency',
  campania: 'campaign_id,campaign_name',
  conjunto: 'campaign_id,campaign_name,adset_id,adset_name',
  aviso: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name',
}
const LEVEL = { cuenta: 'account', campania: 'campaign', conjunto: 'adset', aviso: 'ad' }

/** Un edge paginado entero, devolviendo `[]` y anotando el problema si falla. */
async function todas(path, que) {
  const r = await insightsTodas(path)
  if (!r.ok) { anotar(que, r.error); return [] }
  return r.rows
}

/**
 * La configuración VIGENTE de una cuenta: objetivo, estado y presupuesto de cada objeto, más el
 * `estado_real` de cada conjunto.
 *
 * 🔑 Los avisos se traen en UNA sola llamada paginada de la cuenta y se agrupan por conjunto, en
 * vez de una llamada por conjunto. Con 40 conjuntos activos la diferencia es 1 llamada contra 40,
 * y el cupo de Graph es un recurso compartido con la app.
 */
async function configDe(cuentaId) {
  const [campanias, conjuntos, avisos] = await Promise.all([
    todas(`act_${cuentaId}/campaigns?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget&limit=200`, `campañas de ${cuentaId}`),
    todas(`act_${cuentaId}/adsets?fields=id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget&limit=200`, `conjuntos de ${cuentaId}`),
    todas(`act_${cuentaId}/ads?fields=id,adset_id,status,effective_status&limit=500`, `avisos de ${cuentaId}`),
  ])

  const avisosPorConjunto = new Map()
  for (const a of avisos) {
    const k = String(a.adset_id || '')
    if (!k) continue
    if (!avisosPorConjunto.has(k)) avisosPorConjunto.set(k, [])
    avisosPorConjunto.get(k).push(a)
  }

  const porId = new Map()
  for (const c of campanias) {
    porId.set(String(c.id), {
      objetivo: c.objective || null,
      estado: c.status || null,
      estadoEfectivo: c.effective_status || null,
      diarioCrudo: c.daily_budget != null ? Math.round(num(c.daily_budget)) : null,
    })
  }
  for (const s of conjuntos) {
    const id = String(s.id)
    porId.set(id, {
      objetivo: null,
      estado: s.status || null,
      estadoEfectivo: s.effective_status || null,
      diarioCrudo: s.daily_budget != null ? Math.round(num(s.daily_budget)) : null,
      // `avisosPorConjunto.get(id)` es `undefined` cuando la lectura de avisos falló Y también
      // cuando el conjunto no tiene ninguno. `estadoRealDe` distingue: con `undefined` devuelve
      // `null` (no sabemos) y con `[]` devuelve `'sin-avisos'`. Por eso el fallback es condicional.
      estadoReal: estadoRealDe(s.status, avisosPorConjunto.get(id) ?? (avisos.length ? [] : null)),
    })
  }
  for (const a of avisos) {
    porId.set(String(a.id), {
      estado: a.status || null,
      estadoEfectivo: a.effective_status || null,
      // Un aviso no tiene presupuesto propio en Meta: lo hereda del conjunto.
      diarioCrudo: null,
    })
  }
  return porId
}

// ── Escritura ────────────────────────────────────────────────────────────────

/**
 * Sube las filas en tandas.
 *
 * 🔑 **Van en DOS grupos, y no es una optimización.** Las columnas de configuración (`estado`,
 * `diario_crudo`, `estado_real`, `objetivo`) describen cómo estaba el objeto **al momento de la
 * foto**, y sólo son ciertas para el día en que se sacó. Escribirlas en una fila de hace dos meses
 * sería inventar un presupuesto histórico que Meta no expone por ninguna vía; peor: al releer los
 * últimos días, pisaría el presupuesto correcto de ayer con el de hoy.
 *
 * Por eso la fila de HOY lleva la configuración y las demás no. PostgREST exige que todas las
 * filas de un lote tengan las mismas claves, así que son dos `upsert` distintos — y las claves
 * ausentes no entran en el `ON CONFLICT DO UPDATE SET`, o sea que releer no pisa nada.
 */
const CONFIG_COLS = ['objetivo', 'estado', 'estado_efectivo', 'estado_real', 'diario_crudo']

async function guardar(filas, hoy) {
  const conConfig = []
  const sinConfig = []
  for (const f of filas) {
    if (f.fecha === hoy) { conConfig.push(f); continue }
    const copia = { ...f }
    for (const c of CONFIG_COLS) delete copia[c]
    sinConfig.push(copia)
  }

  let escritas = 0
  for (const [lote, etiqueta] of [[conConfig, 'con configuración'], [sinConfig, 'sólo métricas']]) {
    for (let i = 0; i < lote.length; i += 500) {
      const trozo = lote.slice(i, i + 500)
      if (SIMULAR) { escritas += trozo.length; continue }
      const { error } = await supabase
        .from('meta_ads_snapshot_dia')
        .upsert(trozo, { onConflict: 'fecha,nivel,objeto_id' })
      if (error) anotar(`guardar (${etiqueta})`, error.message)
      else escritas += trozo.length
    }
  }
  return escritas
}

// ── El trabajo ───────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now()

  // Qué días se piden. Sin argumentos, la ventana de relectura: Meta reatribuye conversiones hacia
  // atrás durante la ventana de atribución, así que la fila de anteayer todavía cambia.
  const hoyLocal = isoDia(new Date())
  let desde = DESDE_ARG
  let hasta = HASTA_ARG || hoyLocal
  if (!desde) {
    const dias = BACKFILL ?? DIAS_RELECTURA
    const d = new Date()
    d.setDate(d.getDate() - (dias - 1))
    desde = isoDia(d)
  }
  const tramos = tramosDe(desde, hasta)
  if (!tramos.length) {
    console.error(`Rango inválido: ${desde} → ${hasta}`)
    process.exit(1)
  }

  console.log(`Foto de Meta ${desde} → ${hasta} (${tramos.length} tramo${tramos.length === 1 ? '' : 's'})${SIMULAR ? '  [SIMULACRO]' : ''}`)

  // Las cuentas del token. Sin `business{name}`: pedirlo rompe la consulta ENTERA porque el token
  // no tiene `business_management` (pasó en prod el 26-jul-2026).
  const rc = await graph('me/adaccounts?fields=account_id,name,currency,timezone_name&limit=100')
  if (!rc.ok) {
    console.error(`No se pudieron leer las cuentas: ${mensajeError(rc)}`)
    process.exit(1)
  }
  let cuentas = ((rc.data && rc.data.data) || []).map((c) => ({
    id: String(c.account_id), nombre: c.name || '', moneda: c.currency || 'ARS', zona: c.timezone_name || '',
  }))
  if (CUENTA_UNICA) cuentas = cuentas.filter((c) => c.id === String(CUENTA_UNICA))
  if (!cuentas.length) {
    console.error('El token no ve ninguna cuenta publicitaria.')
    process.exit(1)
  }

  // La línea de cada campaña. La pone una persona y no se deduce de nada que traiga Graph: es el
  // eje por el que después se lee todo. Una campaña sin línea se guarda igual, con `linea: null`.
  const lineaPorCampania = new Map()
  const { data: asign, error: eLinea } = await supabase
    .from('meta_ads_campania_linea')
    .select('campaign_id,linea')
  if (eLinea) anotar('leer las líneas', eLinea.message)
  for (const a of asign || []) lineaPorCampania.set(String(a.campaign_id), a.linea)

  let total = 0
  for (const cuenta of cuentas) {
    console.log(`\n${cuenta.nombre || cuenta.id} (${cuenta.id}, ${cuenta.moneda})`)
    const cfg = await configDe(cuenta.id)
    const filas = []

    for (const t of tramos) {
      for (const nivel of NIVELES_SNAPSHOT) {
        const path = `act_${cuenta.id}/insights?level=${LEVEL[nivel]}`
          + `&fields=${CAMPOS_ID[nivel]},${CAMPOS_INSIGHTS}`
          + `&time_increment=1&${rango(t)}&action_attribution_windows=${ATTR}&limit=500`
        const rows = await todas(path, `insights ${nivel} ${t.since}→${t.until} de ${cuenta.id}`)
        for (const row of rows) {
          const id = nivel === 'cuenta' ? cuenta.id
            : nivel === 'campania' ? String(row.campaign_id || '')
              : nivel === 'conjunto' ? String(row.adset_id || '')
                : String(row.ad_id || '')
          const extras = {
            ...(cfg.get(id) || {}),
            moneda: cuenta.moneda,
            // La línea cuelga de la CAMPAÑA en todos los niveles: un conjunto es de la marca de su
            // campaña. En el nivel cuenta no hay línea posible — la cuenta puede tener varias.
            linea: nivel === 'cuenta' ? null : (lineaPorCampania.get(String(row.campaign_id || '')) ?? null),
          }
          const fila = filaSnapshot(row, nivel, cuenta.id, extras)
          if (fila) filas.push(fila)
        }
      }
    }

    const n = await guardar(filas, hoyLocal)
    total += n
    console.log(`  ${String(n).padStart(5)} filas${SIMULAR ? ' (no escritas)' : ''}`)
  }

  console.log(`\n${total} filas en ${Math.round((Date.now() - t0) / 1000)}s.`)
  if (problemas.length) {
    console.log(`\n${problemas.length} problema${problemas.length === 1 ? '' : 's'}:`)
    for (const p of problemas) console.log(`  · ${p}`)
    process.exitCode = 1
  } else {
    console.log('Sin problemas.')
  }
}

await main()
