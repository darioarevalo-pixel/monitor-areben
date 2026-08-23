import { describe, it, expect } from 'vitest'
import {
  agregarGrupo,
  agregarMensaje,
  borrarGrupo,
  borrarMensaje,
  completar,
  editarMensaje,
  moverGrupo,
  moverMensaje,
  normalizarBanco,
  renombrarGrupo,
  totalMensajes,
  type Banco,
} from '@/lib/crm/mensajes'

/**
 * El banco de mensajes vive en UNA clave del KV que se reescribe entera y cuyo servidor deja
 * pasar `[]`. La invariante que se prueba acá es la misma que en `crm-seguimiento`: **cada
 * operación toca exactamente lo que dice y no muta lo que recibe** — un banco mutado por
 * accidente es un guardado que sale con datos que nadie revisó.
 */

const BANCO: Banco = [
  { grupo: 'Dormidos', mensajes: ['Hola [Nombre]!', 'Tanto tiempo'] },
  { grupo: 'Postventa', mensajes: ['¿Cómo te fue?'] },
]

const clon = (b: Banco) => JSON.parse(JSON.stringify(b)) as Banco

describe('normalizarBanco', () => {
  it('lo que no es lista es banco vacío', () => {
    expect(normalizarBanco(null)).toEqual([])
    expect(normalizarBanco({ grupo: 'x' })).toEqual([])
    expect(normalizarBanco('[]')).toEqual([])
  })

  it('pone en forma lo que venga del KV sin tirar nada útil', () => {
    const raw = [
      { grupo: '  Dormidos  ', mensajes: ['uno', '', '   ', 'dos'] },
      { grupo: 'Sin lista' },
      null,
      { grupo: 'Números', mensajes: [1, 'dos'] },
    ]
    expect(normalizarBanco(raw)).toEqual([
      { grupo: 'Dormidos', mensajes: ['uno', 'dos'] },
      { grupo: 'Sin lista', mensajes: [] },
      { grupo: 'Números', mensajes: ['1', 'dos'] },
    ])
  })

  it('conserva los grupos vacíos: uno recién creado todavía no tiene mensajes', () => {
    expect(normalizarBanco([{ grupo: 'Nuevo', mensajes: [] }])).toHaveLength(1)
  })
})

describe('grupos', () => {
  it('agregar suma al final y no muta el banco de entrada', () => {
    const antes = clon(BANCO)
    const out = agregarGrupo(BANCO, '  Objeciones ')
    expect(out).toHaveLength(3)
    expect(out[2]).toEqual({ grupo: 'Objeciones', mensajes: [] })
    expect(BANCO).toEqual(antes)
  })

  it('un grupo sin nombre no se crea', () => {
    expect(agregarGrupo(BANCO, '   ')).toBe(BANCO)
  })

  it('renombrar cambia sólo ese grupo y le deja los mensajes', () => {
    const out = renombrarGrupo(BANCO, 1, 'Después de la compra')
    expect(out[1]).toEqual({ grupo: 'Después de la compra', mensajes: ['¿Cómo te fue?'] })
    expect(out[0]).toEqual(BANCO[0])
  })

  it('renombrar con vacío o con índice inexistente no hace nada', () => {
    expect(renombrarGrupo(BANCO, 1, '  ')).toBe(BANCO)
    expect(renombrarGrupo(BANCO, 9, 'X')).toBe(BANCO)
  })

  it('borrar se lleva el grupo con sus mensajes', () => {
    const out = borrarGrupo(BANCO, 0)
    expect(out).toHaveLength(1)
    expect(out[0].grupo).toBe('Postventa')
  })

  it('mover respeta los bordes en vez de tirar el grupo afuera', () => {
    expect(moverGrupo(BANCO, 0, -1)).toBe(BANCO)
    expect(moverGrupo(BANCO, 1, 1)).toBe(BANCO)
    expect(moverGrupo(BANCO, 0, 1).map((g) => g.grupo)).toEqual(['Postventa', 'Dormidos'])
  })
})

describe('mensajes', () => {
  it('agregar suma al final del grupo que corresponde', () => {
    const out = agregarMensaje(BANCO, 1, '  Gracias por la compra  ')
    expect(out[1].mensajes).toEqual(['¿Cómo te fue?', 'Gracias por la compra'])
    expect(out[0]).toEqual(BANCO[0])
  })

  it('un mensaje vacío no se agrega', () => {
    expect(agregarMensaje(BANCO, 0, '   ')).toBe(BANCO)
  })

  it('editar cambia sólo ese mensaje', () => {
    const out = editarMensaje(BANCO, 0, 1, 'Cuánto tiempo!')
    expect(out[0].mensajes).toEqual(['Hola [Nombre]!', 'Cuánto tiempo!'])
  })

  it('editar a vacío BORRA el mensaje: es lo que espera el que borró todo el texto', () => {
    const out = editarMensaje(BANCO, 0, 0, '   ')
    expect(out[0].mensajes).toEqual(['Tanto tiempo'])
  })

  it('borrar saca uno solo y deja el resto en orden', () => {
    const out = borrarMensaje(BANCO, 0, 0)
    expect(out[0].mensajes).toEqual(['Tanto tiempo'])
    expect(out[1]).toEqual(BANCO[1])
  })

  it('mover dentro del grupo respeta los bordes', () => {
    expect(moverMensaje(BANCO, 0, 0, -1)).toBe(BANCO)
    expect(moverMensaje(BANCO, 0, 1, 1)).toBe(BANCO)
    expect(moverMensaje(BANCO, 0, 1, -1)[0].mensajes).toEqual(['Tanto tiempo', 'Hola [Nombre]!'])
  })

  it('los índices que no existen no rompen ni cambian nada', () => {
    expect(borrarMensaje(BANCO, 0, 9)).toBe(BANCO)
    expect(editarMensaje(BANCO, 9, 0, 'x')).toBe(BANCO)
    expect(moverMensaje(BANCO, 9, 0, 1)).toBe(BANCO)
  })

  it('ninguna operación muta el banco de entrada', () => {
    const antes = clon(BANCO)
    agregarMensaje(BANCO, 0, 'x')
    editarMensaje(BANCO, 0, 0, 'y')
    borrarMensaje(BANCO, 0, 0)
    moverMensaje(BANCO, 0, 0, 1)
    borrarGrupo(BANCO, 0)
    moverGrupo(BANCO, 0, 1)
    expect(BANCO).toEqual(antes)
  })
})

describe('completar', () => {
  it('pone el nombre del cliente donde dice [Nombre]', () => {
    expect(completar('Hola [Nombre]! ¿Cómo va?', { nombre: 'Marcela' })).toBe('Hola Marcela! ¿Cómo va?')
  })

  it('reemplaza todas las apariciones, escrito como esté', () => {
    expect(completar('[Nombre], che [nombre]', { nombre: 'Ana' })).toBe('Ana, che Ana')
  })

  it('sin nombre DEJA el hueco a la vista: un "Hola ," se manda sin que nadie lo note', () => {
    expect(completar('Hola [Nombre]!', { nombre: null })).toBe('Hola [Nombre]!')
    expect(completar('Hola [Nombre]!', { nombre: '   ' })).toBe('Hola [Nombre]!')
  })

  it('no toca los huecos que se completan a mano', () => {
    const t = 'Llegaron [producto] de [categoría], hasta el [fecha]'
    expect(completar(t, { nombre: 'Ana' })).toBe(t)
  })
})

describe('totalMensajes', () => {
  it('cuenta los de todos los grupos', () => {
    expect(totalMensajes(BANCO)).toBe(3)
    expect(totalMensajes([])).toBe(0)
  })
})
