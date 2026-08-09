/**
 * El ensayo real de la escritura: **crear un conjunto de verdad, mirarlo campo por campo y borrarlo.**
 *
 * # Por qué existe: `validate_only` dice que Meta lo aceptaría, no que haga lo que se le pidió
 *
 * Toda la tanda 4 se midió con `execution_options=["validate_only"]`, que es una herramienta enorme
 * —se puede preguntar «¿esto saldría?» decenas de veces sin gastar un peso— pero contesta una sola
 * cosa: `{"success":true}`. **No dice qué objeto habría quedado.** Un campo que Meta acepta y después
 * ignora, un `targeting` que se guarda distinto del que se mandó o un presupuesto que entra por otro
 * lado pasan la validación exactamente igual que un pedido correcto.
 *
 * Y 2.214 tests en verde tampoco lo dicen: prueban que `recetaDeConjunto()` arma el cuerpo que se
 * espera, no que Meta guarde ese cuerpo. Ver `feedback_areben_ensayo_verde_con_defecto`.
 *
 * Este script cierra ese hueco por el único camino que lo cierra: **escribir de verdad**.
 *
 * # Por qué no cuesta plata
 *
 * El conjunto nace `PAUSED` —y `status` va DESPUÉS del cuerpo en el POST, igual que en el motor, así
 * que ningún dato del original lo puede pisar—. Un conjunto pausado no entrega y no gasta, aunque su
 * campaña esté activa. Y al final se borra, con tres candados (abajo).
 *
 * Borrarlo es seguro justo porque acaba de nacer: la regla «pausar, NO borrar» protege el historial
 * de insights de un objeto que ya entregó, y este no entregó nunca.
 *
 * # Uso
 *
 *   node scripts/crear-y-borrar-meta.mjs --listar --cuenta 1145878766790149
 *   node scripts/crear-y-borrar-meta.mjs --conjunto <adsetId>              # ensaya SIN escribir
 *   node scripts/crear-y-borrar-meta.mjs --conjunto <adsetId> --crear      # crea, compara y borra
 *   node scripts/crear-y-borrar-meta.mjs --conjunto <adsetId> --crear --dejar   # no lo borra
 *
 * ⛔ **Sin `--crear` no escribe nada**: lee la receta y la valida, que es lo que ya se sabía hacer.
 * Escribir en la cuenta de verdad es una decisión, así que se pide en la línea de comandos.
 *
 * # El token
 *
 * `META_ADS_TOKEN` no está en el `.env` local (vive en Vercel y en los secrets de Actions, y de
 * ninguno de los dos se puede recuperar el valor). Se pasa por entorno sin que aparezca en ningún
 * lado: `META_ADS_TOKEN=$(cat /tmp/tk) node scripts/crear-y-borrar-meta.mjs …`
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  graph, graphPost, mensajeError, minimosDe, tokenMeta, TIMEOUT_MS,
} from '../lib/meta-ads/graph.core.js'
import {
  CAMPOS_RECETA, conDiario, escalonesDeDiario, esRechazoDePresupuesto, recetaDeConjunto, VALIDAR_SOLO,
} from '../lib/meta-ads/receta.core.js'
import { cotejarCuerpo, sinDiferencias } from '../lib/meta-ads/cotejo.core.js'
import { marcaDePaso, marcadorDe, nombreConMarca, TIMEOUT_PASO_MS } from '../lib/meta-ads/planes.core.js'

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

const LISTAR = flag('--listar')
const CUENTA = valor('--cuenta')
const CONJUNTO = valor('--conjunto')
const CREAR = flag('--crear')
const DEJAR = flag('--dejar')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** ⚠️ Secuencial y espaciado: 48 POST en paralelo llenaron el cupo de la cuenta el 9-ago. */
const RESPIRO_MS = 1500

// ── Lo único que este script agrega a la plomería: el DELETE ──────────────────────────────────
//
// `graph.core.js` no tiene `graphDelete` porque hasta hoy nada del monitor borra en Meta. Vive acá
// —y no en `lib/`— para no sumarle a la plomería compartida una función sin un solo uso en prod: si
// la tanda 5 termina necesitándola para `deshacer`, se muda con sus tests puestos.

async function graphDelete(id) {
  const url = `https://graph.facebook.com/v25.0/${id}?access_token=${encodeURIComponent(tokenMeta())}`
  try {
    const r = await fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(TIMEOUT_MS) })
    const d = await r.json().catch(() => null)
    if (r.ok) return { ok: true, data: d }
    return { ok: false, status: r.status, error: d && d.error }
  } catch (e) {
    return { ok: false, status: 0, error: { message: String((e && e.message) || e) } }
  }
}

// ── Los pasos ─────────────────────────────────────────────────────────────────────────────────

const corto = (v) => {
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.length > 160 ? `${s.slice(0, 160)}…` : s
}

