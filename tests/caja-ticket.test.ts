/**
 * El ticket de la Caja. El oráculo es la pantalla de cobro del POS de GN (3-oct): $4.990 en
 * efectivo ⇒ descuento $748,50, redondeo −$41,50, total $4.200. El ticket ⛔ calcula: se le pasa el
 * `cobro` del núcleo y se mira que escriba ESOS números.
 */
import { describe, expect, it } from 'vitest'

import { armarTicket, armarTicketCambio, armarTicketCierre, fechaConDia, fechaTicket, marcasDelTicket, numeroProvisorio, plata, type DatosTicket } from '@/lib/caja/ticket'
import { REGLAS_INICIALES, cobro, nombreParaTicket, renglones } from '@/lib/caja/core.core.js'

const medir = (txt: string) => txt.match(/.{1,40}/g) || ['']
const AHORA = Date.parse('2026-10-04T22:04:00Z') // 19:04 en Argentina
const ID = '3f1c2b9e-6a4d-4c1e-9b7a-2d5e8f0a1b3c'
const reglas = REGLAS_INICIALES as unknown as { redondeo: number; cuentas: Record<number, { nombre: string; descuento: number; efectivo?: boolean }> }
const nombreCuenta = (c: number) => nombreParaTicket(c, REGLAS_INICIALES)
const efectivo = (c: number) => !!reglas.cuentas[c]?.efectivo

type Rebaja = { tipo: 'pct' | 'pesos'; valor: number }
function ticket(items: { precio: number; cantidad?: number; rebaja?: Rebaja }[], pagos: { cuenta: number; base?: number }[], extra: Partial<DatosTicket> = {}, descuentoVenta: Rebaja | null = null) {
  const filas = renglones(items.map((it, i) => ({ product_id: 1, size_id: i + 1, cantidad: it.cantidad ?? 1, precio: it.precio, rebaja: it.rebaja ?? null })))
  const c = cobro({ filas, pagos, reglas, descuentoVenta })
  const datos: DatosTicket = {
    numero: 30048,
    id: ID,
    renglones: filas.map((f, i) => ({ nombre: `PRENDA ${i + 1}`, talle: 'S', cantidad: f.cantidad, precio: f.precio, importe: f.importe })),
    subtotal: c.subtotal,
    pagos: c.pagos,
    total: c.total,
    nombreCuenta,
    pagaCon: null,
    politica: null,
    ...extra,
  }
  const r = armarTicket(datos, efectivo, AHORA, medir)
  const txt = r.ops.filter((o) => o.k === 'txt').map((o) => (o as { txt: string }).txt)
  return { ...r, txt, c }
}

/** El monto que está en el mismo renglón que `concepto` (los pares van a la misma `y`). */
function montoDe(ops: { k: string }[], concepto: string): string | undefined {
  const t = ops.filter((o) => o.k === 'txt') as unknown as { txt: string; y: number; align: string }[]
  const izq = t.find((o) => o.txt === concepto && o.align === 'izq')
  return izq && t.find((o) => o.y === izq.y && o.align === 'der')?.txt
}

