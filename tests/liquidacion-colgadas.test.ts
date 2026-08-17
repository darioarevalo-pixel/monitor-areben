import { describe, it, expect } from 'vitest'
import { ofertasColgadas, type UltimoMovimiento } from '@/lib/liquidacion/colgadas'

/**
 * Las ofertas colgadas: precio de sale escrito en Gestión Nube sin campaña viva que lo justifique.
 *
 * Lo que protege este archivo es que la tienda no siga cobrando el precio del sale después del sale.
 * Los dos que más importan:
 *
 *  - que una campaña **viva y vigente** no genere ni un aviso —si no, el día que se pone el sale la
 *    portada acusa a los 262 productos de la campaña y el aviso deja de leerse—, y
 *  - que **`en_curso` no alcance para dar por sacada la oferta**: sacar la última la devuelve a ese
 *    estado, así que una campaña levantada y una que nadie levantó se ven igual desde el estado. Lo
 *    que las separa es la fecha.
 */

const HOY = '2026-08-20'

function ev(over: Partial<UltimoMovimiento> = {}): UltimoMovimiento {
  return {
    pid: 'p1',
    producto: 'CAMPERA PUFFER',
    sku: 'CAM-004',
    liqId: 'liq1',
    liqNombre: 'Sale Invierno',
    precioA: 34900,
    cuando: '2026-08-13T12:00:00.000Z',
    ...over,
  }
}

const VIVA = { liq1: { nombre: 'Sale Invierno', estado: 'aplicada', hasta: '2026-08-29' } }
const APLICADO = { p1: true }
const CON_STOCK = { p1: 4 }

describe('ofertasColgadas', () => {
  it('una campaña viva y vigente no cuelga nada', () => {
    const r = ofertasColgadas([ev()], VIVA, APLICADO, CON_STOCK, HOY)
    expect(r.colgadas).toHaveLength(0)
  })

  it('el que quedó a precio de lista no tiene oferta puesta', () => {
    const cerrada = { liq1: { nombre: 'Sale', estado: 'cerrada', hasta: '2026-08-19' } }
    const r = ofertasColgadas([ev({ precioA: null })], cerrada, APLICADO, CON_STOCK, HOY)
    expect(r.colgadas).toHaveLength(0)
  })

  it('la campaña cerrada con el precio todavía puesto', () => {
    const cerrada = { liq1: { nombre: 'Sale', estado: 'cerrada', hasta: '2026-08-29' } }
    const r = ofertasColgadas([ev()], cerrada, APLICADO, CON_STOCK, HOY)
    expect(r.colgadas[0].motivo).toBe('campania-cerrada')
    expect(r.colgadas[0].precio).toBe(34900)
  })

  it('🔴 la vigencia vencida cuelga aunque la campaña siga en un estado vivo', () => {
    // Sacar la última oferta devuelve la campaña a `en_curso`: mirar sólo el estado no distingue
    // una campaña levantada de una que nadie levantó.
    const vencida = { liq1: { nombre: 'Sale', estado: 'en_curso', hasta: '2026-08-19' } }
    const r = ofertasColgadas([ev()], vencida, APLICADO, CON_STOCK, HOY)
    expect(r.colgadas[0].motivo).toBe('vigencia-vencida')
  })

  it('la vigencia que termina HOY todavía no venció', () => {
    const hastaHoy = { liq1: { nombre: 'Sale', estado: 'aplicada', hasta: HOY } }
    expect(ofertasColgadas([ev()], hastaHoy, APLICADO, CON_STOCK, HOY).colgadas).toHaveLength(0)
  })

  it('una campaña sin fecha de fin no vence por fecha', () => {
    const sinFin = { liq1: { nombre: 'Sale', estado: 'aplicada', hasta: null } }
    expect(ofertasColgadas([ev()], sinFin, APLICADO, CON_STOCK, HOY).colgadas).toHaveLength(0)
  })

  it('🔴 el que ya no está aplicado en ninguna campaña queda fuera del alcance del botón', () => {
    // Se lo quitó de la campaña después de escribirle el precio: `pidsPorAplicar` no lo ve nunca más.
    const r = ofertasColgadas([ev()], VIVA, {}, CON_STOCK, HOY)
    expect(r.colgadas[0].motivo).toBe('fuera-de-alcance')
    expect(r.colgadas[0].seSacaDesdeAca).toBe(false)
  })

  it('la campaña borrada deja el nombre que el evento lleva copiado', () => {
    const r = ofertasColgadas([ev()], {}, APLICADO, CON_STOCK, HOY)
    expect(r.colgadas[0].liqNombre).toBe('Sale Invierno')
    // Sin campaña no hay a quién pedirle que lo saque, ni con el ítem aplicado.
    expect(r.colgadas[0].seSacaDesdeAca).toBe(false)
  })

  it('el agotado también se lista: la oferta muerde el día que vuelve el stock', () => {
    const cerrada = { liq1: { nombre: 'Sale', estado: 'cerrada', hasta: '2026-08-29' } }
    const r = ofertasColgadas([ev()], cerrada, APLICADO, { p1: 0 }, HOY)
    expect(r.colgadas).toHaveLength(1)
    expect(r.conStock).toBe(0)
    expect(r.sinStock).toBe(1)
  })

  it('primero lo que se está vendiendo barato ahora, y de eso lo que más unidades tiene', () => {
    const cerrada = { liq1: { nombre: 'Sale', estado: 'cerrada', hasta: '2026-08-29' } }
    const r = ofertasColgadas(
      [ev({ pid: 'p1' }), ev({ pid: 'p2' }), ev({ pid: 'p3' })],
      cerrada,
      { p1: true, p2: true, p3: true },
      { p1: 0, p2: 2, p3: 9 },
      HOY,
    )
    expect(r.colgadas.map((c) => c.pid)).toEqual(['p3', 'p2', 'p1'])
    expect(r.conStock).toBe(2)
    expect(r.sinStock).toBe(1)
  })

  it('fuera de alcance gana sobre los otros dos motivos: es el que no se arregla desde acá', () => {
    const cerrada = { liq1: { nombre: 'Sale', estado: 'cerrada', hasta: '2026-08-19' } }
    expect(ofertasColgadas([ev()], cerrada, {}, CON_STOCK, HOY).colgadas[0].motivo).toBe('fuera-de-alcance')
  })
})
