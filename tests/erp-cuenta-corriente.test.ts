import { describe, expect, it } from 'vitest'
import { armarFilasCuenta, contarVistas, estadoDe, filtrar, nombresDeVentas, ordenar, resumen, textoCredito } from '../lib/erp/cuenta-corriente.core.js'

// Con la forma de `cuentasCorrientes` del motor (contrato §15), con la línea pegada por el servidor.
const tramos = (a = 0, b = 0, c = 0, d = 0) => ({ '0–30': a, '31–60': b, '61–90': c, 'más de 90': d })
const CUENTAS = [
  { cliente_id: 'a', linea: 'bdi', nombre: 'Manuel Sosa', doc: null, credito: null, saldo: 2788020, a_favor: 0, debe: 2788020, dias_mayor: 90, vencido: 2788020, atrasado: true, sin_credito: true, tramos: tramos(0, 0, 2788020) },
  { cliente_id: 'b', linea: 'bdi', nombre: 'Casa Ganga', doc: '30-1', credito: { credito: true, tope: 1000000, dias: 30, puesto_por: 'Bruno', puesto_en: '2026-10-20T12:00:00Z' }, saldo: 400000, a_favor: 0, debe: 400000, dias_mayor: 10, vencido: 0, atrasado: false, sin_credito: false, tramos: tramos(400000) },
  { cliente_id: 'c', linea: 'bdi', nombre: 'Tienda Sur', doc: null, credito: { credito: true, tope: null, dias: null, puesto_por: 'Bruno', puesto_en: null }, saldo: -5000.5, a_favor: 5000.5, debe: 0, dias_mayor: 0, vencido: 0, atrasado: false, sin_credito: false, tramos: tramos() },
  { cliente_id: 'd', linea: 'bdi', nombre: 'Mayorista Oeste', doc: null, credito: { credito: true, tope: null, dias: 15, puesto_por: 'Bruno', puesto_en: null }, saldo: 0, a_favor: 0, debe: 0, dias_mayor: 0, vencido: 0, atrasado: false, sin_credito: false, tramos: tramos() },
]

describe('cuenta corriente — núcleo', () => {
  const filas = armarFilasCuenta(CUENTAS)

  it('el estado sale del motor: vencido ⇒ atrasada; saldo negativo ⇒ a favor; debe sin vencer ⇒ al día; nada ⇒ sin saldo', () => {
    expect(filas.map((f) => f.estado)).toEqual(['atrasada', 'aldia', 'favor', 'cero'])
    expect(estadoDe({ saldo: 10, debe: 10, vencido: 0 })).toBe('aldia')
  })

  it('las vistas cuentan lo que muestran', () => {
    expect(contarVistas(filas)).toEqual({ saldo: 3, atrasadas: 1, favor: 1, credito: 3, todas: 4 })
    expect(filtrar(filas, { vista: 'favor' }).map((f) => f.nombre)).toEqual(['Tienda Sur'])
    expect(filtrar(filas, { q: '30-1' }).map((f) => f.nombre)).toEqual(['Casa Ganga'])
  })

  it('por cobrar = Σ saldo (debe − a favor), y los tramos suman lo que deben', () => {
    const r = resumen(filas)
    expect(r.porCobrar).toBe(Math.round((2788020 + 400000 - 5000.5) * 100) / 100)
    expect(r.debe).toBe(3188020)
    expect(Object.values(r.tramos).reduce((a, b) => a + b, 0)).toBe(r.debe)
    expect(r).toMatchObject({ atrasadas: 1, vencido: 2788020, aFavor: 5000.5, conFavor: 1, conCredito: 3, conSaldo: 3 })
  })

  it('sin orden elegido respeta el del motor; con orden, por la columna', () => {
    expect(ordenar(filas, null).map((f) => f.clienteId)).toEqual(['a', 'b', 'c', 'd'])
    expect(ordenar(filas, { col: 'saldo', dir: 'asc' }).map((f) => f.clienteId)).toEqual(['c', 'd', 'b', 'a'])
  })

  it('el crédito en palabras', () => {
    const plata = (n: number) => `$${n}`
    expect(textoCredito(null, plata)).toBe('Sin crédito')
    expect(textoCredito(CUENTAS[1].credito, plata)).toBe('Tope $1000000 · 30 días')
    expect(textoCredito(CUENTAS[2].credito, plata)).toBe('Sin tope · sin plazo')
  })

  it('las ventas del mayor se nombran por su número', () => {
    const m = nombresDeVentas({ renglones: [{ ref: 'venta:x', detalle: 'Venta 860' }, { ref: 'pago:1', detalle: 'Transferencia' }] })
    expect(m.get('venta:x')).toBe('Venta 860')
    expect(m.has('pago:1')).toBe(false)
  })
})

describe('Cuenta corriente: las dos columnas del motor (§18)', () => {
  it('trae ventas con saldo y el último cobro; sin ellos queda null (copia vieja del motor)', async () => {
    const { armarFilasCuenta, ordenar } = await import('@/lib/erp/cuenta-corriente.core.js')
    const base = { linea: 'bdi', nombre: 'A', saldo: 10, debe: 10, a_favor: 0, vencido: 0, dias_mayor: 3, tramos: {} }
    const [a, b, c] = armarFilasCuenta([
      { ...base, cliente_id: '1', ventas_con_saldo: 2, ultimo_cobro: { fecha: '2026-10-15', monto: 500 } },
      { ...base, cliente_id: '2', ventas_con_saldo: 5, ultimo_cobro: null },
      { ...base, cliente_id: '3' },
    ])
    expect([a.ventasConSaldo, a.ultimoCobro]).toEqual([2, { fecha: '2026-10-15', monto: 500 }])
    expect([b.ultimoCobro, c.ventasConSaldo, c.ultimoCobro]).toEqual([null, null, null])
    expect(ordenar([a, b, c], { col: 'ventas', dir: 'desc' }).map((f: { clienteId: string }) => f.clienteId)).toEqual(['2', '1', '3'])
  })
})
