import { describe, it, expect } from 'vitest'
import { purgarVentas, purgarDetalles, fechaDesdeRepaso } from '../scripts/lib/purga-ventas.mjs'

/**
 * La purga del espejo de ventas. Lo que se prueba es lo que el bug rompía —una venta
 * anulada en Gestión Nube seguía sumando plata en el Monitor— y, sobre todo, que la
 * purga NO se pase de rosca: borrar de más acá es borrar facturación.
 */

type FilaVenta = { id: number; date_sale: string }
type FilaDetalle = { id: number; sale_id: number }

/**
 * Mock del client de Supabase con las dos tablas en memoria. Implementa solo el
 * sub-set que la purga usa (select/gte/lte/in/range + delete/in). El helper es .mjs
 * sin tipos, así que `any` acá es fiel: no hay contrato de TS que romper.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mock(ventas: FilaVenta[], detalles: FilaDetalle[] = []): any {
  const tablas: Record<string, { id: number; date_sale?: string; sale_id?: number }[]> = {
    ventas: [...ventas],
    venta_detalles: [...detalles],
  }
  return {
    tablas,
    from(tabla: string) {
      let filas = tablas[tabla]
      let borrando = false
      const api = {
        select() { return api },
        delete() { borrando = true; return api },
        gte(col: string, val: string) { filas = filas.filter(f => String(f[col as 'date_sale']) >= val); return api },
        lte(col: string, val: string) { filas = filas.filter(f => String(f[col as 'date_sale']) <= val); return api },
        in(col: string, vals: number[]) {
          if (borrando) {
            const set = new Set(vals)
            tablas[tabla] = tablas[tabla].filter(f => !set.has(f[col as 'id'] as number))
            // borrado en cascada, igual que la FK real de venta_detalles.sale_id
            if (tabla === 'ventas') {
              tablas.venta_detalles = tablas.venta_detalles.filter(d => !set.has(d.sale_id!))
            }
            return Promise.resolve({ error: null })
          }
          const set = new Set(vals)
          filas = filas.filter(f => set.has(f[col as 'id'] as number))
          return api
        },
        /* Ordena de verdad, no es un no-op: sin `order` estable las páginas de PostgREST
           se pisan, y ese fue un bug real (ver purga-ventas.mjs). El mock tiene que
           fallar si alguien saca el order del código. */
        order(col: string) {
          filas = [...filas].sort((x, y) => Number(x[col as 'id']) - Number(y[col as 'id']))
          return api
        },
        async range(a: number, b: number) { return { data: filas.slice(a, b + 1), error: null } },
        /* El builder de PostgREST es esperable sin llamar a range: `await
           from(t).select('*').in('id', ids)` devuelve las filas. El respaldo lo usa así. */
        then(res: (v: { data: unknown[]; error: null }) => unknown, rej: (e: unknown) => unknown) {
          return Promise.resolve({ data: filas, error: null }).then(res, rej)
        },
      }
      return api
    },
  }
}

