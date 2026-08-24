import { describe, expect, it } from 'vitest'
import {
  aplicarEstadoALote,
  conteos,
  etiquetaPuntaje,
  filtrarDisenos,
  marcarEnviados,
  normalizarDiseno,
  ordenar,
  pesadas,
  podarSeleccion,
  quitarLote,
} from '../lib/disenos/core'
import { ranking, resumen } from '../lib/disenos/votacion.core.js'
import type { Diseno } from '../lib/disenos/tipos'
import type { PuntajesDeRonda } from '../lib/disenos/votacion'

const D = (over: Partial<Diseno>): Diseno => ({ id: 'x', name: '', url: 'data:,', estado: 'revisar', ...over })
const nid = () => 'NUEVO'

describe('normalizarDiseno', () => {
  // 🔴 El test más caro de la sección. Si un campo viejo sobrevive a la lectura, el diff de
  // persistencia ve los 37 diseños como cambiados y devuelve el tablero entero —con las fotos en
  // base64— a la base en cada entrada. Molde: la barrera de salida de `paraElVotante`.
  it('deja EXACTAMENTE los campos vivos: los up/down/nota de las filas viejas no pasan', () => {
    const fila = { id: 'a', name: 'Cerezas', url: 'https://x/y.jpg', estado: 'confirmado', up: 7, down: 2, nota: 'linda' }
    const out = normalizarDiseno(fila, nid)!
    expect(Object.keys(out).sort()).toEqual(['estado', 'id', 'name', 'url'])
  })

  it('un estado que no conoce cae en revisar, y sin url devuelve null', () => {
    expect(normalizarDiseno({ id: 'a', url: 'data:,', estado: 'raro' }, nid)!.estado).toBe('revisar')
    expect(normalizarDiseno({ id: 'a', estado: 'confirmado' }, nid)).toBeNull()
    expect(normalizarDiseno({ id: 'a', url: '' }, nid)).toBeNull()
    expect(normalizarDiseno(null, nid)).toBeNull()
  })

  it('sin id inventa uno, y el name que no es texto queda vacío', () => {
    const out = normalizarDiseno({ url: 'data:,', name: 42 }, nid)!
    expect(out.id).toBe('NUEVO')
    expect(out.name).toBe('')
  })

  it('conserva enviados cuando tiene forma, y descarta el que no la tiene sin tirar', () => {
    const envio = { ingresoId: 'g1', ingresoDesc: 'Diciembre', bloqueId: 'b1', columnaId: 'c1', fecha: '2026-08-24', por: 'Bruno' }
    expect(normalizarDiseno({ id: 'a', url: 'data:,', enviados: [envio] }, nid)!.enviados).toEqual([envio])
    // Sin `ingresoId` no identifica nada: no entra, y sobre todo no rompe la lectura del tablero.
    expect(normalizarDiseno({ id: 'a', url: 'data:,', enviados: [{ bloqueId: 'b1' }, null, 'x'] }, nid)!.enviados).toBeUndefined()
    expect(normalizarDiseno({ id: 'a', url: 'data:,', enviados: 'no soy un array' }, nid)!.enviados).toBeUndefined()
  })
})

