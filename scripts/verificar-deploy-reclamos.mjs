/**
 * ¿Llegó a prod un cambio de la sección Reclamos?
 *
 * 🔴 El chunk de Reclamos ⛔ NO está entre los 18 que trae el HTML de /postventa: `Devoluciones`
 * entra por `dynamic()`. Hay que sacar de adentro de esos 18 las rutas de chunk que referencian
 * —son ~95— y bajarlas también.
 * 🔴 Y siempre con una cadena de CONTROL que YA estaba en prod: sin ella, un 0 del oráculo no
 * distingue «no se deployó» de «el crawl no llegó». Pasó dos veces hoy.
 */
const BASE = 'https://monitorareben.vercel.app'
// 30-ago, D4: el confirm del «no aceptó» sobre un reclamo sin decision. 0 apariciones antes.
// ⚠️ SIN TILDES a proposito en el corte, pero el chunk sirve las tildes LITERALES: se busca el
// tramo que no las tiene («decisi» corta antes de la «ó»).
const ORACULO = 'Copiar el mensaje con el link'
// El de control es del MISMO archivo y ya estaba en prod (D4, del deploy anterior de hoy).
const CONTROL = 'no tiene ninguna decisi'

const RUTA = /static\/immutable\/chunks\/[a-zA-Z0-9_.-]+\.js/g
const bajar = async (u) => { const r = await fetch(`${BASE}/_next/${u}`); return r.ok ? await r.text() : '' }

const html = await (await fetch(`${BASE}/postventa`)).text()
const cola = [...new Set(html.match(RUTA) || [])]
console.log(`chunks en el HTML: ${cola.length}`)

const vistos = new Set(cola)
const cuerpos = []
for (let i = 0; i < cola.length; i++) {
  const cuerpo = await bajar(cola[i])
  cuerpos.push([cola[i], cuerpo])
  for (const r of cuerpo.match(RUTA) || []) if (!vistos.has(r)) { vistos.add(r); cola.push(r) }
}

const con = (s) => cuerpos.filter(([, c]) => c.includes(s)).map(([u]) => u.split('/').pop())
const c = con(CONTROL), o = con(ORACULO)
console.log(`chunks bajados: ${cuerpos.length}`)
console.log(`CONTROL «${CONTROL}» → ${c.length} ${c.length ? `✓ el crawl SÍ llega al chunk de Reclamos (${c.join(', ')})` : '❌ el crawl NO llega: el negativo no significa nada'}`)
console.log(`ORACULO «${ORACULO}» → ${o.length} ${o.length ? `✓ DEPLOYADO (${o.join(', ')})` : '✗ todavía NO está en prod'}`)
