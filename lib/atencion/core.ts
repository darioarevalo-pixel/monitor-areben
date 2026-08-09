/**
 * Lógica pura de "Atención al cliente": armar el mensaje que se copia y buscar el modelo.
 * Sin red y sin DOM.
 */

import type { ItemAtencion, ModeloTienda } from './tipos'

/**
 * Reemplaza `{modelo}` y `{link}` en la plantilla.
 *
 * Los marcadores que no existen se dejan tal cual en vez de borrarse: si alguien escribe `{Modelo}`
 * con mayúscula, verlo en el mensaje copiado dice qué pasó; un hueco en blanco, no.
 */
export function armarMensaje(plantilla: string, m: { nombre: string; url: string }): string {
  return String(plantilla || '')
    .replace(/\{modelo\}/g, m.nombre)
    .replace(/\{link\}/g, m.url)
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

function normalizar(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

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
