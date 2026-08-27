#!/usr/bin/env node
/**
 * Le tilda `recepciones` («Lo que entró») a Lorena Reyes en las DOS marcas.
 *
 * 🔑 Va por la API de la pantalla —leer con {action:'config'}, mutar, guardar con
 * {adminUser, adminPass, config}— y NO por un SET al KV: ese POST pasa por `fusionarPass`,
 * que reconstruye la contraseña de cada uno desde el KV. Un SET crudo se las borraría a los 16.
 *
 * Relee del servidor al final: cuenta `tienePass` y confirma el tilde.
 *   node scripts/permiso-recepciones-lorena.mjs
 */
import { readFileSync } from 'node:fs'

const API = 'https://bdi-catalogo.vercel.app/api/usuarios'
const QUIEN = 'Lorena Reyes'
const PERMISO = 'recepciones'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const cred = { adminUser: 'Bruno Arevalo', adminPass: env.MONITOR_PASS }
const post = async (body) => {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`)
  try { return JSON.parse(t) } catch { return t }
}

const antes = (await post({ action: 'config', ...cred })).config
const passAntes = antes.users.filter((u) => u.tienePass).length
console.log(`leído: ${antes.users.length} usuarios · ${passAntes} con contraseña`)

const lore = antes.users.find((u) => u.name === QUIEN)
if (!lore) throw new Error(`no está ${QUIEN} en el padrón`)
const marcas = []
for (const marca of ['bdi', 'zattia']) {
  const mapa = (lore.acceso || {})[marca]
  if (mapa && typeof mapa === 'object') { mapa[PERMISO] = true; marcas.push(marca) }
}
console.log(`tildando "${PERMISO}" en: ${marcas.join(', ')}`)

await post({ ...cred, config: antes })

// Oráculo: releer DEL SERVIDOR. Que el POST conteste ok no dice qué quedó guardado.
const despues = (await post({ action: 'config', ...cred })).config
const passDespues = despues.users.filter((u) => u.tienePass).length
const l2 = despues.users.find((u) => u.name === QUIEN)
const ok = marcas.every((m) => l2.acceso[m][PERMISO] === true)
console.log(`\nreleído del servidor:`)
console.log(`  ${QUIEN} tiene ${PERMISO}: ${marcas.map((m) => `${m}=${l2.acceso[m][PERMISO] === true}`).join(' · ')}`)
console.log(`  contraseñas intactas: ${passDespues}/${despues.users.length} (antes ${passAntes})`)
console.log(passDespues === passAntes && ok ? '\n✅ OK' : '\n🔴 REVISAR: algo no cerró')
