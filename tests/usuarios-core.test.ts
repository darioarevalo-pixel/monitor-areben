import { describe, it, expect } from 'vitest'
import { copiarPermisos, normalizar, nuevoUsuario, origenPermiso, tienePermiso, toggleFuncion, togglePerm, validar } from '@/lib/usuarios/core'
import { marcaExcluir } from '@/lib/permisos'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'

const base = (over: Partial<UsuarioConfig> = {}): UsuarioConfig => ({ name: 'Ana', pass: '1234', admin: false, cuenta: null, acceso: { bdi: {}, zattia: {} }, ...over })

describe('usuarios/core — nuevoUsuario / normalizar', () => {
  it('nuevoUsuario arranca vacío y sin permisos', () => {
    // `email` nace vacío: es lo que enlaza al usuario con su cuenta de Google, y un
    // usuario nuevo todavía no tiene ninguna (los puestos compartidos nunca la tienen).
    expect(nuevoUsuario()).toEqual({ name: '', pass: '', email: '', admin: false, cuenta: null, acceso: { bdi: {}, zattia: {} }, funcion: [] })
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

describe('usuarios/core — permisos que vienen por función', () => {
  const local = () => base({ funcion: ['local'] })

  it('lo que da la función aparece tildado sin estar en acceso', () => {
    const u = local()
    expect(tienePermiso(u, 'bdi', 'cupones')).toBe(true)
    expect(u.acceso.bdi?.['cupones']).toBeUndefined() // no se ensucia la config
    expect(origenPermiso(u, 'bdi', 'cupones')).toBe('funcion')
  })

  it('destildar algo de la función deja una EXCEPCIÓN (no hay nada que borrar)', () => {
    const u = togglePerm(local(), 'bdi', 'cupones', false)
    expect(u.acceso.bdi?.[marcaExcluir('cupones')]).toBe(true)
    expect(tienePermiso(u, 'bdi', 'cupones')).toBe(false)
    expect(origenPermiso(u, 'bdi', 'cupones')).toBe('excluido')
    expect(tienePermiso(u, 'zattia', 'cupones')).toBe(true) // la otra marca no se toca
  })

  it('volver a tildarlo saca la excepción sin dejar permiso redundante', () => {
    let u = togglePerm(local(), 'bdi', 'cupones', false)
    u = togglePerm(u, 'bdi', 'cupones', true)
    expect(u.acceso.bdi?.[marcaExcluir('cupones')]).toBeUndefined()
    expect(u.acceso.bdi?.['cupones']).toBeUndefined() // lo da la función: no hace falta tildarlo
    expect(tienePermiso(u, 'bdi', 'cupones')).toBe(true)
  })

  it('un sub sí se tilda explícito, y no le pone padre redundante si la función ya lo da', () => {
    const u = togglePerm(local(), 'bdi', 'cupones.crear', true)
    expect(u.acceso.bdi?.['cupones.crear']).toBe(true)
    expect(u.acceso.bdi?.['cupones']).toBeUndefined() // el padre viene por función
  })

  it('sin función, el sub sigue marcando al padre (comportamiento de siempre)', () => {
    const u = togglePerm(base(), 'bdi', 'cupones.crear', true)
    expect(u.acceso.bdi?.['cupones']).toBe(true)
  })
})

describe('usuarios/core — copiarPermisos', () => {
  it('copia una marca sobre la otra y no toca el origen', () => {
    const u0 = base({ acceso: { bdi: { productos: true, etiquetas: true }, zattia: { colores: true } } })
    const u1 = copiarPermisos(u0, 'bdi', 'zattia')
    expect(u1.acceso.zattia).toEqual({ productos: true, etiquetas: true })
    expect(u1.acceso.bdi).toEqual({ productos: true, etiquetas: true })
    expect(u0.acceso.zattia).toEqual({ colores: true }) // inmutable
  })
})

describe('usuarios/core — validar', () => {
  it('exige al menos un admin', () => {
    expect(validar([base({ admin: false })])).toBe('Tiene que quedar al menos un administrador.')
  })
  it('exige nombre en todos', () => {
    expect(validar([base({ admin: true }), base({ name: '', pass: '' })])).toBe('Todos los usuarios necesitan un nombre.')
  })
  // Desde el ingreso con Google, "sin contraseña" es un caso legítimo (se entra con el
  // mail) y las contraseñas ya no viajan al navegador. Lo que no puede pasar es que
  // alguien quede sin las dos cosas: esa cuenta no entra por ningún lado.
  it('rechaza a quien no tiene ni mail ni contraseña', () => {
    expect(validar([base({ admin: true }), base({ name: 'Beto', pass: '' })])).toBe(
      '"Beto" no tiene con qué entrar: ponele un mail (para Google) o una contraseña.',
    )
  })
  it('acepta a quien solo tiene mail (entra con Google)', () => {
    expect(validar([base({ name: 'Ana', admin: true }), base({ name: 'Beto', pass: '', email: 'beto@arebensrl.com' })])).toBeNull()
  })
  it('acepta a quien ya tenía contraseña guardada, aunque no se esté cambiando', () => {
    expect(validar([base({ name: 'Ana', admin: true }), base({ name: 'Beto', pass: '', tienePass: true })])).toBeNull()
  })
  it('rechaza nombres repetidos', () => {
    expect(validar([base({ name: 'Ana', admin: true }), base({ name: 'Ana' })])).toBe('Hay nombres de usuario repetidos.')
  })
  it('config válida → null', () => {
    expect(validar([base({ name: 'Ana', admin: true }), base({ name: 'Beto' })])).toBeNull()
  })
})
