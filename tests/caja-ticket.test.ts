/**
 * El ticket de la Caja. El oráculo es la pantalla de cobro del POS de GN (3-oct): $4.990 en
 * efectivo ⇒ descuento $748,50, redondeo −$41,50, total $4.200. El ticket ⛔ calcula: se le pasa el
 * `cobro` del núcleo y se mira que escriba ESOS números.
 */
import { describe, expect, it } from 'vitest'

import { armarTicket, fechaTicket, numeroProvisorio, plata, type DatosTicket } from '@/lib/caja/ticket'
import { REGLAS_INICIALES, cobro, renglones } from '@/lib/caja/core.core.js'

const medir = (txt: string) => txt.match(/.{1,40}/g) || ['']
const AHORA = Date.parse('2026-10-04T22:04:00Z') // 19:04 en Argentina
const ID = '3f1c2b9e-6a4d-4c1e-9b7a-2d5e8f0a1b3c'
const reglas = REGLAS_INICIALES as unknown as { redondeo: number; cuentas: Record<number, { nombre: string; descuento: number; efectivo?: boolean }> }
const nombreCuenta = (c: number) => reglas.cuentas[c]?.nombre ?? String(c)
const efectivo = (c: number) => !!reglas.cuentas[c]?.efectivo

function ticket(items: { precio: number; cantidad?: number }[], pagos: { cuenta: number; base?: number }[], extra: Partial<DatosTicket> = {}) {
  const filas = renglones(items.map((it, i) => ({ product_id: 1, size_id: i + 1, cantidad: it.cantidad ?? 1, precio: it.precio })))
  const c = cobro({ filas, pagos, reglas })
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
    expect(base.txt).toContain('PRENDA 1 · S')
    const unica = ticket([{ precio: 4990 }], [{ cuenta: 12921 }], {
      renglones: [{ nombre: 'ACCESORIO NRO 1', talle: 'Variante Única', cantidad: 1, precio: 4990, importe: 4990 }],
    })
    expect(unica.txt).toContain('ACCESORIO NRO 1')
    expect(unica.txt.join('|')).not.toContain('Variante')
  })

  it('$4.990 en efectivo ⇒ descuento $748,50, redondeo −$41,50, total $4.200', () => {
    const { ops, txt } = ticket([{ precio: 4990 }], [{ cuenta: 12921 }])
    expect(montoDe(ops, 'Subtotal')).toBe('$4.990')
    expect(montoDe(ops, 'Descuento Efectivo 15%')).toBe('-$748,50')
    expect(montoDe(ops, 'Redondeo')).toBe('-$41,50')
    expect(montoDe(ops, 'TOTAL')).toBe('$4.200')
    expect(montoDe(ops, 'Efectivo')).toBe('$4.200')
    expect(txt).toContain('COMPROBANTE')
    expect(txt).toContain('DOCUMENTO NO VÁLIDO COMO FACTURA')
    expect(txt).toContain('#30048')
    expect(txt).toContain('Gracias por tu compra')
  })

  it('con «paga con» sale el vuelto del efectivo', () => {
    const { ops } = ticket([{ precio: 4990 }], [{ cuenta: 12921 }], { pagaCon: 5000 })
    expect(montoDe(ops, 'Paga con')).toBe('$5.000')
    expect(montoDe(ops, 'Vuelto')).toBe('$800')
  })

  it('🔴 el redondeo PARA ARRIBA se llama «Recargo por redondeo» (Bruno, 4-oct)', () => {
    // Feria Efectivo al 0 %: $4.990 ⇒ $5.000.
    const { ops, txt, c } = ticket([{ precio: 4990 }], [{ cuenta: 25867 }])
    expect(c.total).toBe(5000)
    expect(montoDe(ops, 'Recargo por redondeo')).toBe('+$10')
    expect(txt.some((t) => t.startsWith('Descuento'))).toBe(false)
  })

  it('varios pagos: un descuento por cuenta y el vuelto sólo sobre lo que fue en efectivo', () => {
    const { ops, c } = ticket([{ precio: 20000 }], [{ cuenta: 12921, base: 10000 }, { cuenta: 20196 }], { pagaCon: 10000 })
    expect(montoDe(ops, 'Descuento Efectivo 15%')).toBe('-$1.500')
    expect(montoDe(ops, 'Descuento Débito 10%')).toBe('-$1.000')
    expect(montoDe(ops, 'TOTAL')).toBe(plata(c.total))
    expect(montoDe(ops, 'Vuelto')).toBe('$1.500') // 10.000 − 8.500 de efectivo, ⛔ − el total
  })

  it('🔴 sin número de GN sale igual, con el provisorio y diciendo que está pendiente', () => {
    const { txt } = ticket([{ precio: 4990 }], [{ cuenta: 12921 }], { numero: null })
    expect(txt).toContain(`Provisorio ${numeroProvisorio(ID)}`)
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

  it('fecha y hora de Argentina, ⛔ la del navegador', () => {
    expect(fechaTicket(AHORA)).toBe('04/10/2026 19:04')
  })
})
