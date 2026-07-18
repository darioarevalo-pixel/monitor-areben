import { describe, it, expect } from 'vitest'
import { horaLabel, marcasVisibles, ordenar, pendientesDeMarca, unidadesDe } from '@/lib/inicio/core'
import type { Perfil } from '@/lib/permisos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'

const perfil = (over: Partial<Perfil>): Perfil => ({ name: 'U', admin: false, cuenta: null, acceso: {}, ...over })
const sol = (over: Partial<Solicitud>): Solicitud => ({ id: 's1', fecha: '2026-07-18', creado: 1000, creadoPor: 'Ana', descripcion: 'Sesión', estado: 'pendiente', items: [], ...over })

describe('inicio/core — marcasVisibles', () => {
  it('admin ve todas las marcas', () => {
    expect(marcasVisibles(perfil({ admin: true })).sort()).toEqual(['bdi', 'zattia'])
  })
  it('cuenta fija: solo esa marca (si tiene permiso)', () => {
    expect(marcasVisibles(perfil({ cuenta: 'zattia', acceso: { zattia: { 'sesion-fotos': true } } }))).toEqual(['zattia'])
  })
  it('sin cuenta fija: solo las marcas donde puede ver sesión de fotos', () => {
    expect(marcasVisibles(perfil({ acceso: { bdi: { 'sesion-fotos': true } } }))).toEqual(['bdi'])
  })
  it('sin permiso en ninguna → vacío', () => {
    expect(marcasVisibles(perfil({}))).toEqual([])
    expect(marcasVisibles(null)).toEqual([])
  })
})

describe('inicio/core — pendientes', () => {
  it('unidadesDe suma las qty de los ítems', () => {
    const s = sol({ items: [{ vid: 'v1', pid: '1', sid: '1', nombre: 'A', variante: 'M', sku: '', qty: 3, origen: 'deposito' }, { vid: 'v2', pid: '1', sid: '2', nombre: 'A', variante: 'L', sku: '', qty: 2, origen: 'local' }] })
    expect(unidadesDe(s)).toBe(5)
  })

  it('pendientesDeMarca: solo estado pendiente, aplanadas con la marca', () => {
    const lista = [
      sol({ id: 'a', estado: 'pendiente', creado: 10 }),
      sol({ id: 'b', estado: 'cargada', creado: 20 }),
      sol({ id: 'c', estado: 'pendiente', creado: 30 }),
    ]
    const out = pendientesDeMarca(lista, 'bdi')
    expect(out.map((p) => p.id)).toEqual(['a', 'c'])
    expect(out[0].marca).toBe('bdi')
  })

  it('ordenar: la más nueva primero', () => {
    const p = pendientesDeMarca([sol({ id: 'a', creado: 10 }), sol({ id: 'c', creado: 30 }), sol({ id: 'b', creado: 20 })], 'bdi')
    expect(ordenar(p).map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('inicio/core — horaLabel', () => {
  const hoy = new Date('2026-07-18T15:00:00')
  it('hoy / ayer / fecha', () => {
    const creadoHoy = new Date('2026-07-18T09:30:00').getTime()
    const creadoAyer = new Date('2026-07-17T20:05:00').getTime()
    const creadoViejo = new Date('2026-07-10T11:00:00').getTime()
    expect(horaLabel(creadoHoy, '', hoy)).toBe('hoy 09:30')
    expect(horaLabel(creadoAyer, '', hoy)).toBe('ayer 20:05')
    expect(horaLabel(creadoViejo, '', hoy)).toMatch(/^10\/7\/2026 11:00$/)
  })
  it('sin creado cae a la fecha', () => {
    expect(horaLabel(0, '2026-07-18', hoy)).toBe('2026-07-18')
  })
})