describe('purgarVentas', () => {
  it('borra la venta que GN ya no tiene y se lleva sus renglones', async () => {
    const sb = mock(
      [{ id: 1, date_sale: '2026-07-01' }, { id: 2, date_sale: '2026-07-02' }],
      [{ id: 10, sale_id: 1 }, { id: 20, sale_id: 2 }],
    )
    const borradas = await purgarVentas(sb, new Set([1]), '2026-06-01', '2026-07-31')

    expect(borradas).toBe(1)
    expect(sb.tablas.ventas.map((v: FilaVenta) => v.id)).toEqual([1])
    expect(sb.tablas.venta_detalles.map((d: FilaDetalle) => d.id)).toEqual([10])
  })

  it('no toca las ventas de fuera del rango, aunque no vengan de GN', async () => {
    const sb = mock([{ id: 1, date_sale: '2025-01-15' }, { id: 2, date_sale: '2026-07-02' }])
    await purgarVentas(sb, new Set([2]), '2026-06-01', '2026-07-31')

    expect(sb.tablas.ventas.map((v: FilaVenta) => v.id)).toEqual([1, 2])
  })

  it('ABORTA si borraría más del tope: una respuesta rara de GN no puede vaciar el espejo', async () => {
    const ventas = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, date_sale: '2026-07-01' }))
    const sb = mock(ventas)
    // GN devolvió solo 50 de 100: la mitad "desapareció". Es un síntoma, no un hecho.
    const borradas = await purgarVentas(sb, new Set(ventas.slice(0, 50).map(v => v.id)), '2026-06-01', '2026-07-31')

    expect(borradas).toBe(0)
    expect(sb.tablas.ventas).toHaveLength(100)
  })

  it('el piso deja pasar las anulaciones sueltas aunque sean un % alto de un rango chico', async () => {
    // Sin el piso absoluto, 1 anulada entre 2 ventas es el 50% y no se borraba nunca.
    const sb = mock([{ id: 1, date_sale: '2026-07-01' }, { id: 2, date_sale: '2026-07-02' }])
    expect(await purgarVentas(sb, new Set([1]), '2026-06-01', '2026-07-31')).toBe(1)
  })

  it('con más de 1000 ventas en el rango pagina y no se queda con las primeras 1000', async () => {
    const ventas = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1, date_sale: '2026-07-01' }))
    const sb = mock(ventas)
    const vivas = new Set(ventas.map(v => v.id))
    vivas.delete(2400) // la única anulada está más allá de la primera página

    const borradas = await purgarVentas(sb, vivas, '2026-06-01', '2026-07-31')
    expect(borradas).toBe(1)
    expect(sb.tablas.ventas).toHaveLength(2499)
  })
})

describe('purgarDetalles', () => {
  it('borra el producto que sacaron de una venta viva', async () => {
    const sb = mock(
      [{ id: 1, date_sale: '2026-07-01' }],
      [{ id: 10, sale_id: 1 }, { id: 11, sale_id: 1 }],
    )
    const borrados = await purgarDetalles(sb, new Map([[1, new Set([10])]]))

    expect(borrados).toBe(1)
    expect(sb.tablas.venta_detalles.map((d: FilaDetalle) => d.id)).toEqual([10])
  })

  it('una venta que GN devuelve SIN renglones no se vacía (podría ser un fallo al traer el detalle)', async () => {
    const sb = mock([{ id: 1, date_sale: '2026-07-01' }], [{ id: 10, sale_id: 1 }])
    const borrados = await purgarDetalles(sb, new Map([[1, new Set()]]))

    expect(borrados).toBe(0)
    expect(sb.tablas.venta_detalles).toHaveLength(1)
  })

  it('no toca los renglones de ventas que no se revisaron', async () => {
    const sb = mock(
      [{ id: 1, date_sale: '2026-07-01' }, { id: 2, date_sale: '2025-01-01' }],
      [{ id: 10, sale_id: 1 }, { id: 99, sale_id: 2 }],
    )
    await purgarDetalles(sb, new Map([[1, new Set([10])]]))

    expect(sb.tablas.venta_detalles.map((d: FilaDetalle) => d.id).sort()).toEqual([10, 99])
  })

  it('ABORTA si borraría más del tope', async () => {
    const detalles = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, sale_id: 1 }))
    const sb = mock([{ id: 1, date_sale: '2026-07-01' }], detalles)
    const borrados = await purgarDetalles(sb, new Map([[1, new Set([1, 2, 3])]]))

    expect(borrados).toBe(0)
    expect(sb.tablas.venta_detalles).toHaveLength(100)
  })
})

