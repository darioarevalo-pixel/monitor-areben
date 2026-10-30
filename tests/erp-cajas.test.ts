import { describe, expect, it } from 'vitest'
import {
  armarFilasCajas, cajaDelCodigo, contarVistasCaja, filtrarCaja, normalizarPrefsCaja, ordenarCaja, rangoCaja, resumenCaja,
} from '@/lib/erp/cajas.core.js'

/**
 * **ERP › Ventas › Cajas, el núcleo**: un turno de la Caja por fila; la diferencia es la del cierre (contado − esperado, +
 * sobra / − falta) y sólo la tiene un turno CERRADO; el período en días argentinos.
 */
const turno = (id: string, abierto: string, extra: Record<string, unknown> = {}) => ({
  id, abierto_en: abierto, abierto_por: 'josefina', fondo: '50000', cerrado_en: null, cerrado_por: null, contado: null, esperado: null, nota: null, resumen: null, ...extra,
})
const filas = armarFilasCajas([
  turno('a', '2026-10-20T13:00:00Z'),
  turno('b', '2026-10-19T13:00:00Z', { cerrado_en: '2026-10-19T22:00:00Z', cerrado_por: 'camila', esperado: '95900', contado: 95900,
    resumen: { ventas: 6, total: 73500, efectivo: { fondo: 55900, cobrado: 40000, deEspera: 0, cobradoGN: 0, aportes: 0, salidas: 0, esperado: 95900 }, porForma: [{ nombre: 'Efectivo', monto: '40000', cobros: 4 }] } }),
  turno('c', '2026-10-18T13:00:00Z', { cerrado_en: '2026-10-18T22:00:00Z', esperado: 100000, contado: 98599.9 }),
  turno('d', '2026-10-17T13:00:00Z', { cerrado_en: '2026-10-17T22:00:00Z', esperado: 80000, contado: 80500, numero: 140,
    arqueo: { estado: 'bien', esperado: 30500, contado: 30500, diferencia: 0, nota: null, por: 'bruno', en: '2026-10-18T12:00:00Z' } }),
  turno('e', '2026-10-16T13:00:00Z', { cerrado_en: '2026-10-16T22:00:00Z', esperado: 60000, contado: 60000, numero: 139,
    arqueo: { estado: 'diferencia', esperado: 10000, contado: 9000, diferencia: -1000, nota: 'faltaba', por: 'bruno', en: '2026-10-17T12:00:00Z' } }),
], 'zattia')
const de = (id: string) => filas.find((f) => f.id === id)!

describe('armarFilasCajas', () => {
  it('la diferencia sólo en los cerrados, en centavos y con signo', () => {
    expect(de('a')).toMatchObject({ abierta: true, diferencia: null, fondo: 50000, ventas: null })
    expect(de('b')).toMatchObject({ abierta: false, diferencia: 0, ventas: 6, total: 73500, esperado: 95900, porForma: [{ nombre: 'Efectivo', monto: 40000, cobros: 4 }] })
    expect(de('c').diferencia).toBe(-1400.1)
    expect(de('d').diferencia).toBe(500)
  })
})

describe('vistas, resumen y orden', () => {
  it('con diferencia = cerrados con diferencia distinta de cero', () => {
    expect(contarVistasCaja(filas)).toEqual({ todas: 5, dif: 2, sin_recibir: 2, sobre_dif: 1, listas: 1 })
    expect(filtrarCaja(filas, 'dif').map((f) => f.id)).toEqual(['c', 'd'])
  })
  it('el resumen suma lo que faltó y lo que sobró por separado', () => {
    expect(resumenCaja(filas)).toEqual({ cierres: 4, conDiferencia: 2, diferencia: -900.1, falto: -1400.1, sobro: 500 })
  })
  it('sin orden, la más nueva arriba; por diferencia, lo que falta al final', () => {
    expect(ordenarCaja(filas, null).map((f) => f.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ordenarCaja(filas, { col: 'dif', dir: 'desc' }).map((f) => f.id)).toEqual(['d', 'b', 'e', 'c', 'a'])
  })
  it('columnas de siempre', () => {
    expect(normalizarPrefsCaja(null).visibles).toEqual(['abrio', 'cerro', 'estado', 'ventas', 'esp', 'cont', 'dif', 'codigo', 'arqueo'])
  })
  it('el arqueo es fijo: aparece aunque la lista tenga columnas guardadas de antes', () => {
    expect(normalizarPrefsCaja({ orden: ['abrio', 'dif'], visibles: ['abrio', 'dif'] }).visibles).toContain('arqueo')
  })
})

describe('arqueo de caja (30-oct)', () => {
  it('el código, lo que tiene que traer y el estado del sobre', () => {
    expect(de('a')).toMatchObject({ codigo: null, sobre: null, sobreEstado: 'abierta' })
    expect(de('b')).toMatchObject({ codigo: null, sobre: 45900, sobreEstado: 'sin_recibir' })
    expect(de('d')).toMatchObject({ codigo: 'Z-0140', sobre: 30500, sobreEstado: 'lista' })
    expect(de('e')).toMatchObject({ codigo: 'Z-0139', sobreEstado: 'diferencia' })
  })
  it('vistas del sobre: sin recibir · con diferencia · listas', () => {
    expect(filtrarCaja(filas, 'sin_recibir').map((f) => f.id)).toEqual(['b', 'c'])
    expect(filtrarCaja(filas, 'sobre_dif').map((f) => f.id)).toEqual(['e'])
    expect(filtrarCaja(filas, 'listas').map((f) => f.id)).toEqual(['d'])
  })
  it('el código escaneado abre su caja; el de BDI ⛔', () => {
    expect(cajaDelCodigo(filas, 'z-140', 'zattia')?.id).toBe('d')
    expect(cajaDelCodigo(filas, 'B-0140', 'zattia')).toBeNull()
    expect(cajaDelCodigo(filas, 'Z-0001', 'zattia')).toBeNull()
  })
})

describe('rangoCaja', () => {
  it('este mes, el pasado (también en enero) y 7 días', () => {
    expect(rangoCaja('mes', '2026-10-20')).toEqual({ desde: '2026-10-01', hasta: '2026-10-20' })
    expect(rangoCaja('pasado', '2026-10-20')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' })
    expect(rangoCaja('pasado', '2027-01-05')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' })
    expect(rangoCaja('7', '2026-10-03')).toEqual({ desde: '2026-09-27', hasta: '2026-10-03' })
  })
})
