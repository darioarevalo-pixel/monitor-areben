import { describe, it, expect } from 'vitest'
import {
  BASE_HORAS,
  copiarDeUsuario,
  copiarPermisos,
  normalizar,
  normalizarLinkHoras,
  nuevoUsuario,
  origenPermiso,
  resumenUsuario,
  sinLinkDeHoras,
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

/**
 * 🔴 **Al admin también se le puede sacar una sección, y sin degradarlo** (3-sep-2026).
 *
 * Antes la ficha de un administrador no dibujaba matriz: decía «para darle permisos de a uno,
 * destildá Administrador». Y aunque se hubiera dibujado, destildar no habría escrito nada —
 * `togglePerm` sólo dejaba la excepción cuando el permiso «venía solo» por función o por
 * `KEYS_PARA_TODOS`—, así que la casilla se volvía a marcar sola al redibujar.
 */
describe('usuarios/core — sacarle una sección a un administrador', () => {
  const jefe = () => base({ admin: true, funcion: ['direccion'] })

  it('destildar escribe la EXCEPCIÓN, que es lo único que le gana al admin', () => {
    const u = togglePerm(jefe(), 'bdi', 'conteo', false)
    expect(u.acceso.bdi?.[marcaExcluir('conteo')]).toBe(true)
    expect(tienePermiso(u, 'bdi', 'conteo')).toBe(false)
    expect(origenPermiso(u, 'bdi', 'conteo')).toBe('excluido')
    expect(tienePermiso(u, 'zattia', 'conteo')).toBe(true) // la otra marca no se toca
    expect(tienePermiso(u, 'bdi', 'cupones')).toBe(true) // el resto lo sigue viendo
  })

  it('volver a tildarlo saca la excepción y no deja tilde redundante', () => {
    let u = togglePerm(jefe(), 'bdi', 'conteo', false)
    u = togglePerm(u, 'bdi', 'conteo', true)
    expect(u.acceso.bdi?.[marcaExcluir('conteo')]).toBeUndefined()
    expect(u.acceso.bdi?.['conteo']).toBeUndefined() // lo ve por ser admin: no hace falta tildarlo
    expect(tienePermiso(u, 'bdi', 'conteo')).toBe(true)
  })

  it('un SUB se le saca igual, y volver a tildarlo no le tilda el padre', () => {
    let u = togglePerm(jefe(), 'bdi', 'cupones.crear', false)
    expect(u.acceso.bdi?.[marcaExcluir('cupones.crear')]).toBe(true)
    expect(tienePermiso(u, 'bdi', 'cupones.crear')).toBe(false)
    expect(tienePermiso(u, 'bdi', 'cupones')).toBe(true)
    u = togglePerm(u, 'bdi', 'cupones.crear', true)
    expect(u.acceso.bdi?.['cupones']).toBeUndefined()
    expect(tienePermiso(u, 'bdi', 'cupones.crear')).toBe(true)
  })

  it('el resumen de la ficha lo cuenta: baja el «ve N de M» y lista la excepción', () => {
    const antes = resumenUsuario(jefe())
    const u = togglePerm(togglePerm(jefe(), 'bdi', 'conteo', false), 'zattia', 'conteo', false)
    const r = resumenUsuario(u)
    expect(r.secciones.bdi.tiene).toBe(antes.secciones.bdi.tiene - 1)
    expect(r.excepciones.length).toBe(1)
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

/**
 * El link de carga de horas extras.
 *
 * 🔑 **Se pega a mano y por eso hay que validarlo**: el dashboard es otra base y el token no se
 * puede traer solo. Un link mal pegado no falla al guardar — falla el último día del mes, en el
 * teléfono de otra persona.
 */
describe('normalizarLinkHoras', () => {
  const TOKEN = 'x7KqZm3nP1aQwErTyU'

  it('el link entero que copia el dashboard queda tal cual', () => {
    expect(normalizarLinkHoras(BASE_HORAS + TOKEN)).toBe(BASE_HORAS + TOKEN)
  })

  it('el token pelado también sirve: es lo que pasa cuando se copia de menos', () => {
    expect(normalizarLinkHoras(TOKEN)).toBe(BASE_HORAS + TOKEN)
    expect(normalizarLinkHoras(`  ${TOKEN}  `)).toBe(BASE_HORAS + TOKEN)
  })

  it('la basura que se pega de más se recorta y el link sale canónico', () => {
    expect(normalizarLinkHoras(`${BASE_HORAS}${TOKEN}?utm=wsp`)).toBe(BASE_HORAS + TOKEN)
    expect(normalizarLinkHoras(`${BASE_HORAS}${TOKEN}/`)).toBe(BASE_HORAS + TOKEN)
  })

  it('🔴 otro dominio se RECHAZA aunque tenga la misma forma', () => {
    // El token es una credencial sin sesión: quien tiene el link carga horas a nombre de otra.
    expect(normalizarLinkHoras(`https://dashboard.arebensrI.com/horas/${TOKEN}`)).toBeNull()
    expect(normalizarLinkHoras(`http://dashboard.arebensrl.com/horas/${TOKEN}`)).toBeNull()
    expect(normalizarLinkHoras(`https://otra.com/horas/${TOKEN}`)).toBeNull()
  })

  it('lo que no es un link ni un token da null, y el vacío también', () => {
    expect(normalizarLinkHoras('')).toBeNull()
    expect(normalizarLinkHoras('   ')).toBeNull()
    expect(normalizarLinkHoras('pedile el link a Bruno')).toBeNull()
    expect(normalizarLinkHoras(BASE_HORAS)).toBeNull()
    expect(normalizarLinkHoras(`${BASE_HORAS}corto`)).toBeNull()
  })
})

describe('sinLinkDeHoras — el hueco que el sistema no puede cerrar solo', () => {
  it('sólo es hueco si está tildada Y le falta el link', () => {
    expect(sinLinkDeHoras(base({ horasExtras: true }))).toBe(true)
    expect(sinLinkDeHoras(base({ horasExtras: true, horasLink: null }))).toBe(true)
    expect(sinLinkDeHoras(base({ horasExtras: true, horasLink: 'https://x' }))).toBe(false)
    expect(sinLinkDeHoras(base())).toBe(false)
  })

  it('un link guardado sin el tilde NO es un hueco: destildar no borra el link', () => {
    // Quien destilda hoy suele volver a tildar el mes que viene. El tilde es lo único que decide,
    // así que el link guardado no le llega a nadie ni se dibuja en ningún lado.
    expect(sinLinkDeHoras(base({ horasExtras: false, horasLink: 'https://x' }))).toBe(false)
  })
})
