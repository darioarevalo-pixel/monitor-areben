/**
 * El buscador de «Agregar» en la hoja del pedido entiende el MODELO (Darío 24-nov: «el buscador no es inteligente… para que
 * la lista no sea grande»). «templado premium 16 pro max» busca el producto con «templado premium» y deja sólo el talle
 * iPhone 16 Pro Max; sin modelo, todo igual que antes. También entiende lo corto: «16pm», «15p», «14pl», «13mi».
 *
 * El modelo arranca en la primera palabra que es un modelo (un número, 16e, x, xr, xs, air, se) y sigue con pro / max /
 * plus / mini. Así «airpods pro» ⛔ se toma como modelo (no hay número), y «9d» tampoco.
 */

const sinTilde = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const ANCLA = /^(\d{1,2}e?|x|xr|xs|air|se)$/
const SIGUE = new Set(['pro', 'max', 'plus', 'mini'])
const CORTO = { pm: ['pro', 'max'], p: ['pro'], pro: ['pro'], pl: ['plus'], plus: ['plus'], mi: ['mini'], mini: ['mini'], max: ['max'] }

/** «16pm» ⇒ 16 pro max; «16e» queda «16e» (así se llama el talle). */
function expandir(w) {
  const m = /^(\d{1,2}|xs|xr|x)(pm|pro|pl|plus|mi|mini|max|p)$/.exec(w)
  return m ? [m[1], ...CORTO[m[2]]] : [w]
}

/** Las palabras de un talle o de lo buscado, sin «iphone» ni signos. */
function palabras(s) {
  return sinTilde(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && w !== 'iphone').flatMap(expandir)
}

/**
 * Separa lo buscado en el PRODUCTO (lo que va al motor) y el MODELO (lo que filtra los talles).
 * @param {string} q @returns {{ producto: string, modelo: string[] }}
 */
export function separarModelo(q) {
  const ws = sinTilde(q).split(/\s+/).filter(Boolean)
  const producto = []
  const modelo = []
  for (const w of ws) {
    if (w === 'iphone') continue
    const partes = expandir(w.replace(/[^a-z0-9]/g, ''))
    if (!modelo.length && ANCLA.test(partes[0]) ) { modelo.push(...partes); continue }
    if (modelo.length && (SIGUE.has(partes[0]) || ANCLA.test(partes[0]))) { modelo.push(...partes); continue }
    producto.push(w)
  }
  // «9d» y similares son del producto: ANCLA sólo acepta número solo (o con «e»). Sin palabras de producto, se busca todo
  // como antes (el motor decide).
  if (!producto.length) return { producto: String(q ?? '').trim(), modelo: [] }
  return { producto: producto.join(' '), modelo }
}

/** Las variantes de un talle («iPhone X/ Xs/ 11 Pro» ⇒ [x], [xs], [11 pro]). */
const alternativas = (talle) => String(talle ?? '').split('/').map(palabras).filter((a) => a.length)

const igual = (a, b) => a.length === b.length && a.every((w, i) => w === b[i])
const empieza = (a, b) => b.length <= a.length && b.every((w, i) => w === a[i])

/**
 * Deja sólo los talles del modelo: primero los exactos («16 pro» ⇒ 16 Pro, ⛔ 16 Pro Max); si no hay, los que empiezan así.
 * Si ningún talle coincide, devuelve todo sin tocar (mejor ver de más que no ver nada).
 * @template {{ variantes: Array<{ talle: string|null }> }} P
 * @param {P[]} productos @param {string[]} modelo @returns {P[]}
 */
export function filtrarPorModelo(productos, modelo) {
  if (!modelo?.length) return productos
  for (const prueba of [igual, empieza]) {
    const out = productos
      .map((p) => ({ ...p, variantes: p.variantes.filter((v) => alternativas(v.talle).some((a) => prueba(a, modelo))) }))
      .filter((p) => p.variantes.length)
    if (out.length) return out
  }
  return productos
}
