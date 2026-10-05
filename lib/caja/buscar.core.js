// Caja — buscar una prenda por NOMBRE y talle, cuando no se escanea (Bruno, 4-oct-2026: «así la
// búsqueda es más simple»). El código de barras y el SKU se prueban primero: esto entra sólo si ⛔
// encontraron nada.
//
// 🔑 Cada palabra que escribe la cajera tiene que estar, sin importar el orden: como COMIENZO de una
// palabra del nombre («cors fran» ⇒ CORSET FRANK) o como el TALLE entero («s», «38», «unica»). Así
// «corset frank verde s» y «s verde corset» dan lo mismo, y la «s» ⛔ cae en «CorSet».
//
// 🔑 El stock que ordena es el del LOCAL (percha + el depósito de atrás): el Depósito de GN ⛔ se vende
// desde la caja (Bruno, 4-oct). Primero lo que hay acá, después por nombre.

/** Sin tildes, minúsculas, sólo letras y números. */
export const normTexto = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Las palabras de la búsqueda. ⛔ Vacío si no hay ninguna letra: un número solo es un código. */
export function palabrasDeBusqueda(texto) {
  const t = normTexto(texto)
  if (!/[a-z]/.test(t)) return []
  return t.split(' ').filter(Boolean)
}

/** En qué orden se le pregunta a la base (`ilike`): la más larga primero, que es la que más filtra. */
export const ordenParaLaBase = (palabras) => [...new Set(palabras)].sort((a, b) => b.length - a.length)

/** ¿La variante (`product_name`, `size_name`) tiene todas las palabras? */
export function coincide(variante, palabras) {
  const nombre = normTexto(variante.product_name).split(' ')
  const talle = normTexto(variante.size_name)
  return palabras.every((p) => talle === p || talle.split(' ').includes(p) || nombre.some((w) => w.startsWith(p)))
}

/**
 * De las variantes agrupadas (`{ variante, espejo: { local, deposito } }`) a las que coinciden,
 * primero las que tienen stock en el local. `tope` corta la lista; `mas` dice cuántas quedaron afuera.
 */
export function filtrarPorNombre(grupos, palabras, tope = 24) {
  const ok = grupos
    .filter((g) => coincide(g.variante, palabras))
    .sort((a, b) =>
      (b.espejo.local > 0) - (a.espejo.local > 0) ||
      String(a.variante.product_name).localeCompare(String(b.variante.product_name)) ||
      String(a.variante.size_name).localeCompare(String(b.variante.size_name)))
  return { grupos: ok.slice(0, tope), mas: Math.max(0, ok.length - tope) }
}

/**
 * La lista que aparece MIENTRAS se escribe (Bruno, 4-oct: «por defecto sólo los que tienen stock, y
 * un botón “Mostrar sin stock”»). Las dos listas van separadas para que el botón ⛔ vuelva a pedir.
 * Con stock = en el LOCAL (de anoche): es lo que se puede entregar desde la caja.
 */
export function listasPorStock(grupos, palabras, tope = 24) {
  const ok = filtrarPorNombre(grupos, palabras, Infinity).grupos
  const con = ok.filter((g) => g.espejo.local > 0)
  const sin = ok.filter((g) => !(g.espejo.local > 0))
  return {
    conStock: con.slice(0, tope),
    sinStock: sin.slice(0, tope),
    masCon: Math.max(0, con.length - tope),
    masSin: Math.max(0, sin.length - tope),
  }
}

const porNombre = (a, b) => String(a.product_name).localeCompare(String(b.product_name), 'es')
const porTalle = (a, b) => String(a.size_name).localeCompare(String(b.size_name), 'es', { numeric: true })

/**
 * La lista del POS POR PRODUCTO, como el de GN (Bruno, 5-oct: «primero por producto y luego por
 * variante»). Cada producto trae sus variantes que coinciden: las del local primero, el resto después
 * (el modal las muestra tras «Mostrar sin stock»). Con stock = ALGUNA variante en el local (de anoche).
 * `tope` cuenta PRODUCTOS: por variante, un producto con 12 colores se comía la lista.
 */
export function productosPorStock(grupos, palabras, tope = 24) {
  const ok = filtrarPorNombre(grupos, palabras, Infinity).grupos
  const por = new Map()
  for (const g of ok) {
    const id = Number(g.variante.product_id)
    if (!por.has(id)) por.set(id, { product_id: id, product_name: g.variante.product_name, local: 0, variantes: [] })
    const p = por.get(id)
    p.local += Math.max(0, Number(g.espejo.local) || 0)
    p.variantes.push({ ...g.variante, local: g.espejo.local })
  }
  const lista = [...por.values()].map((p) => ({
    ...p,
    variantes: p.variantes.sort((a, b) => (b.local > 0) - (a.local > 0) || porTalle(a, b)),
  }))
  const con = lista.filter((p) => p.local > 0).sort(porNombre)
  const sin = lista.filter((p) => !(p.local > 0)).sort(porNombre)
  return {
    conStock: con.slice(0, tope),
    sinStock: sin.slice(0, tope),
    masCon: Math.max(0, con.length - tope),
    masSin: Math.max(0, sin.length - tope),
  }
}
