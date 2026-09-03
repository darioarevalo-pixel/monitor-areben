import { describe, expect, it } from 'vitest'
import { cuentaDelParte, motivoSinVivo } from '@/lib/meta-ads/cuentas'
import type { CuentaMeta } from '@/lib/meta-ads/tipos'

/**
 * **De qué cuenta sale el día en curso** — la causa de *«en rendimiento cambio la fecha y no anda el
 * filtro de hoy, ni de hoy y ayer. Por eso no la uso. Tampoco actualiza ninguna info»* (Bruno,
 * 3-sep-2026, y es la SEGUNDA vez que lo reporta).
 *
 * 🔴 **Los dos síntomas tenían una sola causa, y ⛔ no estaba en las fechas.** «Hoy» y «Hoy y ayer»
 * son las únicas ventanas que salen de Meta en vivo —la foto diaria sólo guarda días cerrados— y el
 * parte que las trae **es de UNA cuenta publicitaria**. El eje arranca en «Todas», `resolverCuenta`
 * nunca autoselecciona, y sin cuenta el parte no se pide. Entonces las tres ventanas caían a la
 * misma foto de 7 días y, como la clave del pedido no cambiaba, tampoco salía un fetch: la pantalla
 * quedaba **idéntica**.
 *
 * 🔑 El arreglo del 30-ago fue real —los KPIs vivos, `diasDeLaFoto` en el núcleo— pero **⛔ no se
 * caminó**, y le faltaba justo esto: nada de aquello se ve si el vivo nunca llega.
 */

const cuenta = (id: string, nombre: string, lineas: string[]): CuentaMeta => ({
  id,
  nombre,
  moneda: 'ARS',
  zona: 'America/Argentina/Buenos_Aires',
  campanias: 10,
  asignadas: 10,
  lineas: lineas as CuentaMeta['lineas'],
  administra: true,
  minDiarioCrudo: null,
}) as CuentaMeta

/** La compartida por BDI y Zattia, y la propia de Stunned. Es el reparto real. */
const COMPARTIDA = cuenta('1145878766790149', 'Areben', ['bdi', 'zattia'])
const STUNNED = cuenta('999', 'Stunned', ['stunned'])
/** Existe, no pautea: no tiene ninguna línea medida. */
const VACIA = cuenta('777', 'Areben Comercial SRL', [])

describe('cuentaDelParte — de qué cuenta se pide el día en curso', () => {
  it('🔴 con «Todas» y UNA sola cuenta en la línea, la elige sola — el bug era que devolvía nada', () => {
    const r = cuentaDelParte([COMPARTIDA, STUNNED, VACIA], 'stunned', 'todas')
    expect(r.cuenta?.id).toBe('999')
  })

  it('con dos cuentas en la línea ⛔ NO elige: mostraría medio gasto sin decirlo', () => {
    const otra = cuenta('222', 'Zattia nueva', ['zattia'])
    const r = cuentaDelParte([COMPARTIDA, otra], 'zattia', 'todas')
    expect(r.cuenta).toBeNull()
    // Y devuelve las candidatas para que el cartel pueda nombrarlas: «elegí una» sin decir cuáles
    // es la mitad de una instrucción.
    expect(r.candidatas.map((c) => c.nombre)).toEqual(['Areben', 'Zattia nueva'])
  })

  it('la cuenta elegida a mano gana siempre, aunque haya varias', () => {
    const otra = cuenta('222', 'Zattia nueva', ['zattia'])
    expect(cuentaDelParte([COMPARTIDA, otra], 'zattia', '222').cuenta?.nombre).toBe('Zattia nueva')
  })

  it('una cuenta elegida que ya no está en la lista devuelve null, ⛔ no la primera', () => {
    // Pasa con un link viejo o una cuenta que se sacó del token. Caer en otra cuenta mostraría el
    // gasto de un negocio distinto abajo del nombre del pedido.
    expect(cuentaDelParte([COMPARTIDA], 'bdi', 'no-existe').cuenta).toBeNull()
  })

  it('⛔ sin línea no hay parte: el gasto de dos líneas en una cuenta no es de ninguna', () => {
    expect(cuentaDelParte([COMPARTIDA, STUNNED], null, 'todas').cuenta).toBeNull()
  })

  it('🔴 las candidatas son donde la línea PAUTEA, ⛔ no las que ofrece el selector', () => {
    // `cuentasDeLinea` deja pasar también a las que tienen campañas sin asignar —para no esconder
    // el único lugar donde eso se arregla—, y ésa no tiene por qué tener gasto de esta línea hoy.
    // Con ese criterio, una cuenta a medio asignar rompería la autoselección de la única real.
    const aMedias = { ...cuenta('888', 'A medias', []), campanias: 5, asignadas: 0 }
    const r = cuentaDelParte([STUNNED, aMedias], 'stunned', 'todas')
    expect(r.cuenta?.id).toBe('999')
  })
})

describe('motivoSinVivo — por qué no se ve el día en curso', () => {
  it('🔴 con el eje en «Todas» y varias cuentas, dice ELEGIR y las nombra — ⛔ no «Meta no contestó»', () => {
    const s = motivoSinVivo('sin-cuenta', [COMPARTIDA, cuenta('222', 'Zattia nueva', ['zattia'])])
    expect(s).toEqual({ tipo: 'elegir', cuentas: ['Areben', 'Zattia nueva'] })
  })

  it('«Meta no contestó» queda SÓLO para cuando Meta de verdad no contestó, y lleva el motivo', () => {
    expect(motivoSinVivo('error', [], 'token vencido')).toEqual({ tipo: 'error', motivo: 'token vencido' })
  })

  it('un error sin motivo ⛔ no queda mudo', () => {
    expect(motivoSinVivo('error', [], null)).toEqual({ tipo: 'error', motivo: 'no se pudo leer el parte' })
  })

  it('mientras se pide, lo dice: «no contestó» sobre algo que todavía está en vuelo es falso', () => {
    expect(motivoSinVivo('cargando', [])).toEqual({ tipo: 'pidiendo' })
  })

  it('sin ninguna cuenta con campañas, dice que no hay día que pedir', () => {
    expect(motivoSinVivo('sin-cuenta', [])).toEqual({ tipo: 'sin-cuenta' })
  })

  it('con el parte contestado ⛔ no hay cartel', () => {
    expect(motivoSinVivo('ok', [COMPARTIDA])).toBeNull()
  })
})
