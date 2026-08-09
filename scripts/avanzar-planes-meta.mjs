/**
 * **El reloj de las escaladas**: da los escalones que ya vencieron, uno por plan y por corrida.
 *
 * Uso:
 *   node scripts/avanzar-planes-meta.mjs                # la corrida horaria
 *   node scripts/avanzar-planes-meta.mjs --simulacro    # no escribe en Meta: dice qué haría
 *   node scripts/avanzar-planes-meta.mjs --plan 42      # uno solo, para mirarlo de cerca
 *
 * # 🔑 Por qué esto no lo puede hacer el browser
 *
 * Una escalada de cuatro escalones a un día cada uno corre durante cuatro días. El Panel avanza un
 * plan cuando alguien lo mira, y **nadie mira el Panel a las 3 de la mañana del jueves**: sin este
 * cron, «un escalón por día» sería en realidad «los escalones que se den cuando alguien entre», que
 * es exactamente lo que la separación en el tiempo existía para evitar.
 *
 * # Qué hace y qué NO
 *
 * ⛔ **Sólo avanza planes de tipo `escalar`.** Duplicar y crear siguen siendo del Panel a propósito:
 * crean objetos, tienen sonda, adopción y ambigüedad, y un plan que se atasca creando cosas tiene que
 * atascarse delante de alguien. Un escalón, en cambio, pone un valor absoluto sobre algo que ya
 * existe: no puede duplicar nada ni aunque se lo corra dos veces.
 *
 * ⛔ **Un escalón por plan por corrida.** El paso siguiente queda con su `proximo_en` en el futuro, así
 * que la corrida que viene no lo toca. Es lo que impide que un plan que estuvo tres días esperando
 * dispare tres escalones seguidos apenas se destrabe: la espera se cuenta **desde ahora**, no desde
 * que se armó.
 *
 * # Lo que hace ES lo mismo que hace el Panel, y por eso está en `lib/`
 *
 * `correrEscalon()` —releer el diario de Meta, mirar la foto, preguntarle al guardarraíl, escribir y
 * comparar— la comparten este script y `api/_meta-planes.js`. Escrita dos veces serían dos cosas que
 * se despegan el día que se arregle una. Ver la cabecera de `lib/meta-ads/correr-escalon.core.js`.
 *
 * # Este SÍ necesita el token de Meta, y por eso corre en Actions
 *
 * A diferencia de `evaluar-reglas-meta.mjs`, que sólo lee snapshots, éste **escribe en Meta**. El
 * `META_ADS_TOKEN` ya es secret del repo desde el 8-ago; hacerlo local obligaría a generar otra
 * credencial viva para siempre. Es el mismo patrón que `ensayo-meta.yml`.
 *
 * # Un paso que falla se junta y el script sale con código 1
 *
 * Misma regla que `snapshot-meta.mjs` y `evaluar-reglas-meta.mjs`: con `console.warn` y salida 0 el
 * workflow queda VERDE con el trabajo roto adentro. ⚠️ Un escalón **salteado no es un problema**: es
 * el guardarraíl haciendo su trabajo, y contarlo como falla enseñaría a ignorar el rojo.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { correrEscalon } from '../lib/meta-ads/correr-escalon.core.js'
import { HORAS_ESCALON_DEFECTO, proximoEn, ultimoDiaCerrado } from '../lib/meta-ads/escalado.core.js'
import { estadoDePlan, siguientePaso, TIMEOUT_PASO_MS } from '../lib/meta-ads/planes.core.js'

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

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const valor = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }

const SIMULACRO = flag('--simulacro')
const PLAN_UNICO = parseInt(valor('--plan'), 10) || null

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY (la base de BDI).')
  process.exit(1)
}
if (!SIMULACRO && !process.env.META_ADS_TOKEN) {
  // 🔴 Se corta ANTES de leer nada. Sin token, cada escalón daría un corte y los planes acumularían
  // intentos hasta rendirse: un token faltante no puede consumirse los reintentos de una escalada.
  console.error('Falta META_ADS_TOKEN. Sin él este script no puede escribir, y prefiere no empezar.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const TABLA = 'meta_ads_plan'
const TABLA_PASO = 'meta_ads_plan_paso'

/** Cuánto dura el lock. Más largo que el del handler: acá no hay un plan Hobby cortando a los 10 s. */
const LOCK_MS = 120000

