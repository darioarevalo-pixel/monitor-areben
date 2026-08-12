import { describe, it, expect } from 'vitest'
import {
  copiarDeUsuario,
  copiarPermisos,
  normalizar,
  nuevoUsuario,
  origenPermiso,
  resumenUsuario,
  SUBS_PLANOS,
  tienePermiso,
  toggleFuncion,
  togglePerm,
  validar,
} from '@/lib/usuarios/core'
import { marcaExcluir } from '@/lib/permisos'
import { PERM_CAT } from '@/lib/nav'
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

describe('usuarios/core — copiarDeUsuario', () => {
  const molde = (over: Partial<UsuarioConfig> = {}) =>
    base({
      name: 'Candela',
      email: 'candela@arebensrl.com',
      pass: 'secreta',
      tienePass: true,
      nameOriginal: 'Candela',
      admin: false,
      cuenta: 'zattia',
      funcion: ['local'],
      acceso: { bdi: { cupones: true }, zattia: { etiquetas: true } },
      ...over,
    })

  it('copia permisos, funciones, marca fija y admin', () => {
    const u = copiarDeUsuario(nuevoUsuario(), molde())
    expect(u.acceso).toEqual({ bdi: { cupones: true }, zattia: { etiquetas: true } })
    expect(u.funcion).toEqual(['local'])
    expect(u.cuenta).toBe('zattia')
    expect(u.admin).toBe(false)
  })

  it('NO copia la identidad: nombre, mail ni contraseña', () => {
    const u = copiarDeUsuario({ ...nuevoUsuario(), name: 'Sofía' }, molde())
    expect(u.name).toBe('Sofía')
    expect(u.email).toBe('')
    expect(u.pass).toBe('')
    expect(u.tienePass).toBeUndefined()
    expect(u.nameOriginal).toBeUndefined()
  })

  it('es inmutable y los permisos no quedan compartidos con el molde', () => {
    const m = molde()
    const u = togglePerm(copiarDeUsuario(nuevoUsuario(), m), 'bdi', 'productos', true)
    expect(u.acceso.bdi?.['productos']).toBe(true)
    expect(m.acceso.bdi).toEqual({ cupones: true }) // el molde no se enteró
  })

  it('si el molde es admin, la copia también (y se ve en el resumen)', () => {
    const u = copiarDeUsuario(nuevoUsuario(), molde({ admin: true }))
    expect(u.admin).toBe(true)
    expect(resumenUsuario(u).esAdmin).toBe(true)
  })
})

describe('usuarios/core — SUBS_PLANOS', () => {
  it('tiene exactamente los subs de PERM_CAT, sin inventar ni perder ninguno', () => {
    const esperados = PERM_CAT.flatMap((c) => (c.subs ?? []).map((s) => `${c.key}.${s.key}`))
    expect(SUBS_PLANOS.map((s) => s.clave)).toEqual(esperados)
  })

  it('un sub sin brands propios hereda los de su sección', () => {
    const aprobar = SUBS_PLANOS.find((s) => s.clave === 'canjes.aprobar')!
    expect(aprobar.brands).toEqual(PERM_CAT.find((c) => c.key === 'canjes')!.brands)
  })

  it('un sub con brands propios los respeta (Tienda Nube: categorías es sólo de BDI)', () => {
    expect(SUBS_PLANOS.find((s) => s.clave === 'tncat.categorias')!.brands).toEqual(['bdi'])
  })
})

