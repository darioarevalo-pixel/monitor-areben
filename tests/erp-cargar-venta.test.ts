import { describe, expect, it, vi } from 'vitest'
import { entradaManual } from '../api/_erp-cargar.js'

/** Los cortes de hoy (31-oct): sólo Stunned. */
const HOY = { cortes: { stunned: '2026-10-28T23:00:00Z' }, ahora: new Date('2026-11-01T15:00:00Z') }
const ok = {
  linea: 'zattia', origen_ref: '0f8fad5b-d9cb-469f-a165-70867728950e', canal: 'local', deposito: 'local',
  lineas: [{ producto: '101', talle: '7', cantidad: 2, precio: 1500.5, sku: 'ZA1' }],
  pagos: [{ cuenta: 'a1b2', monto: 1000 }, { cuenta: 'c3d4', monto: 2001 }],
}

describe('ERP › Cargar venta: la entrada del motor (§19)', () => {
  it('arma origen manual, de prueba sin corte de su línea, con importe y total que cierran', () => {
    const r = entradaManual(ok, 'zattia', 'Bruno', HOY)
    if ('error' in r) throw new Error(r.error)
    expect(r.entrada).toMatchObject({ origen: 'manual', marca: 'zattia', prueba: true, usuario: 'Bruno', subtotal: 3001, total: 3001 })
    expect(r.entrada.lineas[0]).toMatchObject({ product_id: 101, size_id: 7, cantidad: 2, importe: 3001, descuento: 0, sku: 'ZA1' })
    expect(r.entrada.pagos.map((p: { cuenta: string }) => p.cuenta)).toEqual(['a1b2', 'c3d4'])
    expect(r.entrada.cliente).toBeUndefined()
  })

  it('frena antes de llegar al motor', () => {
    const e = (b: object, marca = 'zattia') => { const r = entradaManual({ ...ok, ...b }, marca, null, HOY); return 'error' in r ? r.error : null }
    expect(e({ linea: 'stunned' }, 'bdi')).toMatch(/Línea/)
    expect(e({ origen_ref: '' })).toMatch(/clave/)
    expect(e({ deposito: 'deposito_mayorista' })).toMatch(/sale/)
    expect(e({ lineas: [] })).toMatch(/prenda/)
    expect(e({ lineas: [{ ...ok.lineas[0], cantidad: 1.5 }] })).toMatch(/cantidad/)
    expect(e({ pagos: [{ cuenta: 'x', monto: 10 }] })).toMatch(/no suma/)
    expect(e({ ocurrida_en: '2099-01-01T00:00:00Z' })).toMatch(/futura/)
  })

  it('el cliente va sólo con documento y nombre (solo dígitos)', () => {
    const r = entradaManual({ ...ok, cliente: { doc: '20-12345678-9', nombre: ' Ana ' } }, 'zattia', null, HOY)
    if ('error' in r) throw new Error(r.error)
    expect(r.entrada.cliente).toEqual({ doc: '20123456789', nombre: 'Ana' })
  })
})

