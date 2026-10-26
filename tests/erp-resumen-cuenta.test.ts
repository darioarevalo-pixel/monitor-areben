import { describe, expect, it } from 'vitest'
import { enlaceWhatsapp, mensajeDeCuenta, numeroWhatsapp, resumenDeCuentaHtml } from '../lib/erp/resumen-cuenta.core.js'

describe('WhatsApp de la cuenta corriente', () => {
  it('los números escritos a mano se llevan a 549 + 10 dígitos', () => {
    for (const crudo of ['11 5555-1234', '011 15 5555-1234', '+54 9 11 5555-1234', '5491155551234', '0054 11 5555 1234', '(0351) 15-555-1234']) {
      expect(numeroWhatsapp(crudo), crudo).toMatch(/^549\d{10}$/)
    }
    expect(numeroWhatsapp('11 5555-1234')).toBe('5491155551234')
    expect(numeroWhatsapp('011 15 5555-1234')).toBe('5491155551234')
    expect(numeroWhatsapp('0351 15 555-1234')).toBe('5493515551234')
  })
  it('⛔ adivina: lo que no cierra da null', () => {
    for (const crudo of ['', null, undefined, '555-1234', '12345', 'no tiene', '1155551234567890']) expect(numeroWhatsapp(crudo), String(crudo)).toBeNull()
  })
  it('el mensaje dice el saldo, el vencido y la marca; a favor lo dice; en cero no hay mensaje', () => {
    expect(mensajeDeCuenta({ nombre: 'Casa Ganga SRL', linea: 'bdi', saldo: 400000, vencido: 0 })).toBe('Hola Casa, te escribimos de BDI. Tu cuenta corriente tiene un saldo pendiente de $ 400.000. ¿Cuándo podés abonarlo? ¡Gracias!')
    expect(mensajeDeCuenta({ nombre: 'Manuel Sosa', linea: 'zattia', saldo: 2788020, vencido: 1000 })).toContain('De eso, $ 1.000 ya está vencido.')
    expect(mensajeDeCuenta({ nombre: 'Tienda Sur', linea: 'bdi', saldo: -5000.5, vencido: 0 })).toContain('$ 5.001 a tu favor')
    expect(mensajeDeCuenta({ nombre: 'X', linea: 'bdi', saldo: 0, vencido: 0 })).toBeNull()
  })
  it('el enlace sale sólo si hay número válido y algo para decir; si no, el motivo', () => {
    const base = { nombre: 'Casa Ganga', linea: 'bdi', saldo: 100, vencido: 0 }
    const ok = enlaceWhatsapp({ ...base, whatsapp: '11 5555-1234' })
    expect(ok.url).toMatch(/^https:\/\/wa\.me\/5491155551234\?text=Hola%20Casa/)
    expect(ok.motivo).toBeNull()
    expect(enlaceWhatsapp({ ...base, whatsapp: null })).toEqual({ url: null, motivo: 'No tiene WhatsApp cargado.' })
    expect(enlaceWhatsapp({ ...base, whatsapp: '12345' }).motivo).toContain('no se entiende')
    expect(enlaceWhatsapp({ ...base, saldo: 0, whatsapp: '11 5555-1234' }).motivo).toContain('en cero')
  })
})

describe('resumen de cuenta para imprimir', () => {
  const d = {
    fila: { nombre: '<b>Casa</b> & Hijos', doc: null, linea: 'bdi' }, hoy: '2026-10-26', prueba: true,
    estado: { saldo: 400000, debe: 400000, a_favor: 0, vencido: 100000, pendientes: [{ ref: 'v1', fecha: '2026-10-01', monto: 500000, pendiente: 400000, dias: 25 }] },
    mayor: { anterior: 0, renglones: [{ fecha: '2026-10-01', tipo: 'compra', ref: 'v1', detalle: 'Venta 12', debe: 500000, haber: 0, saldo: 500000 }, { fecha: '2026-10-10', tipo: 'pago', ref: 'p1', detalle: '', debe: 0, haber: 100000, saldo: 400000 }] },
    ventas: new Map([['v1', 'Venta 12']]),
  }
  const html = resumenDeCuentaHtml(d)
  it('lleva saldo, ventas con saldo, mayor y la marca de prueba', () => {
    expect(html).toContain('$ 400.000')
    expect(html).toContain('01/10/2026')
    expect(html).toContain('Venta 12')
    expect(html).toContain('Pago')
    expect(html).toContain('Movimientos de prueba')
    expect(html).toContain('$ 100.000 vencido')
  })
  it('⛔ el nombre del cliente no entra como HTML', () => {
    expect(html).not.toContain('<b>Casa</b>')
    expect(html).toContain('&lt;b&gt;Casa&lt;/b&gt; &amp; Hijos')
  })
  it('a favor se rotula distinto y una cuenta sin deuda lo dice', () => {
    const h = resumenDeCuentaHtml({ ...d, estado: { ...d.estado, saldo: -500, pendientes: [] }, mayor: { anterior: 0, renglones: [] } })
    expect(h).toContain('Saldo a favor')
    expect(h).toContain('No debe ninguna venta.')
    expect(h).toContain('Sin movimientos.')
  })
})
