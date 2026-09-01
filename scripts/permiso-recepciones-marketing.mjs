#!/usr/bin/env node
/**
 * Le tilda `recepciones` («Ingresos», área Compras) a las tres de MARKETING, en las DOS marcas.
 *
 * Pedido de Bruno el 1-sep-2026: «cande, sofi y cami». Son, en el padrón:
 *   · Candela Luis   (funcion: marketing)
 *   · Sofia Facello  (funcion: marketing)
 *   · Camila Budek   (funcion: marketing)
 *
 * ⚠️ **«Cami» es Camila BUDEK y ⛔ no `camilaquintana`**, que también está en el padrón: la segunda
 * tiene funcion `local`, y lo que pidió Bruno fue «la gente de marketing». La cuarta de marketing,
 * Stefania Scolari, ⛔ NO va: no la nombró.
 *
 * 🔑 Hasta hoy la sección la veía **una sola persona** (Lorena Reyes) más los admin.
 * ⛔ La sección no tiene plata adentro (costo, IVA, flete y margen se quedan del lado de Ingresos),
 * por eso alcanza con el permiso de Compras a secas. Si algún día viajan, esto hay que revisarlo.
 *
 * 🔴 **El POST que escribe el padrón lo bloquea el clasificador de esta Mac** ⇒ lo corre Bruno:
 *
 *   ! cd ~/Projects/monitor-areben && node scripts/permiso-recepciones-marketing.mjs
 */
import { readFileSync } from 'node:fs'

const API = 'https://bdi-catalogo.vercel.app/api/usuarios'
const QUIENES = ['Candela Luis', 'Sofia Facello', 'Camila Budek']
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

// 🔴 Se resuelven las TRES antes de escribir nada. El padrón se manda ENTERO en un solo POST: si
// una no estuviera y se cortara a mitad de camino, ya habría salido un config a medias.
const objetivo = QUIENES.map((q) => {
  const u = antes.users.find((x) => x.name === q)
  if (!u) throw new Error(`no está "${q}" en el padrón — nadie quedó tildado`)
  return u
})

for (const u of objetivo) {
  const marcas = []
  for (const marca of ['bdi', 'zattia']) {
    const mapa = (u.acceso || {})[marca]
    if (mapa && typeof mapa === 'object') { mapa[PERMISO] = true; marcas.push(marca) }
  }
  console.log(`tildando "${PERMISO}" a ${u.name} en: ${marcas.join(', ') || '(ninguna: no tiene mapa de acceso)'}`)
}

await post({ ...cred, config: antes })

// Oráculo: releer DEL SERVIDOR. Que el POST conteste ok ⛔ no dice qué quedó guardado — y lo que
// más importa mirar son las CONTRASEÑAS, que viajan en el mismo config.
const despues = (await post({ action: 'config', ...cred })).config
const passDespues = despues.users.filter((u) => u.tienePass).length
let ok = true
for (const q of QUIENES) {
  const u = despues.users.find((x) => x.name === q)
  const bdi = u?.acceso?.bdi?.[PERMISO] === true
  const zat = u?.acceso?.zattia?.[PERMISO] === true
  if (!bdi || !zat) ok = false
  console.log(`  ${q}: bdi=${bdi} · zattia=${zat}`)
}
const otros = despues.users.filter((u) => u.acceso?.bdi?.[PERMISO] === true || u.acceso?.zattia?.[PERMISO] === true).map((u) => u.name)
console.log(`\nreleído del servidor: ven Ingresos → ${otros.join(' · ')} (+ los admin)`)
console.log(`contraseñas intactas: ${passDespues}/${despues.users.length} (antes ${passAntes})`)
console.log(passDespues === passAntes && ok ? '\n✅ OK' : '\n🔴 REVISAR: algo no cerró')