async function listar(cuentaId) {
  const r = await graph(`act_${cuentaId}/adsets?limit=100&effective_status=["ACTIVE"]&fields=id,name,campaign_id,daily_budget,lifetime_budget,optimization_goal,campaign{objective}`)
  if (!r.ok) { console.log(`❌ No se pudieron listar los conjuntos: ${mensajeError(r)}`); return 1 }
  const filas = (r.data && r.data.data) || []
  console.log(`\n${filas.length} conjuntos activos en act_${cuentaId}:\n`)
  for (const f of filas) {
    const plata = f.daily_budget ? `diario ${f.daily_budget}` : (f.lifetime_budget ? `TOTAL ${f.lifetime_budget}` : 'sin presupuesto (CBO)')
    console.log(`  ${f.id}  ${plata.padEnd(22)} ${String((f.campaign && f.campaign.objective) || '').padEnd(20)} ${String(f.name || '').slice(0, 60)}`)
  }
  console.log('')
  return 0
}

/**
 * La receta validada, **con el mismo camino que `recetaValidada()` de `api/_meta-planes.js`**: se le
 * pregunta a Meta con el diario del original y sólo si lo rechaza por bajo se suben los escalones de
 * menor a mayor. Si acá se separara del handler, el ensayo probaría otra cosa que la que corre.
 */
async function validar(cuentaId, campaignId, arm) {
  const cuerpo = { ...arm.cuerpo }
  const fijos = { name: 'validación del monitor · no se crea nada con este nombre', campaign_id: String(campaignId), status: 'PAUSED' }

  const primero = await graphPost(`act_${cuentaId}/adsets`, { ...cuerpo, ...fijos, ...VALIDAR_SOLO }, TIMEOUT_PASO_MS)
  if (primero.ok) return { ok: true, cuerpo, notas: arm.notas }
  if (!esRechazoDePresupuesto(primero.error)) {
    return { ok: false, error: `Meta no acepta recrearlo como está: ${mensajeError(primero)}` }
  }
  for (const escalon of escalonesDeDiario(mensajeError(primero), await minimosDe(cuentaId, null))) {
    await sleep(RESPIRO_MS)
    const suba = conDiario(cuerpo, escalon)
    if (!suba.ok) continue
    const v = await graphPost(`act_${cuentaId}/adsets`, { ...suba.cuerpo, ...fijos, ...VALIDAR_SOLO }, TIMEOUT_PASO_MS)
    if (v.ok) return { ok: true, cuerpo: suba.cuerpo, notas: [...arm.notas, suba.nota] }
  }
  return { ok: false, error: `Meta no acepta recrearlo ni subiendo el diario: ${mensajeError(primero)}` }
}

/**
 * El borrado, con **tres candados**. Ninguno es decorativo:
 *
 * 1. Sólo el id que este ensayo acaba de crear — nunca uno que venga de un argumento.
 * 2. Sólo si al releerlo **sigue `PAUSED`**: si alguien lo prendió en el minuto que pasó, borrarlo
 *    sería borrarle algo que decidió otra persona.
 * 3. Sólo si el conjunto que se relee **es del conjunto de campaña esperado**, que es la forma barata
 *    de cazar un id equivocado antes de mandar el DELETE.
 */
async function borrar(id, campaignId) {
  const rel = await graph(`${id}?fields=id,status,effective_status,campaign_id`, 2)
  if (!rel.ok) return { ok: false, error: `No se pudo releer antes de borrar: ${mensajeError(rel)}` }
  const d = rel.data || {}
  if (String(d.status) !== 'PAUSED') return { ok: false, error: `NO se borra: quedó en «${d.status}» y no en PAUSED. Miralo en Ads Manager.` }
  if (String(d.campaign_id) !== String(campaignId)) return { ok: false, error: `NO se borra: está en la campaña ${d.campaign_id} y se esperaba ${campaignId}.` }

  const del = await graphDelete(id)
  if (!del.ok) return { ok: false, error: `Meta rechazó el borrado: ${mensajeError(del)}` }

  // El DELETE se verifica releyendo, por la misma razón por la que el motor releé un presupuesto:
  // «Meta contestó que sí» y «Meta lo hizo» son dos afirmaciones distintas.
  await sleep(RESPIRO_MS)
  const post = await graph(`${id}?fields=id,status,effective_status`, 2)
  const est = String(((post.data || {}).effective_status) || '')
  if (post.ok && est !== 'DELETED' && est !== 'ADSET_PAUSED') {
    return { ok: false, error: `Meta aceptó el borrado pero el conjunto sigue ahí como «${est || 'sin estado'}».` }
  }
  return { ok: true, comoQuedo: post.ok ? (est || 'sin estado') : 'ya no se puede leer' }
}

