/**
 * Buscar escribiendo poco: cada palabra tiene que aparecer, en cualquier orden, sin tildes ni
 * mayúsculas. "15 pro" encuentra el iPhone 15 Pro, y "pro 15" también.
 *
 * Nació adentro de `lib/atencion/core.ts` para los modelos de celular y salió acá cuando lo
 * necesitó el tercer módulo. Es la única búsqueda del repo que no es un `includes` de un solo
 * string, así que conviene que sea la misma en todos lados: si en una pantalla "corset negro"
 * encuentra y en otra no, el que busca no piensa "esta pantalla busca distinto", piensa "no está".
 */

export function normalizar(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** ¿El texto tiene todas las palabras de la búsqueda? Una búsqueda vacía matchea con todo. */
export function coincide(texto: string, q: string): boolean {
  const palabras = normalizar(q).split(/\s+/).filter(Boolean)
  if (!palabras.length) return true
  const heno = normalizar(texto)
  return palabras.every((p) => heno.includes(p))
}