describe('caja · ticket contra la pantalla de cobro de GN', () => {
  it('«Variante Única» ⛔ se imprime al lado del nombre; un talle real sí', () => {
    const base = ticket([{ precio: 4990 }], [{ cuenta: 12921 }])
    expect(base.txt).toContain('PRENDA 1 - S')
    const unica = ticket([{ precio: 4990 }], [{ cuenta: 12921 }], {
      renglones: [{ nombre: 'ACCESORIO NRO 1', talle: 'Variante Única', cantidad: 1, precio: 4990, importe: 4990 }],
    })
    expect(unica.txt).toContain('ACCESORIO NRO 1')
    expect(unica.txt.join('|')).not.toContain('Variante')
  })

  it('$4.990 en efectivo ⇒ descuento $748,50, redondeo −$41,50, total $4.200', () => {
    const { ops, txt } = ticket([{ precio: 4990 }], [{ cuenta: 12921 }])
    expect(montoDe(ops, 'Subtotal')).toBe('$4.990')
    expect(montoDe(ops, 'Descuento 15%')).toBe('-$748,50')
    expect(montoDe(ops, 'Redondeo')).toBe('-$41,50')
    expect(montoDe(ops, 'TOTAL')).toBe('$4.200')
    expect(montoDe(ops, 'RECIBIMOS')).toBe('$4.200')
    expect(montoDe(ops, 'SALDO')).toBe('$0')
    expect(txt).toContain('COMPROBANTE')
    expect(txt).toContain('DOCUMENTO NO VÁLIDO COMO FACTURA')
    expect(txt).toContain('Comprobante: #30048')
    expect(txt).toContain('Cliente: Consumidor Final')
    expect(txt).toContain('Gracias por tu compra!')
    // ⛔ Las formas de pago abajo (Bruno, 5-oct: «es raro»).
    expect(montoDe(ops, 'Efectivo')).toBeUndefined()
  })

  it('cascada (Bruno, 4-oct): el de la prenda, «Descuento en la venta», y el de la forma de pago sin la cuenta', () => {
    const { ops, txt } = ticket([{ precio: 10000, rebaja: { tipo: 'pct', valor: 20 } }], [{ cuenta: 20595 }], {}, { tipo: 'pct', valor: 10 })
    expect(montoDe(ops, '1 x $10.000')).toBe('$10.000')
    expect(montoDe(ops, 'Descuento')).toBe('-$2.000')
    expect(montoDe(ops, 'Subtotal')).toBe('$8.000')
    expect(montoDe(ops, 'Descuento en la venta')).toBe('-$800')
    expect(montoDe(ops, 'Descuento 10%')).toBe('-$720')
    expect(montoDe(ops, 'TOTAL')).toBe('$6.500')
    expect(montoDe(ops, 'RECIBIMOS')).toBe('$6.500')
    expect(txt.join('|')).not.toMatch(/CG|Transferencia CG/)
  })

  it('con «paga con»: RECIBIMOS lo entregado y el VUELTO', () => {
    const { ops } = ticket([{ precio: 4990 }], [{ cuenta: 12921 }], { pagaCon: 5000 })
    expect(montoDe(ops, 'RECIBIMOS')).toBe('$5.000')
    expect(montoDe(ops, 'VUELTO')).toBe('$800')
  })

  it('🔴 el redondeo PARA ARRIBA se llama «Redondeo», ⛔ «Recargo» (Bruno, 13-oct)', () => {
    // Feria Efectivo al 0 %: $4.990 ⇒ $5.000.
    const { ops, txt, c } = ticket([{ precio: 4990 }], [{ cuenta: 25867 }])
    expect(c.total).toBe(5000)
    expect(montoDe(ops, 'Redondeo')).toBe('+$10')
    expect(txt.some((t) => /recargo/i.test(t))).toBe(false)
    expect(txt.some((t) => t.startsWith('Descuento'))).toBe(false)
  })

  it('varios pagos: un descuento por cuenta y el vuelto sólo sobre lo que fue en efectivo', () => {
    const { ops, c } = ticket([{ precio: 20000 }], [{ cuenta: 12921, base: 10000 }, { cuenta: 20196 }], { pagaCon: 10000 })
    expect(montoDe(ops, 'Descuento 15%')).toBe('-$1.500')
    expect(montoDe(ops, 'Descuento 10%')).toBe('-$1.000')
    expect(montoDe(ops, 'TOTAL')).toBe(plata(c.total))
    // RECIBIMOS = los $9.000 del débito + los $10.000 que entregó en efectivo.
    expect(montoDe(ops, 'RECIBIMOS')).toBe('$19.000')
    expect(montoDe(ops, 'VUELTO')).toBe('$1.500') // 10.000 − 8.500 de efectivo, ⛔ − el total
  })

  it('🔴 sin número de GN sale igual, con el provisorio y diciendo que está pendiente', () => {
    const { txt } = ticket([{ precio: 4990 }], [{ cuenta: 12921 }], { numero: null })
    expect(txt).toContain(`Comprobante: Provisorio ${numeroProvisorio(ID)}`)
    expect(txt).toContain('Venta pendiente en Gestión Nube')
    expect(txt.some((t) => /^#\d/.test(t))).toBe(false)
  })

  it('la política de cambio va si hay, y el papel crece con los renglones', () => {
    const corto = ticket([{ precio: 4990 }], [{ cuenta: 12921 }])
    const largo = ticket([{ precio: 4990 }, { precio: 13390 }, { precio: 25490 }], [{ cuenta: 12921 }], { politica: 'Cambios dentro de los 30 días con este ticket.' })
    expect(largo.txt.join(' ')).toContain('Cambios dentro de los 30 días')
    expect(corto.txt.join(' ')).not.toContain('Cambios')
    expect(largo.alto).toBeGreaterThan(corto.alto)
    const ultimaY = Math.max(...largo.ops.map((o) => (o as { y: number }).y))
    expect(ultimaY).toBeLessThan(largo.alto)
  })

  it('fecha y hora de Argentina, ⛔ la del navegador; la fecha con el día', () => {
    expect(fechaTicket(AHORA)).toBe('04/10/2026 19:04')
    expect(fechaConDia(AHORA)).toBe('domingo 04/10/2026')
    expect(fechaConDia(Date.parse('2026-10-05T02:30:00Z'))).toBe('domingo 04/10/2026') // 23:30 del domingo en AR
  })

  it('el mail como cliente, y el logo arriba centrado en vez del nombre', () => {
    const { ops, txt } = ticket([{ precio: 4990 }], [{ cuenta: 12921 }], { cliente: 'ana@mail.com', logo: { src: 'data:image/png;base64,AAA', ancho: 400, alto: 200 } })
    expect(txt).toContain('Cliente: ana@mail.com')
    expect(txt).not.toContain('ZATTIA')
    const img = ops.find((o) => o.k === 'img') as unknown as { x: number; w: number; h: number }
    expect(img).toMatchObject({ w: 44, h: 22 })
    expect(img.x).toBe(18) // (80 − 44) / 2
  })
})

describe('el logo de la MARCA de lo que se vende (Bruno, 12-oct)', () => {
  const Z = { src: 'data:image/png;base64,Wg==', ancho: 400, alto: 100 }
  const S = { src: 'data:image/png;base64,Uw==', ancho: 100, alto: 100 }
  const r = (stunned: boolean) => ({ nombre: 'X', cantidad: 1, precio: 1000, importe: 1000, stunned })

  it('sólo Zattia ⇒ su logo; sólo Stunned ⇒ el de Stunned; las dos ⇒ los dos, Zattia primero', () => {
    expect(marcasDelTicket({ renglones: [r(false)], logo: Z, logoStunned: S }).map((m) => m.logo)).toEqual([Z])
    expect(marcasDelTicket({ renglones: [r(true)], logo: Z, logoStunned: S }).map((m) => m.logo)).toEqual([S])
    expect(marcasDelTicket({ renglones: [r(true), r(false)], logo: Z, logoStunned: S }).map((m) => m.logo)).toEqual([Z, S])
  })

  it('🔑 mixto: dos imágenes lado a lado, centradas, sin pisarse', () => {
    const { ops } = ticket([{ precio: 1000 }, { precio: 2000 }], [{ cuenta: 12921 }], { logo: Z, logoStunned: S })
    expect(ops.filter((o) => o.k === 'img')).toHaveLength(1) // sin `stunned` en los renglones: sólo Zattia
    const datosMixto = ticket([{ precio: 1000 }], [{ cuenta: 12921 }], { logo: Z, logoStunned: S, renglones: [{ ...r(false) }, { ...r(true) }] })
    const imgs = datosMixto.ops.filter((o) => o.k === 'img') as unknown as { src: string; x: number; w: number }[]
    expect(imgs.map((i) => i.src)).toEqual([Z.src, S.src])
    expect(imgs[0].x + imgs[0].w).toBeLessThan(imgs[1].x)
    expect(imgs[0].x).toBeCloseTo(80 - (imgs[1].x + imgs[1].w), 5)
  })

  it('a una marca le falta el logo ⇒ van los NOMBRES de las dos, ⛔ un logo solo', () => {
    const { ops, txt } = ticket([{ precio: 1000 }], [{ cuenta: 12921 }], { logo: Z, logoStunned: null, renglones: [r(false), r(true)] })
    expect(ops.filter((o) => o.k === 'img')).toHaveLength(0)
    expect(txt[0]).toBe('ZATTIA · STUNNED')
  })
})

describe('ticket de cambio (regalo, Bruno 13-oct)', () => {
  it('🔑 las prendas con su talle, el número y la política; ⛔ un solo precio', () => {
    const filas = renglones([{ product_id: 1, size_id: 1, cantidad: 2, precio: 4990, rebaja: { tipo: 'pct', valor: 10 } }])
    const c = cobro({ filas, pagos: [{ cuenta: 12921 }], reglas, descuentoVenta: null })
    const datos: DatosTicket = {
      numero: 30048, id: ID, subtotal: c.subtotal, pagos: c.pagos, total: c.total, nombreCuenta, pagaCon: 10000,
      renglones: [{ nombre: 'TOP MONTANA', talle: 'M', cantidad: 2, precio: 4990, importe: c.subtotal }],
      politica: 'Cambios dentro de los 30 días con este ticket.',
    }
    const txt = armarTicketCambio(datos, AHORA, medir).ops.filter((o) => o.k === 'txt').map((o) => (o as { txt: string }).txt)
    expect(txt).toContain('TICKET DE CAMBIO')
    expect(txt).toContain('Comprobante: #30048')
    expect(txt).toContain('2 x TOP MONTANA - M')
    expect(txt.join(' ')).toContain('Cambios dentro de los 30 días')
    expect(txt.some((t) => t.includes('$'))).toBe(false)
    expect(txt.some((t) => /TOTAL|Descuento|RECIBIMOS|VUELTO/.test(t))).toBe(false)
  })
})

describe('ticket del cierre (Bruno, 13-oct)', () => {
  const cierre = {
    marca: 'Zattia', abierto_en: '2026-10-13T12:00:00Z', abierto_por: 'cajera', cerrado_en: '2026-10-13T23:00:00Z', cerrado_por: 'cajera',
    fondo: 50000, contado: 82300, esperado: 82500, nota: 'faltan 200',
    resumen: {
      porCuenta: [{ nombre: 'Efectivo', monto: 30000, cobros: 2, efectivo: true }, { nombre: 'Debito', monto: 15000, cobros: 1 }],
      total: 45000, ventas: 3,
      efectivo: { fondo: 50000, cobrado: 30000, cobradoGN: 4500, salidas: 2000, esperado: 82500 },
      diferencia: -200,
    },
    conteos: { cierre: { billetes: { 20000: 4, 2000: 1, 200: 1, 100: 1, 500: 0 }, total: 82300 } },
    movimientos: [{ tipo: 'salida' as const, monto: 2000, motivo: 'Limpieza' }, { tipo: 'salida' as const, monto: 99, motivo: 'anulada', anulado_en: '2026-10-13T15:00:00Z' }],
  }
  it('🔑 cada cuenta, la cuenta del efectivo y los billetes contados uno por uno', () => {
    const { ops } = armarTicketCierre(cierre, AHORA, medir)
    const txt = ops.filter((o) => o.k === 'txt').map((o) => (o as { txt: string }).txt)
    expect(montoDe(ops, 'Efectivo (2)')).toBe('$30.000')
    expect(montoDe(ops, 'Debito (1)')).toBe('$15.000')
    expect(montoDe(ops, 'Total vendido')).toBe('$45.000')
    expect(montoDe(ops, '+ Cobrado en Gestión Nube')).toBe('$4.500')
    expect(montoDe(ops, 'ESPERADO')).toBe('$82.500')
    expect(montoDe(ops, 'CONTADO')).toBe('$82.300')
    expect(montoDe(ops, 'FALTA')).toBe('$200')
    expect(montoDe(ops, '4 x $20.000')).toBe('$80.000')
    expect(montoDe(ops, 'Total')).toBe('$82.300')
    expect(txt.some((t) => t.startsWith('0 x'))).toBe(false)
    expect(montoDe(ops, 'Limpieza')).toBe('-$2.000')
    expect(txt).not.toContain('anulada')
    expect(txt).toContain('Nota: faltan 200')
  })
})
