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
