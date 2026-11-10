import { describe, it, expect } from 'vitest'
import { cajaGerencia, entradaDelMotor, entradaDelMotorErp } from '../lib/caja/motor.core.js'
import { REGLAS_INICIALES } from '../lib/caja/core.core.js'
import { MARCAS_CAJA } from '../lib/caja/marcas.core.js'

// 🎯 Bruno 10-nov: «ERP sin CG; GN igual». Las reglas como están en prod (caja_config, leídas el 10-nov).
const ZATTIA = {
  medios: { transferencia: { feria: 25868, opciones: [13015, 20595] } },
  transferenciaPorMp: { 136578181: 20595 }, transferenciaFija: null,
  titulares: { bruno: 20595, dario: 20595, areben: 13015 },
}
const BDI = {
  medios: { transferencia: { feria: null, opciones: [14701, 20597] } },
  transferenciaPorMp: { 1911036737: 14701 }, transferenciaFija: 20597,
  titulares: { bruno: 20597, dario: 20597, areben: 14701 },
}

const fila = (store: string, cuenta: number) => ({
  id: '11111111-1111-4111-8111-111111111111', store, estado: 'en_gn', usuario: 'karen', creada_en: '2026-11-10T15:00:00Z',
  renglones: [{ product_id: 1, size_id: 2, cantidad: 1, precio: 10000, descuento: 0, rebaja: 0, importe: 10000 }],
  pagos: [{ cuenta, base: 10000, porcentaje: 10, descuento: 1000, redondeo: 0, monto: 9000 }],
  subtotal: 10000, total: 9000,
})

describe('cajaGerencia: qué cuentas de GN son «Caja Gerencia» (de las reglas, ⛔ fijas)', () => {
  it('Zattia/Stunned: 20595 ⇒ 13015; BDI: 20597 ⇒ 14701', () => {
    expect(cajaGerencia(ZATTIA)).toEqual({ normal: 13015, cg: new Set([20595]) })
    expect(cajaGerencia(BDI)).toEqual({ normal: 14701, cg: new Set([20597]) })
  })
  it('la feria ⛔ es CG', () => {
    expect(cajaGerencia(ZATTIA)!.cg.has(25868)).toBe(false)
  })
  it('sin reglas o sin titular de Areben ⇒ nada que traducir', () => {
    expect(cajaGerencia(null)).toBeNull()
    expect(cajaGerencia({ medios: ZATTIA.medios })).toBeNull()
  })
  it('las siembras de cada marca dan lo mismo que prod', () => {
    for (const m of Object.values(MARCAS_CAJA as Record<string, { reglasIniciales: unknown }>)) {
      const r = cajaGerencia(m.reglasIniciales)
      if (r) expect(r.cg.has(r.normal)).toBe(false)
    }
    expect(REGLAS_INICIALES).toBeTruthy()
  })
})

describe('la venta del POS de una línea en el ERP entra SIN CG', () => {
  it('Stunned con transferencia a CG (20595) ⇒ el ERP la anota en 13015, con el mismo descuento y monto', () => {
    const v = fila('zattia', 20595)
    const e = entradaDelMotorErp(v, { marca: 'stunned', reglas: ZATTIA })
    expect(e.pagos).toEqual([{ cuenta: 13015, base: 10000, porcentaje: 10, descuento: 1000, redondeo: 0, monto: 9000 }])
    // La fila del POS (lo que cobró, lo que va a GN mientras la línea escriba ahí) ⛔ cambia.
    expect(v.pagos[0].cuenta).toBe(20595)
  })
  it('BDI después del corte: 20597 ⇒ 14701', () => {
    expect(entradaDelMotorErp(fila('bdi', 20597), { marca: 'bdi', reglas: BDI }).pagos[0].cuenta).toBe(14701)
  })
  it('las otras cuentas pasan igual (efectivo, feria)', () => {
    expect(entradaDelMotorErp(fila('zattia', 12921), { marca: 'stunned', reglas: ZATTIA }).pagos[0].cuenta).toBe(12921)
    expect(entradaDelMotorErp(fila('zattia', 25868), { marca: 'zattia', reglas: ZATTIA }).pagos[0].cuenta).toBe(25868)
  })
  it('reglas null (⛔ se pudieron leer) ⇒ va como antes', () => {
    expect(entradaDelMotorErp(fila('zattia', 20595), { marca: 'stunned', reglas: null }).pagos[0].cuenta).toBe(20595)
  })
  it('sin el parámetro reglas ⇒ tira (⛔ un default escondido)', () => {
    expect(() => entradaDelMotorErp(fila('zattia', 20595), { marca: 'stunned' } as never)).toThrow(/reglas/)
  })
})

describe('la copia de PRUEBA (línea que todavía escribe en GN) ⛔ cambia', () => {
  it('Zattia antes del 23-nov: el motor recibe 20595, igual que GN', () => {
    expect(entradaDelMotor(fila('zattia', 20595)).pagos[0].cuenta).toBe(20595)
  })
})
