/**
 * Lógica pura de "Atención al cliente": armar el mensaje que se copia y buscar el modelo.
 * Sin red y sin DOM.
 */

import { normalizar } from '@/lib/texto'
import type { ItemAtencion, ModeloTienda, ProductoTienda } from './tipos'

/**
 * Reemplaza los marcadores `{asi}` de una plantilla.
 *
 * Los marcadores que no están en `valores` se dejan tal cual en vez de borrarse: si alguien escribe
 * `{Modelo}` con mayúscula, verlo en el mensaje copiado dice qué pasó; un hueco en blanco, no.
 *
 * Un valor vacío **sí** se reemplaza, por vacío. Es el caso de un producto sin precio: mejor una
 * línea de menos que un `{precio}` crudo viajando a un WhatsApp.
 */
export function interpolar(plantilla: string, valores: Record<string, string>): string {
  let out = String(plantilla || '')
  for (const [clave, valor] of Object.entries(valores)) {
    out = out.split(`{${clave}}`).join(valor)
  }
  return out
}

/** El mensaje de un modelo de celular: `{modelo}` y `{link}`. */
export function armarMensaje(plantilla: string, m: { nombre: string; url: string }): string {
  return interpolar(plantilla, { modelo: m.nombre, link: m.url })
}

/**
 * El mensaje de un producto: `{producto}`, `{link}`, `{precio}` y `{sku}`.
 *
 * El precio llega **ya formateado** y no como número: formatearlo es cosa del kit (`formatMoney`) y
 * este archivo es lógica pura. Cuando no hay precio llega vacío — nunca `$0`, que en un WhatsApp es
 * un problema comercial y no un detalle de formato.
 *
 * Un renglón que **tenía** algo escrito y quedó vacío al interpolar se cae. La plantilla de fábrica
 * pone el precio en una línea propia: sin precio dejaría un renglón en blanco en el medio del
 * mensaje. Un renglón que ya venía vacío en la plantilla se respeta — ahí alguien quiso separar.
 */
export function textoDeProducto(
  plantilla: string,
  v: { producto: string; link: string; precio: string; sku: string },
): string {
  return String(plantilla || '')
    .split('\n')
    .map((linea) => ({ antes: linea.trim(), despues: interpolar(linea, v) }))
    .filter(({ antes, despues }) => antes === '' || despues.trim() !== '')
    .map(({ despues }) => despues)
    .join('\n')
}

/** Lo que se copia de un item: el mensaje con el link pegado abajo, o sólo uno de los dos. */
export function textoDeItem(i: ItemAtencion): string {
  if (i.tipo === 'mensaje') return i.texto || ''
  if (i.texto && i.url) return `${i.texto}\n${i.url}`
  return i.url || i.texto || ''
}

/**
 * Busca un modelo escribiendo poco: "15 pro" encuentra el iPhone 15 Pro (y el Pro Max), "13" los
 * tres 13. Cada palabra tiene que aparecer, en cualquier orden, así que "pro 15" también sirve.
 *
 * Se busca contra el nombre y el slug juntos, sin tildes ni mayúsculas.
 */
export function filtrarModelos(modelos: ModeloTienda[], q: string): ModeloTienda[] {
  const palabras = normalizar(q).split(/\s+/).filter(Boolean)
  if (!palabras.length) return modelos
  return modelos.filter((m) => {
    const heno = normalizar(`${m.nombre} ${m.slug.replace(/-/g, ' ')}`)
    return palabras.every((p) => heno.includes(p))
  })
}

/** Mismo criterio de búsqueda, sobre el título, el grupo y el texto de los items cargados. */
export function filtrarItems(items: ItemAtencion[], q: string): ItemAtencion[] {
  const palabras = normalizar(q).split(/\s+/).filter(Boolean)
  if (!palabras.length) return items
  return items.filter((i) => {
    const heno = normalizar(`${i.titulo} ${i.grupo || ''} ${i.texto || ''} ${i.url || ''}`)
    return palabras.every((p) => heno.includes(p))
  })
}

/**
 * Cuántos productos se muestran a la vez. Quien atiende necesita **uno**: si la búsqueda trae 200,
 * el problema no se arregla scrolleando, se arregla escribiendo dos palabras más. La pantalla dice
 * cuántos quedaron afuera en vez de cortar en silencio.
 */
export const TOPE_PRODUCTOS = 30

/**
 * Mismo criterio que los modelos, sobre el nombre y el SKU del producto.
 *
 * **Con menos de dos letras no devuelve nada**, y eso es a propósito: la tienda entera en pantalla
 * es justo lo que esta sección existe para no hacer. Devuelve también cuántos hubo en total, que es
 * lo que se necesita para decir "y N más".
 */
export function filtrarProductos(
  productos: ProductoTienda[],
  q: string,
  tope = TOPE_PRODUCTOS,
): { hallados: ProductoTienda[]; total: number } {
  const palabras = normalizar(q).split(/\s+/).filter(Boolean)
  if (normalizar(q).length < 2) return { hallados: [], total: 0 }
  const todos = productos.filter((p) => {
    const heno = normalizar(`${p.name} ${p.sku || ''}`)
    return palabras.every((w) => heno.includes(w))
  })
  return { hallados: todos.slice(0, tope), total: todos.length }
}

// Vive en `lib/texto.ts` desde que lo necesitó el tercer módulo (atención, manuales y la búsqueda
// de productos). Se re-exporta para no tocar a quien ya lo importaba de acá.
export { normalizar } from '@/lib/texto'

/** Los items agrupados para pintar, respetando el orden de carga dentro de cada grupo. */
export function porGrupo(items: ItemAtencion[]): { grupo: string; items: ItemAtencion[] }[] {
  const mapa = new Map<string, ItemAtencion[]>()
  for (const i of items) {
    const g = (i.grupo || '').trim() || 'Sin grupo'
    if (!mapa.has(g)) mapa.set(g, [])
    mapa.get(g)!.push(i)
  }
  // "Sin grupo" al final: lo que alguien se tomó el trabajo de clasificar va primero.
  return [...mapa.entries()]
    .sort(([a], [b]) => (a === 'Sin grupo' ? 1 : b === 'Sin grupo' ? -1 : a.localeCompare(b, 'es')))
    .map(([grupo, items]) => ({ grupo, items }))
}
