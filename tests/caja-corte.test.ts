import { describe, it, expect, vi } from 'vitest'
import { destinoPorCorte, lineaDelRenglon, lineasErpDeStore, marcaDeVentaErp, todoEnErp } from '../lib/caja/corte-caja.core.js'
import { entradaDelMotor, entradaDelMotorErp } from '../lib/caja/motor.core.js'
import { cortesDeCaja, olvidarCortes, CORTES_TTL_MS } from '../api/_caja-corte.js'

// Los cortes acordados (Bruno 30/31-oct): Stunned 28-oct, BDI 15/16-nov, Zattia 23-nov.
const CORTES = { stunned: '2026-10-28T23:40:27Z', bdi: '2026-11-16T03:00:00Z', zattia: '2026-11-23T03:00:00Z' }
const ANTES = { stunned: new Date('2026-10-28T23:40:26Z'), bdi: new Date('2026-11-16T02:59:59Z'), zattia: new Date('2026-11-23T02:59:59Z') }
const DESPUES = { stunned: new Date('2026-10-28T23:40:27Z'), bdi: new Date('2026-11-16T03:00:00Z'), zattia: new Date('2026-11-23T03:00:00Z') }

describe('lineaDelRenglon: del PRODUCTO, con el SKU de la variante', () => {
  it('en BDI todo es BDI (el prefijo STU ⛔ significa nada)', () => {
    expect(lineaDelRenglon('bdi', { sku: 'STU-X' }, { sku: 'STU-X' })).toBe('bdi')
    expect(lineaDelRenglon('bdi', { sku: null }, null)).toBe('bdi')
  })
  it('en Zattia: el SKU del producto, el proveedor de respaldo y el SKU de la variante', () => {
    expect(lineaDelRenglon('zattia', { sku: 'RFA-1' }, { sku: 'RFA' })).toBe('zattia')
    expect(lineaDelRenglon('zattia', { sku: 'RFA-1' }, { sku: 'STU-REM' })).toBe('stunned')
    expect(lineaDelRenglon('zattia', { sku: 'RFA-1' }, { sku: null, proveedor: 'STUNNED' })).toBe('stunned')
    expect(lineaDelRenglon('zattia', { sku: 'STU-REM-1-S' }, { sku: null, proveedor: null })).toBe('stunned')
    // Sin el producto en el espejo, sólo el SKU del renglón.
    expect(lineaDelRenglon('zattia', { sku: 'STU-1' }, undefined)).toBe('stunned')
    expect(lineaDelRenglon('zattia', { sku: 'RFA-1' }, undefined)).toBe('zattia')
  })
})

describe('destinoPorCorte: las 3 líneas × antes/después de su corte', () => {
  for (const linea of ['stunned', 'bdi', 'zattia'] as const) {
    it(`${linea}: un segundo antes ⇒ GN; en el instante ⇒ ERP con marca ${linea}`, () => {
      expect(destinoPorCorte({ cortes: CORTES, lineas: [linea, linea], ahora: ANTES[linea] })).toEqual({ destino: 'gn', marca: linea })
      expect(destinoPorCorte({ cortes: CORTES, lineas: [linea, linea], ahora: DESPUES[linea] })).toEqual({ destino: 'erp', marca: linea })
    })
  }
  it('sin fila de corte ⇒ GN (lo publicado ⛔ cambia nada hasta el corte)', () => {
    expect(destinoPorCorte({ cortes: {}, lineas: ['bdi'], ahora: new Date('2030-01-01') }).destino).toBe('gn')
    expect(destinoPorCorte({ cortes: { stunned: CORTES.stunned }, lineas: ['zattia'], ahora: new Date('2030-01-01') }).destino).toBe('gn')
  })
  it('mezclado: con alguna línea en el ERP se frena; sin ninguna, GN como hoy', () => {
    const m = destinoPorCorte({ cortes: CORTES, lineas: ['stunned', 'zattia'], ahora: DESPUES.stunned })
    expect(m.error).toMatch(/cobralas por separado/)
    expect(m.error).toMatch(/Stunned y de Zattia/)
    expect(destinoPorCorte({ cortes: CORTES, lineas: ['stunned', 'zattia'], ahora: ANTES.stunned })).toEqual({ destino: 'gn', marca: null })
    // Después del corte de Zattia sigue frenado: una venta del motor tiene UNA marca.
    expect(destinoPorCorte({ cortes: CORTES, lineas: ['zattia', 'stunned'], ahora: DESPUES.zattia }).error).toBeTruthy()
  })
  it('🔴 sin cortes TIRA (⛔ un default que olvide el corte callado)', () => {
    expect(() => destinoPorCorte({ cortes: undefined as unknown as Record<string, string>, lineas: ['bdi'] })).toThrow(/cortes/)
  })
})

