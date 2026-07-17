import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BANCO_SEMILLA, agregarMensaje, borrarMensaje, editarMensaje, semillaFresca, type GrupoMensajes } from '@/lib/crm/banco'

const RAIZ = join(import.meta.dirname, '..')

/**
 * La semilla se compara contra el legacy en vez de confiar en que se copió bien:
 * es lo que TODO el mundo ve hoy, porque `mensajes:bdi` no existe en el KV.
 */
describe('la semilla es la del legacy', () => {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')

  it('tiene los mismos grupos, en el mismo orden', () => {
    const enLegacy = [...html.matchAll(/\{ grupo: '([^']+)', mensajes: \[/g)].map((m) => m[1])
    expect(enLegacy.length).toBeGreaterThan(0) // si el regex deja de matchear, el test no prueba nada
    expect(BANCO_SEMILLA.map((g) => g.grupo)).toEqual(enLegacy)
  })

  it('tiene la misma cantidad de mensajes por grupo', () => {
    const bloque = html.slice(html.indexOf('const BANCO_MENSAJES = ['))
    const legacy = bloque.slice(0, bloque.indexOf('\n];'))
    // Cuenta los mensajes de cada grupo por las líneas que abren con comilla simple.
    const porGrupo = legacy
      .split(/\{ grupo: '[^']+', mensajes: \[/)
      .slice(1)
      .map((s) => (s.match(/^\s+'/gm) || []).length)
    expect(BANCO_SEMILLA.map((g) => g.mensajes.length)).toEqual(porGrupo)
  })

  it('semillaFresca devuelve copias, no la referencia (el legacy hace JSON.parse(JSON.stringify))', () => {
    const a = semillaFresca()
    a[0].mensajes[0] = 'pisado'
    expect(semillaFresca()[0].mensajes[0]).not.toBe('pisado')
    expect(BANCO_SEMILLA[0].mensajes[0]).not.toBe('pisado')
  })
})

describe('operaciones del banco', () => {
  const base = (): GrupoMensajes[] => [
    { grupo: 'A', mensajes: ['a1', 'a2'] },
    { grupo: 'B', mensajes: ['b1'] },
  ]

  it('editar cambia solo ese mensaje', () => {
    expect(editarMensaje(base(), 0, 1, 'nuevo')).toEqual([
      { grupo: 'A', mensajes: ['a1', 'nuevo'] },
      { grupo: 'B', mensajes: ['b1'] },
    ])
  })

  it('editar con texto vacío BORRA el mensaje (no guarda uno en blanco)', () => {
    // El legacy delega en bancoBorrar con silent=true (14325): sin confirmación.
    expect(editarMensaje(base(), 0, 0, '   ')).toEqual([
      { grupo: 'A', mensajes: ['a2'] },
      { grupo: 'B', mensajes: ['b1'] },
    ])
  })

  it('editar trimea', () => {
    expect(editarMensaje(base(), 1, 0, '  hola  ')[1].mensajes[0]).toBe('hola')
  })

  it('borrar saca solo ese mensaje', () => {
    expect(borrarMensaje(base(), 0, 0)[0].mensajes).toEqual(['a2'])
  })

  it('agregar suma uno vacío al final', () => {
    expect(agregarMensaje(base(), 1)[1].mensajes).toEqual(['b1', ''])
  })

  it('no muta el banco original (React necesita otra referencia)', () => {
    const orig = base()
    editarMensaje(orig, 0, 0, 'x')
    borrarMensaje(orig, 0, 0)
    agregarMensaje(orig, 0)
    expect(orig).toEqual(base())
  })
})
