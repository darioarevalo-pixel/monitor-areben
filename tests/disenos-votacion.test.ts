import { describe, expect, it } from 'vitest'
import {
  MAX_PUNTAJE,
  TOPE_PUNTAJES,
  paraElVotante,
  promedio,
  quienesVotaron,
  ranking,
  resumen,
  resumenLiviano,
  sanearPuntajes,
  sinNingunVoto,
  snapshotDeRonda,
} from '../lib/disenos/votacion.core.js'

/**
 * La barrera de verdad: `paraElVotante` es lo último que corre antes de que algo salga a internet.
 * Se le pasa una ronda con todo lo interno adentro y se verifica que no aparezca. Molde:
 * `tests/reclamo-publico.test.ts`.
 */
describe('paraElVotante — lo que NO sale al link', () => {
  const sucia = {
    titulo: 'Verano',
    id: 'r1',
    store: 'bdi',
    token: 'a'.repeat(64),
    disenos: [
      {
        id: 'd1',
        name: 'Palmera',
        url: 'https://blob/x.jpg',
        nota: 'Al gerente no le gusta el verde',
        estado: 'duda',
        up: 7,
        down: 2,
        costo: 4200,
      },
    ],
  }

  it('deja pasar exactamente tres campos por diseño', () => {
    const salida = paraElVotante(sucia)
    expect(Object.keys(salida.disenos[0]).sort()).toEqual(['id', 'name', 'url'])
  })

  it('no filtra la nota, el estado, los 👍/👎 ni nada de plata', () => {
    const plano = JSON.stringify(paraElVotante(sucia))
    for (const secreto of ['gerente', 'duda', '4200', 'nota', 'estado', 'costo', 'token']) {
      expect(plano).not.toContain(secreto)
    }
    // Y el token de la ronda tampoco, aunque venga en la fila.
    expect(plano).not.toContain('a'.repeat(64))
  })

  it('aguanta una ronda vacía o rota sin explotar', () => {
    expect(paraElVotante({}).disenos).toEqual([])
    expect(paraElVotante({ disenos: [null, { name: 'sin id' }] } as never).disenos).toEqual([])
  })
})

describe('snapshotDeRonda — el mismo recorte, al crear', () => {
  const tablero = [
    { id: 'a', name: 'Uno', url: 'u1', nota: 'interna', estado: 'revisar', up: 3, down: 0 },
    { id: 'b', name: 'Dos', url: 'u2', nota: 'otra', estado: 'confirmado', up: 0, down: 1 },
  ]
  it('se queda con los elegidos y sólo con id/name/url', () => {
    expect(snapshotDeRonda(tablero, ['b'])).toEqual([{ id: 'b', name: 'Dos', url: 'u2' }])
  })
  it('un id que no está en el tablero no inventa una fila', () => {
    expect(snapshotDeRonda(tablero, ['z'])).toEqual([])
  })
})

describe('sanearPuntajes — lo que entra del portal', () => {
  const ids = ['a', 'b']
  it('acepta enteros de 1 a MAX', () => {
    expect(sanearPuntajes({ a: 1, b: MAX_PUNTAJE }, ids)).toEqual({ a: 1, b: MAX_PUNTAJE })
  })
  it('rechaza fuera de escala, decimales y basura', () => {
    expect(sanearPuntajes({ a: 0 }, ids)).toEqual({})
    expect(sanearPuntajes({ a: MAX_PUNTAJE + 1 }, ids)).toEqual({})
    expect(sanearPuntajes({ a: -3 }, ids)).toEqual({})
    expect(sanearPuntajes({ a: 3.5 }, ids)).toEqual({})
    expect(sanearPuntajes({ a: null }, ids)).toEqual({})
    expect(sanearPuntajes({ a: 'muchas' }, ids)).toEqual({})
  })
  it("acepta el número que llega como texto ('3' → 3)", () => {
    expect(sanearPuntajes({ a: '3' }, ids)).toEqual({ a: 3 })
  })
  it('descarta ids que no son de ESTA ronda', () => {
    expect(sanearPuntajes({ a: 4, intruso: 5 }, ids)).toEqual({ a: 4 })
  })
  it('no acepta cualquier cosa en vez de un objeto', () => {
    expect(sanearPuntajes(null, ids)).toEqual({})
    expect(sanearPuntajes([1, 2, 3], ids)).toEqual({})
    expect(sanearPuntajes('hola', ids)).toEqual({})
  })
  it('corta en el tope de puntajes por boleta', () => {
    const muchos = Array.from({ length: TOPE_PUNTAJES + 50 }, (_, i) => [`d${i}`, 3])
    const todos = muchos.map(([id]) => String(id))
    expect(Object.keys(sanearPuntajes(Object.fromEntries(muchos), todos)).length).toBe(TOPE_PUNTAJES)
  })
})

describe('promedio — el cero afirma, la ausencia no', () => {
  it('sin votos devuelve null, NO cero', () => {
    expect(promedio([])).toBeNull()
  })
  it('promedia lo que hay', () => {
    expect(promedio([5, 4])).toBe(4.5)
    expect(promedio([3])).toBe(3)
  })
})