describe('las líneas en el ERP de cada Caja, y cuándo GN ya ⛔ tiene ventas', () => {
  it('lineasErpDeStore', () => {
    expect(lineasErpDeStore(CORTES, 'zattia', DESPUES.stunned)).toEqual(['stunned'])
    expect(lineasErpDeStore(CORTES, 'zattia', DESPUES.zattia)).toEqual(['zattia', 'stunned'])
    expect(lineasErpDeStore(CORTES, 'bdi', ANTES.bdi)).toEqual([])
    expect(lineasErpDeStore(CORTES, 'bdi', DESPUES.bdi)).toEqual(['bdi'])
  })
  it('todoEnErp: BDI desde su corte; Zattia sólo cuando cortaron Zattia Y Stunned', () => {
    expect(todoEnErp(CORTES, 'bdi', ANTES.bdi)).toBe(false)
    expect(todoEnErp(CORTES, 'bdi', DESPUES.bdi)).toBe(true)
    expect(todoEnErp(CORTES, 'zattia', DESPUES.stunned)).toBe(false)
    expect(todoEnErp(CORTES, 'zattia', DESPUES.zattia)).toBe(true)
    expect(todoEnErp({}, 'bdi', new Date('2030-01-01'))).toBe(false)
  })
})

describe('la venta al ERP: marca de su línea y REAL', () => {
  const fila = { id: 'u1', store: 'bdi', usuario: 'Ana', creada_en: '2026-11-16T15:00:00Z', renglones: [{ product_id: 1, size_id: 2, cantidad: 1, precio: 100, importe: 100, sku: 'F-1', linea: 'bdi' }], pagos: [{ cuenta: 9, monto: 100 }], subtotal: 100, total: 100, paga_con: 200 }
  it('marcaDeVentaErp: la línea que dejó el servidor; las filas viejas de Zattia eran Stunned', () => {
    expect(marcaDeVentaErp(fila)).toBe('bdi')
    expect(marcaDeVentaErp({ ...fila, store: 'zattia', renglones: [{}] })).toBe('stunned')
    expect(() => marcaDeVentaErp({ ...fila, renglones: [{}] })).toThrow(/no dice de qué línea/)
    expect(() => marcaDeVentaErp({ ...fila, renglones: [{ linea: 'stunned' }] })).toThrow(/no es de la Caja de bdi/)
    expect(() => marcaDeVentaErp({ ...fila, store: 'zattia', renglones: [{ linea: 'stunned' }, { linea: 'zattia' }] })).toThrow(/mezcla/)
  })
  it('entradaDelMotorErp: la marca que le dicen, prueba false, sin datos de GN', () => {
    const e = entradaDelMotorErp(fila, { marca: 'bdi' })
    expect(e).toMatchObject({ marca: 'bdi', prueba: false, origen: 'caja', origen_ref: 'u1' })
    expect(e.detalle).toEqual({ paga_con: 200 })
    expect(() => entradaDelMotorErp(fila, { marca: '' })).toThrow(/marca/)
  })
  it('la copia de GN sigue igual (marca de la tienda, prueba)', () => {
    expect(entradaDelMotor(fila)).toMatchObject({ marca: 'bdi', prueba: true })
  })
})

describe('cortesDeCaja: caché de 5 min y la última lectura buena si la base ⛔ contesta', () => {
  it('lee una vez por ventana; si falla, la vieja; en frío, TIRA', async () => {
    olvidarCortes()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const leer = vi.fn(async () => ({ stunned: CORTES.stunned }))
    expect(await cortesDeCaja('zattia', { ahora: 0, leer })).toEqual({ stunned: CORTES.stunned })
    await cortesDeCaja('zattia', { ahora: CORTES_TTL_MS - 1, leer })
    expect(leer).toHaveBeenCalledTimes(1)
    const cae = vi.fn(async () => { throw new Error('sin base') })
    expect(await cortesDeCaja('zattia', { ahora: CORTES_TTL_MS, leer: cae })).toEqual({ stunned: CORTES.stunned })
    expect(cae).toHaveBeenCalledTimes(1)
    // Se agrega el corte de BDI: la próxima lectura buena lo trae.
    expect(await cortesDeCaja('zattia', { ahora: 2 * CORTES_TTL_MS, leer: async () => ({ ...CORTES }) })).toEqual(CORTES)
    await expect(cortesDeCaja('bdi', { ahora: 0, leer: cae })).rejects.toThrow('sin base')
    warn.mockRestore()
  })
})
