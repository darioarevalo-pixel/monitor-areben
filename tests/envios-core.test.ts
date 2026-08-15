import { describe, expect, it } from 'vitest'
import {
  aCobrar,
  direccionCompleta,
  envioSaldado,
  estaTodoPago,
  linkWhatsapp,
  diaDeRepartoVecino,
  esTurnoDeGrilla,
  ordenAEnvio,
  ordenarParaPreparar,
  ordenesQueNoLlegaron,
  proximoDiaDeReparto,
  resumenDeTraida,
  rotuloDeDia,
  cuentaDelCadete,
  netoDelEnvio,
  tarifaCadete,
  totalesDelDia,
  turnosDe,
  vaAlReparto,
  validarEnvio,
} from '@/lib/envios/core'
import { armarTicket, textoDePlata } from '@/lib/envios/ticket'
import type { CierreDia, Envio, OrdenTN, Traida } from '@/lib/envios/tipos'

/**
 * La hoja del cadete.
 *
 * 🔴 **El defecto que estos tests existen para cazar es uno solo: que el ticket mande a cobrar
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
  envio_bonificado: false,
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
  // ticket sale a la calle pidiendo plata que el cliente ya transfirió.
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
  // el ticket pediría diez veces el envío.
  it('aguanta los montos como string, que es como los devuelve la base', () => {
    expect(aCobrar(con({ monto_envio: '3000', monto_pedido_a_cobrar: '500' }))).toBe(3500)
  })

  it('un envío en cero no es un envío pagado, pero tampoco se cobra', () => {
    expect(aCobrar(con({ monto_envio: 0, envio_pagado: false }))).toBe(0)
    expect(estaTodoPago(con({ monto_envio: 0 }))).toBe(true)
  })

  // 🔴 El segundo tilde. El mutante es `aCobrar` mirando sólo `envio_pagado`: el bonificado sale a
  // la calle con el ticket pidiendo los $3.000 que la clienta ya sabe que no paga.
  it('🔴 NO cobra el envío cuando va bonificado', () => {
    expect(aCobrar(con({ monto_envio: 3000, envio_bonificado: true }))).toBe(0)
    expect(estaTodoPago(con({ monto_envio: 3000, envio_bonificado: true }))).toBe(true)
    expect(envioSaldado(con({ monto_envio: 3000, envio_bonificado: true }))).toBe(true)
  })

  it('el bonificado igual cobra el saldo del pedido, que es otra plata', () => {
    expect(aCobrar(con({ monto_envio: 3000, envio_bonificado: true, monto_pedido_a_cobrar: 17500 }))).toBe(17500)
  })

  it('sin ningún tilde el envío no está saldado', () => {
    expect(envioSaldado(con({ monto_envio: 3000 }))).toBe(false)
  })
})

describe('los totales con los que se cierra el día', () => {
  const dia: Envio[] = [
    con({ id: 'a', monto_envio: 3000, envio_pagado: true, estado: 'entregado' }),
    con({ id: 'b', monto_envio: 3000, envio_pagado: false, estado: 'entregado' }),
    con({ id: 'c', monto_envio: 4300, envio_pagado: false, monto_pedido_a_cobrar: 10000, estado: 'entregado' }),
    con({ id: 'd', monto_envio: 3000, envio_pagado: false, estado: 'no_entregado' }),
    con({ id: 'e', monto_envio: 3000, envio_pagado: false, monto_pedido_a_cobrar: 5000, estado: 'pendiente' }),
  ]

  it('ENVÍOS PAGOS junta sólo lo que ya había entrado', () => {
    expect(totalesDelDia(dia).enviosPagos).toBe(3000)
  })

  // 🔴 En la puerta el bonificado y el pagado se comportan igual, y por eso es fácil sumarlos en el
  // mismo KPI. El mutante —`if (pagado || bonificado)`— infla la caja con plata que nadie pagó
  // nunca: el número que se controla contra las transferencias del día dejaría de cerrar.
  it('🔴 lo BONIFICADO no es plata que entró: va en su propio total', () => {
    const conBonificado = [...dia, con({ id: 'f', monto_envio: 5500, envio_bonificado: true, estado: 'entregado' })]
    const t = totalesDelDia(conBonificado)
    expect(t.enviosPagos).toBe(3000)
    expect(t.enviosBonificados).toBe(5500)
    // Y al cadete se le paga igual: la tarifa del bonificado entra en lo que se queda.
    expect(t.tarifas).toBe(3000 + 3000 + 4300 + 5500)
  })

  // 🔴 El que se equivoca solo: si `cobrado` sumara el día entero en vez de sólo lo entregado,
  // daría de más y la caja nunca cerraría los días que alguien no estaba en la casa.
  it('COBRÓ cuenta sólo lo que se entregó de verdad', () => {
    const t = totalesDelDia(dia)
    expect(t.cobrado).toBe(0 + 3000 + 14300) // `a` ya estaba pago, `d` volvió, `e` no salió
    expect(t.cobrado).not.toBe(31300)
  })

  // 🔴 **La cuenta entera en un caso.** Lo que tiene que traer no es lo que cobró: de eso se queda
  // con sus envíos. Si alguien borra la resta, esto da 17300 y el cadete entrega diez mil de más.
  it('TIENE QUE TRAER es lo que cobró menos lo que se queda por llevarlos', () => {
    const t = totalesDelDia(dia)
    expect(t.tarifas).toBe(3000 + 3000 + 4300)
    expect(t.debeTraer).toBe(17300 - 10300)
    // Y es exactamente «el producto que cobró en efectivo, menos los envíos que el cliente ya había
    // pagado»: 10.000 del pedido de `c` menos los 3.000 de `a`, que llevó sin cobrar nada.
    expect(t.debeTraer).toBe(10000 - 3000)
  })

  it('cuenta lo que todavía no salió de la casa y lo que volvió sin entregar', () => {
    const t = totalesDelDia(dia)
    expect(t.pendienteDeSalir).toBe(1)
    expect(t.noEntregados).toBe(1)
    expect(t.envios).toBe(5)
  })

  it('la diferencia contra "si todo llega" es la plata que quedó en la calle', () => {
    const t = totalesDelDia(dia)
    // El `e`: el envío que cobre se lo queda, así que lo que falta traer es el pedido en efectivo.
    expect(t.debeTraerSiTodoLlega - t.debeTraer).toBe(5000)
  })

  it('un día vacío no rompe ni inventa plata', () => {
    expect(totalesDelDia([])).toMatchObject({ envios: 0, enviosPagos: 0, cobrado: 0, tarifas: 0, debeTraer: 0 })
  })
})

/**
 * 🔑 **Al cadete se le paga el costo del reparto, lo cobre o no en la puerta.**
 *
 * Es la cuenta que un test de "la suma da bien" nunca toca. Hubo una versión que resolvía el
 * bonificado poniendo `monto_envio` en cero y anotando aparte lo que él cobraba igual: dos columnas
 * para el mismo número. El precio ahora se carga siempre —es lo que se le paga— y los dos tildes
 * dicen quién lo paga.
 */
