/**
 * ¿Dónde guarda Meta los SEGUIDORES de un conjunto? — sondeo de sólo lectura.
 *
 * Uso (en Actions, que es donde vive el token): workflow `sondear-seguidores-meta.yml`.
 *   node scripts/sondear-seguidores-meta.mjs --cuenta 4366752500136303 --desde 2026-10-14 --hasta 2026-10-15
 *
 * # Por qué existe
 *
 * Ads Manager le muestra a Bruno «seguidores de Instagram» por conjunto en los PERFIL IG de
 * Stunned, y la foto diaria los trae SIEMPRE en 0 (ver `tests/meta-seguidores.test.ts`). La foto
 * pide sólo `actions`; nunca se probó si el número vive en otro campo (`results`,
 * `conversions`, `cost_per_result`…) o detrás de un desglose. Esto pide todo, campo por campo —un
 * campo que Meta no conoce tumba la llamada entera, por eso van separados— e imprime lo que
 * contesta para cotejarlo con la captura de Ads Manager.
 *
 * ⛔ No escribe nada: ni en Meta ni en la base.
 */

import { graph, mensajeError } from '../lib/meta-ads/graph.core.js'

const arg = (k, d = '') => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? d : process.argv[i + 1] || d }
const CUENTA = arg('cuenta', '4366752500136303')
const DESDE = arg('desde'), HASTA = arg('hasta')
if (!DESDE || !HASTA) { console.error('Faltan --desde y --hasta (AAAA-MM-DD).'); process.exit(2) }
if (!process.env.META_ADS_TOKEN) { console.error('Falta META_ADS_TOKEN.'); process.exit(1) }

const rango = `time_range=${encodeURIComponent(JSON.stringify({ since: DESDE, until: HASTA }))}`
const ver = (x) => JSON.stringify(x, null, 1)

const conjuntos = await graph(`act_${CUENTA}/adsets?fields=id,name,effective_status,optimization_goal,destination_type,promoted_object,billing_event&limit=100`)
if (!conjuntos.ok) { console.error('No se pudieron leer los conjuntos:', mensajeError(conjuntos)); process.exit(1) }
const activos = (conjuntos.data.data || []).filter((s) => s.effective_status === 'ACTIVE')
console.log(`\n══ ${activos.length} conjuntos activos en act_${CUENTA} (${DESDE} → ${HASTA})`)

// Un campo por llamada: si Meta no conoce uno, el error dice cuál.
const CAMPOS = ['actions', 'unique_actions', 'conversions', 'results', 'cost_per_result', 'cost_per_action_type',
  'outbound_clicks', 'instagram_profile_visits', 'instagram_profile_follow', 'instagram_profile_follows',
  'instagram_follows', 'instagram_follow', 'follows']
const DESGLOSES = ['action_type', 'action_destination', 'action_target_id']

let primero = true
for (const s of activos) {
  console.log(`\n━━ ${s.name} · ${s.id}`)
  console.log('   configuración:', ver({ optimization_goal: s.optimization_goal, destination_type: s.destination_type, promoted_object: s.promoted_object, billing_event: s.billing_event }))
  for (const c of CAMPOS) {
    const r = await graph(`${s.id}/insights?fields=spend,${c}&${rango}`)
    const fila = r.ok ? (r.data.data || [])[0] : null
    console.log(`   · ${c}:`, r.ok ? (fila && fila[c] !== undefined ? ver(fila[c]) : '(vacío)') : `ERROR ${mensajeError(r)}`)
  }
  // Los desgloses, sólo en el primero: si alguno abre algo, se ve con uno.
  if (primero) {
    for (const b of DESGLOSES) {
      const r = await graph(`${s.id}/insights?fields=actions&action_breakdowns=${b}&${rango}`)
      console.log(`   · actions × ${b}:`, r.ok ? ver(((r.data.data || [])[0] || {}).actions || '(vacío)') : `ERROR ${mensajeError(r)}`)
    }
    primero = false
  }
}