const ahoraIso = () => new Date().toISOString()
const horasDe = (plan) => Number((plan.entrada || {}).horas) || HORAS_ESCALON_DEFECTO

const aPaso = (f) => ({
  orden: f.orden, tipo: f.tipo, rotulo: f.rotulo, estado: f.estado, intentos: f.intentos || 0,
  pedido: f.pedido || null, resultadoId: f.resultado_id || null, marca: f.marca || null,
  detalle: f.detalle || null, ultimoEn: f.ultimo_en || null, puedeReintentar: !!f.puede_reintentar,
})

/**
 * Los planes de escalar a los que les llegó la hora.
 *
 * `proximo_en is null` entra a propósito: una escalada recién armada tiene su primer escalón para
 * ahora mismo. Lo que la separa en el tiempo son los escalones 2 en adelante.
 */
async function traerVencidos() {
  let q = supabase.from(TABLA).select('*')
    .eq('tipo', 'escalar')
    .in('estado', ['pendiente', 'en-curso'])
    .or(`proximo_en.is.null,proximo_en.lte."${ahoraIso()}"`)
    .order('creado', { ascending: true })
    .limit(50)
  if (PLAN_UNICO) q = q.eq('id', PLAN_UNICO)
  const { data, error } = await q
  if (error) { anotar('leer planes', error.message); return [] }
  return data || []
}

/** Toma el lock optimista. `false` = otro lo tiene, y no se toca. */
async function tomarLock(plan) {
  const ahora = Date.now()
  const { data } = await supabase.from(TABLA)
    .update({ lock_hasta: new Date(ahora + LOCK_MS).toISOString(), estado: 'en-curso', actualizado: ahoraIso() })
    .eq('id', plan.id)
    // 🔑 El `is`/`lt` es lo que lo hace optimista: si el Panel lo tomó entre la lectura y esto, no
    // vuelve fila y el escalón no se da dos veces. Es el mismo candado que usa `api/_meta-planes.js`.
    // ⚠️ El ISO va entre comillas: trae puntos y PostgREST parte `col.op.valor` por puntos.
    .or(`lock_hasta.is.null,lock_hasta.lt."${new Date(ahora).toISOString()}"`)
    .select('id').maybeSingle()
  return !!data
}

async function guardarPaso(planId, orden, campos) {
  const { error } = await supabase.from(TABLA_PASO).update(campos).eq('plan_id', planId).eq('orden', orden)
  if (error) anotar(`guardar el paso ${orden} del plan ${planId}`, error.message)
}

