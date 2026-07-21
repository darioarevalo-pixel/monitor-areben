import { describe, it, expect } from 'vitest'
import { filtrarPorFuncion, ordenarResumenes, puedeRetirar, resumenFoto, resumenInterna, veTodo } from '@/lib/solicitudes/overview'
import type { Perfil } from '@/lib/permisos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'

const perfil = (over: Partial<Perfil>): Perfil => ({ name: 'U', admin: false, cuenta: null, acceso: {}, ...over })
const item = (over: Partial<Solicitud['items'][number]> = {}) => ({ vid: 'v', pid: '1', sid: '1', nombre: 'A', variante: 'M', sku: '', qty: 1, origen: 'deposito' as const, ...over })
const foto = (over: Partial<Solicitud>): Solicitud => ({ id: 's', fecha: '2026-07-20', creado: 1, creadoPor: 'Ana', descripcion: 'Sesión', estado: 'pendiente', items: [], ...over })
const interna = (over: Partial<SolicitudInterna>): SolicitudInterna => ({ id: 'i', fecha: '2026-07-20', creado: 1, creadoPor: 'Ana', motivo: 'Muestra', tipo: 'retornable', descripcion: '', estado: 'aprobada', items: [], ...over })

describe('solicitudes/overview — estado', () => {
  it('foto con venta GN sin retirar → "Separado" (grupo conventagn)', () => {
    const r = resumenFoto(foto({ estado: 'cargada', items: [item({ origen: 'deposito' })], ventas: { deposito: { id: 1 } } }), 'bdi')
    expect(r.estadoLabel).toBe('Separado')
    expect(r.estadoTag).toBe('sin retirar')
    expect(r.grupo).toBe('conventagn')
    expect(r.tipo).toBe('foto')
  })
  it('foto con venta GN y todo retirado → "Retirado"', () => {
    const r = resumenFoto(foto({ estado: 'cargada', items: [item({ origen: 'deposito' })], ventas: { deposito: { id: 1 } }, retirado: { deposito: true } }), 'bdi')
    expect(r.estadoLabel).toBe('Retirado')
  })
  it('foto devuelta con venta sin anular → tag "falta anular venta GN"', () => {
    const r = resumenFoto(foto({ estado: 'devuelta', ventas: { local: { id: 2 } } }), 'bdi')
    expect(r.estadoTag).toBe('falta anular venta GN')
    expect(r.grupo).toBe('devuelta')
  })
  it('interna pendiente → "Pendiente de aprobar"', () => {
    const r = resumenInterna(interna({ estado: 'pendiente' }), 'zattia')
    expect(r.estadoLabel).toBe('Pendiente de aprobar')
    expect(r.subtitulo).toContain('Interna')
    expect(r.seccion).toBe('solicitudes-internas')
  })
})

describe('solicitudes/overview — visibilidad por función', () => {
  it('admin / dirección / marketing / administración / sin función → ve todo', () => {
    expect(veTodo(perfil({ admin: true }))).toBe(true)
    expect(veTodo(perfil({ funcion: ['direccion'] }))).toBe(true)
    expect(veTodo(perfil({ funcion: ['marketing'] }))).toBe(true)
    expect(veTodo(perfil({ funcion: ['administracion'] }))).toBe(true)
    expect(veTodo(perfil({}))).toBe(true)
  })
  it('solo Local/Depósito → ve solo su sector', () => {
    expect(veTodo(perfil({ funcion: ['local'] }))).toBe(false)
    const rLocal = resumenFoto(foto({ id: 'a', items: [item({ origen: 'local' })] }), 'bdi')
    const rDep = resumenFoto(foto({ id: 'b', items: [item({ origen: 'deposito' })] }), 'bdi')
    const soloLocal = filtrarPorFuncion([rLocal, rDep], perfil({ funcion: ['local'] }))
    expect(soloLocal.map((r) => r.id)).toEqual(['a'])
    const soloDep = filtrarPorFuncion([rLocal, rDep], perfil({ funcion: ['deposito'] }))
    expect(soloDep.map((r) => r.id)).toEqual(['b'])
  })
  it('ve todo → no filtra', () => {
    const rs = [resumenFoto(foto({ id: 'a', items: [item({ origen: 'local' })] }), 'bdi')]
    expect(filtrarPorFuncion(rs, perfil({ admin: true }))).toHaveLength(1)
  })

  it('puedeRetirar: sector solo su origen; veTodo cualquiera', () => {
    expect(puedeRetirar(perfil({ funcion: ['local'] }), 'local')).toBe(true)
    expect(puedeRetirar(perfil({ funcion: ['local'] }), 'deposito')).toBe(false)
    expect(puedeRetirar(perfil({ funcion: ['deposito'] }), 'deposito')).toBe(true)
    expect(puedeRetirar(perfil({ admin: true }), 'deposito')).toBe(true)
    expect(puedeRetirar(perfil({ funcion: ['marketing'] }), 'local')).toBe(true)
    expect(puedeRetirar(perfil({}), 'local')).toBe(true) // sin función → ve todo
  })
})

describe('solicitudes/overview — ordenar', () => {
  it('más nueva primero', () => {
    const a = resumenFoto(foto({ id: 'a', creado: 10 }), 'bdi')
    const b = resumenFoto(foto({ id: 'b', creado: 30 }), 'bdi')
    expect(ordenarResumenes([a, b]).map((r) => r.id)).toEqual(['b', 'a'])
  })
})
