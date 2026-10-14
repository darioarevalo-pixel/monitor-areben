// ERP › Diferencias del día: el día del libro armado para resolverlo (lib/erp/diferencias.core.js).
import { describe, it, expect } from 'vitest'
import { CLASE, INEXPLICADAS, armarDiferencias, leerFecha } from '../lib/erp/diferencias.core.js'

const fila = (product_id: number, clase: string, delta_gn: number, delta_libro: number, extra = {}) => ({
  product_id, size_id: 1, deposito: 'local', linea: 'zattia', delta_gn, delta_libro, nivel_gn: 5, nivel_libro: 5 - delta_gn + delta_libro, clase, explicacion: null, ...extra,
})

describe('armarDiferencias', () => {
  const nombres = new Map([['1/1', { nombre: 'Remera', talle: 'M' }]])
  it('agrupa las inexplicadas por clase, la más grande primero, y cuenta las explicadas aparte', () => {
    const d = armarDiferencias({
      filas: [fila(1, 'gn_sin_causa', 1, 0), fila(2, 'gn_sin_causa', 3, 0), fila(3, 'en_vuelo', 1, 0), fila(4, 'libro_sin_gn', 0, -2), fila(5, 'rara', 1, 0)],
      nombres,
    })
    expect(d.grupos.map((g) => [g.clase, g.filas.map((f: { producto: string }) => f.producto), g.unidades])).toEqual([['gn_sin_causa', ['2', '1'], 4], ['libro_sin_gn', ['4'], 2]])
    expect(d.grupos[0].filas[1]).toMatchObject({ nombre: 'Remera', talleNombre: 'M', diferencia: 1, deltaGN: 1, deltaLibro: 0 })
    expect(d.explicadas).toEqual([{ clase: 'en_vuelo', nombre: CLASE.en_vuelo.nombre, variantes: 1 }])
    expect(d.inexplicadas).toBe(3)
    expect(d.desconocidas).toBe(1)
  })
  it('la sobreventa: lo más negativo primero, con nombre', () => {
    const d = armarDiferencias({ filas: [], nombres, negativos: [{ product_id: 9, size_id: 9, linea: 'stunned', deposito: 'local', nivel: -1 }, { product_id: 1, size_id: 1, linea: 'zattia', deposito: 'local', nivel: -2 }] })
    expect(d.sobreventa.map((s) => [s.producto, s.nivelLibro, s.nombre])).toEqual([['1', -2, 'Remera'], ['9', -1, null]])
    expect(d.grupos).toEqual([])
  })
  it('cada clase que escribe el libro tiene su texto', () => {
    for (const c of [...INEXPLICADAS, 'en_vuelo', 'ingreso_pendiente_gn', 'ajuste_pendiente_gn', 'transferencia_por_gn']) expect(CLASE[c as keyof typeof CLASE]).toBeTruthy()
  })
})

describe('leerFecha', () => {
  it('vacía = el último día; si no, YYYY-MM-DD', () => {
    expect(leerFecha('')).toEqual({ fecha: null })
    expect(leerFecha('2026-10-14')).toEqual({ fecha: '2026-10-14' })
    expect(leerFecha('14/10').error).toBeTruthy()
  })
})
