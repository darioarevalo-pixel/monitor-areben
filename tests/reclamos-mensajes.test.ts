import { describe, it, expect } from 'vitest'
import { mensajeApertura, mensajeResolucion, mensajeSeguimiento, resumenCorto } from '@/lib/reclamos/mensajes'
import type { ReclamoRow, ItemReclamo } from '@/lib/reclamos/tipos'

/**
 * Los mensajes que salen al cliente.
 *
 * Tienen tests porque **son texto que sale de la empresa**: si dice un monto que no es, o promete
 * algo que no se va a cumplir, el problema no es visual. Y porque el motivo de que los arme el
 * sistema es justamente que no dependan de cómo lo redacte cada persona.
 */

const items: ItemReclamo[] = [
  { producto: 'WEAVE CASE CHERRY', variante: 'iPhone 11', cantidad: 1, precio: 8990 },
  { producto: 'ICONIC GREEN', variante: 'iPhone 11', cantidad: 2, precio: 8990 },
]

const base = { cliente: 'carla florencia ietta', orden_tn: '20700', items } as Partial<ReclamoRow>

describe('mensaje de apertura', () => {
  const txt = mensajeApertura({ ...base, motivo: 'falla' } as ReclamoRow, 'R-0025', 'https://x/reclamo/tok')

  it('saluda por el nombre de pila, no por el nombre del comprobante', () => {
    expect(txt).toContain('¡Hola Carla!')
    expect(txt).not.toContain('ietta')
  })

  it('dice el reclamo, el pedido y qué productos son', () => {
    expect(txt).toContain('R-0025')
    expect(txt).toContain('#20700')
    expect(txt).toContain('1× WEAVE CASE CHERRY (iPhone 11)')
    expect(txt).toContain('2× ICONIC GREEN')
  })

  // El link es el punto del mensaje: si queda pegado a otro texto, WhatsApp se lo come.
  it('el link va solo en su renglón', () => {
    expect(txt.split('\n')).toContain('https://x/reclamo/tok')
  })

  it('sin nombre del cliente, saluda igual y no dice "Hola undefined"', () => {
    const t = mensajeApertura({ items, motivo: 'falla' } as ReclamoRow, 'D-1', 'https://x')
    expect(t).toContain('¡Hola!')
    expect(t.toLowerCase()).not.toContain('undefined')
  })
})

describe('mensaje de resolución', () => {
  it('devolución total: dice el monto exacto', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'plata_total', monto_total: 15283, destino_prenda: 'stock', via_retorno: 'andreani' } as ReclamoRow, 'R-0025')
    expect(t).toContain('$ 15.283')
    expect(t).toContain('Andreani')
    expect(t).toContain('lo pagamos nosotros')
  })

  // La duda número uno del cliente cuando le devuelven plata y no le piden el producto.
  it('si se la queda, lo dice explícitamente', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'plata_parcial', monto_total: 5000, destino_prenda: 'falla', via_retorno: null } as ReclamoRow, 'R-0025')
    expect(t).toContain('No hace falta que nos devuelvas nada')
    expect(t).toContain('$ 5.000')
  })

  it('reenvío del faltante: no promete plata', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'reenvio', monto_total: 0, destino_prenda: 'no_salio' } as ReclamoRow, 'R-0025')
    expect(t).toContain('Te enviamos lo que falta')
    expect(t).not.toContain('devolvemos $')
  })

  it('cupón: incluye el código', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'cupon', cupon_codigo: 'ABC123', destino_prenda: 'falla' } as ReclamoRow, 'R-0025')
    expect(t).toContain('ABC123')
  })

  it('presencial: le dice que se acerque, no que espere una etiqueta', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'plata_total', monto_total: 1000, via_retorno: 'presencial', destino_prenda: 'stock' } as ReclamoRow, 'R-0025')
    expect(t).toContain('Acercate al local')
    expect(t).not.toContain('etiqueta')
  })

  // Prometer una fecha exacta de acreditación es la forma más fácil de generar un segundo reclamo.
  it('avisa que la acreditación tarda, sin prometer un plazo exacto', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'plata_total', monto_total: 1000, destino_prenda: 'stock' } as ReclamoRow, 'R-0025')
    expect(t).toContain('puede tardar unos días')
    expect(t).not.toMatch(/\b(24|48|72)\s*(hs|horas)\b/i)
  })
})

describe('mensaje de seguimiento', () => {
  it('etiqueta: incluye el código y aclara quién paga', () => {
    const t = mensajeSeguimiento({ ...base, seguimiento_vuelta: 'AR123' } as ReclamoRow, 'R-0025', 'etiqueta')
    expect(t).toContain('AR123')
    expect(t).toContain('por nuestra cuenta')
  })

  it('reenvío: usa el seguimiento de IDA, no el de vuelta', () => {
    const t = mensajeSeguimiento({ ...base, seguimiento_ida: 'IDA9', seguimiento_vuelta: 'VUELTA1' } as ReclamoRow, 'R-0025', 'reenvio')
    expect(t).toContain('IDA9')
    expect(t).not.toContain('VUELTA1')
  })

  it('plata: dice el monto', () => {
    const t = mensajeSeguimiento({ ...base, monto_total: 15283 } as ReclamoRow, 'R-0025', 'plata')
    expect(t).toContain('$ 15.283')
  })
})

describe('resumenCorto', () => {
  it('arma la etiqueta del listado', () => {
    expect(resumenCorto({ motivo: 'mal_armado', cliente: 'carla ietta' } as ReclamoRow, 'R-0007'))
      .toBe('R-0007 · Pedido mal armado · Carla')
  })
})