describe('Real o de prueba por el CORTE de la línea (`erp_corte`), ⛔ ERP_STUNNED_PRUEBA', () => {
  const stu = { ...ok, linea: 'stunned' }
  const bdi = { ...ok, linea: 'bdi', deposito: 'deposito_minorista' }
  const CORTES = { stunned: '2026-10-28T23:00:00Z', bdi: '2026-11-16T03:00:00Z', zattia: '2026-11-24T03:00:00Z' }
  const prueba = (b: object, marca: string, ahora: string) => {
    const r = entradaManual(b, marca, 'Bruno', { cortes: CORTES, ahora: new Date(ahora) })
    if ('error' in r) throw new Error(r.error)
    return r.entrada.prueba
  }
  it('cada línea es real desde SU corte y de prueba antes', () => {
    // hoy: Stunned real, BDI y Zattia de prueba (lo mismo que daban las llaves en producción)
    expect([prueba(stu, 'zattia', '2026-11-01T15:00:00Z'), prueba(ok, 'zattia', '2026-11-01T15:00:00Z'), prueba(bdi, 'bdi', '2026-11-01T15:00:00Z')]).toEqual([false, true, true])
    // después del corte de BDI, antes del de Zattia
    expect([prueba(bdi, 'bdi', '2026-11-17T15:00:00Z'), prueba(ok, 'zattia', '2026-11-17T15:00:00Z')]).toEqual([false, true])
    // un segundo antes del corte de BDI, todavía de prueba
    expect(prueba(bdi, 'bdi', '2026-11-16T02:59:59Z')).toBe(true)
    // después del de Zattia, todas reales
    expect([prueba(ok, 'zattia', '2026-11-25T15:00:00Z'), prueba(stu, 'zattia', '2026-11-25T15:00:00Z')]).toEqual([false, false])
  })
  it('🔑 manda la FECHA DE LA VENTA (Bruno, 1-nov): una de BDI de antes de su corte, cargada después, es de prueba', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-20T15:00:00Z'))
    try {
      const cargada = (ocurrida_en: string) => prueba({ ...bdi, ocurrida_en }, 'bdi', '2026-11-20T15:00:00Z')
      expect(cargada('2026-11-10T15:00:00Z')).toBe(true)
      expect(cargada('2026-11-18T15:00:00Z')).toBe(false)
      // sin fecha, el momento de cargarla
      expect(prueba(bdi, 'bdi', '2026-11-20T15:00:00Z')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
  it('sin cortes TIRA (⛔ un default que diga «nadie cortó»)', () => {
    expect(() => entradaManual(stu, 'zattia', 'Bruno', {} as never)).toThrow(/cortes/)
  })
  it('ERP_STUNNED_PRUEBA ya ⛔ se lee', () => {
    process.env.ERP_STUNNED_PRUEBA = '1'
    try {
      expect(prueba(stu, 'zattia', '2026-11-01T15:00:00Z')).toBe(false)
    } finally {
      delete process.env.ERP_STUNNED_PRUEBA
    }
  })
})

describe('Nueva venta (Bruno 10-nov): precio de lista, descuento por producto y % de la forma de pago', () => {
  const nv = {
    linea: 'zattia', origen_ref: '0f8fad5b-d9cb-469f-a165-70867728950e', canal: 'local', deposito: 'local', modo: 'local', paso: 100,
    lineas: [{ producto: '101', talle: '7', cantidad: 1, precio: 32900, descuento_pct: 0 }, { producto: '102', talle: '1', cantidad: 1, precio: 27500, descuento_pct: 20 }],
    pagos: [{ cuenta: 'tr', base: null, porcentaje: 10, redondear: true }],
  }

  it('la línea lleva su descuento en pesos y el pago su % y su redondeo (⛔ 0 y 0 como antes)', () => {
    const r = entradaManual(nv, 'zattia', 'Bruno', HOY)
    if ('error' in r) throw new Error(r.error)
    expect(r.entrada.lineas[1]).toMatchObject({ precio: 27500, descuento: 5500, importe: 22000 })
    expect(r.entrada.subtotal).toBe(54900)
    expect(r.entrada.pagos[0]).toMatchObject({ cuenta: 'tr', base: 54900, porcentaje: 10, descuento: 5490, redondeo: -10, monto: 49400 })
    expect(r.entrada.total).toBe(49400)
  })

  it('el servidor rearma los montos: un monto mentido por el navegador ⛔ pasa', () => {
    const r = entradaManual({ ...nv, pagos: [{ cuenta: 'tr', base: null, porcentaje: 10, redondear: true, monto: 1 }] }, 'zattia', null, HOY)
    if ('error' in r) throw new Error(r.error)
    expect(r.entrada.total).toBe(49400)
  })

  it('dos formas de pago: la primera paga su parte y la última lo que falta', () => {
    const r = entradaManual({ ...nv, pagos: [{ cuenta: 'ef', base: 20000, porcentaje: 15, redondear: true }, { cuenta: 'tr', base: null, porcentaje: 10, redondear: true }] }, 'zattia', null, HOY)
    if ('error' in r) throw new Error(r.error)
    expect(r.entrada.pagos.map((p: { base: number; monto: number }) => [p.base, p.monto])).toEqual([[20000, 17000], [34900, 31400]])
    expect(r.entrada.total).toBe(48400)
  })

  it('«Corregir una venta pasada» pide motivo y fecha, y los guarda; la del local es de AHORA', () => {
    const e = (b: object) => { const r = entradaManual({ ...nv, ...b }, 'zattia', null, HOY); return 'error' in r ? r.error : r.entrada }
    expect(e({ modo: 'corregir', ocurrida_en: '2026-10-30T15:00:00Z' })).toMatch(/por qué/)
    expect(e({ modo: 'corregir', motivo: 'se olvidó en la caja' })).toMatch(/cuándo/)
    const ok = e({ modo: 'corregir', motivo: 'se olvidó en la caja', ocurrida_en: '2026-10-30T15:00:00Z' }) as { detalle: unknown; ocurrida_en: string }
    expect(ok.detalle).toEqual({ modo: 'corregir', motivo: 'se olvidó en la caja' })
    expect(ok.ocurrida_en).toBe('2026-10-30T15:00:00.000Z')
    expect((e({ ocurrida_en: '2026-10-01T15:00:00Z' }) as { ocurrida_en?: string }).ocurrida_en).toBeUndefined()
  })
})
