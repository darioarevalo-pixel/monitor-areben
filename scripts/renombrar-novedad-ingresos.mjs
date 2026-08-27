#!/usr/bin/env node
/**
 * Ajusta la novedad en BORRADOR de la sección `recepciones` al nombre nuevo:
 * «Lo que entró» → «Ingresos» (rename del 27-ago-2026, pedido de Bruno).
 *
 * ⛔ NO la publica: sólo corrige el texto. Publicar sigue siendo un gesto de la pantalla.
 * Es el texto que lee el equipo entero, y nombrar una sección que ya no se llama así manda
 * a buscar en el menú algo que no está.
 *
 *   node scripts/renombrar-novedad-ingresos.mjs
 */
import { readFileSync } from 'node:fs'

const ID = 'n1787752960322_a9r73t'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'content-type': 'application/json' }
const rest = async (p, init = {}) => {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : []
}

// Leer antes de pisar: si alguien la editó o ya la publicó, no la toco.
const [n] = await rest(`novedades?id=eq.${ID}&select=estado,titulo,cuerpo`)
if (!n) throw new Error('no está esa novedad')
if (n.estado !== 'borrador') { console.log(`⛔ está "${n.estado}", no borrador — no la toco`); process.exit(0) }
console.log(`antes: "${n.titulo}"`)

const titulo = n.titulo.replace(/^Lo que entró:/, 'Ingresos:')
const cuerpo = n.cuerpo.replace(/Compras › Lo que entró/g, 'Compras › Ingresos')
if (titulo === n.titulo && cuerpo === n.cuerpo) { console.log('ya estaba al día'); process.exit(0) }

await rest(`novedades?id=eq.${ID}`, { method: 'PATCH', body: JSON.stringify({ titulo, cuerpo }) })

const [d] = await rest(`novedades?id=eq.${ID}&select=estado,titulo,cuerpo`)
console.log(`ahora: "${d.titulo}"`)
console.log(`sigue en ${d.estado} · ¿queda algún "Lo que entró"?: ${/Lo que entró/.test(d.titulo + d.cuerpo) ? '🔴 SÍ' : 'no ✅'}`)
