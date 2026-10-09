/**
 * **La foto de Ingresos como RESPALDO de la de Tienda Nube** (9-oct-2026, pedido de Bruno).
 *
 * *«productos sin foto, en el caso de que no tenga foto el producto, que use la de areben ingresos,
 * provisoriamente, y cuando tenga foto en tienda online, que la de tienda pise la de ingresos»*.
 *
 * 📊 Por qué: el 8-oct entraron 8 OC de Zattia con 76 productos; 75 ya estaban en Gestión Nube y
 * sólo **21 tenían foto en Tienda Nube** — los otros 55 decían «sin foto» en Por producto y la
 * Asignación rápida de ⭐ los salteaba, justo los nuevos que marketing tiene que conocer.
 * Ingresos manda foto en cada renglón desde el 1-sep (`recepcion_linea.imagen_url`).
 *
 * 🔑 **La regla es una sola y vive acá**: si Tienda Nube tiene fotos, ganan SIEMPRE —sin fecha, sin
 * comparar—; Ingresos sólo cubre el hueco. Así el respaldo se apaga solo el día que se carga la foto
 * de la tienda, ⛔ sin que nadie lo borre.
 *
 * 🔑 **El cruce es por NOMBRE, después por SKU de variante.** El renglón de Ingresos trae el nombre
 * del producto tal cual se da de alta en GN (`MINI LARA`) y el SKU de la variante (`RMI-0095-S`);
 * el producto de la tabla trae su nombre y, a veces, un SKU. ⛔ No se usa el cruce «todas las
 * palabras contenidas» de `tn-match.core.js`: con fotos provisorias, una foto de OTRO producto es
 * peor que «sin foto».
 */

const norm = (s) => String(s || '').trim().toUpperCase()

/**
 * Índice de fotos de Ingresos. Las filas vienen **de la más vieja a la más nueva**: si un producto
 * entró en dos OC, gana la foto de la última.
 *
 * @param {{ nombre?: string|null, sku?: string|null, imagen_url?: string|null, imagen_thumb_url?: string|null }[]} filas
 */
export function indexarFotosIngreso(filas) {
  const porNombre = new Map()
  const porSku = new Map()
  for (const f of filas || []) {
    const grande = f.imagen_url || f.imagen_thumb_url
    if (!grande) continue
    const foto = { grande, chica: f.imagen_thumb_url || grande }
    if (f.nombre) porNombre.set(norm(f.nombre), foto)
    if (f.sku) porSku.set(norm(f.sku), foto)
  }
  return { porNombre, porSku }
}

/** La foto de Ingresos de un producto, o `null`. */
export function fotoDeIngreso(p, idx) {
  if (!idx || !p) return null
  return idx.porNombre.get(norm(p.name)) || (p.sku ? idx.porSku.get(norm(p.sku)) : null) || null
}

/**
 * Las fotos a mostrar y de dónde salen.
 *
 * @param {string[]} fotosTn  lo que ya devuelve `imagenesDe(p, tnIdx)`
 * @returns {{ origen: 'tn'|'ingreso'|null, imagenes: string[], miniatura: string|null }}
 */
export function fotosConRespaldo(p, fotosTn, idxIngreso) {
  const tn = (fotosTn || []).filter(Boolean)
  if (tn.length) return { origen: 'tn', imagenes: tn, miniatura: tn[0] }
  const ing = fotoDeIngreso(p, idxIngreso)
  if (ing) return { origen: 'ingreso', imagenes: [ing.grande], miniatura: ing.chica }
  return { origen: null, imagenes: [], miniatura: null }
}
