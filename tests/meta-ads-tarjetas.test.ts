import { describe, expect, it } from 'vitest'
import {
  historiasARescatar,
  tarjetasDeHistoria,
  tarjetasPorHistoria,
  TOPE_TARJETAS,
} from '@/lib/meta-ads/tarjetas'

/**
 * El rescate de las tarjetas del carrusel.
 *
 * Existe por un caso real: los dos avisos `SWEATERS - CARROUSEL RAYADOS` llegaban con `piezas: 0`
 * **siendo carruseles**, porque salen de una publicación de Instagram y el creativo no trae
 * `child_attachments`. Lo que se prueba acá es lo que se puede equivocar sin que Meta proteste: a
 * quién se le pregunta y cómo se lee la respuesta.
 */

const aviso = (id: string, piezas: string[] = []) => ({ id, piezas })

const posteo = (fotos: (string | null)[]) => ({
  attachments: {
    data: [
      {
        subattachments: {
          data: fotos.map((src) => ({ media: src ? { image: { src } } : {} })),
        },
      },
    ],
  },
})

describe('a quién se le pregunta', () => {
  it('sólo a los avisos sin tarjetas que salen de una publicación', () => {
    const ads = [aviso('1'), aviso('2', ['ya.jpg']), aviso('3')]
    const historias = new Map([
      ['1', 'p_1'],
      ['2', 'p_2'],
      // el 3 no tiene publicación: no hay a quién preguntarle
    ])

    const out = historiasARescatar(ads, historias, 50)

    expect([...out.keys()]).toEqual(['p_1'])
  })

  it('🔴 dos avisos sobre la MISMA publicación entran los dos', () => {
    // Este es el defecto que justifica que el valor del mapa sea una lista. Con un
    // `Map<historia, aviso>` el segundo pisaba al primero y se quedaba sin tarjetas.
    const ads = [aviso('1'), aviso('2')]
    const historias = new Map([
      ['1', 'p_compartida'],
      ['2', 'p_compartida'],
    ])

    const out = historiasARescatar(ads, historias, 50)

    expect(out.size).toBe(1)
    expect(out.get('p_compartida')?.map((a) => a.id)).toEqual(['1', '2'])
  })

  it('el tope corta publicaciones nuevas, pero nunca un aviso de una que ya entró', () => {
    const ads = [aviso('1'), aviso('2'), aviso('3')]
    const historias = new Map([
      ['1', 'p_1'],
      ['2', 'p_2'],
      ['3', 'p_1'],
    ])

    const out = historiasARescatar(ads, historias, 1)

    expect([...out.keys()]).toEqual(['p_1'])
    expect(out.get('p_1')?.map((a) => a.id)).toEqual(['1', '3'])
  })
})

describe('cómo se lee lo que contesta Meta', () => {
  it('un carrusel devuelve las fotos de sus tarjetas, en orden', () => {
    expect(tarjetasDeHistoria(posteo(['a.jpg', 'b.jpg', 'c.jpg']))).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
  })

  it('una publicación que no es carrusel no devuelve nada', () => {
    expect(tarjetasDeHistoria({ attachments: { data: [{ media: { image: { src: 'sola.jpg' } } }] } })).toEqual([])
    expect(tarjetasDeHistoria({})).toEqual([])
    expect(tarjetasDeHistoria(null)).toEqual([])
  })

  it('una tarjeta sin imagen no cuenta: la lista son fotos, no un conteo', () => {
    expect(tarjetasDeHistoria(posteo(['a.jpg', null, 'c.jpg']))).toEqual(['a.jpg', 'c.jpg'])
  })

  it('corta en el tope de Meta', () => {
    const muchas = Array.from({ length: 15 }, (_, i) => `f${i}.jpg`)
    expect(tarjetasDeHistoria(posteo(muchas))).toHaveLength(TOPE_TARJETAS)
  })

  it('el batch deja afuera a las publicaciones que no son carrusel', () => {
    const mapa = tarjetasPorHistoria({
      p_1: posteo(['a.jpg', 'b.jpg']),
      p_2: { attachments: { data: [{ media: { image: { src: 'sola.jpg' } } }] } },
    })

    expect([...mapa.keys()]).toEqual(['p_1'])
    expect(mapa.get('p_1')).toEqual(['a.jpg', 'b.jpg'])
  })

  it('una respuesta que no es un objeto no rompe nada', () => {
    expect(tarjetasPorHistoria(null).size).toBe(0)
    expect(tarjetasPorHistoria('error' as unknown).size).toBe(0)
  })
})
