/**
 * ¿Llegó a prod un cambio de la sección Chequeo de exhibición?
 *
 * 🔴 El chunk de `Exhib` ⛔ NO está entre los 20 que trae el HTML de /exhib: entra por `dynamic()`.
 * Hay que sacar de adentro de esos 20 las rutas de chunk que referencian —terminan siendo ~123— y
 * bajarlas también. (Mismo patrón que `verificar-deploy-reclamos.mjs`.)
 * 🔴 Y siempre con una cadena de CONTROL que YA estaba en prod: sin ella, un 0 del oráculo ⛔ no
 * distingue «no se deployó» de «el crawl no llegó al chunk».
 *
 * 🏁 19-sep-2026, `3b6b15f4`: 123 chunks, control ✓ y los tres oráculos en `0jznf_tcccgw_.js`.
 */
const BASE = 'https://monitorareben.vercel.app'
const ORACULOS = ['Terminar y guardar', 'Este recorrido ya se cerr', 'marcas viejas en este']
const CONTROL = 'Iniciar recorrido'
const RUTA = /static\/immutable\/chunks\/[a-zA-Z0-9_.-]+\.js/g
const bajar = async (u) => { const r = await fetch(`${BASE}/_next/${u}`); return r.ok ? await r.text() : '' }
const html = await (await fetch(`${BASE}/exhib`)).text()
const cola = [...new Set(html.match(RUTA) || [])]
const vistos = new Set(cola)
const cuerpos = []
for (let i = 0; i < cola.length; i++) {
  const c = await bajar(cola[i])
  cuerpos.push([cola[i], c])
  for (const r of c.match(RUTA) || []) if (!vistos.has(r)) { vistos.add(r); cola.push(r) }
}
const con = (s) => cuerpos.filter(([, c]) => c.includes(s)).map(([u]) => u.split('/').pop())
console.log(`chunks bajados: ${cuerpos.length}`)
const ctrl = con(CONTROL)
console.log(`CONTROL «${CONTROL}»: ${ctrl.length} ${ctrl.length ? '✓ el crawl llegó al chunk' : '✗ el crawl NO llegó ⇒ un 0 abajo no dice nada'}`)
for (const o of ORACULOS) { const h = con(o); console.log(`${h.length ? '✓' : '✗'} «${o}»: ${h.length} ${h.join(' ')}`) }
