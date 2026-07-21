import { describe, it, expect } from 'vitest'
import { normalizar, nuevoUsuario, tienePermiso, toggleFuncion, togglePerm, validar } from '@/lib/usuarios/core'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'

const base = (over: Partial<UsuarioConfig> = {}): UsuarioConfig => ({ name: 'Ana', pass: '1234', admin: false, cuenta: null, acceso: { bdi: {}, zattia: {} }, ...over })

describe('usuarios/core — nuevoUsuario / normalizar', () => {
  it('nuevoUsuario arranca vacío y sin permisos', () => {
    expect(nuevoUsuario()).toEqual({ name: '', pass: '', admin: false, cuenta: null, acceso: { bdi: {}, zattia: {} }, funcion: [] })
  })
  it('normalizar rellena acceso.bdi/zattia si faltan', () => {
    const u = normalizar({ name: 'X', pass: 'y', admin: false, cuenta: null, acceso: {} as UsuarioConfig['acceso'] })
    expect(u.acceso.bdi).toEqual({})
    expect(u.acceso.zattia).toEqual({})
  })
})

describe('usuarios/core — togglePerm (relación padre/sub)', () => {
  it('marcar un SUB marca también el padre', () => {
    const u = togglePerm(base(), 'bdi', 'etiquetas.dep', true)
    expect(u.acceso.bdi?.['etiquetas.dep']).toBe(true)
    expect(u.acceso.bdi?.['etiquetas']).toBe(true) // el padre se marca solo
  })
  it('desmarcar el PADRE borra todos sus subs', () => {
    let u = togglePerm(base(), 'bdi', 'etiquetas.dep', true)
    u = togglePerm(u, 'bdi', 'etiquetas.loc', true)
    expect(Object.keys(u.acceso.bdi ?? {}).sort()).toEqual(['etiquetas', 'etiquetas.dep', 'etiquetas.loc'])
    u = togglePerm(u, 'bdi', 'etiquetas', false) // desmarco el padre
    expect(u.acceso.bdi?.['etiquetas']).toBeUndefined()
    expect(u.acceso.bdi?.['etiquetas.dep']).toBeUndefined()
    expect(u.acceso.bdi?.['etiquetas.loc']).toBeUndefined()
  })
  it('es inmutable y no toca la otra marca', () => {
    const u0 = base()
    const u1 = togglePerm(u0, 'bdi', 'productos', true)
    expect(u0.acceso.bdi?.['productos']).toBeUndefined() // el original no cambia
    expect(u1.acceso.zattia).toEqual({}) // la otra marca intacta
  })
})

describe('usuarios/core — tienePermiso', () => {
  it('el admin ve todo; el resto según acceso', () => {
    expect(tienePermiso(base({ admin: true }), 'bdi', 'lo-que-sea')).toBe(true)
    expect(tienePermiso(base({ acceso: { bdi: { productos: true }, zattia: {} } }), 'bdi', 'productos')).toBe(true)
    expect(tienePermiso(base(), 'bdi', 'productos')).toBe(false)
  })
})

describe('usuarios/core — funcion', () => {
  it('nuevoUsuario arranca con funcion vacía', () => {
    expect(nuevoUsuario().funcion).toEqual([])
  })
  it('normalizar rellena funcion faltante a []', () => {
    expect(normalizar(base()).funcion).toEqual([])
  })
  it('toggleFuncion agrega y quita sin duplicar', () => {
    let u = base({ funcion: [] })
    u = toggleFuncion(u, 'local', true)
    expect(u.funcion).toEqual(['local'])
    u = toggleFuncion(u, 'local', true) // idempotente
    expect(u.funcion).toEqual(['local'])
    u = toggleFuncion(u, 'deposito', true)
    expect(u.funcion).toEqual(['local', 'deposito'])
    u = toggleFuncion(u, 'local', false)
    expect(u.funcion).toEqual(['deposito'])
  })
})

describe('usuarios/core — validar', () => {
  it('exige al menos un admin', () => {
    expect(validar([base({ admin: false })])).toBe('Tiene que quedar al menos un administrador.')
  })
  it('exige nombre y contraseña en todos', () => {
    expect(validar([base({ admin: true }), base({ name: '', pass: '' })])).toBe('Todos los usuarios necesitan nombre y contraseña.')
  })
  it('rechaza nombres repetidos', () => {
    expect(validar([base({ name: 'Ana', admin: true }), base({ name: 'Ana' })])).toBe('Hay nombres de usuario repetidos.')
  })
  it('config válida → null', () => {
    expect(validar([base({ name: 'Ana', admin: true }), base({ name: 'Beto' })])).toBeNull()
  })
})
