/**
 * Ubicaciones depósito — el núcleo (JS plano: lo usan `api/_ubicaciones-local.js`, la pantalla y los tests).
 *
 * 🔑 QUÉ ES (Bruno, 4-oct-2026): el depósito de atrás del local de Zattia. Percha + atrás son UN stock
 * («Local» en GN) y ⛔ eso no se separa: lo que se guarda acá es DÓNDE está guardado cada producto.
 * Plan: `~/Documents/reunion-gerencia/2026-10-04-ubicaciones-deposito-plan-v1.md`.
 *
 * - La ubicación es **por producto**, no por bolsa ni por color: los colores van juntos, en orden de SKU.
 * - La clave del producto es el SKU de la variante SIN el color/talle (`RBT-0137` de `RBT-0137-BE`).
 *   ⛔ No es el `product_id` de GN ni el campo SKU del producto en GN (en 373 de 440 dice cualquier cosa).
 * - Se escanea el ESTANTE (etiqueta `EST-A1`) y después TODAS sus bolsas; eso REEMPLAZA el estante.
 */

/** Prefijo de la etiqueta de estante: lo que distingue «esto es un estante» de «esto es una bolsa». */
export const PREFIJO_ESTANTE = 'EST-'

/** Más que esto por variante en el Local ⇒ no entra en percha (1 a 3 por color) ⇒ tiene que haber bolsa. */
export const TOPE_PERCHA = 3

export const cmpSku = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' })

/**
 * La clave del producto: categoría + número, hasta el primer bloque con números inclusive
 * (`RTO-0013-NG` → `RTO-0013`, `STU-REM-0001-S` → `STU-REM-0001`). Lo que sigue (talle, color) es de
 * la variante. 🔑 Es LA regla de «qué es el producto» en el depósito: `skuBase` del conteo la reusa.
 */
export function claveDe(sku) {
  const s = String(sku || '').trim().toUpperCase()
  if (!s) return ''
  const segs = s.split('-')
  const i = segs.findIndex((seg) => /\d/.test(seg))
  return i < 0 ? s : segs.slice(0, i + 1).join('-')
}

/**
 * Lo que leyó el lector ⇒ estante o bolsa.
 *
 * 🔴 Un lector configurado con teclado en castellano escribe `'` donde la etiqueta dice `-`: se
 * corrige antes de mirar nada (`EST'A1` es el estante A1, `RBT'0137` es la bolsa RBT-0137).
 *
 * @returns {{tipo:'estante', estante:string} | {tipo:'bolsa', codigo:string, clave:string} | {tipo:'vacio'}}
 */
export function leerCodigo(texto) {
  const s = String(texto || '').trim().toUpperCase().replace(/'/g, '-')
  if (!s) return { tipo: 'vacio' }
  if (s.startsWith(PREFIJO_ESTANTE)) {
    const estante = s.slice(PREFIJO_ESTANTE.length).replace(/[^A-Z0-9]/g, '')
    return estante ? { tipo: 'estante', estante } : { tipo: 'vacio' }
  }
  return { tipo: 'bolsa', codigo: s, clave: claveDe(s) }
}

/** Nombre de estante válido: lo que queda de `EST-…`, letras y números, hasta 8. */
export function estanteValido(e) {
  return /^[A-Z0-9]{1,8}$/.test(String(e || ''))
}

/**
 * Las lecturas de un estante ⇒ una fila por producto, con cuántas bolsas se leyeron.
 * Cada lectura repetida es UNA bolsa más (dos bolsas del mismo producto llevan la misma etiqueta).
 *
 * @param {string[]} claves  ya resueltas
 * @returns {{clave:string, bolsas:number}[]} en orden de SKU
 */
export function agruparLecturas(claves) {
  const n = new Map()
  for (const c of claves) {
    const k = String(c || '').trim().toUpperCase()
    if (k) n.set(k, (n.get(k) || 0) + 1)
  }
  return [...n.entries()].map(([clave, bolsas]) => ({ clave, bolsas })).sort((a, b) => cmpSku(a.clave, b.clave))
}

/**
 * En qué estantes está un producto, ordenados.
 * @param {{estante:string, clave:string}[]} foto
 */
export function ubicacionesDe(foto, clave) {
  const k = claveDe(clave)
  if (!k) return []
  return [...new Set(foto.filter((f) => f.clave === k).map((f) => f.estante))].sort(cmpSku)
}

/**
 * Los dos controles del escaneo total, contra el stock del Local.
 *
 * - **Bolsa sin stock**: la clave está en un estante y el Local tiene 0 de todas sus variantes ⇒
 *   la bolsa está vacía o el stock de GN está mal.
 * - **Stock sin bolsa**: alguna variante tiene MÁS de `TOPE_PERCHA` en el Local y la clave ⛔ está en
 *   ningún estante ⇒ bolsa perdida o en un lugar sin escanear. 🔑 Con 3 o menos ⛔ se avisa: puede
 *   estar todo colgado, y eso está bien (eran ~140 productos de ruido el 1-oct).
 *
 * @param {{estante:string, clave:string}[]} foto
 * @param {{sku:string|null, product_name:string, size_name?:string, available_quantity:number}[]} local  filas del Local
 */
export function controles(foto, local) {
  const porClave = new Map()
  for (const r of local) {
    const clave = claveDe(r.sku)
    if (!clave) continue
    const q = Number(r.available_quantity) || 0
    const c = porClave.get(clave) || { clave, nombre: r.product_name, total: 0, max: 0 }
    c.total += Math.max(0, q)
    c.max = Math.max(c.max, q)
    porClave.set(clave, c)
  }
  const enEstante = new Map()
  for (const f of foto) {
    if (!enEstante.has(f.clave)) enEstante.set(f.clave, [])
    enEstante.get(f.clave).push(f.estante)
  }

  const bolsaSinStock = [...enEstante.entries()]
    .filter(([clave]) => !((porClave.get(clave) || {}).total > 0))
    .map(([clave, estantes]) => ({ clave, nombre: (porClave.get(clave) || {}).nombre || null, estantes: [...new Set(estantes)].sort(cmpSku) }))
    .sort((a, b) => cmpSku(a.clave, b.clave))

  const stockSinBolsa = [...porClave.values()]
    .filter((c) => c.max > TOPE_PERCHA && !enEstante.has(c.clave))
    .map((c) => ({ clave: c.clave, nombre: c.nombre, enLocal: c.total, maxVariante: c.max }))
    .sort((a, b) => b.enLocal - a.enLocal || cmpSku(a.clave, b.clave))

  return { bolsaSinStock, stockSinBolsa }
}
