import { describe, it, expect } from 'vitest'
import { patronBusqueda } from '../api/_crm.js'

/**
 * El patrón de búsqueda por nombre de "ya es cliente mío, cambió de número".
 *
 * 🔴 Los dos reemplazos que hace fallan **en silencio**, que es por lo que se prueban: uno deja
 * pasar comodines ajenos (y entonces un `%` en el cuadro trae el padrón entero), y el otro, si
 * falta, esconde a todo el que tenga un acento en el nombre — el que busca concluye que el cliente
 * no está y termina cargándolo dos veces.
 */
describe('patronBusqueda', () => {
  it('🔴 encuentra a "Martín" buscando "martin": ilike NO ignora los acentos', () => {
    // Las vocales pasan a ser comodines de un carácter, así que la í entra igual.
    expect(patronBusqueda('martin')).toBe('%m_rt_n%')
    expect(patronBusqueda('Martín')).toBe('%M_rt_n%')
  })

  it('el caso real: "candela martin" tiene que llegar a "Candela Martin"', () => {
    expect(patronBusqueda('candela martin')).toBe('%c_nd_l_ m_rt_n%')
  })

  it('🔴 los comodines que escribe la persona son TEXTO, no comodines', () => {
    // Sin esto, un "%" en el cuadro de búsqueda trae el padrón entero.
    expect(patronBusqueda('50%')).toBe('%50\\%%')
    expect(patronBusqueda('a_b')).toBe('%_\\_b%')
  })

  it('vacío no explota', () => {
    expect(patronBusqueda('')).toBe('%%')
    expect(patronBusqueda(null)).toBe('%%')
  })
})
