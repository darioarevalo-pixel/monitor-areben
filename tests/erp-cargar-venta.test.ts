import { describe, expect, it } from 'vitest'
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
