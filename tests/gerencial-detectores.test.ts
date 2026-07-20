import { describe, it, expect } from 'vitest'
import { detectarComercial } from '@/lib/gerencial/detectores/comercial'
import { detectarOperativo } from '@/lib/gerencial/detectores/operativo'
import { detectarImportaciones } from '@/lib/gerencial/detectores/importaciones'
import { ordenar, type Accionable } from '@/lib/gerencial/tipos'
import { UMBRALES } from '@/lib/gerencial/umbrales'
import type { DatosETL, Fase, Producto, SyncMeta } from '@/lib/etl/tipos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import type { Ingreso } from '@/lib/ingresos/tipos'

const FASE: Record<string, Fase> = {
  madurez: { label: 'madurez', cls: '' },
  declive: { label: 'declive', cls: '' },
}

const prod = (over: Partial<Producto>): Producto => ({
  id: '1', name: 'Prod', sku: null, proveedor: null, category: null,
  retailer_price: 0, unit_cost: 0, margin: null, markup: null, ingresoMes: null,
  firstSale: null, lastSale: null, daysSinceLast: 0, sales7: 0, sales15: 0, sales30: 0,
  sales60: 0, sales90: 0, totalSales: 0, monthlySales: [], stock: 0, lifespan: 0,
  lifespanFirst: 0, phase: FASE.madurez, ...over,
})

const etl = (productos: Producto[], syncMeta: SyncMeta = null): DatosETL =>
  ({ allProductos: productos, syncMeta } as unknown as DatosETL)

const now = new Date('2026-07-20T12:00:00')

describe('detectarComercial', () => {
  it('capital parado: solo productos con stock y sin vender hace +N días', () => {
    const out = detectarComercial('bdi', etl([
      prod({ id: 'a', name: 'A', stock: 5, daysSinceLast: 60 }), // parado
      prod({ id: 'b', name: 'B', stock: 0, daysSinceLast: 90 }), // sin stock → no cuenta
      prod({ id: 'c', name: 'C', stock: 3, daysSinceLast: 10 }), // vendió reciente → no cuenta
    ]), UMBRALES)
    const parado = out.find((a) => a.id === 'comercial:sinventa:bdi')
    expect(parado?.valor).toBe(1)
    expect(parado?.severidad).toBe('atencion')
    expect(parado?.marca).toBe('bdi')
  })

  it('capital parado escala a crítico según el umbral', () => {
    const prods = Array.from({ length: UMBRALES.sinVentaCritico }, (_, i) =>
      prod({ id: `p${i}`, name: `P${i}`, stock: 1, daysSinceLast: 90 }))
    const out = detectarComercial('bdi', etl(prods), UMBRALES)
    expect(out.find((a) => a.id === 'comercial:sinventa:bdi')?.severidad).toBe('critico')
  })

  it('declive: cuenta los productos en fase declive', () => {
    const out = detectarComercial('zattia', etl([
      prod({ id: 'a', phase: FASE.declive }),
      prod({ id: 'b', phase: FASE.madurez }),
      prod({ id: 'c', phase: FASE.declive }),
    ]), UMBRALES)
    expect(out.find((a) => a.id === 'comercial:declive:zattia')?.valor).toBe(2)
  })

  it('sin señales → sin accionables', () => {
    expect(detectarComercial('bdi', etl([prod({ stock: 10, daysSinceLast: 1 })]), UMBRALES)).toEqual([])
  })
})

describe('detectarOperativo', () => {
  const sol = (over: Partial<Solicitud>): Solicitud =>
    ({ id: 's', fecha: '', creado: 0, creadoPor: '', descripcion: '', estado: 'pendiente', items: [], ...over })
  const si = (over: Partial<SolicitudInterna>): SolicitudInterna =>
    ({ id: 'i', fecha: '', creado: 0, creadoPor: '', motivo: '', tipo: 'consumo', descripcion: '', estado: 'pendiente', items: [], ...over })

  it('cuenta fotos pendientes y consumos por aprobar', () => {
    const out = detectarOperativo(
      'bdi',
      [sol({ id: 'a', estado: 'pendiente' }), sol({ id: 'b', estado: 'cargada' })],
      [si({ id: 'x', tipo: 'consumo', estado: 'pendiente' }), si({ id: 'y', tipo: 'retornable', estado: 'aprobada' })],
      null,
      UMBRALES,
      now,
    )
    expect(out.find((a) => a.id === 'operativo:fotos:bdi')?.valor).toBe(1)
    expect(out.find((a) => a.id === 'operativo:aprobaciones:bdi')?.valor).toBe(1)
  })

  it('sync caído (última corrida falló) → accionable crítico', () => {
    const syncMeta: SyncMeta = { last_run: '2026-07-20T06:00:00Z', latest_status: 'completed', latest_conclusion: 'failure' }
    const out = detectarOperativo('bdi', [], [], etl([], syncMeta), UMBRALES, now)
    const sync = out.find((a) => a.id === 'operativo:sync:bdi')
    expect(sync?.severidad).toBe('critico')
  })

  it('sync sano → sin accionable de sync', () => {
    const syncMeta: SyncMeta = { last_run: now.toISOString(), latest_status: 'completed', latest_conclusion: 'success' }
    const out = detectarOperativo('bdi', [], [], etl([], syncMeta), UMBRALES, now)
    expect(out.find((a) => a.id === 'operativo:sync:bdi')).toBeUndefined()
  })
})

describe('detectarImportaciones', () => {
  const ing = (over: Partial<Ingreso>): Ingreso =>
    ({ id: 'g', desc: 'Fundas IMD', proveedor: 'Prov', fecha: '', estado: 'transito', nota: '', bloques: [], gallery: [], ...over })

  it('ETA vencida → atención; ETA próxima → oportunidad; arribado o lejano → nada', () => {
    const out = detectarImportaciones('bdi', [
      ing({ id: 'venc', fecha: '2026-07-10' }),          // hace 10 días
      ing({ id: 'prox', fecha: '2026-07-27' }),          // en 7 días
      ing({ id: 'lejos', fecha: '2026-09-01' }),         // fuera de ventana
      ing({ id: 'lleg', fecha: '2026-07-05', estado: 'arribado' }),
    ], UMBRALES, now)
    expect(out.find((a) => a.id === 'importaciones:vencida:bdi:venc')?.severidad).toBe('atencion')
    expect(out.find((a) => a.id === 'importaciones:proxima:bdi:prox')?.severidad).toBe('oportunidad')
    expect(out.some((a) => a.id.includes('lejos'))).toBe(false)
    expect(out.some((a) => a.id.includes('lleg'))).toBe(false)
  })
})

describe('ordenar', () => {
  it('crítico antes que atención antes que oportunidad; dentro, por valor desc', () => {
    const a = (id: string, severidad: Accionable['severidad'], valor: number): Accionable =>
      ({ id, area: 'comercial', severidad, marca: 'bdi', titulo: id, detalle: '', recomendacion: '', valor, acciones: [] })
    const out = ordenar([a('o', 'oportunidad', 9), a('c1', 'critico', 1), a('a', 'atencion', 5), a('c2', 'critico', 8)])
    expect(out.map((x) => x.id)).toEqual(['c2', 'c1', 'a', 'o'])
  })
})
