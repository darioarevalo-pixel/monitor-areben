#!/usr/bin/env node
/**
 * Completa `recepcion_linea.imagen_url` / `imagen_thumb_url` en los renglones ya guardados.
 *
 * POR QUÉ SE PUEDE SIN PEDIRLE NADA AL EMISOR
 * -------------------------------------------
 * Igual que `backfill-confirmada-at.mjs`: **el dato ya estaba de este lado**. Ingresos manda las
 * dos URLs por renglón desde el 1-sep-2026 y el receptor las descartaba; `recepcion_evento.payload`
 * guarda el cuerpo entero de cada webhook, así que esto es una relectura, ⛔ no un reenvío.
 *
 * ⚠️ Las 79 OC del backfill del 27-ago NO las traen: son de antes de que él lo prendiera. Que
 * queden sin foto es el resultado correcto, no una falla del script.
 *
 * Corre después de `node scripts/apply-recepciones.mjs` (que crea las columnas). Idempotente.
 *
 *   node scripts/backfill-fotos-recepciones.mjs            # aplica
 *   node scripts/backfill-fotos-recepciones.mjs --simular  # sólo dice qué haría
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

// 🔑 Ascendente por `recibido_en`: una OC puede tener VARIOS eventos (las 9 del 1-sep llegaron dos
// veces, la segunda con las fotos) y el que tiene que ganar es el último, que es el que dejó los
// renglones que hoy están guardados.
// 🔴 PostgREST corta en 1.000 filas y ⛔ no avisa: la primera corrida de esto leyó 1.000 de los
// 1.516 renglones, no encontró los de las 9 OC nuevas —que son las últimas— y contestó «nada que
// hacer». Se pagina por `id`, que es único: sin un orden estable la ventana repite filas y se come
// otras. Ver la lección `paginar sin orden estable`.
const leerTodo = async (tabla, select) => {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const tanda = await rest(`${tabla}?select=${select}&order=id.asc&limit=1000&offset=${desde}`)
    filas.push(...tanda)
    if (tanda.length < 1000) return filas
  }
}

const eventos = await rest('recepcion_evento?select=webhook_id,recibido_en,payload&estado=eq.procesado&order=recibido_en.asc&limit=2000')
const guardadas = await leerTodo('recepcion_linea', 'id,sku,imagen_url,imagen_thumb_url')
const actual = new Map(guardadas.map((l) => [l.id, l]))
console.log(`${eventos.length} eventos procesados · ${guardadas.length} renglones guardados`)

const cambios = new Map()
let sinFoto = 0, skuDistinto = 0
for (const e of eventos) {
  const n = normalizarEvento(e.payload)
  if (!n.ok) continue
  for (const l of n.lineas) {
    if (!l.imagen_url && !l.imagen_thumb_url) { sinFoto++; continue }
    const g = actual.get(l.id)
    if (!g) continue
    // 🔴 El id del renglón es `store:oc:ORDEN`, o sea una POSICIÓN. Si un evento viejo traía los
    // renglones en otro orden, la posición 3 de aquel no es la 3 de hoy y la foto terminaría sobre
    // otro artículo. El SKU es lo que ata la foto a su renglón: si no coincide, no se toca.
    if ((g.sku || null) !== (l.sku || null)) { skuDistinto++; continue }
    if (g.imagen_url === l.imagen_url && g.imagen_thumb_url === l.imagen_thumb_url) continue
    cambios.set(l.id, { id: l.id, imagen_url: l.imagen_url, imagen_thumb_url: l.imagen_thumb_url })
  }
}
console.log(`a completar: ${cambios.size} renglones · renglones de eventos sin foto: ${sinFoto} · descartados porque el SKU no coincide: ${skuDistinto}`)
if (SIMULAR) { console.log([...cambios.values()].slice(0, 3)); process.exit(0) }
if (!cambios.size) { console.log('nada que hacer'); process.exit(0) }

for (const c of cambios.values()) {
  await rest(`recepcion_linea?id=eq.${encodeURIComponent(c.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ imagen_url: c.imagen_url, imagen_thumb_url: c.imagen_thumb_url }),
  })
}

// Oráculo: releer DEL SERVIDOR y contarlo por OC. Que el PATCH conteste 204 no dice qué quedó.
const despues = await leerTodo('recepcion_linea', 'id,oc_ref,imagen_url')
const conFoto = despues.filter((l) => l.imagen_url)
const ocs = new Set(conFoto.map((l) => l.oc_ref))
console.log(`\nreleído: ${despues.length} renglones · con foto: ${conFoto.length} en ${ocs.size} OC`)
console.log(conFoto.length ? `✅ ${[...ocs].sort().join(' · ')}` : '🔴 no quedó ninguna foto guardada')