async function avanzarUno(plan) {
  const { data: filas, error } = await supabase.from(TABLA_PASO).select('*').eq('plan_id', plan.id).order('orden')
  if (error) { anotar(`leer los pasos del plan ${plan.id}`, error.message); return null }
  const pasos = (filas || []).map(aPaso)
  const paso = siguientePaso(pasos)
  if (!paso) return { cerrar: 'hecho', nota: 'ya no le quedaban pasos' }

  if (paso.tipo !== 'escalon') {
    // No debería pasar: un plan `escalar` sólo tiene escalones. Se dice en vez de adivinar qué hacer.
    anotar(`plan ${plan.id}`, `el paso ${paso.orden} es «${paso.tipo}» y este script sólo da escalones`)
    return null
  }

  console.log(`  · plan ${plan.id} (${plan.linea}) — ${paso.rotulo}`)
  await guardarPaso(plan.id, paso.orden, {
    estado: 'en-curso', intentos: (paso.intentos || 0) + 1, ultimo_en: ahoraIso(),
  })

  const e = await correrEscalon(supabase, {
    // 🔴 El último día CERRADO, no hoy: la foto del día en curso corta cualquier racha.
    pedido: paso.pedido || {}, linea: plan.linea, hasta: ultimoDiaCerrado(Date.now()),
    simulacro: SIMULACRO || !!plan.simulacro, timeoutMs: TIMEOUT_PASO_MS,
  })

  if (e.salteado) {
    // ⚠️ Salteado NO va a `problemas`: el guardarraíl frenando es el sistema funcionando.
    console.log(`    ⏭  salteado — ${e.motivo}`)
    await guardarPaso(plan.id, paso.orden, { estado: 'salteado', detalle: e.motivo })
    return { estado: 'salteado', motivo: e.motivo }
  }
  if (e.corte) {
    console.log(`    ⏸  cortado — ${e.error}`)
    await guardarPaso(plan.id, paso.orden, { estado: 'en-curso', detalle: e.error, uso: e.uso || null })
    // Un corte no es un fallo del script: el paso se repite solo en la corrida que viene. No se
    // corre el reloj, justamente para que la próxima hora lo reintente.
    return { estado: 'en-curso', sinEspera: true, motivo: e.error }
  }
  if (!e.ok) {
    anotar(`plan ${plan.id}, escalón ${paso.orden}`, e.error || 'Meta lo rechazó')
    await guardarPaso(plan.id, paso.orden, {
      estado: 'fallado', puede_reintentar: true, detalle: e.error || 'Meta lo rechazó.', uso: e.uso || null,
    })
    return { estado: 'fallado', motivo: e.error }
  }

  console.log(`    ✅ ${e.detalle}`)
  await guardarPaso(plan.id, paso.orden, {
    estado: 'hecho', resultado_id: e.id || null, detalle: e.detalle || null, uso: e.uso || null,
  })
  return { estado: 'hecho', motivo: e.detalle }
}

async function main() {
  console.log(`Escaladas de Meta · ${ahoraIso()}${SIMULACRO ? ' · SIMULACRO' : ''}`)
  const planes = await traerVencidos()
  console.log(`${planes.length} plan${planes.length === 1 ? '' : 'es'} de escalar con la hora cumplida`)

  let dados = 0
  let salteados = 0
  for (const plan of planes) {
    if (!(await tomarLock(plan))) {
      console.log(`  · plan ${plan.id}: lo está avanzando alguien más, se saltea`)
      continue
    }
    const r = await avanzarUno(plan)

    // El estado se deriva de los pasos, siempre. Se releen porque `avanzarUno` los acaba de tocar.
    const { data: filas } = await supabase.from(TABLA_PASO).select('estado').eq('plan_id', plan.id).order('orden')
    const estado = estadoDePlan((filas || []).map((f) => ({ estado: f.estado })))
    const quedan = (filas || []).some((f) => f.estado !== 'hecho' && f.estado !== 'salteado')

    // 🔑 El reloj se corre igual si el escalón se dio o si se salteó: la foto no va a cambiar en los
    // próximos segundos, así que reintentar ya mismo diría lo mismo. Un corte SÍ vuelve enseguida.
    const espera = r && !r.sinEspera && quedan && (r.estado === 'hecho' || r.estado === 'salteado')
      ? proximoEn(Date.now(), horasDe(plan))
      : null

    await supabase.from(TABLA).update({
      estado, lock_hasta: null, actualizado: ahoraIso(),
      ...(espera ? { proximo_en: espera } : {}),
      ...(r && r.motivo ? { detalle: r.motivo } : {}),
    }).eq('id', plan.id)

    if (r && r.estado === 'hecho') dados++
    if (r && r.estado === 'salteado') salteados++
  }

  // «escalón» pierde el acento al pluralizar: `escalón`+`es` daría «escalónes».
  console.log(`\n${dados} ${dados === 1 ? 'escalón dado' : 'escalones dados'} · ${salteados} ${salteados === 1 ? 'salteado' : 'salteados'} por el guardarraíl`)

  if (problemas.length) {
    console.error(`\n❌ ${problemas.length} problema${problemas.length === 1 ? '' : 's'}:`)
    for (const p of problemas) console.error(`  - ${p}`)
    process.exit(1)
  }
  console.log('✅ Sin problemas.')
}

main().catch((e) => {
  console.error('Se cayó entero:', e && e.message ? e.message : e)
  process.exit(1)
})
