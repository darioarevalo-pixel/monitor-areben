/**
 * ¿Llegó a prod la sección Insumos?
 *
 * 🔴 El chunk de Insumos ⛔ NO está entre los que trae el HTML: cada sección entra por
 * `dynamic()`, así que su JS es un chunk aparte. Hay que sacar de adentro de los del HTML las
 * rutas de chunk que referencian y bajarlas también.
 * 🔴 Y siempre con una cadena de CONTROL que YA estaba en prod: sin ella, un 0 del oráculo no
 * distingue «no se deployó» de «el crawl no llegó». Pasó dos veces hoy.
 */
const BASE = 'https://monitorareben.vercel.app'
const ORACULO = 'hasta que alguien los cuente no avisan' // sin tildes (el minificador las escapa); 0 apariciones antes de este commit
const CONTROL = 'Candidatos a depurar' // ya estaba en prod (la descripcion de Caducados, en lib/nav.ts)

const RUTA = /static\/immutable\/chunks\/[a-zA-Z0-9_.-]+\.js/g
const bajar = async (u) => { const r = await fetch(`${BASE}/_next/${u}`); return r.ok ? await r.text() : '' }

const html = await (await fetch(`${BASE}/insumos`)).text()
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
console.log(`CONTROL «${CONTROL}» → ${c.length} ${c.length ? `✓ el crawl SI llega (${c.join(', ')})` : '❌ el crawl NO llega: el negativo no significa nada'}`)
console.log(`ORACULO «${ORACULO}» → ${o.length} ${o.length ? `✓ DEPLOYADO (${o.join(', ')})` : '✗ todavía NO está en prod'}`)
