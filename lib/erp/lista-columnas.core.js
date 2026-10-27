/**
 * Las columnas que cada uno elige en una lista del ERP (diseño §3: «Columnas · 7 de 10», mostrar/ocultar, cambiar el
 * orden, «Volver a las de siempre»). Nació en Ventas; Stock y las que sigan usan la MISMA cuenta con SUS columnas.
 * Puro: lo guarda `lib/erp/lista-prefs.ts` (por usuario) y lo dibuja `components/ui/PanelColumnas`.
 *
 * `columnas`: clave → [título, ancho de la grilla, ordena, fija]. Las fijas van siempre.
 * `deSiempre`: { orden, visibles } — con lo que arranca quien ⛔ eligió nada.
 */

/**
 * @typedef {{ orden: string[], visibles: string[] }} Prefs
 * @typedef {Record<string, [string, string, boolean, boolean]>} Columnas
 */

/**
 * Lo guardado (o nada) ⇒ prefs válidas: una columna que ya ⛔ existe se cae, una nueva entra al final, las fijas se ven.
 * @param {Columnas} columnas @param {{ orden: string[], visibles: string[] }} deSiempre @param {unknown} raw @returns {Prefs}
 */
export function normalizarPrefsDe(columnas, deSiempre, raw) {
  const r = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}
  const validas = Object.keys(columnas)
  const orden = Array.isArray(r.orden) ? r.orden.filter((k, i, a) => validas.includes(k) && a.indexOf(k) === i) : []
  for (const k of deSiempre.orden) if (validas.includes(k) && !orden.includes(k)) orden.push(k)
  for (const k of validas) if (!orden.includes(k)) orden.push(k)
  const vis = new Set(Array.isArray(r.visibles) ? r.visibles.filter((k) => validas.includes(k)) : deSiempre.visibles)
  for (const k of validas) if (columnas[k][3]) vis.add(k)
  return { orden, visibles: orden.filter((k) => vis.has(k)) }
}

/** Mueve una columna un lugar (−1 sube, +1 baja). En los bordes ⛔ hace nada. @param {Prefs} prefs @param {string} col @param {number} d @returns {Prefs} */
export function moverColumna(prefs, col, d) {
  const o = prefs.orden.slice()
  const i = o.indexOf(col), j = i + d
  if (i < 0 || j < 0 || j >= o.length) return prefs
  ;[o[i], o[j]] = [o[j], o[i]]
  return { ...prefs, orden: o, visibles: o.filter((k) => prefs.visibles.includes(k)) }
}

/** Muestra u oculta una columna (las fijas ⛔ se ocultan). @param {Columnas} columnas @param {Prefs} prefs @param {string} col @returns {Prefs} */
export function alternarColumnaDe(columnas, prefs, col) {
  if (!columnas[col] || columnas[col][3]) return prefs
  const vis = new Set(prefs.visibles)
  if (vis.has(col)) vis.delete(col)
  else vis.add(col)
  return { ...prefs, visibles: prefs.orden.filter((k) => vis.has(k)) }
}