describe('lo que cobra el cadete por llevarlo', () => {
  it('es el costo del envío, y nada más', () => {
    expect(tarifaCadete(con({ monto_envio: 4300 }))).toBe(4300)
  })

  // 🔴 **EL test de la tanda.** El mutante que caza es `tarifaCadete` mirando si el envío está
  // saldado y devolviendo 0: la fila diría que ese reparto salió gratis y la diferencia se la
  // comería la única persona que no está mirando la pantalla. Los dos tildes tienen que dar lo mismo
  // acá, porque los dos significan "no lo cobró en la puerta", no "lo llevó gratis".
  it('🔴 el envío BONIFICADO se le paga igual: la clienta paga $0, él cobra el costo', () => {
    const bonificado = con({ monto_envio: 3000, envio_bonificado: true, estado: 'entregado' })
    expect(tarifaCadete(bonificado)).toBe(3000)
    expect(aCobrar(bonificado)).toBe(0) // en la puerta no cobra nada
    expect(netoDelEnvio(bonificado)).toBe(-3000) // y le quedamos debiendo lo que puso él
  })

  it('🔴 el envío ya PAGO se le paga igual, por el mismo motivo', () => {
    const pago = con({ monto_envio: 3000, envio_pagado: true, estado: 'entregado' })
    expect(tarifaCadete(pago)).toBe(3000)
    expect(tarifaCadete(pago)).toBe(tarifaCadete(con({ monto_envio: 3000, envio_bonificado: true })))
  })

  it('aguanta el string de la base', () => {
    expect(tarifaCadete(con({ monto_envio: '4300' }))).toBe(4300)
  })

  // Los tres casos de la calle, que son los que hacen que la cuenta exista.
  it('el envío cobrado en la puerta se salda solo: no trae nada', () => {
    expect(netoDelEnvio(con({ monto_envio: 3000, envio_pagado: false, estado: 'entregado' }))).toBe(0)
  })

  it('el envío ya pagado por el cliente lo llevó sin cobrar: le debemos', () => {
    expect(netoDelEnvio(con({ monto_envio: 3000, envio_pagado: true, estado: 'entregado' }))).toBe(-3000)
  })

  it('el producto en efectivo es lo único que de verdad trae', () => {
    expect(netoDelEnvio(con({ monto_envio: 3000, monto_pedido_a_cobrar: 17500, estado: 'entregado' }))).toBe(17500)
  })
})

/**
 * La cuenta corriente: un solo cadete, y un saldo que **se arrastra**.
 *
 * 🔴 El defecto que estos casos existen para cazar es que el saldo se reinicie cada día. Un test que
 * mire un día solo da verde con el arrastre roto, y el error recién se ve cuando el cadete dice que
 * le deben algo que la pantalla no muestra.
 */