describe('usuarios/core — resumenUsuario', () => {
  it('cuenta las secciones igual que la matriz (misma fuente: tienePermiso)', () => {
    const u = base({ funcion: ['local'] })
    const r = resumenUsuario(u)
    for (const m of ['bdi', 'zattia'] as const) {
      const aMano = PERM_CAT.filter((c) => c.brands.includes(m) && tienePermiso(u, m, c.key)).length
      expect(r.secciones[m].tiene).toBe(aMano)
      expect(r.secciones[m].total).toBe(PERM_CAT.filter((c) => c.brands.includes(m)).length)
    }
    expect(r.secciones.bdi.tiene).toBeGreaterThan(0) // la función Local trae su área
  })

  it('la cuenta fija acota las marcas en las que trabaja', () => {
    expect(resumenUsuario(base()).marcas).toEqual(['bdi', 'zattia'])
    expect(resumenUsuario(base({ cuenta: 'zattia' })).marcas).toEqual(['zattia'])
  })

  it('lista los extras tildados y no los que no tiene', () => {
    const u = togglePerm(base(), 'bdi', 'canjes.aprobar', true)
    const r = resumenUsuario(u)
    expect(r.extras).toContain('Canjes: Puede aprobar canjes')
    expect(r.extras).not.toContain('Canjes: Puede cerrar un canje incompleto')
  })

  it('un extra de una marca que la persona no trabaja no cuenta', () => {
    const u = togglePerm(base({ cuenta: 'zattia' }), 'bdi', 'canjes.aprobar', true)
    expect(resumenUsuario(u).extras).toEqual([])
  })

  it('lista las excepciones (lo que la función le daría y se le quitó)', () => {
    const u = togglePerm(base({ funcion: ['local'] }), 'bdi', 'cupones', false)
    expect(resumenUsuario(u).excepciones).toContain('Cupones y canjes')
  })

  it('el admin ve todas las secciones de las dos marcas y no tiene excepciones', () => {
    const r = resumenUsuario(base({ admin: true }))
    expect(r.esAdmin).toBe(true)
    expect(r.secciones.bdi.tiene).toBe(r.secciones.bdi.total)
    expect(r.secciones.zattia.tiene).toBe(r.secciones.zattia.total)
    expect(r.excepciones).toEqual([])
  })

  it('devuelve los rótulos de las funciones, no sus claves', () => {
    expect(resumenUsuario(base({ funcion: ['local', 'marketing'] })).funciones).toEqual(['Marketing', 'Local'])
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

/**
 * 🔴 **Config y `puedeVer` tienen que contestar lo mismo, o la pantalla donde se decide quién ve
 * qué es la que miente.** `origenPermiso` dibuja el «no ve esta sección» de la tabla de acciones;
 * el día que la puerta abierta pasó a vivir en la decisión (`KEYS_PARA_TODOS`), esta función quedó
 * diciendo que el puesto Local no veía la Agenda cuando ya la veía.
 */
describe('usuarios/core — las secciones que ve todo el equipo', () => {
  it('salen como «todos», sin que nadie las haya tildado', () => {
    const u = base({ funcion: ['local'] })
    for (const k of ['agenda', 'novedades', 'manuales']) {
      expect(origenPermiso(u, 'bdi', k), k).toBe('todos')
      expect(tienePermiso(u, 'bdi', k), k).toBe(true)
    }
  })

  it('⛔ el resumen NO es de todos: sigue saliendo «no»', () => {
    expect(origenPermiso(base(), 'bdi', 'resumen')).toBe('no')
    expect(tienePermiso(base(), 'bdi', 'resumen')).toBe(false)
  })

  it('un tilde puesto a mano se sigue viendo como explícito, y no se lo tapa', () => {
    // Si dijera «todos» ahí, quien mira no podría saber que hay un tilde guardado en la config.
    const u = base({ acceso: { bdi: { agenda: true }, zattia: {} } })
    expect(origenPermiso(u, 'bdi', 'agenda')).toBe('explicito')
  })

  it('🔑 destildarla deja la EXCEPCIÓN, no un borrado que no borra nada', () => {
    // Sin esto la casilla rebota: no hay tilde que sacar, así que la persona la seguiría viendo
    // y la casilla se volvería a marcar sola al redibujar.
    const u = togglePerm(base(), 'bdi', 'agenda', false)
    expect(u.acceso.bdi?.[marcaExcluir('agenda')]).toBe(true)
    expect(origenPermiso(u, 'bdi', 'agenda')).toBe('excluido')
    expect(tienePermiso(u, 'bdi', 'agenda')).toBe(false)
    // Y sólo en su marca.
    expect(tienePermiso(u, 'zattia', 'agenda')).toBe(true)
  })

  it('volver a tildarla saca la excepción y NO deja un tilde redundante', () => {
    const u = togglePerm(togglePerm(base(), 'bdi', 'agenda', false), 'bdi', 'agenda', true)
    expect(u.acceso.bdi?.[marcaExcluir('agenda')]).toBeUndefined()
    expect(u.acceso.bdi?.agenda).toBeUndefined()
    expect(origenPermiso(u, 'bdi', 'agenda')).toBe('todos')
  })
})
