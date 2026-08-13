import { describe, expect, it } from 'vitest'
import {
  aCobrar,
  direccionCompleta,
  estaTodoPago,
  linkWhatsapp,
  ordenarParaPreparar,
  totalesDelTurno,
  validarEnvio,
} from '@/lib/envios/core'
import { textoDePlata } from '@/lib/envios/etiqueta'
import type { Envio } from '@/lib/envios/tipos'

/**
 * La hoja del cadete.
 *
 * 🔴 **El defecto que estos tests existen para cazar es uno solo: que la etiqueta mande a cobrar
 * algo que ya está pagado.** No es hipotético — se midió sobre dos años de la planilla de reparto
 * que en la mediana el 100% de lo que el cadete cobra es el envío, o sea que el pedido ya venía
 * pagado. Un test que sólo verifique que la cuenta suma daría verde con esa suma mal hecha, así que
 * cada caso de plata acá está escrito para fallar si se ignora `envio_pagado`.
 */

const base: Envio = {
  id: 'en1',
  store: 'bdi',
  fecha: '2026-08-13',
  turno: 'tarde',
  origen: 'tn',
  orden_numero: '1234',
  cliente: 'Ana',
  telefono: '3415551234',
  direccion: '3 de Febrero 1234',
  piso_depto: null,
  localidad: 'Rosario',
  anotacion: null,
  monto_envio: 3000,
  envio_pagado: false,
  monto_pedido_a_cobrar: 0,
  estado: 'pendiente',
  vendedor: 'Karen',
  cadete: null,
  datos: {},
  autor: null,
}

const con = (p: Partial<Envio>): Envio => ({ ...base, ...p })

describe('lo que se cobra en la puerta', () => {
  it('cobra el envío cuando NO se pagó por adelantado', () => {
    expect(aCobrar(con({ monto_envio: 3000, envio_pagado: false }))).toBe(3000)
  })

  // Éste es EL test. Si alguien saca el `envio_pagado ? 0 :` de `aCobrar`, este caso da 3000 y la
  // etiqueta sale a la calle pidiendo plata que el cliente ya transfirió.
  it('🔴 NO cobra el envío cuando ya estaba pagado', () => {
    expect(aCobrar(con({ monto_envio: 3000, envio_pagado: true }))).toBe(0)
    expect(estaTodoPago(con({ monto_envio: 3000, envio_pagado: true }))).toBe(true)
  })

  it('cobra el saldo del pedido aunque el envío esté pagado', () => {
    expect(aCobrar(con({ monto_envio: 3000, envio_pagado: true, monto_pedido_a_cobrar: 17500 }))).toBe(17500)
  })

  it('suma envío y saldo cuando no se pagó nada', () => {
    expect(aCobrar(con({ monto_envio: 3000, envio_pagado: false, monto_pedido_a_cobrar: 17500 }))).toBe(20500)
  })

  // PostgREST devuelve `numeric` como string: sin el parseFloat, "3000" + 0 daría "30000" y la
  // etiqueta pediría diez veces el envío.
  it('aguanta los montos como string, que es como los devuelve la base', () => {
    expect(aCobrar(con({ monto_envio: '3000', monto_pedido_a_cobrar: '500' }))).toBe(3500)
  })

  it('un envío en cero no es un envío pagado, pero tampoco se cobra', () => {
    expect(aCobrar(con({ monto_envio: 0, envio_pagado: false }))).toBe(0)
    expect(estaTodoPago(con({ monto_envio: 0 }))).toBe(true)
  })
})

describe('los dos totales con los que se cierra el turno', () => {
  const turno: Envio[] = [
    con({ id: 'a', monto_envio: 3000, envio_pagado: true, estado: 'entregado' }),
    con({ id: 'b', monto_envio: 3000, envio_pagado: false, estado: 'entregado' }),
    con({ id: 'c', monto_envio: 4300, envio_pagado: false, monto_pedido_a_cobrar: 10000, estado: 'entregado' }),
    con({ id: 'd', monto_envio: 3000, envio_pagado: false, estado: 'no_entregado' }),
    con({ id: 'e', monto_envio: 3000, envio_pagado: false, estado: 'pendiente' }),
  ]

  it('ENVÍOS PAGOS junta sólo lo que ya había entrado', () => {
    expect(totalesDelTurno(turno).enviosPagos).toBe(3000)
  })

  // 🔴 El que se equivoca solo: si `aRendir` sumara todo el turno en vez de sólo lo entregado,
  // daría 26300 y la caja nunca cerraría los días que alguien no estaba en la casa.
  it('A RENDIR cuenta sólo lo que se entregó de verdad', () => {
    const t = totalesDelTurno(turno)
    expect(t.aRendir).toBe(3000 + 4300 + 10000) // b + c. `a` ya estaba pago, `d` volvió, `e` no salió.
    expect(t.aRendir).not.toBe(26300)
  })

  it('cuenta lo que todavía no salió de la casa y lo que volvió sin entregar', () => {
    const t = totalesDelTurno(turno)
    expect(t.pendienteDeSalir).toBe(1)
    expect(t.noEntregados).toBe(1)
    expect(t.envios).toBe(5)
  })

  it('la diferencia contra "si todo llega" es la plata que quedó en la calle', () => {
    const t = totalesDelTurno(turno)
    expect(t.aRendirSiTodoLlega - t.aRendir).toBe(3000) // el `e`, que sigue sin salir
  })

  it('un turno vacío no rompe ni inventa plata', () => {
    expect(totalesDelTurno([])).toMatchObject({ envios: 0, enviosPagos: 0, aRendir: 0 })
  })
})