describe('modo simulación (la purga histórica arranca así)', () => {
  it('informa cuántas borraría y no borra ninguna', async () => {
    const sb = mock(
      [{ id: 1, date_sale: '2026-07-01' }, { id: 2, date_sale: '2026-07-02' }],
      [{ id: 10, sale_id: 1 }, { id: 20, sale_id: 2 }],
    )
    const aBorrar = await purgarVentas(sb, new Set([1]), '2026-06-01', '2026-07-31', { simular: true })

    expect(aBorrar).toBe(1)
    expect(sb.tablas.ventas).toHaveLength(2)       // intacto
    expect(sb.tablas.venta_detalles).toHaveLength(2)
  })

  it('informa el número real aunque supere el tope: para eso se simula', async () => {
    // Al aplicar esto se frenaría solo, pero el que mira necesita ver el número.
    const ventas = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, date_sale: '2026-07-01' }))
    const sb = mock(ventas)
    const aBorrar = await purgarVentas(sb, new Set([1]), '2026-06-01', '2026-07-31', { simular: true })

    expect(aBorrar).toBe(99)
    expect(sb.tablas.ventas).toHaveLength(100)
  })

  it('los renglones también se simulan sin tocar nada', async () => {
    const sb = mock([{ id: 1, date_sale: '2026-07-01' }], [{ id: 10, sale_id: 1 }, { id: 11, sale_id: 1 }])
    const aBorrar = await purgarDetalles(sb, new Map([[1, new Set([10])]]), { simular: true })

    expect(aBorrar).toBe(1)
    expect(sb.tablas.venta_detalles).toHaveLength(2)
  })

  it('un tope más flojo deja pasar lo que el default frenaría', async () => {
    const ventas = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, date_sale: '2026-07-01' }))
    const sb = mock(ventas)
    const vivas = new Set(ventas.slice(0, 75).map(v => v.id)) // 25% desaparecidas

    expect(await purgarVentas(sb, vivas, '2026-06-01', '2026-07-31')).toBe(0)                     // default 10%: frena
    expect(await purgarVentas(sb, vivas, '2026-06-01', '2026-07-31', { topePorc: 0.3 })).toBe(25) // 30%: pasa
  })
})

describe('respaldo antes de borrar', () => {
  it('guarda las filas completas de las ventas antes de que desaparezcan', async () => {
    const sb = mock([{ id: 1, date_sale: '2026-07-01' }, { id: 2, date_sale: '2026-07-02' }])
    const guardado: { tabla: string; filas: unknown[] }[] = []

    await purgarVentas(sb, new Set([1]), '2026-06-01', '2026-07-31', {
      respaldo: (tabla: string, filas: unknown[]) => { guardado.push({ tabla, filas }) },
    })

    expect(guardado).toHaveLength(1)
    expect(guardado[0].tabla).toBe('ventas')
    expect(guardado[0].filas).toEqual([{ id: 2, date_sale: '2026-07-02' }]) // la fila entera, no solo el id
    expect(sb.tablas.ventas.map((v: FilaVenta) => v.id)).toEqual([1])       // y sí se borró
  })

  it('guarda los renglones antes de borrarlos', async () => {
    const sb = mock([{ id: 1, date_sale: '2026-07-01' }], [{ id: 10, sale_id: 1 }, { id: 11, sale_id: 1 }])
    const guardado: unknown[] = []

    await purgarDetalles(sb, new Map([[1, new Set([10])]]), {
      respaldo: (_t: string, filas: unknown[]) => { guardado.push(...filas) },
    })

    expect(guardado).toEqual([{ id: 11, sale_id: 1 }])
  })

  it('en simulación no respalda nada, porque no borra nada', async () => {
    const sb = mock([{ id: 1, date_sale: '2026-07-01' }, { id: 2, date_sale: '2026-07-02' }])
    let llamado = false

    await purgarVentas(sb, new Set([1]), '2026-06-01', '2026-07-31', {
      simular: true,
      respaldo: () => { llamado = true },
    })

    expect(llamado).toBe(false)
  })

  it('si el respaldo falla, NO se borra: el error corta antes del delete', async () => {
    const sb = mock([{ id: 1, date_sale: '2026-07-01' }, { id: 2, date_sale: '2026-07-02' }])

    await expect(purgarVentas(sb, new Set([1]), '2026-06-01', '2026-07-31', {
      respaldo: () => { throw new Error('disco lleno') },
    })).rejects.toThrow('disco lleno')

    expect(sb.tablas.ventas).toHaveLength(2) // intacto
  })
})

describe('fechaDesdeRepaso', () => {
  it('cuenta los días hacia atrás en formato YYYY-MM-DD', () => {
    expect(fechaDesdeRepaso(90, new Date('2026-07-29T03:00:00Z'))).toBe('2026-04-30')
    expect(fechaDesdeRepaso(1, new Date('2026-01-01T03:00:00Z'))).toBe('2025-12-31')
  })
})
