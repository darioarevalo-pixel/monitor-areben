/**
 * **El cruce Gestión Nube → Tienda Nube**, en JS plano. Se mudó de `lib/tn.ts` el 30-sep-2026
 * porque lo necesita el parte de la mañana (`scripts/parte-manana.mjs`), que corre en Node sin el
 * compilador de Next y ⛔ puede importar TypeScript. `lib/tn.ts` lo re-exporta tipado para la app:
 * ⛔ se copia (lo usan una treintena de archivos).
 *
 * El matcheo es idéntico a los dos originales del legacy: por SKU, luego por nombre exacto, luego
 * por "todas las palabras ≥3 letras contenidas".
 */

/**
 * Índice por SKU y por nombre (ambos lower+trim). `soloConImagenes` replica el mapa de fotos del
 * legacy, que sólo indexaba productos con al menos una imagen (index.html:12857). Sin esa opción
 * indexa todos (para el precio promo, P3).
 */
export function indexarTn(products, opts) {
  const idx = { bySku: {}, byName: {}, sinFoto: { bySku: {}, byName: {} } }
  for (const p of products) {
    if (opts?.soloConImagenes && !(p.images || []).filter(Boolean).length) {
      // Se anota igual: existir sin foto ⛔ es lo mismo que no existir (ver `matchTn`).
      if (p.sku) idx.sinFoto.bySku[p.sku.toLowerCase().trim()] = true
      if (p.name) idx.sinFoto.byName[p.name.toLowerCase().trim()] = true
      continue
    }
    if (p.sku) idx.bySku[p.sku.toLowerCase().trim()] = p
    if (p.name) idx.byName[p.name.toLowerCase().trim()] = p
  }
  return idx
}

/**
 * Matchea un producto GN contra el índice TN. Port literal de _mktFindTN (index.html:8832) /
 * tnEntryForProducto (12879): SKU exacto → nombre exacto → todas las palabras de ≥3 letras
 * contenidas en algún nombre TN.
 */
export function matchTn(p, idx) {
  if (p.sku) {
    const h = idx.bySku[p.sku.toLowerCase().trim()]
    if (h) return h
  }
  if (p.name) {
    const nameLower = p.name.toLowerCase().trim()
    if (idx.byName[nameLower]) return idx.byName[nameLower]
    // 🔴 Si el producto ESTÁ en la tienda pero sin foto, ⛔ se busca por palabras: «BERMUDA CAM»
    // (nueva, oculta, 0 fotos) agarraba la foto de «BERMUDA DARK CAMO» (9-oct-2026). Las palabras
    // son para cuando GN y TN lo nombran distinto, ⛔ para prestarle la foto de otro.
    const sf = idx.sinFoto
    if (sf && (sf.byName[nameLower] || (p.sku && sf.bySku[p.sku.toLowerCase().trim()]))) return null
    const palabras = nameLower.split(/\s+/).filter((w) => w.length >= 3)
    if (palabras.length) {
      for (const tnName of Object.keys(idx.byName)) {
        if (palabras.every((w) => tnName.includes(w))) return idx.byName[tnName]
      }
    }
  }
  return null
}

/** Todas las fotos del producto matcheado (index.html:12906). */
export function imagenesDe(p, idx) {
  return (matchTn(p, idx)?.images || []).filter(Boolean)
}

/** La primera foto, o null (thumbnail de la tabla, index.html:12900). */
export function imagenDe(p, idx) {
  return imagenesDe(p, idx)[0] || null
}