describe('resumen y ranking', () => {
  const ronda = {
    titulo: 't',
    disenos: [
      { id: 'a', name: 'Alfa', url: 'u' },
      { id: 'b', name: 'Beta', url: 'u' },
      { id: 'c', name: 'Gama', url: 'u' },
      { id: 'z', name: 'Zeta', url: 'u' },
    ],
  }
  const boletas: { nombre: string; puntajes: Record<string, number> }[] = [
    { nombre: 'Ana', puntajes: { a: 5, b: 4, c: 4 } },
    { nombre: 'Leo', puntajes: { a: 4, b: 4 } },
    { nombre: 'Ana', puntajes: { a: 5 } }, // mismo nombre, otra boleta: no se repite en la lista
  ]

  it('cuenta votos y arma la distribución', () => {
    const r = resumen(ronda, boletas)
    const a = r.find((d) => d.id === 'a')!
    expect(a.n).toBe(3)
    expect(a.promedio).toBeCloseTo(14 / 3)
    expect(a.distribucion).toEqual([0, 0, 0, 1, 2]) // un 4 y dos 5
  })

  it('un diseño que nadie votó queda en null y con n = 0', () => {
    const z = resumen(ronda, boletas).find((d) => d.id === 'z')!
    expect(z.n).toBe(0)
    expect(z.promedio).toBeNull()
  })

  it('ignora puntajes de ids que no están en la ronda', () => {
    const r = resumen(ronda, [{ nombre: 'X', puntajes: { fantasma: 5 } }])
    expect(r.every((d) => d.n === 0)).toBe(true)
  })

  it('ranking: los sin votos van al final, aunque el resto tenga promedio bajo', () => {
    const flojo = resumen({ disenos: [{ id: 'a', name: 'A', url: 'u' }, { id: 'z', name: 'Z', url: 'u' }] }, [
      { nombre: 'Ana', puntajes: { a: 1 } },
    ])
    expect(ranking(flojo).map((d) => d.id)).toEqual(['a', 'z'])
  })

  it('ranking: con el mismo promedio gana el que tiene más votos', () => {
    const r = resumen({ disenos: [{ id: 'p', name: 'P', url: 'u' }, { id: 'q', name: 'Q', url: 'u' }] }, [
      { nombre: '1', puntajes: { p: 4, q: 4 } },
      { nombre: '2', puntajes: { p: 4 } },
    ])
    expect(ranking(r).map((d) => d.id)).toEqual(['p', 'q'])
  })

  it('sinNingunVoto cuenta los que quedaron afuera', () => {
    expect(sinNingunVoto(resumen(ronda, boletas))).toBe(1) // sólo 'z'
  })

  it('quienesVotaron: sin repetir, ordenado, y sin rellenar los vacíos', () => {
    expect(quienesVotaron(boletas)).toEqual(['Ana', 'Leo'])
    expect(quienesVotaron([{ nombre: '  ' }, {}])).toEqual([])
  })
})

/**
 * La OTRA barrera de este archivo. `paraElVotante` recorta por privacidad; `resumenLiviano` recorta
 * por **peso**, y las dos existen por el mismo motivo de fondo: lo que sale se arma campo por
 * campo, nunca con un spread.
 *
 * El snapshot de la ronda congela la `url` tal cual estaba, y los diseños viejos la tienen en
 * base64 (9 de los 37 de BDI, medido el 24-ago-2026). El ★ tiene que estar en cada tarjeta del
 * tablero, o sea que esto se pide **al entrar a la sección** — si se llevara las fotos, se
 * pagarían enteras en cada entrada, en cada cambio de pestaña y en cada cambio de marca.
 */
describe('resumenLiviano — lo que cuesta el ★ de cada tarjeta', () => {
  const conBase64 = {
    disenos: [
      { id: 'a', name: 'Cerezas', url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ' },
      { id: 'b', name: 'Mariposa', url: 'https://blob.vercel-storage.com/disenos/x.jpg' },
    ],
  }
  const boletas = [
    { nombre: 'Ana', puntajes: { a: 5 } },
    { nombre: 'Leo', puntajes: { a: 4 } },
  ]

  it('cada diseño trae EXACTAMENTE n y promedio', () => {
    const out = resumenLiviano(conBase64, boletas)
    expect(Object.keys(out).sort()).toEqual(['a', 'b'])
    expect(Object.keys(out.a).sort()).toEqual(['n', 'promedio'])
    expect(out.a).toEqual({ n: 2, promedio: 4.5 })
  })

  it('🔴 la foto NO sale: ni la data URL ni la del Blob', () => {
    const crudo = JSON.stringify(resumenLiviano(conBase64, boletas))
    expect(crudo).not.toContain('data:')
    expect(crudo).not.toContain('base64')
    expect(crudo).not.toContain('blob.vercel-storage.com')
    expect(crudo).not.toContain('Cerezas')
  })

  it('el que nadie votó dice null, ⛔ nunca 0', () => {
    expect(resumenLiviano(conBase64, boletas).b).toEqual({ n: 0, promedio: null })
    expect(resumenLiviano(conBase64, []).a).toEqual({ n: 0, promedio: null })
  })

  it('una ronda sin diseños devuelve un objeto vacío y no se cae', () => {
    expect(resumenLiviano({}, [])).toEqual({})
    expect(resumenLiviano({ disenos: [] }, boletas)).toEqual({})
  })
})
