#!/usr/bin/env node
/**
 * **«Accesorios nacionales» deja de ser una puerta: es la compra nacional de BDI** (1-sep-2026,
 * decisión de Bruno: *«accesorios nacionales sería compra nacional»*, *«bdi y zattia tienen compra
 * nacional; la diferencia es que bdi tiene importado, y zattia tiene producción propia»*).
 *
 * 🔴 **Sin esto, el deploy pierde dos moldes en silencio.** `puertas: ['accesorios']` deja de
 * matchear contra ninguna puerta viva ⇒ esos dos pasos ⛔ no los siembra ningún ingreso y nada
 * avisa; y si alguien abre uno en la pantalla y lo guarda, la lista vacía lo convierte en «corre en
 * TODAS». Los moldes son data, así que la migración es data y ⛔ no un deploy.
 *
 * Qué hace, en la base de BDI (la Agenda vive siempre ahí):
 *   1. «03) El NOMBRE» de accesorios → `puertas: ['nacional']`, `marcas: ['bdi']` (Darío o Lorena).
 *   2. «03) El NOMBRE» nacional, que corría en las dos → `marcas: ['zattia']` (Administración).
 *      🔑 Sin este paso, un ingreso nacional de BDI sembraría **dos** renglones de nombre.
 *   3. «04) La DESCRIPCIÓN de una compra nacional de fundas» → se renombra a «… de BDI» —ahora
 *      cubre también los accesorios, y un título que nombra sólo las fundas manda a dudar— y **se
 *      le pega el renglón que sólo decía el molde de accesorios**: que el formato de accesorios de
 *      celular todavía no está hecho. 🔑 Eso es un pendiente escrito, ⛔ no un adorno: borrarlo con
 *      el molde sería perderlo sin que nadie se entere.
 *   4. «04) La DESCRIPCIÓN de accesorios» → recién ahí se ELIMINA: duplica al de BDI (mismo
 *      destino, Lorena) y dos moldes de la misma puerta y marca son dos renglones para un paso.
 *
 * 🔑 **El oráculo ⛔ no es la respuesta del PATCH**: al final relee y arma, con las mismas funciones
 * del core, **qué sembraría cada combinación (puerta × marca)**. Eso es lo que hay que mirar.
 *
 *   node scripts/agenda-fusionar-accesorios.mjs             # sólo mira y dice qué haría
 *   node scripts/agenda-fusionar-accesorios.mjs --aplicar   # escribe
 *
 * # Cómo se deshace (corrido el 1-sep-2026)
 *
 * ⚠️ Son cuatro gestos y ⛔ no hay `--revertir`: volver atrás sólo tiene sentido si además se
 * vuelve atrás el código, y en ese caso lo que hay que restituir es esto, con estos valores:
 *
 *   `it1787664494544_accesorios3_jhcrz6` → `marcas: []`, `datos.puertas: ['accesorios']`
 *   `it1787664493947_nacional2_wbtny4`   → `marcas: []`
 *   `it1787665937326_descnacbdi_ra98b0`  → titulo «04) La DESCRIPCIÓN de una compra nacional de
 *                                          fundas», y sacarle la frase que arranca en «▶️ El
 *                                          formato de accesorios de celular»
 *   y volver a crear el ítem borrado: «04) La DESCRIPCIÓN de accesorios», `puertas: ['accesorios']`,
 *   `marcas: []`, destino `personas: ['Lorena Reyes']`, `offsetDias: 0`, `arrastra: false`,
 *   `manual_id: 'm1787525434943_muojw2'`, `regla: { tipo: 'unica', fecha: '2026-01-01' }`.
 */
import { readFileSync } from 'node:fs'
import { moldeCorreEn, moldeCorreEnMarca, PUERTAS, puertasDeMarca } from '../lib/agenda/puertas.core.js'

const APLICAR = process.argv.includes('--aplicar')
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const rest = async (p, init = {}) => {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : []
}
const leerMoldes = () => rest('agenda_items?select=id,titulo,marcas,destino,datos&limit=3000')
  .then((f) => f.filter((i) => i.datos && i.datos.plantilla === 'ingreso'))

