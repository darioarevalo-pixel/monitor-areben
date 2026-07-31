import { describe, it, expect } from 'vitest'
import { estadoDe } from '@/lib/tncat/auditoria'
import { frasesDeProblema } from '@/lib/tncat/texto'
import type { ProductoFchk, VarianteFchk } from '@/lib/tncat/tipos'

const v = (color: string | null, image_url: string | null, over: Partial<VarianteFchk> = {}): VarianteFchk => ({
  color,
  image_url,
  ...over,
})
const prod = (variantes: VarianteFchk[], imagenes: { id: string; src: string }[] = []): ProductoFchk => ({
  id: '1',
  name: 'P',
  image_count: imagenes.length,
  imagenes,
  variantes,
})

/** Lo que termina viéndose en el renglón: las frases unidas, como las une la pantalla. */
const renglon = (p: ProductoFchk) => frasesDeProblema(estadoDe(p)).map((f) => f.texto).join(' · ')

describe('el renglón dice de qué son los números que muestra', () => {
  /**
   * El caso que destapó todo. `SWEATER MONTEREY` (Zattia): dos variantes —BEIGE y NEGRO— y
   * ninguna foto cargada. El renglón imprimía las dos frases pegadas y sin espacio:
   * "2 sin foto propiaEl producto no tiene ninguna foto cargada — subilas en Carga de imágenes…".
   */
  it('un producto sin ninguna foto lo dice una sola vez', () => {
    const p = prod([v('BEIGE', null), v('NEGRO', null)])
    expect(renglon(p)).toBe('No tiene ninguna foto cargada: en la tienda se ve en blanco.')
  })

  it('nunca deja dos frases pegadas', () => {
    const p = prod([v('A', 'x.jpg'), v('B', 'x.jpg'), v('C', null)], [{ id: '1', src: 'x.jpg' }])
    const texto = renglon(p)
    expect(texto).toContain(' · ')
    expect(texto).not.toMatch(/[a-z][A-Z]/)
  })

  it('los colores sin foto se cuentan como colores', () => {
    const p = prod([v('BEIGE', null), v('NEGRO', null), v('ROJO', 'r.jpg')], [{ id: '1', src: 'r.jpg' }])
    expect(renglon(p)).toBe('2 colores sin foto propia')
  })

  it('en singular no dice "1 colores"', () => {
    const p = prod([v('BEIGE', null), v('ROJO', 'r.jpg')], [{ id: '1', src: 'r.jpg' }])
    expect(renglon(p)).toBe('1 color sin foto propia')
  })

  /** El color está fotografiado: lo que falta es pegarle esa foto a un modelo o talle. */
  it('el modelo al que no le pegaron la foto se cuenta como variante, no como color', () => {
    const p = prod([v('AZUL', 'a.jpg'), v('AZUL', null), v('AZUL', null)], [{ id: '1', src: 'a.jpg' }])
    expect(renglon(p)).toBe('2 variantes sin la foto de su color')
  })

  it('la foto cruzada va primero y marcada como grave', () => {
    const p = prod([v('A', 'x.jpg'), v('B', 'x.jpg'), v('C', null)], [{ id: '1', src: 'x.jpg' }])
    const frases = frasesDeProblema(estadoDe(p))
    expect(frases[0].texto).toBe('1 publicación con la foto de otro color')
    expect(frases[0].grave).toBe(true)
    expect(frases[1].grave).toBeFalsy()
  })

  it('sin nada detectado no dice nada: de eso se ocupa el renglón por su cuenta', () => {
    const p = prod([v('A', 'a.jpg'), v('B', 'b.jpg')], [
      { id: '1', src: 'a.jpg' },
      { id: '2', src: 'b.jpg' },
    ])
    expect(frasesDeProblema(estadoDe(p))).toEqual([])
  })
})