async function main() {
  if (!tokenMeta()) {
    console.log('❌ Falta META_ADS_TOKEN. Pasalo por entorno sin escribirlo:  META_ADS_TOKEN=$(cat /tmp/tk) node scripts/crear-y-borrar-meta.mjs …')
    return 1
  }
  if (LISTAR) {
    if (!CUENTA) { console.log('❌ --listar necesita --cuenta <id>'); return 1 }
    return listar(CUENTA)
  }
  if (!CONJUNTO) {
    console.log('❌ Falta --conjunto <adsetId> (o --listar --cuenta <id> para elegir uno).')
    return 1
  }

  // 1. Leer el original, con los MISMOS campos que lee el handler.
  const l = await graph(`${CONJUNTO}?fields=${CAMPOS_RECETA}`)
  if (!l.ok) { console.log(`❌ No se pudo leer el conjunto: ${mensajeError(l)}`); return 1 }
  const orig = l.data || {}
  const cuentaId = String(orig.account_id || '')
  const campaignId = String(orig.campaign_id || '')
  console.log(`\n📖 Referencia: «${orig.name}»`)
  console.log(`   cuenta act_${cuentaId} · campaña ${campaignId} · ${orig.optimization_goal} · diario ${orig.daily_budget || '(sin diario)'}`)

  // 2. Armar la receta — la función pura que ya tiene 35 tests.
  const arm = recetaDeConjunto(orig)
  if (!arm.ok) { console.log(`❌ No se puede armar la receta: ${arm.error}`); return 1 }

  // 3. Preguntarle a Meta si la aceptaría, sin escribir.
  const val = await validar(cuentaId, campaignId, arm)
  if (!val.ok) { console.log(`❌ ${val.error}`); return 1 }
  console.log(`✅ Meta valida la receta (${Object.keys(val.cuerpo).length} campos).`)
  for (const n of val.notas) console.log(`   · ${n}`)

  if (!CREAR) {
    console.log('\n⏸️  Sin --crear no se escribe nada. Para el ensayo de verdad: agregá --crear.\n')
    return 0
  }

  // 4. Crearlo DE VERDAD, con exactamente el mismo POST que hace `correr()` para `crear-conjunto`.
  const marca = marcaDePaso(marcadorDe(`ensayo-${CONJUNTO}-${process.pid}`), 1)
  const nombre = nombreConMarca(`ENSAYO borrar · ${orig.name}`, marca)
  await sleep(RESPIRO_MS)
  const alta = await graphPost(`act_${cuentaId}/adsets`, {
    ...val.cuerpo,
    name: nombre,
    campaign_id: campaignId,
    status: 'PAUSED',
  }, TIMEOUT_PASO_MS)
  if (!alta.ok) { console.log(`❌ Meta rechazó la creación real: ${mensajeError(alta)}`); return 1 }
  const nuevoId = String((alta.data && alta.data.id) || '')
  if (!nuevoId) { console.log('❌ Meta aceptó la creación pero no dijo cuál es. ⚠️ BUSCALO EN ADS MANAGER por la marca ' + marca); return 1 }
  console.log(`\n🆕 Creado de verdad: ${nuevoId}  «${nombre}»`)

  let salida = 0
  try {
    // 5. Releerlo con los mismos campos y compararlo campo por campo.
    await sleep(RESPIRO_MS)
    const rel = await graph(`${nuevoId}?fields=${CAMPOS_RECETA}`, 3)
    if (!rel.ok) {
      console.log(`⚠️  No se pudo releer lo creado: ${mensajeError(rel)}`)
      salida = 1
    } else {
      const quedo = rel.data || {}
      console.log(`   status: ${quedo.status} · effective_status: ${quedo.effective_status}`)
      if (String(quedo.status) !== 'PAUSED') {
        console.log('🔴 NACIÓ SIN PAUSAR. Eso es plata: pausalo a mano YA.')
        salida = 1
      }

      const dif = cotejarCuerpo(val.cuerpo, quedo)
      console.log('\n── Lo que se pidió contra lo que quedó ──')
      if (sinDiferencias(dif)) console.log('✅ Los campos pedidos quedaron todos, con el mismo valor.')
      for (const f of dif.falta) { console.log(`🔴 FALTA   ${f.ruta}: se pidió ${corto(f.pedido)} y no está.`); salida = 1 }
      for (const c of dif.cambio) { console.log(`🔴 CAMBIÓ  ${c.ruta}: se pidió ${corto(c.pedido)} · quedó ${corto(c.quedo)}`); salida = 1 }
      if (dif.agrega.length) {
        console.log(`\nℹ️  ${dif.agrega.length} campos que Meta agregó por su cuenta (normalización y defaults):`)
        for (const a of dif.agrega) console.log(`   + ${a.ruta} = ${corto(a.quedo)}`)
      }
    }
  } finally {
    // 6. Borrarlo. En `finally` porque **un ensayo que se cae no puede dejar el conjunto puesto**.
    if (DEJAR) {
      console.log(`\n⏸️  --dejar: NO se borra. Queda ${nuevoId} pausado en la cuenta. Borralo a mano.`)
    } else {
      await sleep(RESPIRO_MS)
      const b = await borrar(nuevoId, campaignId)
      if (b.ok) console.log(`\n🗑️  Borrado: ${nuevoId} (${b.comoQuedo})`)
      else { console.log(`\n🔴 ${b.error}\n   ⚠️ QUEDÓ ${nuevoId} EN LA CUENTA — borralo a mano.`); salida = 1 }
    }
  }
  console.log('')
  return salida
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1) })
