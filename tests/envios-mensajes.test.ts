import { describe, expect, it } from 'vitest'
import { aCobrar, turnosDe } from '@/lib/envios/reglas.core.js'
import { linkWhatsapp } from '@/lib/envios/core'
import { cuandoPasamos, diaEnCriollo, diasQueOfrecemos, mensajeParaLaClienta } from '@/lib/envios/mensajes'
import type { Envio } from '@/lib/envios/tipos'

/**
 * El primer mensaje a la clienta: cuánto sale el envío y cuándo pasa la moto.
 *
 * 🔴 **Lo que estos tests existen para cazar es que el mensaje prometa una cosa y el ticket cobre
 * otra.** Es texto que sale a alguien de afuera y habla de plata: una vez mandado no se corrige, y
 * la contradicción aparece con el cadete en la puerta. Por eso el número de «al recibir» se afirma
 * contra `aCobrar` —la misma función que imprime el ticket— y no contra un número escrito acá.
 */

const base: Envio = {
  id: 'en1',
  store: 'bdi',
  fecha: null,
  turno: null,
  origen: 'tn',
  orden_numero: '20913',
  cliente: 'ana lopez',
  telefono: '3415551234',
  direccion: 'Riobamba 1234',
  piso_depto: null,
  localidad: 'Rosario',
  cp: '2000',
  anotacion: null,
  monto_envio: 4300,
  envio_pagado: false,
  envio_bonificado: false,
  monto_pedido_a_cobrar: 0,
  estado: 'pendiente',
  cobrado: null,
  vendedor: null,
  cadete: null,
  datos: {},
  autor: null,
}

const con = (p: Partial<Envio>): Envio => ({ ...base, ...p })

/** Un lunes. La grilla: lun tarde · mar mañana y tarde · mié tarde · jue mañana y tarde · vie tarde. */
const LUNES = '2026-08-17'

describe('🔴 la plata del mensaje es la misma que la del ticket', () => {
  it('🔴 el número de «al recibir» sale de `aCobrar`, no de una suma escrita en el texto', () => {
    // El mutante: sumar acá `monto_envio + monto_pedido_a_cobrar` sin mirar los tildes. Da el mismo
    // número en el caso normal y de más en el envío ya pago, o sea que el mensaje le pide plata en
    // la puerta a alguien a quien el sistema ya le cobró.
    const e = con({ monto_envio: 4300, monto_pedido_a_cobrar: 17500 })
    const m = mensajeParaLaClienta(e, LUNES) || ''
    expect(aCobrar(e)).toBe(21800)
    expect(m).toContain('$ 21.800')
  })

  it('🔴 el desglose sale SÓLO cuando la puerta cobra dos cosas', () => {
    // Repetir el mismo número en chico al lado del grande invita a leer el chico. Mismo criterio
    // que el ticket.
    expect(mensajeParaLaClienta(con({ monto_pedido_a_cobrar: 17500 }), LUNES)).toContain('(envío $ 4.300 + pedido $ 17.500)')
    expect(mensajeParaLaClienta(con({}), LUNES)).not.toContain('+ pedido')
  })

  it('🔴 un envío YA PAGO no dice «se abona al recibir»', () => {
    // Es el mismo error que el KPI que mandaba a reclamarle plata a una clienta que ya había pagado,
    // pero por escrito y a la clienta.
    const m = mensajeParaLaClienta(con({ envio_pagado: true }), LUNES) || ''
    expect(m).toContain('ya está pago')
    expect(m).not.toContain('se abona al recibir')
    expect(m).not.toContain('$ 4.300')
  })

  it('🔴 un envío BONIFICADO dice que va sin cargo, y no que está pago', () => {
    // No son lo mismo: uno es plata que entró por adelantado, el otro plata que no entró nunca.
    // Colapsarlos le dice a la clienta que pagó algo que le regalamos.
    const m = mensajeParaLaClienta(con({ envio_bonificado: true }), LUNES) || ''
    expect(m).toContain('va sin cargo')
    expect(m).not.toContain('ya está pago')
  })

  it('con el envío saldado pero saldo del pedido, sigue pidiendo lo del pedido', () => {
    const e = con({ envio_pagado: true, monto_pedido_a_cobrar: 17500 })
    const m = mensajeParaLaClienta(e, LUNES) || ''
    expect(aCobrar(e)).toBe(17500)
    expect(m).toContain('$ 17.500')
  })
})

