#!/usr/bin/env node
// Carga los locales sacados de Google Maps en `prospecto_local` (la pestaña «Mapa» del CRM).
//
//   node scripts/prospectos-cargar.mjs ~/Bruno/leads-mapa/locales_costa.json            → muestra qué haría
//   node scripts/prospectos-cargar.mjs ~/Bruno/leads-mapa/locales_costa.json --aplicar  → carga
//   (opcional: --origen maps-costa-2026-10 · --env <ruta al .env>)
//
// 🔑 ⛔ Pisa nada: un local que ya está (mismo id = nombre + punto, `idDeLocal`) se saltea, así que
// volver a correrlo con la búsqueda de dentro de seis meses suma sólo los nuevos y deja intacto el
// estado y el historial de los que ya se trabajaron.
import { readFileSync } from 'node:fs'
import { filaDesdeMaps } from '../lib/crm/prospectos.core.js'

const args = process.argv.slice(2)
const archivo = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--origen' && args[args.indexOf(a) - 1] !== '--env')
const APLICAR = args.includes('--aplicar')
const valor = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null)
const ORIGEN = valor('--origen') || 'maps-costa-2026-10'
const rutaEnv = valor('--env') || new URL('../.env', import.meta.url)

if (!archivo) {
  console.error('Uso: node scripts/prospectos-cargar.mjs <locales.json> [--aplicar] [--origen X] [--env ruta]')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(rutaEnv, 'utf8')
    .split('\n').filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const KEY = env.SUPABASE_SERVICE_KEY
if (!KEY || !env.SUPABASE_URL) {
  console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY en el .env')
  process.exit(1)
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const rest = async (p, init = {}) => {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : []
}

const crudo = JSON.parse(readFileSync(archivo, 'utf8'))
const filas = (Array.isArray(crudo) ? crudo : crudo.locales).map((r) => filaDesdeMaps(r, ORIGEN))

// Dos filas del mismo archivo con el mismo id: se queda la primera.
const unicas = [...new Map(filas.map((f) => [f.id, f])).values()]
const yaEstan = new Set((await rest('prospecto_local?select=id&limit=10000')).map((r) => r.id))
const nuevas = unicas.filter((f) => !yaEstan.has(f.id))

console.log(`En el archivo: ${filas.length} · repetidos adentro: ${filas.length - unicas.length} · ya en la base: ${unicas.length - nuevas.length} · nuevos: ${nuevas.length}`)
const porCiudad = {}
for (const f of nuevas) porCiudad[f.ciudad || '(sin ciudad)'] = (porCiudad[f.ciudad || '(sin ciudad)'] || 0) + 1
console.log(porCiudad)

if (!APLICAR) {
  console.log('Sin --aplicar: no se cargó nada.')
  process.exit(0)
}
for (let i = 0; i < nuevas.length; i += 200) {
  await rest('prospecto_local?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(nuevas.slice(i, i + 200)),
  })
}
console.log(`Cargados: ${nuevas.length}`)
