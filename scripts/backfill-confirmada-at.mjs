#!/usr/bin/env node
/**
 * Completa `recepcion_oc.confirmada_at` en las OC que ya están guardadas.
 *
 * POR QUÉ SE PUEDE HACER SIN PEDIRLE NADA AL EMISOR
 * -------------------------------------------------
 * `recepcion_evento.payload` guarda el cuerpo entero de cada webhook, y ahí está
 * `orden_compra.confirmada_at` — el receptor simplemente no lo copiaba a la OC. O sea que el dato
 * ya está de este lado: esto es una relectura, no un reenvío.
 *
 * Corre después de `node scripts/apply-recepciones.mjs` (que crea la columna). Idempotente: sólo
 * toca las filas donde el valor es distinto del que dice su evento.
 *
 *   node scripts/backfill-confirmada-at.mjs            # aplica
 *   node scripts/backfill-confirmada-at.mjs --simular  # sólo dice qué haría
 */
import { readFileSync } from 'node:fs'
import { normalizarEvento } from '../lib/recepciones/webhook.core.js'

const SIMULAR = process.argv.includes('--simular')
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'content-type': 'application/json' }
const rest = async (p, init = {}) => {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : []
}

const eventos = await rest('recepcion_evento?select=webhook_id,payload&estado=eq.procesado&limit=2000')
const ocs = await rest('recepcion_oc?select=id,confirmada_at&limit=2000')
const actual = new Map(ocs.map((o) => [o.id, o.confirmada_at]))
console.log(`${eventos.length} eventos procesados · ${ocs.length} OC guardadas`)

// 🔑 Pasa por el MISMO normalizador que el webhook, no por un parseo propio: si mañana cambia cómo
// se lee `confirmada_at`, el backfill cambia con él. Un backfill con su propia copia de la regla
// es exactamente donde los dos caminos se despegan.
const pendientes = []
let sinDato = 0
for (const e of eventos) {
  const n = normalizarEvento(e.payload)
  if (!n.ok) continue
  const v = n.oc.confirmada_at
  if (!v) { sinDato++; continue }
  if (!actual.has(n.oc.id)) continue
  if (actual.get(n.oc.id) && new Date(actual.get(n.oc.id)).getTime() === new Date(v).getTime()) continue
  pendientes.push({ id: n.oc.id, confirmada_at: v })
}
console.log(`a completar: ${pendientes.length} · ya al día: ${ocs.length - pendientes.length} · sin el dato en el payload: ${sinDato}`)
if (SIMULAR) { console.log(pendientes.slice(0, 5)); process.exit(0) }
if (!pendientes.length) { console.log('nada que hacer'); process.exit(0) }

for (const p of pendientes) {
  await rest(`recepcion_oc?id=eq.${encodeURIComponent(p.id)}`, { method: 'PATCH', body: JSON.stringify({ confirmada_at: p.confirmada_at }) })
}

// Oráculo: releer del servidor y contar cuántas quedaron SIN fecha por la que ordenar.
const despues = await rest('recepcion_oc?select=id,confirmada_at,fecha_ingreso&limit=2000')
const sin = despues.filter((o) => !o.confirmada_at)
const sinIngreso = despues.filter((o) => !o.fecha_ingreso)
console.log(`\nreleído: ${despues.length} OC · sin confirmada_at: ${sin.length} · (sin fecha_ingreso seguían siendo ${sinIngreso.length})`)
console.log(sin.length === 0 ? '✅ todas tienen por qué ordenarse' : `🔴 quedaron ${sin.length} sin fecha: ${sin.slice(0, 5).map((o) => o.id).join(', ')}`)
