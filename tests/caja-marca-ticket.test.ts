import { describe, it, expect } from 'vitest'
import { marcaDelTicket, destinoDelTicket } from '../lib/caja/marca-ticket.core.js'
import { entradaDelMotorErp, entradaDelMotor } from '../lib/caja/motor.core.js'

const stu = { sku: 'STU-REM-0001-S' }
const zat = { sku: 'RFA-0022-M' }

describe('marcaDelTicket', () => {
  it('Zattia sola, Stunned sola y mezclado', () => {
    expect(marcaDelTicket('zattia', [zat, zat]).marca).toBe('zattia')
    expect(marcaDelTicket('zattia', [stu]).marca).toBe('stunned')
    expect(marcaDelTicket('zattia', [stu, zat]).marca).toBe('mixto')
  })
  it('la pantalla manda `linea` y manda sobre el SKU (producto de GN sin SKU propio)', () => {
    expect(marcaDelTicket('zattia', [{ sku: null, linea: 'stunned' }]).marca).toBe('stunned')
    expect(marcaDelTicket('zattia', [{ sku: 'STU-X', linea: 'zattia' }]).marca).toBe('zattia')
  })
  it('en BDI el prefijo STU no significa nada', () => {
    expect(marcaDelTicket('bdi', [stu]).marca).toBe('bdi')
  })
})

describe('destinoDelTicket', () => {
  it('con la llave apagada TODO va a GN como hoy, mixto incluido', () => {
    expect(destinoDelTicket('zattia', [stu], false).destino).toBe('gn')
    expect(destinoDelTicket('zattia', [stu, zat], false).error).toBeUndefined()
  })
  it('con la llave prendida: Stunned al ERP, Zattia a GN, mixto frenado', () => {
    expect(destinoDelTicket('zattia', [stu], true)).toEqual({ destino: 'erp', marca: 'stunned' })
    expect(destinoDelTicket('zattia', [zat], true).destino).toBe('gn')
    const m = destinoDelTicket('zattia', [stu, zat], true)
    expect(m.error).toMatch(/por separado/)
  })
  it('BDI nunca va al ERP por esta vía', () => {
    expect(destinoDelTicket('bdi', [stu], true).destino).toBe('gn')
  })
})

describe('entradaDelMotorErp', () => {
  const fila = { id: 'u1', store: 'zattia', usuario: 'Ana', creada_en: '2026-11-01T15:00:00Z', renglones: [{ product_id: 1, size_id: 2, cantidad: 1, precio: 100, importe: 100, sku: 'STU-REM-0001-S' }], pagos: [{ cuenta: 12921, monto: 100 }], subtotal: 100, total: 100, gn_sale_id: 5, gn_number: 9, paga_con: 200 }
  it('marca stunned, `prueba` lo decide quien llama, sin datos de GN', () => {
    const e = entradaDelMotorErp(fila, { prueba: true })
    expect(e.marca).toBe('stunned'); expect(e.prueba).toBe(true); expect(e.origen).toBe('caja'); expect(e.origen_ref).toBe('u1')
    expect(e.detalle).toEqual({ paga_con: 200 })
    expect(entradaDelMotorErp(fila, { prueba: false }).prueba).toBe(false)
  })
  it('la de GN sigue igual (marca de la tienda, prueba)', () => {
    const e = entradaDelMotor(fila); expect(e.marca).toBe('zattia'); expect(e.prueba).toBe(true)
  })
})
