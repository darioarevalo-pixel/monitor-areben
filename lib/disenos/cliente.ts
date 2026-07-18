/**
 * Votación online: crea una ronda, sube las imágenes y trae las boletas. Endpoint
 * `votacion` (Vercel, no TN/GN). Port de dbVotCrear/dbVotTraer (index.html:3580/3600).
 */

import type { Boleta } from './core'

const VOT_API = 'https://bdi-catalogo.vercel.app/api/votacion'
export const VOT_PAGE = 'https://bdi-catalogo.vercel.app/votar'

/** Crea una ronda de votación. Devuelve el id o lanza. */
export async function crearRonda(designs: { id: string; name: string }[]): Promise<string> {
  const r = await fetch(VOT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'crear', title: 'Selección de diseños', designs }) })
  const d = await r.json()
  if (!d.ok) throw new Error(d.error || 'no se pudo crear')
  return d.id as string
}

/** Sube la imagen de un diseño a la ronda. */
export async function subirImagen(rondaId: string, designId: string, image: string): Promise<void> {
  await fetch(VOT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'img', id: rondaId, designId, image }) })
}

/** Trae las boletas de una ronda. */
export async function traerBoletas(rondaId: string): Promise<Boleta[]> {
  const r = await fetch(`${VOT_API}?id=${rondaId}`)
  const d = await r.json()
  if (!d.ok) throw new Error(d.error || 'error')
  return (d.ballots || []) as Boleta[]
}