describe('🔴 sin precio no hay mensaje', () => {
  it('🔴 devuelve `null`, no un texto sin la plata', () => {
    // Mismo criterio que `puedeIrAUnDia`: un mensaje de coordinación que no dice cuánto sale obliga
    // a un segundo mensaje con la plata. Y callarse el precio adentro de un texto que habla de plata
    // es peor que no mandarlo. El mutante devuelve el texto igual y nadie ve nada raro.
    expect(mensajeParaLaClienta(con({ monto_envio: 0 }), LUNES)).toBeNull()
  })

  it('y entonces el botón abre el chat vacío, como antes', () => {
    expect(linkWhatsapp(con({}), null)).toBe('https://wa.me/5493415551234')
  })
})

describe('🔴 el día: propone o confirma, según lo que la fila tenga', () => {
  it('🔴 SIN día propone los dos próximos y PREGUNTA', () => {
    // El día lo confirma la clienta: es la regla de la sección y la razón de que exista la bandeja.
    const m = mensajeParaLaClienta(con({ fecha: null, turno: null }), LUNES) || ''
    expect(m).toContain('Podemos pasar')
    expect(m).toContain('¿Cuál te viene mejor?')
  })

  it('🔴 CON día confirma ese, y no propone ninguno', () => {
    // El mutante: un solo texto para los dos casos. Vuelve a proponer días sobre uno ya acordado —
    // que es cómo se pierde un turno— y encima contradice lo que la pantalla ya tiene guardado.
    const m = mensajeParaLaClienta(con({ fecha: '2026-08-18', turno: 'mañana' }), LUNES) || ''
    expect(m).toContain('Pasamos el martes 18 a la mañana')
    expect(m).not.toContain('Podemos pasar')
  })

  it('🔴 los días propuestos arrancan MAÑANA, no hoy', () => {
    // El mutante: arrancar en `hoy`. Cuando alguien manda el primer mensaje la mochila de hoy ya
    // está armada y la moto puede estar en la calle: se le promete un turno que ya salió.
    const dias = diasQueOfrecemos(LUNES)
    expect(dias[0]).toBe('2026-08-18')
    expect(dias).not.toContain(LUNES)
  })

  it('🔴 y son días que EXISTEN en la grilla: el segundo SALTA el finde', () => {
    // 🔴 El mutante: sumar un día corrido para el segundo. Casi nunca se nota —martes y miércoles
    // son los dos de reparto— y el jueves promete un **sábado**, que es un día sin moto. Por eso el
    // caso está fijado en un jueves y no en un lunes: medir donde el defecto se ve.
    expect(diasQueOfrecemos('2026-08-20')).toEqual(['2026-08-21', '2026-08-24'])
    for (const dia of ['2026-08-17', '2026-08-20', '2026-08-21', '2026-08-22']) {
      for (const f of diasQueOfrecemos(dia)) expect(turnosDe(f).length).toBeGreaterThan(0)
    }
  })

  it('🔴 el turno ofrecido es el que ese día TIENE', () => {
    // El mutante: escribir «a la tarde» siempre. El martes sale también a la mañana y la clienta
    // pierde la mitad de las opciones; peor al revés, prometiendo una mañana que no existe.
    expect(cuandoPasamos('2026-08-18')).toBe('el martes 18 (a la mañana o a la tarde)')
    expect(cuandoPasamos('2026-08-19')).toBe('el miércoles 19 a la tarde')
  })

  it('el día se dice como se dice por WhatsApp, y `\'\'` no lo hace explotar', () => {
    // 🔴 `rotuloFecha('')` tira, y un throw en el render mata la pestaña. Ya pasó tres veces acá.
    expect(diaEnCriollo('2026-08-18')).toBe('martes 18')
    expect(diaEnCriollo('')).toBe('')
  })
})

describe('el resto del mensaje', () => {
  it('la marca sale de la fila y el nombre es el de pila, capitalizado', () => {
    expect(mensajeParaLaClienta(con({}), LUNES)).toContain('Hola Ana! Te escribimos de BDI por tu pedido #20913.')
    expect(mensajeParaLaClienta(con({ store: 'zattia' }), LUNES)).toContain('de Zattia')
  })

  it('un alta a mano sin número de orden no dice «#null»', () => {
    expect(mensajeParaLaClienta(con({ orden_numero: null, origen: 'manual' }), LUNES)).toContain('por tu pedido.')
  })

  it('🔴 el link va con el texto ESCAPADO', () => {
    // El mutante: pegarlo crudo. El texto se corta en el primer `&` o `#` — y el mensaje lleva el
    // `#` del número de orden en la primera línea, así que llegaría siempre partido.
    const link = linkWhatsapp(con({}), 'Pedido #20913 & saldo') || ''
    expect(link).toContain('text=Pedido%20%2320913%20%26%20saldo')
  })
})