describe('ordenar', () => {
  const arr = [
    D({ id: 'a', name: 'Beta' }),
    D({ id: 'b', name: 'Alfa' }),
    D({ id: 'c', name: 'Gama' }),
    D({ id: 'd', name: 'Delta' }),
  ]
  const puntajes: PuntajesDeRonda = {
    a: { n: 9, promedio: 4.5 },
    b: { n: 1, promedio: 4.5 },
    c: { n: 8, promedio: 5 },
    // 'd' no está: nadie lo votó
  }

  it('no muta el array de entrada', () => {
    const copia = arr.slice()
    ordenar(arr, 'nombre')
    expect(arr).toEqual(copia)
  })

  it('puntaje: el mejor primero, y el que nadie votó SIEMPRE al final', () => {
    expect(ordenar(arr, 'puntaje', puntajes).map((d) => d.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('puntaje sin ninguna ronda: todos son "sin votos" y cae al nombre, como ranking()', () => {
    // No es el orden de carga a propósito: con todos empatados en `null`, `ranking()` desempata
    // por nombre, y las dos reglas tienen que ser la misma. Un orden estable también evita que la
    // grilla baile entre recargas.
    expect(ordenar(arr, 'puntaje', null).map((d) => d.id)).toEqual(['b', 'a', 'd', 'c'])
  })

  // 🔑 Si la grilla y la tabla de resultados desempataran distinto, dirían cosas distintas del
  // mismo lote — que es el defecto que esta sección vino a cerrar.
  it('puntaje desempata IGUAL que ranking(): por cantidad de votos, después por nombre', () => {
    const ronda = { disenos: arr.map((d) => ({ id: d.id, name: d.name, url: d.url })) }
    const boletas: { nombre: string; puntajes: Record<string, number> }[] = [
      { nombre: 'uno', puntajes: { a: 4, b: 5, c: 5 } },
      { nombre: 'dos', puntajes: { a: 5, c: 5 } },
    ]
    const enElRanking = ranking(resumen(ronda, boletas)).map((d: { id: string }) => d.id)
    const puntajesDeEsaRonda: PuntajesDeRonda = Object.fromEntries(
      resumen(ronda, boletas).map((d: { id: string; n: number; promedio: number | null }) => [d.id, { n: d.n, promedio: d.promedio }]),
    )
    expect(ordenar(arr, 'puntaje', puntajesDeEsaRonda).map((d) => d.id)).toEqual(enElRanking)
  })

  it('nombre ordena en español; carga deja como viene', () => {
    expect(ordenar(arr, 'nombre').map((d) => d.id)).toEqual(['b', 'a', 'd', 'c'])
    expect(ordenar(arr, 'carga').map((d) => d.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('etiquetaPuntaje', () => {
  // 🔑 En una escala de 1 a 5 un cero no es "sin datos": es la peor nota. Quien pinta el
  // resultado —la tarjeta y el PDF— tiene que decir "sin votos" con todas las letras.
  it('sin votos lo dice con todas las letras, y NUNCA imprime un cero', () => {
    for (const pt of [undefined, null, { n: 0, promedio: null }]) {
      const txt = etiquetaPuntaje(pt)
      expect(txt).toBe('sin votos')
      expect(txt).not.toContain('0')
      expect(txt).not.toContain('★')
    }
  })

  it('con votos usa coma decimal y dice cuántos', () => {
    expect(etiquetaPuntaje({ n: 7, promedio: 4.25 })).toBe('★ 4,3 (7)')
    expect(etiquetaPuntaje({ n: 1, promedio: 5 })).toBe('★ 5,0 (1)')
  })
})

describe('filtrar y contar', () => {
  const arr = [
    D({ id: 'a', name: 'Cerezas', estado: 'revisar' }),
    D({ id: 'b', name: 'Corazón', estado: 'confirmado' }),
    D({ id: 'c', name: 'Mariposa', estado: 'revisar' }),
  ]

  it('conteos devuelve los cuatro estados en cero cuando no hay nada', () => {
    // Los chips imprimen el número: un `undefined` ahí se ve como un hueco, no como un cero.
    expect(conteos([])).toEqual({ todos: 0, revisar: 0, confirmado: 0, duda: 0, rechazado: 0 })
  })

  it('conteos cuenta por estado y el total', () => {
    expect(conteos(arr)).toEqual({ todos: 3, revisar: 2, confirmado: 1, duda: 0, rechazado: 0 })
  })

  it('la búsqueda ignora acentos y mayúsculas', () => {
    expect(filtrarDisenos(arr, { q: 'corazon' }).map((d) => d.id)).toEqual(['b'])
    expect(filtrarDisenos(arr, { q: 'CEREZ' }).map((d) => d.id)).toEqual(['a'])
  })

  it('q vacío y estado "todos" no filtran nada', () => {
    expect(filtrarDisenos(arr, { q: '  ', estado: 'todos' })).toHaveLength(3)
  })

  it('el estado y el texto se cruzan', () => {
    expect(filtrarDisenos(arr, { q: 'a', estado: 'revisar' }).map((d) => d.id)).toEqual(['a', 'c'])
  })
})

describe('acciones en lote', () => {
  const arr = [D({ id: 'a' }), D({ id: 'b', estado: 'duda' }), D({ id: 'c' })]

  it('aplicarEstadoALote toca sólo los ids dados y no muta', () => {
    const copia = arr.slice()
    const out = aplicarEstadoALote(arr, new Set(['a', 'c']), 'confirmado')
    expect(out.map((d) => d.estado)).toEqual(['confirmado', 'duda', 'confirmado'])
    expect(arr).toEqual(copia)
  })

  it('un id que no existe se ignora, y una selección vacía devuelve el mismo array', () => {
    expect(aplicarEstadoALote(arr, new Set(['zzz']), 'confirmado').map((d) => d.estado)).toEqual(['revisar', 'duda', 'revisar'])
    expect(aplicarEstadoALote(arr, new Set(), 'confirmado')).toBe(arr)
  })

  it('quitarLote saca sólo lo pedido', () => {
    expect(quitarLote(arr, new Set(['b'])).map((d) => d.id)).toEqual(['a', 'c'])
  })

  // 🔑 Sin esto, tildar 12 y cambiar de chip deja el botón diciendo "Confirmar los 12" sobre cosas
  // que ya no están en pantalla.
  it('podarSeleccion recorta a lo visible', () => {
    expect([...podarSeleccion(new Set(['a', 'b', 'c']), [D({ id: 'a' })])]).toEqual(['a'])
  })

  it('podarSeleccion devuelve el MISMO Set cuando no hay nada que podar', () => {
    // Identidad, no igualdad: se usa como dependencia de efectos y un Set nuevo cada vez los
    // dispararía en loop.
    const sel = new Set(['a'])
    expect(podarSeleccion(sel, arr)).toBe(sel)
    expect(podarSeleccion(new Set(), [])).toEqual(new Set())
  })
})

describe('pesadas y marcarEnviados', () => {
  it('pesadas detecta las data URL y no marca las del Blob', () => {
    const arr = [D({ id: 'a', url: 'data:image/jpeg;base64,AAA' }), D({ id: 'b', url: 'https://blob/x.jpg' })]
    expect(pesadas(arr).map((d) => d.id)).toEqual(['a'])
  })

  const envio = { ingresoId: 'g1', ingresoDesc: 'Diciembre', bloqueId: 'b1', columnaId: 'c1', fecha: '2026-08-24', por: 'Bruno' }

  it('marcarEnviados es inmutable y sólo toca los marcados', () => {
    const arr = [D({ id: 'a' }), D({ id: 'b' })]
    const out = marcarEnviados(arr, [{ id: 'a', envio }])
    expect(out[0].enviados).toEqual([envio])
    expect(out[1].enviados).toBeUndefined()
    expect(arr[0].enviados).toBeUndefined()
  })

  it('no duplica el mismo envío, y sí acumula el de otra importación', () => {
    const arr = [D({ id: 'a', enviados: [envio] })]
    expect(marcarEnviados(arr, [{ id: 'a', envio }])[0].enviados).toHaveLength(1)
    const otro = { ...envio, ingresoId: 'g2', columnaId: 'c9' }
    expect(marcarEnviados(arr, [{ id: 'a', envio: otro }])[0].enviados).toHaveLength(2)
  })
})
