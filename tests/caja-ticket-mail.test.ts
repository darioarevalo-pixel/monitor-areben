// El ticket por mail (F4): qué le pide la Caja al mailer y qué queda anotado en la venta.
//
// 🔑 El oráculo es el ticket de papel de la venta real #30049 (4-oct-2026): accesorio de $4.990 en
// Efectivo, paga con $5.000 ⇒ descuento $748,50, redondeo −$41,50, total $4.200, vuelto $800.
import { describe, it, expect } from 'vitest'
import { ticketParaMail, estadoDeRespuesta, mandarTicket } from '../lib/caja/ticket-mail.core.js'
import { REGLAS_INICIALES } from '../lib/caja/core.core.js'

const V30049 = {
  id: '0b6f1c8e-2d3a-4f5b-9c7d-1e2f3a4b5c6d',
  estado: 'en_gn',
  email: 'clienta@ejemplo.com',
  gn_number: 30049,
  en_gn_en: '2026-10-04T18:30:00.000Z',
  creada_en: '2026-10-04T18:29:58.000Z',
  renglones: [{ product_id: 1, size_id: 2, cantidad: 1, precio: 4990, descuento: 0, importe: 4990, nombre: 'ACCESORIO NRO 1', talle: 'LILA', foto: null }],
  pagos: [{ cuenta: 12921, base: 4990, porcentaje: 15, descuento: 748.5, redondeo: -41.5, monto: 4200, nombre: 'Efectivo' }],
  subtotal: 4990,
  total: 4200,
  paga_con: 5000,
}
const CFG = { reglas: REGLAS_INICIALES, politica: 'Cambios dentro de los 30 días.' }

describe('ticketParaMail', () => {
  it('#30049: los números del papel, ⛔ recalculados', () => {
    const b = ticketParaMail(V30049, CFG)
    expect(b.marca).toBe('zattia')
    expect(b.email).toBe('clienta@ejemplo.com')
    expect(b.ticket).toMatchObject({
      ventaId: V30049.id, numero: 30049, fecha: V30049.en_gn_en, subtotal: 4990, total: 4200,
      pagaCon: 5000, vuelto: 800, politica: 'Cambios dentro de los 30 días.',
    })
    expect(b.ticket.renglones).toEqual([{ nombre: 'ACCESORIO NRO 1', talle: 'LILA', cantidad: 1, precio: 4990, importe: 4990, foto: null }])
    expect(b.ticket.pagos).toEqual([{ cuenta: 'Efectivo', porcentaje: 15, descuento: 748.5, redondeo: -41.5, monto: 4200 }])
  })

  it('sin pago en efectivo ⛔ hay vuelto aunque se haya anotado «paga con»', () => {
    const v = { ...V30049, pagos: [{ ...V30049.pagos[0], cuenta: 20196, nombre: 'Débito' }] }
    const b = ticketParaMail(v, CFG)
    expect(b.ticket.vuelto).toBeNull()
    expect(b.ticket.pagaCon).toBeNull()
  })

  it('una venta de antes de F4 (sin nombres) sale con el nombre de la cuenta de las reglas y «Producto»', () => {
    const v = { ...V30049, renglones: [{ ...V30049.renglones[0], nombre: undefined, talle: undefined }], pagos: [{ ...V30049.pagos[0], nombre: undefined }] }
    const b = ticketParaMail(v, CFG)
    expect(b.ticket.renglones[0].nombre).toBe('Producto')
    expect(b.ticket.pagos[0].cuenta).toBe('Efectivo')
  })
})

describe('estadoDeRespuesta', () => {
  it('lee lo que contesta el mailer', () => {
    expect(estadoDeRespuesta(200, { encolado: true })).toBe('encolado')
    expect(estadoDeRespuesta(200, { encolado: false, motivo: 'ya estaba encolado' })).toBe('ya estaba')
    expect(estadoDeRespuesta(200, { encolado: false, motivo: 'la marca no tiene la automation del ticket activa' })).toBe('sin automation')
    expect(estadoDeRespuesta(401, null)).toBe('error: el mailer contestó 401')
    expect(estadoDeRespuesta(400, { error: 'los pagos no suman el total' })).toBe('error: el mailer contestó 400: los pagos no suman el total')
  })
})

function sbFalso() {
  const updates: Array<{ cambios: Record<string, unknown>; id: unknown }> = []
  const sb = {
    from: (tabla: string) => {
      const q: Record<string, unknown> = {}
      let cambios: Record<string, unknown> | null = null
      q.select = () => q
      q.update = (c: Record<string, unknown>) => { cambios = c; return q }
      q.eq = (col: string, v: unknown) => {
        if (cambios && col === 'id') { updates.push({ cambios, id: v }); return Promise.resolve({ error: null }) }
        return q
      }
      q.maybeSingle = async () => ({ data: tabla === 'caja_config' ? { reglas: REGLAS_INICIALES, politica_cambio: null } : null, error: null })
      return q
    },
  }
  return { sb, updates }
}

describe('mandarTicket', () => {
  it('manda la llave en el HEADER (⛔ en la URL) y anota «encolado»', async () => {
    const { sb, updates } = sbFalso()
    const pedidos: Array<{ url: string; init: RequestInit }> = []
    const fetch = (async (url: string, init: RequestInit) => {
      pedidos.push({ url, init })
      return new Response(JSON.stringify({ encolado: true, runId: 'r1' }), { status: 200 })
    }) as unknown as typeof globalThis.fetch
    const estado = await mandarTicket(V30049, { sb, fetch, url: 'https://mailer.test/', key: 'llave-secreta' })
    expect(estado).toBe('encolado')
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0].url).toBe('https://mailer.test/api/externo/ticket')
    expect(pedidos[0].url).not.toContain('llave-secreta')
    expect((pedidos[0].init.headers as Record<string, string>)['x-ticket-key']).toBe('llave-secreta')
    expect(JSON.parse(String(pedidos[0].init.body)).ticket.total).toBe(4200)
    expect(updates).toEqual([{ cambios: { ticket_mail: 'encolado' }, id: V30049.id }])
  })

  it('el mailer caído ⛔ lanza: anota el error sin la llave', async () => {
    const { sb, updates } = sbFalso()
    const fetch = (async () => { throw new Error('connect ECONNREFUSED x-ticket-key=llave-secreta-larguisima-0123456789abcdef0123') }) as unknown as typeof globalThis.fetch
    const estado = await mandarTicket(V30049, { sb, fetch, url: 'https://mailer.test', key: 'llave-secreta-larguisima-0123456789abcdef0123' })
    expect(estado).toMatch(/^error: /)
    expect(estado).not.toContain('llave-secreta-larguisima')
    expect(updates[0].cambios.ticket_mail).toBe(estado)
  })

  it('sin mail, sin GN o sin configurar ⛔ hace nada', async () => {
    const { sb, updates } = sbFalso()
    let llamadas = 0
    const fetch = (async () => { llamadas++; return new Response('{}') }) as unknown as typeof globalThis.fetch
    expect(await mandarTicket({ ...V30049, email: null }, { sb, fetch, url: 'u', key: 'k' })).toBeNull()
    expect(await mandarTicket({ ...V30049, estado: 'error' }, { sb, fetch, url: 'u', key: 'k' })).toBeNull()
    expect(await mandarTicket(V30049, { sb, fetch, url: undefined, key: 'k' })).toBeNull()
    expect(llamadas).toBe(0)
    expect(updates).toHaveLength(0)
  })
})