describe('la cuenta corriente del cadete', () => {
  const dia = (fecha: string, envios: Partial<Envio>[]): Envio[] =>
    envios.map((e, i) => con({ id: `${fecha}-${i}`, fecha, estado: 'entregado', ...e }))

  const cierre = (fecha: string, trajo: number | null, pagado_aparte = 0): CierreDia => ({
    fecha,
    trajo,
    pagado_aparte,
    nota: null,
    cerrado_por: 'Bruno',
    cerrado_en: `${fecha}T20:00:00Z`,
  })

  it('el día normal —todo cobrado en la puerta— no mueve la cuenta', () => {
    const c = cuentaDelCadete(dia('2026-08-17', [{ monto_envio: 3000 }, { monto_envio: 4300 }]), [cierre('2026-08-17', 0)])
    expect(c.dias[0].debeTraer).toBe(0)
    expect(c.saldo).toBe(0)
  })

  it('el envío que el cliente ya había pagado lo deja a favor del cadete', () => {
    const c = cuentaDelCadete(dia('2026-08-17', [{ monto_envio: 3000, envio_pagado: true }]), [cierre('2026-08-17', 0)])
    expect(c.saldo).toBe(-3000) // negativo = le debemos
  })

  // 🔴 EL test de la tanda. Con `acumulado = saldoDelDia` esto da -3000 y el lunes se le paga de
  // menos: el martes trajo de más justamente porque el lunes se le había quedado debiendo.
  it('🔴 el saldo se ARRASTRA de un día al siguiente', () => {
    const envios = [
      ...dia('2026-08-17', [{ monto_envio: 3000, envio_pagado: true }]), // le quedamos debiendo 3000
      ...dia('2026-08-18', [{ monto_envio: 3000, monto_pedido_a_cobrar: 10000 }]), // trae 10000
    ]
    const c = cuentaDelCadete(envios, [cierre('2026-08-17', 0), cierre('2026-08-18', 10000)])
    expect(c.dias.map((d) => d.acumulado)).toEqual([-3000, -3000])
    // El martes trajo los 10.000 enteros, así que los 3.000 del lunes le siguen debiendo.
    expect(c.saldo).toBe(-3000)
  })

  it('si se descuenta lo que se le debía, la cuenta vuelve a cero', () => {
    const envios = [
      ...dia('2026-08-17', [{ monto_envio: 3000, envio_pagado: true }]),
      ...dia('2026-08-18', [{ monto_envio: 3000, monto_pedido_a_cobrar: 10000 }]),
    ]
    // Trae 7.000 y se queda con los 3.000 que se le debían: es como se salda en la calle.
    const c = cuentaDelCadete(envios, [cierre('2026-08-17', 0), cierre('2026-08-18', 7000)])
    expect(c.saldo).toBe(0)
  })

  // 🔴 **El signo del pago por fuera.** Los dos caminos dan un número plausible y sólo uno cierra
  // contra la calle: si restara, transferirle lo que se le debía DUPLICARÍA la deuda (-6.000) en vez
  // de saldarla. Se le debían 3.000, se le transfirieron 3.000, quedan a mano.
  it('🔴 la plata que se le da por fuera SALDA lo que se le debía, no lo agranda', () => {
    const c = cuentaDelCadete(dia('2026-08-17', [{ monto_envio: 3000, envio_pagado: true }]), [cierre('2026-08-17', 0, 3000)])
    expect(c.saldo).toBe(0)
    expect(c.saldo).not.toBe(-6000)
  })

  // 🔴 Un envío que volvió sin entregar no cobró nada Y no se le paga. Contarlo haría que la cuenta
  // se rompa justo los días que algo salió mal.
  it('🔴 lo que no se entregó no entra en la cuenta', () => {
    const c = cuentaDelCadete(
      dia('2026-08-17', [{ monto_envio: 3000, monto_pedido_a_cobrar: 10000, estado: 'no_entregado' }]),
      [cierre('2026-08-17', 0)],
    )
    expect(c.dias[0].cobrado).toBe(0)
    expect(c.dias[0].tarifas).toBe(0)
    expect(c.saldo).toBe(0)
  })

  it('un día sin cerrar cuenta igual: la plata está en su bolsillo aunque nadie la haya anotado', () => {
    const c = cuentaDelCadete(dia('2026-08-17', [{ monto_envio: 3000, monto_pedido_a_cobrar: 10000 }]), [])
    expect(c.dias[0].trajo).toBe(null)
    expect(c.dias[0].cerrado).toBe(false)
    expect(c.saldo).toBe(10000)
  })

  // 🔴 El acumulado depende del orden. Si los días llegaran de la base al revés y no se ordenaran,
  // cada fila mostraría el saldo de otro día.
  it('🔴 ordena los días aunque lleguen mezclados', () => {
    const envios = [
      ...dia('2026-08-19', [{ monto_envio: 3000, monto_pedido_a_cobrar: 5000 }]),
      ...dia('2026-08-17', [{ monto_envio: 3000, envio_pagado: true }]),
    ]
    const c = cuentaDelCadete(envios, [])
    expect(c.dias.map((d) => d.fecha)).toEqual(['2026-08-17', '2026-08-19'])
    expect(c.dias.map((d) => d.acumulado)).toEqual([-3000, 2000])
  })

  it('los que están en la bandeja, sin día, no tienen nada que ver con la cuenta', () => {
    const c = cuentaDelCadete([con({ fecha: null, turno: null, estado: 'entregado', monto_pedido_a_cobrar: 9999 })], [])
    expect(c.dias).toEqual([])
    expect(c.saldo).toBe(0)
  })

  it('un día cerrado sin envíos igual es una fila: es el día en que se le pagó lo que se le debía', () => {
    const c = cuentaDelCadete([], [cierre('2026-08-17', 0, 5000)])
    expect(c.dias).toHaveLength(1)
    expect(c.saldo).toBe(5000) // no repartió y se le dieron 5.000: ahora los tiene él
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

describe('🔴 lo que dice el ticket en la mano del cadete', () => {
  it('un envío ya pagado dice PAGADO, no "$0"', () => {
    const dice = textoDePlata(con({ monto_envio: 3000, envio_pagado: true }))
    expect(dice.modo).toBe('pagado')
    expect(dice.titulo).toBe('PAGADO')
    // "$0" se lee como un precio, no como "no cobres". Es la diferencia entre un ticket que
    // funciona en la puerta y una que hace discutir al cadete con el cliente.
    expect(dice.titulo).not.toContain('$')
  })

  // 🔴 El bonificado en el papel. El mutante es `textoDePlata` mirando sólo `envio_pagado`: el
  // ticket saldría con "$3.000" arriba de un envío que se regaló, y el cadete lo cobra.
  it('🔴 un envío bonificado también dice PAGADO, no el precio', () => {
    const dice = textoDePlata(con({ monto_envio: 3000, envio_bonificado: true }))
    expect(dice.modo).toBe('pagado')
    expect(dice.titulo).toBe('PAGADO')
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
    // El envío ya está pago: meterlo en el desglose sería mandar a cobrarlo por la puerta de atrás.
    expect(dice.detalle).toBeNull()
  })

  it('cuando la puerta cobra dos cosas, el desglose las nombra y suman el total', () => {
    const dice = textoDePlata(con({ monto_envio: 3000, envio_pagado: false, monto_pedido_a_cobrar: 17500 }))
    expect(dice.titulo).toBe('$20.500')
    expect(dice.detalle).toBe('Envío $3.000 + pedido $17.500')
  })

  it('con una sola cosa que cobrar no hay desglose', () => {
    // Repetir el mismo número en chico abajo del grande invita a leer el chico.
    expect(textoDePlata(con({ monto_envio: 3000, monto_pedido_a_cobrar: 0 })).detalle).toBeNull()
  })
})

/**
 * 🔴 **El alto del rollo lo decide el contenido**, así que el defecto propio de este formato es el
 * ticket cortado: una dirección de cuatro renglones que empuja el bloque de plata fuera del papel.
 * Un test que sólo verifique que el PDF se generó da verde con eso puesto — de ahí que el layout sea
 * una función pura que devuelve dónde queda cada cosa y cuánto mide la página.
 *
 * El medidor de mentira corta cada 24 caracteres: no imita a jsPDF, sólo hace que un texto más largo
 * ocupe más renglones, que es lo único de lo que depende el alto.
 */
const medir = (txt: string) => txt.match(/.{1,24}/g) || ['']

describe('🔴 el ticket de 80 mm no se corta', () => {
  it('el papel crece con la dirección: nada queda abajo del corte', () => {
    const corto = armarTicket(con({ direccion: 'San Juan 100' }), medir)
    const largo = armarTicket(
      con({ direccion: 'Avenida Presidente Perón 4567 bis, entre Mendoza y Córdoba', piso_depto: 'Piso 12 Depto B', anotacion: 'Tocar timbre 2, si no atiende llamar antes de irse' }),
      medir,
    )
    expect(largo.alto).toBeGreaterThan(corto.alto)
    // Lo que importa no es que la página sea más alta, sino que la plata siga adentro.
    for (const t of [corto, largo]) {
      const plata = t.ops.find((o) => o.k === 'plata')!
      expect(plata).toBeDefined()
      // El bloque ENTERO, no sólo su primer milímetro: un ticket que arranca el recuadro adentro y
      // lo termina afuera sale con el monto cortado por la cuchilla, que es el defecto de este
      // formato.
      expect(plata.y + plata.alto).toBeLessThanOrEqual(t.alto)
    }
  })

  it('el recuadro crece cuando además va el desglose: el número grande y el chico no se tocan', () => {
    const simple = armarTicket(con({ monto_envio: 3000, monto_pedido_a_cobrar: 0 }), medir)
    const doble = armarTicket(con({ monto_envio: 3000, monto_pedido_a_cobrar: 17500 }), medir)
    const alto = (t: { ops: { k: string; alto?: number }[] }) => t.ops.find((o) => o.k === 'plata')!.alto!
    expect(alto(doble)).toBeGreaterThan(alto(simple))
  })

  it('el bloque de plata va último: nada se escribe abajo del número que hay que cobrar', () => {
    const { ops } = armarTicket(con({ anotacion: 'Dejar en portería' }), medir)
    expect(ops[ops.length - 1].k).toBe('plata')
  })

  it('lo que el cadete necesita en la puerta está impreso', () => {
    const { ops } = armarTicket(con({ cliente: 'Ana', telefono: '3415551234', anotacion: 'Timbre 2' }), medir)
    const escrito = ops.filter((o) => o.k === 'txt').map((o) => (o as { txt: string }).txt).join(' ')
    expect(escrito).toContain('Ana')
    expect(escrito).toContain('3415551234')
    expect(escrito).toContain('Timbre 2')
    expect(escrito).toContain('#1234')
  })

  it('un envío sin teléfono ni anotación no deja renglones vacíos', () => {
    const { ops } = armarTicket(con({ telefono: null, anotacion: null }), medir)
    expect(ops.filter((o) => o.k === 'txt').every((o) => (o as { txt: string }).txt.trim() !== '')).toBe(true)
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

/**
 * Qué paquetes son del cadete.
 *
 * 🔴 **El defecto que estos tests existen para cazar es que entre a la hoja un paquete que despacha
 * el correo.** No es hipotético: se midió en prod sobre 127 órdenes de BDI que **23 de las 39 que
 * pasaban el filtro (el 59%) eran de Correo Argentino y Andreani**. Un test que sólo verifique que
 * la de cadetería entra da verde con ese defecto puesto, así que cada caso de acá está escrito al
 * revés: qué tiene que quedar AFUERA, y por cuál de las dos señales.
 */
describe('vaAlReparto — qué sale en la mochila', () => {
  const orden = (p: Partial<OrdenTN>): OrdenTN => ({
    number: 20915,
    cliente: 'Ana',
    envio: 'Envío Cadeteria Rosario y alrededores',
    fecha: '2026-08-14',
    envio_costo_cliente: 0,
    envio_tipo: 'ship',
    envio_tracking: null,
    estado_pago: 'paid',
    estado_orden: 'open',
    envio_direccion: null,
    ...p,
  })

  it('el cadete lleva la cadetería, con el nombre de hoy y con el de julio', () => {
    expect(vaAlReparto(orden({}))).toBe(true)
    // El mismo servicio, escrito como estaba hasta julio. Si el filtro fuera positivo por nombre,
    // el día que lo renombran otra vez el paquete no sale y nadie se entera.
    expect(
      vaAlReparto(
        orden({ envio: 'Envio con Cadete en Rosario (entre $3000 y $4300), Fisherton ($4300/$5500), Funes ( $8000)' }),
      ),
    ).toBe(true)
  })

  it('🔴 el correo NO va a la mochila, ni siquiera antes de tener tracking', () => {
    // Con tracking es fácil. El caso que importa es el de arriba: a la mañana, cuando se arma la
    // hoja, la orden de correo todavía no fue despachada y no tiene número de seguimiento. Un
    // filtro que sólo mire el tracking la deja pasar.
    expect(vaAlReparto(orden({ envio: 'Envío Nube - Correo Argentino Clásico a domicilio', envio_tracking: null }))).toBe(false)
    expect(vaAlReparto(orden({ envio: 'Envío Nube - Correo Argentino Clásico a domicilio', envio_tracking: 'AR123' }))).toBe(false)
    expect(vaAlReparto(orden({ envio: 'Envío Nube - Andreani a domicilio', envio_tracking: '360001234' }))).toBe(false)
  })

  it('un correo nuevo, con otro nombre, se caza por el tracking', () => {
    expect(vaAlReparto(orden({ envio: 'OCA Puerta a Puerta', envio_tracking: 'OCA99' }))).toBe(false)
  })

  it('una opción desconocida y sin tracking entra: falla del lado seguro', () => {
    // Aparece una fila de más, que se ve y se borra. Al revés —esconderla— el paquete no sale.
    expect(vaAlReparto(orden({ envio: 'Moto Rosario centro' }))).toBe(true)
  })

  it('el retiro no sale a la calle, aunque el nombre no diga nada', () => {
    expect(vaAlReparto(orden({ envio: 'BDI Store', envio_tipo: 'pickup' }))).toBe(false)
    expect(vaAlReparto(orden({ envio: 'Punto de retiro', envio_tipo: 'pickup' }))).toBe(false)
  })

  it('una orden cancelada no se prepara', () => {
    expect(vaAlReparto(orden({ cancelada: true }))).toBe(false)
    expect(vaAlReparto(orden({ estado_orden: 'cancelled' }))).toBe(false)
  })
})

/**
 * Los días en que el cadete sale.
 *
 * 🔴 **El defecto que estos tests cazan es un paquete agendado en un turno que no existe**: queda
 * esperando en la pantalla, nadie lo lleva, y no falla nada. Por eso cada caso pregunta por el día
 * que NO tiene ese turno —un test que sólo pruebe el martes da verde con la tabla del lunes vacía—.
 */
describe('turnosDe — lun-vie tarde, mar y jue también mañana', () => {
  // Agosto de 2026: el 10 cae lunes.
  const LUNES = '2026-08-10'
  const MARTES = '2026-08-11'
  const MIERCOLES = '2026-08-12'
  const JUEVES = '2026-08-13'
  const VIERNES = '2026-08-14'
  const SABADO = '2026-08-15'
  const DOMINGO = '2026-08-16'

  it('el lunes, el miércoles y el viernes son sólo de tarde', () => {
    for (const f of [LUNES, MIERCOLES, VIERNES]) expect(turnosDe(f)).toEqual(['tarde'])
    expect(esTurnoDeGrilla(LUNES, 'mañana')).toBe(false)
  })

  it('el martes y el jueves tienen los dos turnos', () => {
    for (const f of [MARTES, JUEVES]) expect(turnosDe(f)).toEqual(['mañana', 'tarde'])
  })

  it('el fin de semana no hay reparto', () => {
    expect(turnosDe(SABADO)).toEqual([])
    expect(turnosDe(DOMINGO)).toEqual([])
    expect(esTurnoDeGrilla(SABADO, 'tarde')).toBe(false)
  })

  it('🔴 el día se lee sin corrimiento de zona horaria', () => {
    // `new Date('2026-08-10')` es medianoche UTC: en Argentina eso todavía es el domingo 9, y toda
    // la grilla se correría un día sin que fallara nada. `diaDeSemanaDe` parsea a mano por eso.
    expect(turnosDe(LUNES)).toEqual(['tarde'])
    expect(turnosDe(DOMINGO)).toEqual([])
  })

  it('una fecha rota no rompe la pantalla: no hay reparto', () => {
    expect(turnosDe('')).toEqual([])
    expect(turnosDe('15/08/2026')).toEqual([])
  })
})

/**
 * La bandeja: el envío cotizado que todavía no tiene día.
 *
 * 🔴 **Lo que no puede volver es la fila con fecha y sin turno**: era el 53,8% de la planilla vieja,
 * y es la única combinación que se rechaza. «Sin ninguno de los dos» es un estado legítimo.
 */
describe('validarEnvio — fecha y turno, los dos o ninguno', () => {
  const base = {
    store: 'bdi',
    origen: 'manual',
    direccion: 'Callao 1033',
    monto_envio: 3000,
    monto_pedido_a_cobrar: 0,
  }

  it('sin fecha ni turno se acepta: es un pendiente', () => {
    expect(validarEnvio({ ...base, fecha: null, turno: null })).toBeNull()
    expect(validarEnvio({ ...base, fecha: '', turno: '' })).toBeNull()
  })

  it('🔴 con fecha y sin turno se rechaza', () => {
    expect(validarEnvio({ ...base, fecha: '2026-08-11', turno: null })).toMatch(/turno/i)
  })

  it('con turno y sin fecha se rechaza', () => {
    expect(validarEnvio({ ...base, fecha: null, turno: 'tarde' })).toMatch(/fecha|día/i)
  })

  it('con los dos, bien formados, se acepta', () => {
    expect(validarEnvio({ ...base, fecha: '2026-08-11', turno: 'tarde' })).toBeNull()
  })

  it('un turno fuera de grilla se guarda igual: la grilla la avisa la pantalla', () => {
    // Lunes a la mañana no existe en el reparto, pero un envío especial tiene que poder salir sin
    // tocar el código. Si esto empieza a devolver un error, el local se queda sin salida.
    expect(validarEnvio({ ...base, fecha: '2026-08-10', turno: 'mañana' })).toBeNull()
  })

  // 🔴 Los dos tildes juntos son dos verdades sobre la misma plata, y el mutante es no chequearlo:
  // en la puerta no se nota —`aCobrar` da lo mismo—, así que si no se rechaza acá no se rechaza en
  // ningún lado, y el día que haya que contestar «cuánto regalamos en envíos» esas filas no se
  // pueden ni contar ni dejar afuera.
  it('🔴 pagado y bonificado a la vez se rechaza', () => {
    expect(validarEnvio({ ...base, envio_pagado: true, envio_bonificado: true })).toMatch(/pagado y bonificado/i)
  })

  it('cada uno por su lado se acepta', () => {
    expect(validarEnvio({ ...base, envio_pagado: true, envio_bonificado: false })).toBeNull()
    expect(validarEnvio({ ...base, envio_pagado: false, envio_bonificado: true })).toBeNull()
  })
})

/**
 * Lo que llega de Tienda Nube.
 *
 * 🔴 **Dos defectos distintos, y los dos se cobran mal en la puerta**: que un pedido a pagar en
 * efectivo salga con saldo 0 (el cadete no cobra el producto y la plata no vuelve), y que un pago
 * anulado salga con saldo (el cadete le pide plata a alguien que no compró).
 */
describe('ordenAEnvio — de la orden a la fila', () => {
  const orden = (p: Record<string, unknown>) => ({
    number: 20915,
    cliente: 'Ana',
    envio: 'Envío Cadeteria Rosario y alrededores',
    fecha: '2026-08-14',
    total: '18174.70',
    envio_costo_cliente: 0,
    envio_tipo: 'ship',
    envio_tracking: null,
    estado_pago: 'paid',
    estado_orden: 'open',
    envio_direccion: null,
    ...p,
  })

  it('nace sin día: va a la bandeja, no al día de la orden', () => {
    const f = ordenAEnvio(orden({}), 'bdi')
    expect(f.fecha).toBeNull()
    expect(f.turno).toBeNull()
  })

  it('🔴 el pedido a pagar en efectivo sale con el saldo del producto cargado', () => {
    // `offline` + `custom` + `pending` es el efectivo de TN. El envío se cuenta aparte, así que el
    // saldo es el total MENOS el envío: sumarlo entero cobraría el envío dos veces en la puerta.
    const f = ordenAEnvio(orden({ estado_pago: 'pending', total: '20000', envio_costo_cliente: 3000 }), 'bdi')
    expect(f.monto_pedido_a_cobrar).toBe(17000)
    expect(f.envio_pagado).toBe(false)
  })

  it('🔴 un pago anulado NO se cobra en la puerta', () => {
    for (const estado of ['voided', 'refunded']) {
      const f = ordenAEnvio(orden({ estado_pago: estado, total: '20000' }), 'bdi')
      expect(f.monto_pedido_a_cobrar).toBe(0)
    }
  })

  it('una orden pagada no cobra nada de producto', () => {
    expect(ordenAEnvio(orden({ estado_pago: 'paid' }), 'bdi').monto_pedido_a_cobrar).toBe(0)
  })
})

/**
 * El rótulo del día.
 *
 * 🔴 **El defecto que este test caza mató la pestaña dos veces en producción.** Un
 * `<input type="date">` pasa por vacío mientras se tipea, `rotuloFecha('')` tira un TypeError, y un
 * throw en el render de React no muestra un cartel: reintenta hasta que Chrome mata la pestaña
 * ("This page couldn't load"), con el modal abierto y el envío sin agendar.
 */
describe('rotuloDeDia — el borde por donde entra lo que se tipea', () => {
  it('🔴 una fecha a medio escribir no rompe: devuelve vacío', () => {
    for (const rota of ['', '2', '2026', '2026-08', '2026-08-1', '15/08/2026', null, undefined]) {
      expect(() => rotuloDeDia(rota as string)).not.toThrow()
      expect(rotuloDeDia(rota as string)).toBe('')
    }
  })

  it('una fecha entera sale con el día de la semana', () => {
    expect(rotuloDeDia('2026-08-14')).toBe('vie 14-ago')
  })
})

/**
 * Que la ORDEN esté paga no quiere decir que el ENVÍO esté pago.
 *
 * 🔴 **El defecto que este bloque caza es plata que el cadete no cobra.** La cadetería llega de
 * Tienda Nube en $0 —el precio vive en el mapa de zonas y lo pone una persona después—, así que con
 * `estado_pago === 'paid'` a secas la fila salía marcada PAGADO con el precio sin cargar. Se
 * cotizaba en $3.000 y el ticket seguía diciendo PAGADO. Pasó en la hoja del 14-ago-2026:
 * «Envíos ya pagos $3.000 · A rendir $0».
 */
describe('envio_pagado — sólo si Tienda Nube cobró el envío', () => {
  const orden = (p: Record<string, unknown>) => ({
    number: 20913,
    cliente: 'Ana',
    envio: 'Envío Cadeteria Rosario y alrededores',
    fecha: '2026-08-14',
    total: '18174.70',
    envio_costo_cliente: 0,
    envio_tipo: 'ship',
    estado_pago: 'paid',
    estado_orden: 'open',
    envio_direccion: null,
    ...p,
  })

  it('🔴 la orden paga con el envío en $0 NO nace pagada', () => {
    expect(ordenAEnvio(orden({}), 'bdi').envio_pagado).toBe(false)
  })

  it('el envío que la tienda sí cobró nace pagado', () => {
    expect(ordenAEnvio(orden({ envio_costo_cliente: 9326 }), 'bdi').envio_pagado).toBe(true)
  })

  it('un envío con precio pero con la orden impaga se cobra en la puerta', () => {
    expect(ordenAEnvio(orden({ envio_costo_cliente: 9326, estado_pago: 'pending' }), 'bdi').envio_pagado).toBe(false)
  })
})

/**
 * Las flechas del día.
 *
 * 🔴 **El defecto que cazan es dejar al usuario parado en un día sin reparto**, que es una pantalla
 * siempre vacía. Un test que sólo avance de martes a miércoles da verde con el salto del fin de
 * semana roto, así que los casos son justo los bordes: el viernes y el lunes.
 */
describe('diaDeRepartoVecino — saltea los días sin moto', () => {
  it('🔴 del viernes, la flecha adelante cae en lunes, no en sábado', () => {
    expect(diaDeRepartoVecino('2026-08-14', 1)).toBe('2026-08-17')
  })

  it('🔴 del lunes, la flecha atrás cae en viernes, no en domingo', () => {
    expect(diaDeRepartoVecino('2026-08-17', -1)).toBe('2026-08-14')
  })

  it('entre semana avanza y retrocede de a un día', () => {
    expect(diaDeRepartoVecino('2026-08-11', 1)).toBe('2026-08-12')
    expect(diaDeRepartoVecino('2026-08-12', -1)).toBe('2026-08-11')
  })

  it('desde un sábado —al que se llega por el calendario— sale para los dos lados', () => {
    expect(diaDeRepartoVecino('2026-08-15', 1)).toBe('2026-08-17')
    expect(diaDeRepartoVecino('2026-08-15', -1)).toBe('2026-08-14')
  })

  it('el próximo día de reparto desde un sábado es el lunes, y desde un día hábil es él mismo', () => {
    expect(proximoDiaDeReparto('2026-08-15')).toBe('2026-08-17')
    expect(proximoDiaDeReparto('2026-08-14')).toBe('2026-08-14')
  })
})

/**
 * Lo que Tienda Nube no contestó.
 *
 * 🔴 **El defecto que cazan es el peor de todos los de esta pantalla: media hoja en verde.** Cuando
 * el detalle se come el rate limit, el endpoint contesta `ok: true` con menos órdenes adentro —se
 * midió: 15 de 77, con 62 fallidas— así que no hay excepción que atrape nadie. Un test que sólo
 * verifique que traer devuelve un texto da verde con el defecto puesto: lo que hay que afirmar es
 * que el número aparece **y que el cartel deja de ser verde**.
 */
describe('🔴 lo que Tienda Nube no contestó', () => {
  it('cuenta las que faltan restando, no leyendo `fallidas`', () => {
    // El tramo real de nueve días: 77 en el rango, 15 llegaron.
    expect(ordenesQueNoLlegaron({ total_en_rango: 77, fallidas: 62 }, 15)).toBe(62)
  })

  it('🔴 también cuenta las que ni se intentaron: `truncado` no es `fallidas`', () => {
    // Ninguna falló: el rango se pasó del límite y esas 100 nunca se pidieron. Faltan lo mismo.
    expect(ordenesQueNoLlegaron({ total_en_rango: 300, fallidas: 0 }, 200)).toBe(100)
  })

  it('cuando llegaron todas, no falta ninguna', () => {
    expect(ordenesQueNoLlegaron({ total_en_rango: 32, fallidas: 0 }, 32)).toBe(0)
  })

  it('si el total no viaja, cae en `fallidas`; y sin nada, no inventa un faltante', () => {
    expect(ordenesQueNoLlegaron({ fallidas: 5 }, 10)).toBe(5)
    expect(ordenesQueNoLlegaron({}, 10)).toBe(0)
    expect(ordenesQueNoLlegaron(null, 10)).toBe(0)
  })

  it('nunca da negativo, ni si el endpoint cuenta mal el rango', () => {
    expect(ordenesQueNoLlegaron({ total_en_rango: 5 }, 10)).toBe(0)
  })
})

describe('🔴 el cartel de traer no puede ser verde con media hoja', () => {
  const traida = (p: Partial<Traida> = {}): Traida => ({
    agregados: 7,
    ya_estaban: 1,
    sinDireccion: 0,
    porCorreo: 7,
    noLeidas: 0,
    ...p,
  })

  it('la pasada buena sigue diciendo lo mismo, en verde', () => {
    const r = resumenDeTraida(traida())
    expect(r.tono).toBe('ok')
    expect(r.texto).toBe('7 nuevos · 1 ya estaban · 7 van por correo')
  })

  it('🔴 si faltaron órdenes, el tono NO es `ok`', () => {
    expect(resumenDeTraida(traida({ noLeidas: 62 })).tono).toBe('aviso')
  })

  it('🔴 y el número aparece en el texto, con qué hacer', () => {
    const r = resumenDeTraida(traida({ agregados: 0, ya_estaban: 0, porCorreo: 0, noLeidas: 62 }))
    expect(r.texto).toContain('62')
    expect(r.texto).toContain('Tienda Nube no contestó')
    expect(r.texto).toContain('volvé a apretar Traer')
  })

  it('«0 nuevos» con órdenes perdidas no se lee como un día tranquilo', () => {
    const r = resumenDeTraida(traida({ agregados: 0, ya_estaban: 0, porCorreo: 0, noLeidas: 1 }))
    expect(r.tono).toBe('aviso')
    expect(r.texto).toBe('0 nuevos · ⚠️ 1 orden que Tienda Nube no contestó: volvé a apretar Traer')
  })

  it('sigue avisando de las que entraron sin dirección', () => {
    const r = resumenDeTraida(traida({ sinDireccion: 2 }))
    expect(r.texto).toContain('2 sin dirección')
    expect(r.tono).toBe('ok')
  })
})