describe('lo que va impreso', () => {
  it('el WhatsApp lleva el 9 después del 54', () => {
    expect(linkWhatsapp(con({ telefono: '3415551234' }))).toBe('https://wa.me/5493415551234')
    expect(linkWhatsapp(con({ telefono: '+54 341 555-1234' }))).toBe('https://wa.me/5493415551234')
  })

  it('sin teléfono devuelve null, no un link roto', () => {
    expect(linkWhatsapp(con({ telefono: null }))).toBeNull()
    expect(linkWhatsapp(con({ telefono: 'no tiene' }))).toBeNull()
  })

  it('la dirección no sale con comas huérfanas cuando falta el piso', () => {
    expect(direccionCompleta(con({ piso_depto: null }))).toBe('3 de Febrero 1234 · Rosario')
    expect(direccionCompleta(con({ piso_depto: '3º B' }))).toBe('3 de Febrero 1234 · 3º B · Rosario')
  })
})

describe('🔴 lo que dice la etiqueta en la mano del cadete', () => {
  it('un envío ya pagado dice PAGADO, no "$0"', () => {
    const dice = textoDePlata(con({ monto_envio: 3000, envio_pagado: true }))
    expect(dice.modo).toBe('pagado')
    expect(dice.titulo).toBe('PAGADO')
    // "$0" se lee como un precio, no como "no cobres". Es la diferencia entre una etiqueta que
    // funciona en la puerta y una que hace discutir al cadete con el cliente.
    expect(dice.titulo).not.toContain('$')
  })

  it('un envío por cobrar dice el monto, con el signo', () => {
    const dice = textoDePlata(con({ monto_envio: 3000, envio_pagado: false }))
    expect(dice.modo).toBe('cobrar')
    expect(dice.titulo).toBe('$3.000')
  })

  it('el pedido con saldo se cobra aunque el envío esté pago', () => {
    const dice = textoDePlata(con({ monto_envio: 3000, envio_pagado: true, monto_pedido_a_cobrar: 17500 }))
    expect(dice.modo).toBe('cobrar')
    expect(dice.titulo).toBe('$17.500')
  })
})

describe('el orden en que se preparan', () => {
  it('primero lo que todavía está en casa, al final lo cerrado', () => {
    const lista = [
      con({ id: 'entregado', estado: 'entregado' }),
      con({ id: 'despachado', estado: 'despachado' }),
      con({ id: 'pendiente', estado: 'pendiente' }),
    ]
    expect(ordenarParaPreparar(lista).map((e) => e.id)).toEqual(['pendiente', 'despachado', 'entregado'])
  })

  it('no toca la lista original', () => {
    const lista = [con({ id: 'z', estado: 'entregado' }), con({ id: 'a', estado: 'pendiente' })]
    ordenarParaPreparar(lista)
    expect(lista.map((e) => e.id)).toEqual(['z', 'a'])
  })
})

describe('lo que no se puede guardar', () => {
  it('acepta un envío bien formado', () => {
    expect(validarEnvio(base)).toBeNull()
  })

  // Los tres que hacen desaparecer un paquete de la hoja del cadete sin avisar.
  it('rechaza el turno que no existe, que es como se perdía el 53,8% de la planilla', () => {
    expect(validarEnvio(con({ turno: 'noche' as never }))).toMatch(/turno/i)
    expect(validarEnvio({ ...base, turno: undefined as never })).toMatch(/turno/i)
  })

  it('rechaza la fecha ausente o mal escrita', () => {
    expect(validarEnvio({ ...base, fecha: undefined as never })).toMatch(/fecha/i)
    expect(validarEnvio(con({ fecha: '13/08/2026' }))).toMatch(/fecha/i)
  })

  it('rechaza un estado inventado', () => {
    expect(validarEnvio(con({ estado: 'en camino' as never }))).toMatch(/estado/i)
  })

  it('exige dirección: sin eso el cadete no puede salir', () => {
    expect(validarEnvio(con({ direccion: '   ' }))).toMatch(/direcci/i)
  })

  it('una orden de Tienda Nube sin número no se puede deduplicar', () => {
    expect(validarEnvio(con({ origen: 'tn', orden_numero: null }))).toMatch(/orden/i)
    // Pero un manual sin número es normal: es el 10% que se carga a mano.
    expect(validarEnvio(con({ origen: 'manual', orden_numero: null }))).toBeNull()
  })

  it('rechaza montos negativos', () => {
    expect(validarEnvio(con({ monto_envio: -100 }))).toMatch(/monto|número/i)
  })
})