const ID_NOMBRE_ACC = 'it1787664494544_accesorios3_jhcrz6'
const ID_NOMBRE_NAC = 'it1787664493947_nacional2_wbtny4'
const ID_DESC_ACC = 'it1787664496737_accesorios2_0g1nkd'
const ID_DESC_BDI = 'it1787665937326_descnacbdi_ra98b0'
const TITULO_NUEVO = '04) La DESCRIPCIÓN de una compra nacional de BDI'
const NOTA_ACCESORIOS = ' ▶️ El formato de accesorios de celular todavía no está hecho: sin valor de'
  + ' marca que contar se describe igual, porque la ficha sin descripción es una ficha que la clienta'
  + ' abandona.'

const antes = await leerMoldes()
const de = (id) => antes.find((m) => m.id === id)

// ⛔ Leer antes de pisar. Si alguno ya no está —o ya lo movió una mano— no se toca nada: el
// script está escrito contra un estado concreto y adivinar el resto sería peor que no correr.
const falta = [ID_NOMBRE_ACC, ID_NOMBRE_NAC, ID_DESC_ACC, ID_DESC_BDI].filter((id) => !de(id))
if (falta.length) {
  console.log(`⛔ ya no están estos moldes: ${falta.join(', ')} — no toco nada.`)
  console.log('   Puede ser que la migración ya haya corrido. Mirá el mapa de abajo antes de decidir.')
}

console.log('— ANTES —')
for (const m of antes) console.log(`  ${m.titulo.padEnd(58)} puertas=${JSON.stringify(m.datos.puertas || [])} marcas=${JSON.stringify(m.marcas || [])}`)

if (!falta.length) {
  const cuerpoBdi = String(de(ID_DESC_BDI).cuerpo || '')
  const pasos = [
    ['PATCH', `agenda_items?id=eq.${ID_NOMBRE_ACC}`, { marcas: ['bdi'], datos: { ...de(ID_NOMBRE_ACC).datos, puertas: ['nacional'] } }, '03) El NOMBRE de accesorios → compra nacional de BDI'],
    ['PATCH', `agenda_items?id=eq.${ID_NOMBRE_NAC}`, { marcas: ['zattia'] }, '03) El NOMBRE nacional → sólo Zattia'],
    // ⚠️ Primero se guarda la nota y recién después se borra el molde que la traía: al revés, un
    // corte en el medio la pierde.
    ['PATCH', `agenda_items?id=eq.${ID_DESC_BDI}`, {
      titulo: TITULO_NUEVO,
      cuerpo: cuerpoBdi.includes('accesorios de celular') ? cuerpoBdi : cuerpoBdi + NOTA_ACCESORIOS,
    }, '04) … de fundas → … de BDI, con la nota del formato de accesorios adentro'],
    ['DELETE', `agenda_items?id=eq.${ID_DESC_ACC}`, null, '04) La DESCRIPCIÓN de accesorios → se elimina (ya duplicaba a la de BDI)'],
  ]
  console.log(`\n— ${APLICAR ? 'APLICANDO' : 'LO QUE HARÍA (corré con --aplicar)'} —`)
  for (const [metodo, ruta, cuerpo, que] of pasos) {
    console.log(`  ${metodo} ${que}`)
    if (APLICAR) await rest(ruta, { method: metodo, ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) })
  }
}

// 🔑 EL ORÁCULO: qué sembraría cada combinación, releído de la base y resuelto con el core.
const ahora = await leerMoldes()
console.log('\n— QUÉ SIEMBRA CADA COMBINACIÓN (releído de la base) —')
for (const marca of ['zattia', 'bdi']) {
  for (const p of puertasDeMarca(marca)) {
    const corren = ahora
      .filter((m) => moldeCorreEn(m.datos.puertas, p.key) && moldeCorreEnMarca(m.marcas, marca))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'))
    console.log(`\n  ${marca} · ${p.label} → ${corren.length} pasos`)
    for (const m of corren) console.log(`     ${m.titulo}`)
  }
}
const huerfanos = ahora.filter((m) => (m.datos.puertas || []).some((k) => !PUERTAS.some((p) => p.key === k)))
console.log(`\n  moldes con una puerta que ya no existe: ${huerfanos.length ? `🔴 ${huerfanos.map((m) => m.titulo).join(' · ')}` : 'ninguno ✅'}`)
