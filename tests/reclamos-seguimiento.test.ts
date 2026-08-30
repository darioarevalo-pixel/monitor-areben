import { describe, expect, it } from 'vitest'
import { leerSeguimiento, MINIMO_DEL_SEGUIMIENTO } from '@/lib/reclamos/seguimiento.core.js'
import { elCodigoNoViajaEnElLink, trackingPortalUrl, trackingUrl } from '@/lib/reclamos/tipos'

/**
 * **El código de seguimiento del retorno** (29-ago-2026, I5 del mapa operativo).
 *
 * 🔴 Lo que se está cuidando ⛔ no es la prolijidad del dato: `seguimiento_vuelta` decide **el
 * rótulo del estado, el mensaje que se le ofrece al cliente y cuál de los dos relojes corre** — el
 * nuestro, en rojo a los 2 días, o el del transporte, a los 15. Un código mal tipeado **cambia a
 * quién estamos yendo a buscar**, y ⛔ no rompe ninguna pantalla.
 */
describe('leerSeguimiento — el piso, ⛔ no un formato', () => {
  it('acepta los códigos que se parecen a uno de verdad', () => {
    for (const c of ['AR123456789', '01234567890123', 'CD-1234-5678', 'AA 1234 5678 9']) {
      expect(leerSeguimiento(c), c).toEqual({ ok: true, codigo: c })
    }
  })

  it('recorta los espacios de los costados', () => {
    expect(leerSeguimiento('  AR123456789  ')).toEqual({ ok: true, codigo: 'AR123456789' })
  })

  /**
   * ⛔ **Vaciarlo es legítimo**: se carga el equivocado, se borra, se pone el bueno. Y `null` ⛔ no
   * es un error — es el estado normal de una fila que todavía no tiene etiqueta.
   */
  it('vaciarlo ⛔ no es un error: devuelve null', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(leerSeguimiento(v as never), String(v)).toEqual({ ok: true, codigo: null })
    }
  })

  it(`🔴 lo que ⛔ no llega a ${MINIMO_DEL_SEGUIMIENTO} caracteres útiles se rechaza, y el error dice qué se rompe`, () => {
    const r = leerSeguimiento('123')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('en camino')
    // 🔑 El piso cuenta LETRAS Y NÚMEROS, ⛔ no el largo: siete dígitos separados por guiones
    // siguen siendo siete.
    expect(leerSeguimiento('1-2-3-4-5-6-7').ok).toBe(false)
    expect(leerSeguimiento('1-2-3-4-5-6-7-8').ok).toBe(true)
  })

  it('rechaza lo que se vino pegado de un mail', () => {
    const r = leerSeguimiento('Seguimiento: AR123456789 <https://andreani.com>')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('caracteres que un código de seguimiento')
  })
})

/**
 * 🔑 **La derivación, ⛔ no una segunda lista de transportistas.** El día que Andreani acepte el
 * código por URL, o que entre un correo nuevo, esto se contesta solo.
 */
describe('elCodigoNoViajaEnElLink', () => {
  it('🔴 Andreani abre el portal pelado: el código hay que pegarlo del otro lado', () => {
    expect(trackingUrl('andreani', 'AR123456789')).toBe(trackingPortalUrl('andreani'))
    expect(elCodigoNoViajaEnElLink('andreani', 'AR123456789')).toBe(true)
  })

  it('Correo Argentino sí se lo lleva', () => {
    expect(trackingUrl('correo', 'AR123456789')).toContain('AR123456789')
    expect(elCodigoNoViajaEnElLink('correo', 'AR123456789')).toBe(false)
  })

  it('sin código, o por una vía sin seguimiento, ⛔ no hay nada que copiar', () => {
    expect(elCodigoNoViajaEnElLink('andreani', '')).toBe(false)
    expect(elCodigoNoViajaEnElLink('presencial', 'AR123456789')).toBe(false)
    expect(elCodigoNoViajaEnElLink(null, 'AR123456789')).toBe(false)
  })
})
