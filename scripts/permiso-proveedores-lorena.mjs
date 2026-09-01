#!/usr/bin/env node
/**
 * Le tilda el sub `recepciones.proveedores` a **Lorena Reyes**, en las DOS marcas.
 *
 * Pedido de Bruno el 1-sep-2026: *«lorena es la única que puede ver los proveedores, el resto que
 * vea los ingresos pero los proveedores no»*. Ella es la que recibe la mercadería.
 *
 * 🔑 **Bruno y Darío lo ven igual, por admin** — `puedeVer` le contesta que sí a un admin antes de
 * mirar nada, y eso vale para toda la app, ⛔ no sólo para esta sección. O sea que después de esto
 * el nombre del proveedor lo ven: Lorena + los dos admin. Marketing (Candela, Sofía, Camila) sigue
 * viendo la sección entera **sin** proveedores, que es lo pedido.
 *
 * ⚠️ Un sub ⛔ NUNCA lo trae la función: por eso hay que tildarlo a mano aunque Lorena ya tenga
 * `administracion` y `deposito`.
 *
 *   node scripts/permiso-proveedores-lorena.mjs
 */
import { readFileSync } from 'node:fs'

const API = 'https://bdi-catalogo.vercel.app/api/usuarios'
const QUIEN = 'Lorena Reyes'
const CLAVE = 'recepciones.proveedores'

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
  if (mapa && typeof mapa === 'object') { mapa[CLAVE] = true; marcas.push(marca) }
}
console.log(`tildando "${CLAVE}" a ${QUIEN} en: ${marcas.join(', ')}`)

await post({ ...cred, config: antes })

// Oráculo: releer DEL SERVIDOR, y mirar TAMBIÉN a quién NO le quedó — que es la mitad del pedido.
const despues = (await post({ action: 'config', ...cred })).config
const passDespues = despues.users.filter((u) => u.tienePass).length
const l2 = despues.users.find((u) => u.name === QUIEN)
const ok = marcas.every((m) => l2.acceso[m][CLAVE] === true)
const conSub = despues.users.filter((u) => ['bdi', 'zattia'].some((m) => u.acceso?.[m]?.[CLAVE] === true)).map((u) => u.name)
const conSeccion = despues.users.filter((u) => ['bdi', 'zattia'].some((m) => u.acceso?.[m]?.recepciones === true)).map((u) => u.name)
console.log(`\nreleído del servidor:`)
console.log(`  ven los PROVEEDORES (además de los admin): ${conSub.join(' · ') || '(nadie)'}`)
console.log(`  ven la SECCIÓN: ${conSeccion.join(' · ')}`)
console.log(`  contraseñas intactas: ${passDespues}/${despues.users.length} (antes ${passAntes})`)
console.log(passDespues === passAntes && ok && conSub.length === 1 ? '\n✅ OK — Lorena y nadie más' : '\n🔴 REVISAR: algo no cerró')
