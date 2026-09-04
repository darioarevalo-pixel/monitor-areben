// El núcleo de Modelos: qué se normaliza, qué se rechaza y qué avisa.
//
// 🔑 **El primer describe es el que importa**: fija que la sesión de fotos y el padrón normalizan el
// talle y la altura con LA MISMA función. Ese es el motivo por el que la normalización se mudó a
// `lib/modelos/core.core.js`, y sin este test el próximo que las vea escritas en dos lugares las
// empareja mal sin que falle nada.
import { describe, it, expect } from 'vitest'
import {
  alturaNormalizada,
  claveDeNombre,
  esDeLaMarca,
  esDirecta,
  esElegible,
  ESTADOS,
  fichaQueChoca,
  filtrarModelos,
  instagramNormalizado,
  medidasNormalizadas,
  motivoModeloInvalido,
  ordenarModelos,
  talleNormalizado,
} from '@/lib/modelos/core'
import {
  alturaNormalizada as alturaDeLaSesion,
  talleNormalizado as talleDeLaSesion,
} from '@/lib/sesionfotos/modelo'
import type { Modelo } from '@/lib/modelos/tipos'

const modelo = (x: Partial<Modelo> = {}): Modelo => ({
  id: 'mo1',
  nombre: 'Juana Pérez',
  instagram: null,
  telefono: null,
  mail: null,
  agencia: null,
  booker: null,
  bookerContacto: null,
  talle: null,
  altura: null,
  medidas: {},
  estado: 'activa',
  marcas: [],
  nota: null,
  autor: null,
  creado: '2026-09-03T00:00:00Z',
  actualizado: '2026-09-03T00:00:00Z',
  ...x,
})

describe('modelos — una sola normalización para la ficha y para la sesión', () => {
  it('🔴 la sesión de fotos usa LA MISMA función que el padrón, no una copia', () => {
    expect(talleDeLaSesion).toBe(talleNormalizado)
    expect(alturaDeLaSesion).toBe(alturaNormalizada)
  })

  it('el talle sube a mayúsculas y se come el prefijo', () => {
    expect(talleNormalizado(' m ')).toBe('M')
    expect(talleNormalizado('Talle M')).toBe('M')
    expect(talleNormalizado('talles 38')).toBe('38')
    expect(talleNormalizado('único')).toBe('ÚNICO')
    expect(talleNormalizado('')).toBe('')
  })

  it('las cuatro formas de escribir una altura dan la misma, y lo que no es altura se descarta', () => {
    for (const escrito of ['170', '1.70', '1,70', '1,70 m']) expect(alturaNormalizada(escrito)).toBe('1,70 m')
    for (const basura of ['', 'alta', '0', '-1,70', '3,10 m', '95']) expect(alturaNormalizada(basura)).toBe('')
  })
})

describe('modelos — el Instagram', () => {
  it('las tres formas de pegarlo dan el mismo usuario', () => {
    for (const escrito of ['@juana.perez', 'juana.perez', 'https://www.instagram.com/juana.perez?igshid=abc']) {
      expect(instagramNormalizado(escrito)).toBe('juana.perez')
    }
  })

  it('lo que no es un usuario ⛔ no se guarda a medias: vuelve vacío', () => {
    expect(instagramNormalizado('juana perez')).toBe('')
    expect(instagramNormalizado('no sé')).toBe('')
    expect(instagramNormalizado('')).toBe('')
  })
})

describe('modelos — las medidas', () => {
  it('🔴 un campo vacío es AUSENTE y ⛔ nunca 0', () => {
    expect(medidasNormalizadas({ busto: '', cintura: null, cadera: undefined })).toEqual({})
    // El caso que muerde: `Number('')` es 0 y un 0 escribiría «cintura 0 cm».
    expect(medidasNormalizadas({ cintura: '' })).not.toHaveProperty('cintura')
  })

  it('acepta coma decimal y redondea; lo de afuera de rango es un tipeo y se descarta', () => {
    expect(medidasNormalizadas({ busto: '88,4', calzado: '37' })).toEqual({ busto: 88, calzado: 37 })
    expect(medidasNormalizadas({ busto: '8', cadera: '900', calzado: '2' })).toEqual({})
  })
})

describe('modelos — qué se puede guardar', () => {
  it('lo único obligatorio es el nombre', () => {
    expect(motivoModeloInvalido({ nombre: 'Juana' })).toBeNull()
    expect(motivoModeloInvalido({ nombre: '   ' })).toMatch(/nombre/i)
    expect(motivoModeloInvalido(null)).toBeTruthy()
  })

  it('⛔ no se guarda un estado inventado ni un Instagram que no es un usuario', () => {
    expect(motivoModeloInvalido({ nombre: 'Juana', estado: 'de vacaciones' })).toMatch(/Estado/)
    expect(motivoModeloInvalido({ nombre: 'Juana', instagram: 'juana perez' })).toMatch(/Instagram/)
    expect(motivoModeloInvalido({ nombre: 'Juana', altura: '95' })).toMatch(/altura/i)
  })

  it('un talle sin anotar ⛔ no frena la ficha: la modelo se carga antes de venir', () => {
    expect(motivoModeloInvalido({ nombre: 'Juana', talle: '' })).toBeNull()
  })

  it('los estados son dos, y ninguno dice nada sobre la persona', () => {
    expect(ESTADOS.map((e) => e.key)).toEqual(['activa', 'archivada'])
  })
})

