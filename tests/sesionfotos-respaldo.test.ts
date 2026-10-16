import { beforeEach, describe, expect, it } from 'vitest'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import { eliminarRespaldoSiIgual, guardarRespaldo, leerRespaldo, mismaSolicitud, clasificarRespaldos } from '@/lib/sesionfotos/respaldo'
import { hayDevolucion, reiniciarDevolucion } from '@/lib/sesionfotos/core'

/** localStorage de mentira: los tests corren en Node. */
beforeEach(() => {
  const m = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
})

const sol = (extra: Partial<Solicitud> = {}): Solicitud =>
  ({ id: 's1', estado: 'cargada', fecha: '2026-10-16', items: [], verif: { a: 2 }, devuelto: { a: 1 }, ...extra }) as unknown as Solicitud

describe('respaldo en la compu de lo que no se guardó', () => {
  it('la misma solicitud con las claves en otro orden es la misma (la base las reordena)', () => {
    const a = sol()
    const b = JSON.parse(JSON.stringify({ devuelto: { a: 1 }, verif: { a: 2 }, items: [], fecha: '2026-10-16', estado: 'cargada', id: 's1' })) as Solicitud
    expect(mismaSolicitud(a, b)).toBe(true)
    expect(mismaSolicitud(a, sol({ devuelto: { a: 2 } }))).toBe(false)
  })

  it('se ofrece sólo si trae algo distinto de lo que hay en la base', () => {
    guardarRespaldo(sol({ devuelto: { a: 2 } }), 1000)
    const p = clasificarRespaldos([sol()])
    expect(p.distintos).toHaveLength(1)
    expect(p.distintos[0].ts).toBe(1000)
    expect(p.iguales).toBe(false)
  })

  it('uno igual a lo abierto no se ofrece, pero tampoco se da por guardado', () => {
    // Lo abierto puede venir de la lista en memoria, que ya tenía el cambio aunque la base no.
    guardarRespaldo(sol())
    expect(clasificarRespaldos([sol()])).toEqual({ distintos: [], iguales: true })
    expect(leerRespaldo('s1')).not.toBeNull()
  })

  it('no se limpia si mientras se guardaba se escaneó otra prenda', () => {
    guardarRespaldo(sol({ devuelto: { a: 2 } }))
    eliminarRespaldoSiIgual(sol())
    expect(leerRespaldo('s1')).not.toBeNull()
    eliminarRespaldoSiIgual(sol({ devuelto: { a: 2 } }))
    expect(leerRespaldo('s1')).toBeNull()
  })
})

describe('empezar la devolución de nuevo', () => {
  it('elimina sólo lo escaneado en la devolución y lo anota', () => {
    const r = reiniciarDevolucion(sol({ estado: 'devuelta', ventas: { deposito: { id: 7 } } } as Partial<Solicitud>), { por: 'Lorena', ts: 1 })
    expect(r.devuelto).toEqual({})
    expect(r.verif).toEqual({ a: 2 })
    expect(r.estado).toBe('cargada')
    expect(hayDevolucion(r)).toBe(false)
    expect(r.cambios?.[0]).toMatchObject({ por: 'Lorena', accion: 'reinició la devolución' })
  })

  it('sin venta vuelve a preparada; una cerrada no se toca', () => {
    expect(reiniciarDevolucion(sol({ estado: 'devuelta' }), { por: 'L', ts: 1 }).estado).toBe('preparada')
    const c = sol({ estado: 'cerrada' })
    expect(reiniciarDevolucion(c, { por: 'L', ts: 1 })).toBe(c)
  })
})
