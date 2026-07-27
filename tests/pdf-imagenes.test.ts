import { describe, it, expect } from 'vitest'
import { comoDataUrl, precargarImagenes } from '@/lib/pdf'

/**
 * La precarga de imágenes para los PDF.
 *
 * Existe porque las fotos pasaron a vivir en Vercel Blob: `d.url` es una URL remota y jsPDF
 * dibuja sincrónico, así que sin precargar los reportes salen sin imágenes. Lo que se protege
 * acá es sobre todo **el camino viejo**: los diseños de antes de la migración tienen la foto
 * embebida en un data URL y tienen que seguir saliendo igual, sin tocar la red.
 *
 * Los tests corren en node (sin DOM), así que cubren los caminos que no necesitan `Image`:
 * data URLs, vacíos y deduplicación. El camino remoto se apoya en `crossOrigin='anonymous'`,
 * que es lo mismo que ya usa el export de Fundas contra el mismo Blob.
 */

const DATA_1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const DATA_2 = 'data:image/png;base64,iVBORw0KGgo='

describe('comoDataUrl', () => {
  it('un data URL vuelve tal cual: no hay nada que ir a buscar', async () => {
    expect(await comoDataUrl(DATA_1)).toBe(DATA_1)
  })

  it('vacío devuelve null en vez de romper', async () => {
    expect(await comoDataUrl('')).toBeNull()
  })
})

describe('precargarImagenes', () => {
  it('mapea cada data URL a sí mismo', async () => {
    const m = await precargarImagenes([DATA_1, DATA_2])
    expect(m.get(DATA_1)).toBe(DATA_1)
    expect(m.get(DATA_2)).toBe(DATA_2)
  })

  // Un mismo diseño puede aparecer más de una vez en un reporte y la red se paga una sola vez.
  it('no repite: el mapa tiene una entrada por imagen distinta', async () => {
    const m = await precargarImagenes([DATA_1, DATA_1, DATA_2, DATA_1])
    expect(m.size).toBe(2)
  })

  it('descarta los vacíos y los nulos sin romper', async () => {
    const m = await precargarImagenes([DATA_1, '', null, undefined])
    expect(m.size).toBe(1)
    expect(m.get(DATA_1)).toBe(DATA_1)
  })

  it('una lista vacía da un mapa vacío', async () => {
    expect((await precargarImagenes([])).size).toBe(0)
  })
})
