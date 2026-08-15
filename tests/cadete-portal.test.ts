import { describe, expect, it } from 'vitest'
import {
  fechaDelPortal,
  paraElCadete,
  parcheDeAccion,
  pinTrabado,
  venceElProximoPrimero,
} from '@/lib/envios/portal.core.js'

/**
 * El portal del cadete: lo único de Envíos abierto a internet.
 *
 * 🔴 **Lo que hay del otro lado no es plata: son nombres, direcciones y teléfonos de clientas.** El
 * defecto que estos tests existen para cazar es que algo de eso salga sin querer — por un `select *`,
 * por un `{...fila}`, o por un link filtrado que devuelva más de un día.
 *
 * Molde: `tests/reclamo-publico.test.ts`, que hace lo mismo para `/reclamo/<token>`.
 */

/** Una fila como viene de la base, **con todo lo que NO puede salir metido adentro a propósito**. */
const fila = {
  id: 'en1',
  store: 'bdi',
  fecha: '2026-08-17',
  turno: 'tarde',
  orden_numero: '1234',
  cliente: 'Ana',
  telefono: '3415551234',
  direccion: '3 de Febrero 1234',
  piso_depto: '3º B',
  localidad: 'Rosario',
  cp: '2000',
  anotacion: 'Tocar timbre 2',
  monto_envio: 3000,
  envio_pagado: false,
  envio_bonificado: false,
  monto_pedido_a_cobrar: 0,
  estado: 'preparado',
  cobrado: null,
  // Lo sensible, que tiene que quedar afuera:
  vendedor: 'Karen',
  autor: 'Bruno',
  cadete: 'Marcelo',
  datos: {
    tn: {
      number: 1234,
      total: '17990.00',
      contact_email: 'ana@gmail.com',
      gateway: 'mercadopago',
      pago_cuotas: 3,
      products: [{ name: 'POP CASE', price: '14990.00', sku: 'F-0225' }],
    },
  },
}

describe('🔴 lo que el portal deja salir a internet', () => {
  // 🔴 EL test del archivo. El mutante es `{...fila}` o un `select *`: con eso viaja `datos`, que
  // tiene el mail de la clienta, el total, el medio de pago y los ítems, más los nombres de la gente
  // que trabaja acá. Nada de eso tiene que ver con dejar un paquete en una puerta.
  it('🔴 NO sale la orden de Tienda Nube ni los nombres internos', () => {
    const salida = paraElCadete(fila) as Record<string, unknown>
    expect(salida.datos).toBeUndefined()
    expect(salida.vendedor).toBeUndefined()
    expect(salida.autor).toBeUndefined()
    expect(salida.cadete).toBeUndefined()
    // Y lo mismo dicho de la otra forma, por si mañana alguien renombra un campo: el mail de la
    // clienta no puede aparecer en NINGÚN lado de la respuesta.
    expect(JSON.stringify(salida)).not.toContain('ana@gmail.com')
    expect(JSON.stringify(salida)).not.toContain('mercadopago')
  })

  it('sale lo que hace falta para llegar a la puerta', () => {
    const salida = paraElCadete(fila)
    expect(salida).toMatchObject({
      id: 'en1',
      cliente: 'Ana',
      direccion: '3 de Febrero 1234',
      piso: '3º B',
      localidad: 'Rosario',
      telefono: '3415551234',
      anotacion: 'Tocar timbre 2',
    })
  })

  // 🔑 El monto se calcula con la MISMA función que el ticket impreso y la pantalla interna. El
  // mutante es que el portal haga su propia resta: el papel y el teléfono dirían números distintos
  // sobre la misma puerta, con la clienta adelante.
  it('🔴 la plata sale resuelta, no en crudo', () => {
    expect(paraElCadete(fila).aCobrar).toBe(3000)
    expect(paraElCadete({ ...fila, envio_pagado: true }).aCobrar).toBe(0)
    expect(paraElCadete({ ...fila, envio_bonificado: true }).aCobrar).toBe(0)
    expect(paraElCadete({ ...fila, monto_pedido_a_cobrar: 17500 }).aCobrar).toBe(20500)
  })

  // `null` es "todavía no dijo"; `false` es "no me pagó". Se saldan de formas opuestas, así que
  // colapsarlos en un booleano rompe la rendición del día.
  it('🔴 «no dijo nada» y «no cobró» no son lo mismo', () => {
    expect(paraElCadete({ ...fila, cobrado: null }).cobrado).toBeNull()
    expect(paraElCadete({ ...fila, cobrado: false }).cobrado).toBe(false)
    expect(paraElCadete({ ...fila, cobrado: true }).cobrado).toBe(true)
  })

  it('el estado viaja con su nombre, no crudo', () => {
    expect(paraElCadete({ ...fila, estado: 'en_transito' }).estadoTexto).toBe('En tránsito')
    // Y un legado tampoco sale sin nombre mientras dure la ventana de la migración.
    expect(paraElCadete({ ...fila, estado: 'despachado' }).estadoTexto).toBe('En tránsito')
  })
})

