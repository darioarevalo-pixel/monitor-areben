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
// 30-ago, B4/B5/B6: las cuatro decisiones de la auditoria. 0 apariciones antes de este deploy.
// ⚠️ SIN TILDES a proposito en los cortes, pero el chunk sirve las tildes LITERALES: se buscan los
// tramos que no las tienen («cu» corta antes de la «á»).
//
// 🔑 Van TRES y ⛔ no uno: los tres salen de cambios distintos —el faltante del envio (nucleo), el
// aviso del techo (pantalla) y el desglose del costo (nucleo)— asi que uno solo verde con los
// otros dos rojos diria que el deploy llego a MEDIAS, que es lo que un unico oraculo no distingue.
const ORACULOS = [
  'sale traerlo',                 // `falta: 'envio'` — el cero que afirmaba (nucleo)
  'Se pasa del techo',            // el aviso que hace auditable la oferta (pantalla)
  'de recibirlo y reingresarlo',  // el desglose del costo operativo (nucleo)
  'Apenas empata',                // la 2a rama del piso, la que antes no existia (nucleo)
]
// El de control es del MISMO archivo y ya estaba en prod desde el 27-ago: sin el, un 0 del oraculo
// ⛔ no distingue «no se deployo» de «el crawl no llego al chunk».
const CONTROL = 'Va contra la sugerencia'

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
const c = con(CONTROL)
console.log(`chunks bajados: ${cuerpos.length}`)
console.log(`CONTROL «${CONTROL}» → ${c.length} ${c.length ? `✓ el crawl SÍ llega al chunk de Reclamos (${c.join(', ')})` : '❌ el crawl NO llega: el negativo no significa nada'}`)
let todos = c.length > 0
for (const oraculo of ORACULOS) {
  const o = con(oraculo)
  if (!o.length) todos = false
  console.log(`ORACULO «${oraculo}» → ${o.length} ${o.length ? `✓ DEPLOYADO (${o.join(', ')})` : '✗ todavía NO está en prod'}`)
}
console.log(todos ? '\n✅ los cuatro en prod, con el control prendido' : '\n✗ falta alguno — o el crawl no llegó')