describe('modelos — quién la representa', () => {
  it('las tres vacías quieren decir DIRECTA', () => {
    expect(esDirecta(modelo())).toBe(true)
    expect(esDirecta(modelo({ agencia: 'Multitalent' }))).toBe(false)
    expect(esDirecta(modelo({ booker: 'Sofi' }))).toBe(false)
    expect(esDirecta(modelo({ bookerContacto: '3834 00 00 00' }))).toBe(false)
  })
})

describe('modelos — el duplicado avisa, no bloquea', () => {
  const padron = [modelo({ id: 'mo1', nombre: 'Juana Pérez', instagram: 'juanap' })]

  it('encuentra la misma persona escrita sin tildes y en minúscula', () => {
    expect(fichaQueChoca({ nombre: 'juana perez' }, padron)?.id).toBe('mo1')
  })

  it('el Instagram es la llave fuerte: caza aunque el nombre sea otro', () => {
    expect(fichaQueChoca({ nombre: 'Juanita', instagram: '@juanap' }, padron)?.id).toBe('mo1')
  })

  it('⛔ no choca consigo misma cuando se está editando', () => {
    expect(fichaQueChoca({ id: 'mo1', nombre: 'Juana Pérez' }, padron)).toBeNull()
  })

  it('claveDeNombre saca tildes, mayúsculas y dobles espacios', () => {
    expect(claveDeNombre('  Juana   PÉREZ ')).toBe('juana perez')
  })
})

describe('modelos — la lista', () => {
  it('🔴 `marcas` vacío quiere decir LAS DOS, ⛔ no ninguna', () => {
    expect(esDeLaMarca(modelo(), 'bdi')).toBe(true)
    expect(esDeLaMarca(modelo(), 'zattia')).toBe(true)
    expect(esDeLaMarca(modelo({ marcas: ['zattia'] }), 'bdi')).toBe(false)
  })

  it('las activas van primero y después por nombre', () => {
    const lista = [
      modelo({ id: 'a', nombre: 'Zoe' }),
      modelo({ id: 'b', nombre: 'Ana', estado: 'archivada' }),
      modelo({ id: 'c', nombre: 'Bianca' }),
    ]
    expect(ordenarModelos(lista).map((m) => m.id)).toEqual(['c', 'a', 'b'])
  })

  it('la búsqueda encuentra por Instagram, agencia y talle, no sólo por nombre', () => {
    const lista = [
      modelo({ id: 'a', nombre: 'Zoe', instagram: 'zoezoe' }),
      modelo({ id: 'b', nombre: 'Ana', agencia: 'Multitalent' }),
      modelo({ id: 'c', nombre: 'Bianca', talle: 'M' }),
    ]
    expect(filtrarModelos(lista, 'zoezoe').map((m) => m.id)).toEqual(['a'])
    expect(filtrarModelos(lista, 'multi').map((m) => m.id)).toEqual(['b'])
    expect(filtrarModelos(lista, '').map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })
})

/**
 * A quién se le puede ofrecer una ficha cuando se carga una sesión de fotos. Vive en el núcleo `.js`
 * y ⛔ no en `core.ts` porque **el handler la corre** para armar la lista corta: escrita dos veces
 * sería exactamente lo que ya pasó con el talle.
 */
describe('modelos — a quién se puede elegir en una sesión', () => {
  const m = (over: Partial<Modelo> = {}): Pick<Modelo, 'estado' | 'marcas'> => ({
    estado: 'activa',
    marcas: [],
    ...over,
  })

  it('🔴 `marcas` vacío quiere decir LAS DOS, ⛔ no «ninguna»', () => {
    expect(esDeLaMarca(m(), 'bdi')).toBe(true)
    expect(esDeLaMarca(m(), 'zattia')).toBe(true)
    expect(esDeLaMarca(m({ marcas: ['zattia'] }), 'bdi')).toBe(false)
  })

  it('la archivada sale de la lista de a quién llamar, y por eso ⛔ no se ofrece', () => {
    expect(esElegible(m({ estado: 'archivada' }), 'bdi')).toBe(false)
    expect(esElegible(m(), 'bdi')).toBe(true)
  })

  /** ⚠️ Sin talle igual se elige: el talle se tipea en la sesión. Exigirlo escondería a la modelo. */
  it('una ficha a medio cargar se ofrece igual', () => {
    expect(esElegible(m({ talle: null, altura: null }), 'bdi')).toBe(true)
  })
})
