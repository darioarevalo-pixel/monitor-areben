/**
 * La vista de Etiquetas sobre una liquidación — lo que decide **qué ve el local**.
 *
 * Es un filtro chico y por eso es peligroso: si se equivoca, no falla nada. La gente sale a la
 * tienda con etiquetas de precios que no rigen, y el error aparece en la percha, no en la pantalla.
 * Los dos errores posibles son opuestos y los dos son caros:
 *
 *  - **de más**: colgar el precio de un sale que todavía no está cargado en la tienda;
 *  - **de menos**: dejar sin etiqueta la mitad de los productos cuando los precios se cargaron a
 *    mano en Gestión Nube y los ítems nunca pasaron por el aplicador.
 */
import { describe, it, expect } from 'vitest'
import { ESTADOS_CAMPANIA_VIVA, pidsAEtiquetar } from '../api/_liquidacion.js'

const ITEMS = [
  { pid: '1', estado: 'aplicado' },
  { pid: '2', estado: 'confirmado' },
  { pid: '3', estado: 'definido' },
  { pid: '4', estado: 'descartado' },
  { pid: '5', estado: 'pendiente' },
]

describe('ESTADOS_CAMPANIA_VIVA', () => {
  it('deja afuera borrador y cerrada', () => {
    // Una campaña en borrador tiene precios decididos que NO están en la tienda: etiquetar desde
    // ahí cuelga en la percha un precio que no existe.
    expect(ESTADOS_CAMPANIA_VIVA).toEqual(['en_curso', 'aplicada'])
    expect(ESTADOS_CAMPANIA_VIVA).not.toContain('borrador')
    expect(ESTADOS_CAMPANIA_VIVA).not.toContain('cerrada')
  })
})

describe('pidsAEtiquetar', () => {
  it('con la campaña en curso, sólo los aplicados', () => {
    // `aplicado` es «su precio está puesto en GN ahora». Un `confirmado` está aprobado pero nadie
    // lo escribió todavía.
    expect(pidsAEtiquetar(ITEMS, 'en_curso')).toEqual(['1'])
  })

  it('con la campaña ya aplicada, también los confirmados', () => {
    // Es el caso de los precios cargados a mano en GN: el ítem nunca pasa por el aplicador, y quien
    // marcó la campaña como aplicada es el único que puede decir que están puestos.
    expect(pidsAEtiquetar(ITEMS, 'aplicada')).toEqual(['1', '2'])
  })

  it('nunca los definidos, descartados ni pendientes', () => {
    for (const estado of ['en_curso', 'aplicada']) {
      const salen = pidsAEtiquetar(ITEMS, estado)
      expect(salen).not.toContain('3') // definido: falta la segunda mirada
      expect(salen).not.toContain('4') // descartado: se decidió que NO entra al sale
      expect(salen).not.toContain('5') // pendiente: no tiene precio
    }
  })

  it('devuelve pid, y nada más que pid', () => {
    // Lo que sostiene que esta vista no filtre costo ni margen al local: acá no viaja el ítem.
    expect(pidsAEtiquetar([{ pid: '9', estado: 'aplicado', foto: { costo: 1234 } }], 'aplicada')).toEqual(['9'])
  })

  it('sin ítems no devuelve nada', () => {
    expect(pidsAEtiquetar([], 'aplicada')).toEqual([])
    expect(pidsAEtiquetar(null, 'aplicada')).toEqual([])
  })
})