/**
 * 🔴 La barrera más importante: el link sirve para HOY, no para la agenda entera.
 */
describe('🔴 qué día puede pedir el link', () => {
  const HOY = '2026-08-17'

  it('sin fecha, el día del servidor', () => {
    expect(fechaDelPortal(undefined, HOY)).toBe(HOY)
    expect(fechaDelPortal('', HOY)).toBe(HOY)
  })

  // 🔴 EL test. El mutante —aceptar cualquier fecha— convierte el link en un volcado de la agenda:
  // nombre, dirección y teléfono de cada clienta que pasó por la moto.
  it('🔴 un día lejano se rechaza', () => {
    expect(fechaDelPortal('2026-01-05', HOY)).toBeNull()
    expect(fechaDelPortal('2026-07-17', HOY)).toBeNull()
    expect(fechaDelPortal('2026-08-14', HOY)).toBeNull()
  })

  // 🔑 El ±1 no es holgura: el servidor corre en UTC y a las 21:00 de Argentina ya devuelve mañana.
  // Sin esto, el portal se vaciaría solo en el medio del turno tarde.
  it('el día de al lado sí, que es el huso', () => {
    expect(fechaDelPortal('2026-08-16', HOY)).toBe('2026-08-16')
    expect(fechaDelPortal('2026-08-18', HOY)).toBe('2026-08-18')
  })

  it('una fecha con cualquier forma se rechaza', () => {
    expect(fechaDelPortal('17/08/2026', HOY)).toBeNull()
    expect(fechaDelPortal('2026-08-17 or 1=1', HOY)).toBeNull()
  })
})

describe('🔴 lo único que el portal puede escribir', () => {
  it('las cuatro acciones, con su parche fijo', () => {
    expect(parcheDeAccion('entregado')).toEqual({ estado: 'entregado' })
    expect(parcheDeAccion('no_entregado')).toEqual({ estado: 'no_entregado' })
    expect(parcheDeAccion('cobrado')).toEqual({ cobrado: true })
    expect(parcheDeAccion('no_cobrado')).toEqual({ cobrado: false })
  })

  // 🔴 El mutante es copiar el body: con eso, cualquiera con el link reescribe precios, nombres y
  // direcciones. Acá el parche sale de la lista y lo demás no existe.
  it('🔴 cualquier otra cosa no escribe nada', () => {
    expect(parcheDeAccion('borrar')).toBeNull()
    expect(parcheDeAccion('')).toBeNull()
    expect(parcheDeAccion('monto_envio')).toBeNull()
    // Y no se cuela por la cadena de prototipos, que es la forma tonta de romper una lista blanca.
    expect(parcheDeAccion('constructor')).toBeNull()
    expect(parcheDeAccion('toString')).toBeNull()
  })

  it('el parche es una copia: nadie puede ensuciar la lista para el pedido siguiente', () => {
    const p = parcheDeAccion('entregado') as Record<string, unknown>
    p.estado = 'cualquiera'
    expect(parcheDeAccion('entregado')).toEqual({ estado: 'entregado' })
  })
})

describe('🔴 el PIN se traba', () => {
  // Sin contador, cuatro dígitos son 10.000 combinaciones: un rato de script.
  it('trabado mientras no pase el rato', () => {
    expect(pinTrabado({ pin_bloqueado_hasta: '2026-08-17T12:15:00Z' }, '2026-08-17T12:05:00Z')).toBe(true)
  })

  it('destrabado después', () => {
    expect(pinTrabado({ pin_bloqueado_hasta: '2026-08-17T12:15:00Z' }, '2026-08-17T12:20:00Z')).toBe(false)
  })

  it('sin traba puesta, no traba', () => {
    expect(pinTrabado({ pin_bloqueado_hasta: null }, '2026-08-17T12:00:00Z')).toBe(false)
    expect(pinTrabado({}, '2026-08-17T12:00:00Z')).toBe(false)
  })
})

describe('hasta cuándo vale un link', () => {
  it('hasta el 1º del mes que viene', () => {
    expect(venceElProximoPrimero('2026-08-01')).toBe('2026-09-01')
    expect(venceElProximoPrimero('2026-08-15')).toBe('2026-09-01')
  })

  // 🔴 El caso bobo que el piso de 15 días evita: un link generado el 29 moriría en dos días y el
  // cadete se quedaría sin la hoja un martes a la mañana.
  it('🔴 nunca menos de 15 días: salta al mes siguiente', () => {
    expect(venceElProximoPrimero('2026-08-29')).toBe('2026-10-01')
    expect(venceElProximoPrimero('2026-08-25')).toBe('2026-10-01')
  })

  it('cruza el año sin romperse', () => {
    expect(venceElProximoPrimero('2026-12-05')).toBe('2027-01-01')
    expect(venceElProximoPrimero('2026-12-28')).toBe('2027-02-01')
  })

  it('una fecha rota no devuelve un vencimiento inventado', () => {
    expect(venceElProximoPrimero('')).toBeNull()
    expect(venceElProximoPrimero('mañana')).toBeNull()
  })
})
