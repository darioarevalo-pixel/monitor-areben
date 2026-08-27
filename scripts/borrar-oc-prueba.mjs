#!/usr/bin/env node
/**
 * Borra los DOS rastros de las pruebas del 27-ago del webhook de Ingresos:
 *   · la OC sembrada `bdi:999999902` (OC-PRUEBA-BORRAR) + sus renglones
 *   · la fila del evento `verif-secreto-27ago` (la sonda que verificó el secreto)
 *
 * Contaminan los totales de la sección: sus 45 unidades, 2 faltantes y 1 sobrante
 * se suman a los reales. Los renglones van ANTES que la OC (son hijos).
 *
 *   node scripts/borrar-oc-prueba.mjs
 */
import { readFileSync } from 'node:fs'

const OC = 'bdi:999999902'
const SONDA = 'verif-secreto-27ago'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'content-type': 'application/json' }
const rest = async (path, init = {}) => {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : []
}

// Leer ANTES de borrar: hay que ver qué se lleva puesto, no borrar a ciegas.
const lineas = await rest(`recepcion_linea?oc_ref=eq.${OC}&select=sku,cantidad_contada`)
const oc = await rest(`recepcion_oc?id=eq.${OC}&select=oc_label,proveedor_nombre,unidades_pedidas`)
console.log(`a borrar: ${oc.length} OC (${oc[0]?.oc_label ?? '—'}) y ${lineas.length} renglones`)
if (!oc.length) { console.log('no está: ya se borró'); process.exit(0) }

await rest(`recepcion_linea?oc_ref=eq.${OC}`, { method: 'DELETE' })
await rest(`recepcion_oc?id=eq.${OC}`, { method: 'DELETE' })
await rest(`recepcion_evento?webhook_id=in.(${SONDA},oc-prueba-27ago-999999902)`, { method: 'DELETE' })

// Oráculo: releer. Y que no se haya llevado nada de al lado.
const quedan = await rest(`recepcion_oc?id=eq.${OC}&select=id`)
const lq = await rest(`recepcion_linea?oc_ref=eq.${OC}&select=sku`)
const totalOc = await rest('recepcion_oc?select=id')
const totalEv = await rest('recepcion_evento?select=webhook_id')
console.log(`\nreleído: la OC de prueba ${quedan.length === 0 ? 'YA NO ESTÁ ✅' : '🔴 SIGUE'} · renglones huérfanos: ${lq.length}`)
console.log(`quedan ${totalOc.length} OC y ${totalEv.length} eventos — tienen que ser las reales (79 y 79)`)
