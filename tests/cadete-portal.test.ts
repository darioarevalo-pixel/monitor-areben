import { describe, expect, it } from 'vitest'
import {
  diaArgentino,
  diasConEnvios,
  diasNavegables,
  diaVecino,
  enviosDelDia,
  fechaQueSePuedeEscribir,
  fechaQueSePuedeLeer,
  linkDeWhatsapp,
  mensajeParaLaPuerta,
  paraElCadete,
  paraElCadeteFuturo,
  parcheDeAccion,
  pinTrabado,
  rangoDeLectura,
  rotuloCorto,
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
 * 🔴 El día del portal es el de ACÁ, no el de UTC.
 *
 * El defecto que estos tests existen para cazar le vaciaba la hoja al cadete en el medio del turno
 * tarde: el servidor corre en UTC, así que a las 21:00 de Argentina ya contestaba el día siguiente.
 */
describe('🔴 el día del portal es el de Argentina', () => {
  it('🔴 a las 23:30 de acá TODAVÍA es hoy', () => {
    // El mutante es el código que había: `new Date().toISOString().slice(0,10)`. Con él, a las 21:00
    // el portal salta a mañana —una hoja vacía— y los toques de «Entregado» caen sobre los envíos
    // del día siguiente. Las 23:30 del 17 en Argentina son las 02:30 del 18 en UTC.
    expect(diaArgentino(Date.parse('2026-08-18T02:30:00Z'))).toBe('2026-08-17')
    expect(diaArgentino(Date.parse('2026-08-18T00:15:00Z'))).toBe('2026-08-17')
  })

  it('🔴 a las 00:30 de acá ya es el día nuevo', () => {
    // El mutante que el borde de arriba solo no caza: restar el offset dos veces, o sumarlo en vez
    // de restarlo. Con cualquiera de los dos, el cadete arranca el día viendo la hoja de ayer.
    expect(diaArgentino(Date.parse('2026-08-18T03:30:00Z'))).toBe('2026-08-18')
    expect(diaArgentino(Date.parse('2026-08-18T03:00:00Z'))).toBe('2026-08-18')
  })

  it('el mediodía no se mueve', () => {
    // Canario de un offset gigante o con el signo cambiado: si esto falla, no hay borde que discutir.
    expect(diaArgentino(Date.parse('2026-08-17T15:00:00Z'))).toBe('2026-08-17')
  })
})

/**
 * 🔴 La barrera más importante: el link sirve para esta semana, no para la agenda entera.
 */
describe('🔴 qué día puede pedir el link', () => {
  const HOY = '2026-08-17'

  it('sin fecha, el día de hoy', () => {
    expect(fechaQueSePuedeLeer(undefined, HOY)).toBe(HOY)
    expect(fechaQueSePuedeLeer('', HOY)).toBe(HOY)
    expect(fechaQueSePuedeEscribir(undefined, HOY)).toBe(HOY)
  })

  // 🔴 EL test. El mutante —aceptar cualquier fecha— convierte el link en un volcado de la agenda:
  // nombre, dirección y teléfono de cada clienta que pasó por la moto.
  it('🔴 un día lejano se rechaza', () => {
    expect(fechaQueSePuedeLeer('2026-01-05', HOY)).toBeNull()
    expect(fechaQueSePuedeLeer('2026-07-17', HOY)).toBeNull()
    expect(fechaQueSePuedeLeer('2026-08-25', HOY)).toBeNull()
  })

  // 🔴 La ventana es ASIMÉTRICA a propósito. El mutante es hacerla ±7: el historial es justo lo que
  // un link filtrado nunca puede dar, y para adelante lo que hay son envíos que todavía no salieron.
  it('🔴 para adelante una semana, para atrás sólo el día del huso', () => {
    expect(fechaQueSePuedeLeer('2026-08-24', HOY)).toBe('2026-08-24')
    expect(fechaQueSePuedeLeer('2026-08-25', HOY)).toBeNull()
    expect(fechaQueSePuedeLeer('2026-08-16', HOY)).toBe('2026-08-16')
    expect(fechaQueSePuedeLeer('2026-08-15', HOY)).toBeNull()
  })

  // 🔴 EL otro test del archivo. El mutante es usar la ventana de lectura también para el POST: con
  // eso, un link filtrado marca entregada —y cobrada— la semana entera de una sentada.
  it('🔴 un día de la semana que viene se LEE pero no se ESCRIBE', () => {
    expect(fechaQueSePuedeLeer('2026-08-20', HOY)).toBe('2026-08-20')
    expect(fechaQueSePuedeEscribir('2026-08-20', HOY)).toBeNull()
  })

  // 🔑 El ±1 de escritura no es holgura: a las 00:30 el cadete todavía está cerrando lo de ayer.
  it('el día de al lado sí se puede tocar, que es el borde del huso', () => {
    expect(fechaQueSePuedeEscribir('2026-08-16', HOY)).toBe('2026-08-16')
    expect(fechaQueSePuedeEscribir('2026-08-18', HOY)).toBe('2026-08-18')
    expect(fechaQueSePuedeEscribir('2026-08-19', HOY)).toBeNull()
  })

  it('una fecha con cualquier forma se rechaza en las dos', () => {
    expect(fechaQueSePuedeLeer('17/08/2026', HOY)).toBeNull()
    expect(fechaQueSePuedeLeer('2026-08-17 or 1=1', HOY)).toBeNull()
    expect(fechaQueSePuedeEscribir('17/08/2026', HOY)).toBeNull()
    expect(fechaQueSePuedeEscribir('2026-08-17 or 1=1', HOY)).toBeNull()
  })

  it('el rango que se le pide a la base es el mismo que la ventana de lectura', () => {
    // El mutante: un rango más ancho que la ventana. Los chips contarían días que después el
    // servidor rechaza, y al tocarlos daría 400.
    const { desde, hasta } = rangoDeLectura(HOY)
    expect(desde).toBe('2026-08-16')
    expect(hasta).toBe('2026-08-24')
    expect(fechaQueSePuedeLeer(desde, HOY)).toBe(desde)
    expect(fechaQueSePuedeLeer(hasta, HOY)).toBe(hasta)
  })
})

/**
 * 🔴 Los días que todavía no llegaron salen sin con qué llegar a la puerta.
 */
describe('🔴 lo que se ve de la semana que viene', () => {
  it('🔴 un día futuro NO lleva dirección ni teléfono', () => {
    // EL test de la ventana de 7 días. El mutante es reusar `paraElCadete` para los futuros: ahí
    // mirar la semana pasa a entregar siete días de direcciones y teléfonos en vez de uno.
    const salida = paraElCadeteFuturo(fila) as Record<string, unknown>
    expect(salida.direccion).toBeUndefined()
    expect(salida.telefono).toBeUndefined()
    expect(salida.piso).toBeUndefined()
    expect(salida.anotacion).toBeUndefined()
    // Sin `id` no hay con qué escribir, ni siquiera armando el pedido a mano.
    expect(salida.id).toBeUndefined()
    // Y dicho de la otra forma, por si mañana alguien renombra un campo.
    const json = JSON.stringify(salida)
    expect(json).not.toContain('3 de Febrero')
    expect(json).not.toContain('3415551234')
    expect(json).not.toContain('Tocar timbre')
  })

  it('pero sí lo que hace falta para saber qué viene', () => {
    expect(paraElCadeteFuturo(fila)).toMatchObject({
      marca: 'bdi',
      cliente: 'Ana',
      localidad: 'Rosario',
      turno: 'tarde',
      aCobrar: 3000,
    })
  })

  it('🔴 la forma la decide poder ESCRIBIR el día, no que sea hoy', () => {
    // EL test del recorte, y va sobre `enviosDelDia` porque es ahí donde se elige: probar sólo las
    // dos formas por separado deja el mutante que importa —usar la completa para todos los días—
    // adentro del handler, donde no lo mira nadie.
    const futuro = enviosDelDia([fila], false) as Record<string, unknown>[]
    expect(futuro[0].direccion).toBeUndefined()
    expect(futuro[0].telefono).toBeUndefined()
    expect(JSON.stringify(futuro)).not.toContain('3415551234')

    // Y ayer sigue siendo escribible por el borde del huso: ahí la dirección tiene que estar, porque
    // a las 00:30 el paquete todavía está en la moto.
    const hoyOAyer = enviosDelDia([fila], true) as Record<string, unknown>[]
    expect(hoyOAyer[0].direccion).toBe('3 de Febrero 1234')
    expect(hoyOAyer[0].telefono).toBe('3415551234')
  })

  it('🔴 la forma completa se construye ENCIMA de la flaca', () => {
    // El mutante es mantener dos listas de campos en paralelo: alguien agrega un dato a una y se
    // olvida de la otra. Acá, todo lo de la flaca tiene que estar sí o sí en la completa.
    const flaca = paraElCadeteFuturo(fila) as Record<string, unknown>
    const completa = paraElCadete(fila) as Record<string, unknown>
    for (const k of Object.keys(flaca)) expect(completa[k]).toEqual(flaca[k])
  })
})

describe('los chips de los días que vienen', () => {
  it('agrupa, cuenta y ordena, sin días vacíos', () => {
    const d = diasConEnvios(['2026-08-19', '2026-08-17', '2026-08-19', '2026-08-17', '2026-08-19'], '2026-08-17')
    expect(d).toEqual([
      { fecha: '2026-08-17', cuantos: 2, rotulo: 'Hoy' },
      { fecha: '2026-08-19', cuantos: 3, rotulo: 'mié 19-ago' },
    ])
  })

  it('una fecha rota no se cuenta como un día', () => {
    expect(diasConEnvios([null, '', 'mañana', '2026-08-17'] as unknown as string[], '2026-08-17')).toEqual([
      { fecha: '2026-08-17', cuantos: 1, rotulo: 'Hoy' },
    ])
  })

  it('🔴 a HOY siempre se puede volver, tenga envíos o no', () => {
    // El mutante: armar la lista de navegación sólo con los días que tienen envíos. Un sábado sin
    // reparto, el cadete toca la flecha para mirar el martes y **se queda sin camino de vuelta** al
    // único día que puede tocar.
    const dias = diasNavegables([{ fecha: '2026-08-18', cuantos: 2, rotulo: 'mar 18-ago' }], '2026-08-15')
    expect((dias as { fecha: string }[]).map((d) => d.fecha)).toEqual(['2026-08-15', '2026-08-18'])
    expect(dias[0]).toMatchObject({ cuantos: 0, rotulo: 'Hoy' })
    expect(diaVecino(dias, '2026-08-18', -1)).toBe('2026-08-15')
  })

  it('🔴 hoy no se duplica cuando SÍ tiene envíos', () => {
    // Mutante: empujar hoy sin preguntar. La flecha «siguiente» iría de hoy a hoy y no pasaría nada.
    const dias = diasNavegables(
      [
        { fecha: '2026-08-15', cuantos: 2, rotulo: 'Hoy' },
        { fecha: '2026-08-18', cuantos: 1, rotulo: 'mar 18-ago' },
      ],
      '2026-08-15',
    )
    expect(dias).toHaveLength(2)
    expect(diaVecino(dias, '2026-08-15', 1)).toBe('2026-08-18')
  })

  it('🔴 en la punta la flecha no lleva a ningún lado', () => {
    // Mutante: dar la vuelta al llegar al final. El cadete cree que avanza y vuelve al principio.
    const dias = diasNavegables([{ fecha: '2026-08-18', cuantos: 1, rotulo: 'mar 18-ago' }], '2026-08-15')
    expect(diaVecino(dias, '2026-08-18', 1)).toBeNull()
    expect(diaVecino(dias, '2026-08-15', -1)).toBeNull()
    expect(diaVecino(dias, '2026-09-30', 1)).toBeNull()
  })

  it('los días llegan ordenados aunque la base los devuelva mezclados', () => {
    const dias = diasNavegables(
      [
        { fecha: '2026-08-20', cuantos: 1, rotulo: 'jue 20-ago' },
        { fecha: '2026-08-16', cuantos: 1, rotulo: 'dom 16-ago' },
      ],
      '2026-08-15',
    )
    expect((dias as { fecha: string }[]).map((d) => d.fecha)).toEqual(['2026-08-15', '2026-08-16', '2026-08-20'])
  })

  it('🔴 el rótulo no corre un día', () => {
    // El mutante: reordenar el arreglo de días «para que arranque en lunes». `getDay()` indexa con
    // 0 = domingo, y el corrimiento no rompe nada visible: sale a la calle con el día cambiado.
    expect(rotuloCorto('2026-08-17')).toBe('lun 17-ago') // lunes
    expect(rotuloCorto('2026-08-23')).toBe('dom 23-ago') // domingo
    expect(rotuloCorto('2026-01-01')).toBe('jue 1-ene')
    expect(rotuloCorto('mañana')).toBe('')
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

describe('🔴 el mensaje que el cadete manda antes de salir', () => {
  const delPortal = paraElCadete(fila) as { cliente: string; direccion: string; localidad: string; marca: string }

  it('🔴 no pregunta lo que el sistema YA sabe', () => {
    // El mensaje que escribían a mano arrancaba pidiendo el nombre y la dirección, porque lo tipeaban
    // en la calle sin tener la hoja delante. El mutante es dejarlo así: se le pregunta a la clienta
    // un dato que está en la pantalla, y encima queda mal.
    const m = mensajeParaLaPuerta(delPortal)
    expect(m).toContain('Ana')
    expect(m).toContain('3 de Febrero 1234')
    expect(m).toContain('Rosario')
    expect(m).not.toMatch(/tu nombre/i)
  })

  it('sí pide lo único que falta: la ubicación y el piso', () => {
    const m = mensajeParaLaPuerta(delPortal)
    expect(m).toMatch(/ubicaci[óo]n/i)
    expect(m).toMatch(/piso/i)
  })

  it('🔴 dice la marca del pedido, no las dos siempre', () => {
    // El mutante es dejar «BDI y Zattia» fijo: la clienta compró en una sola, y el mensaje se lee
    // como si vinieran de otro lado.
    expect(mensajeParaLaPuerta({ ...delPortal, marca: 'zattia' })).toContain('Zattia')
    expect(mensajeParaLaPuerta({ ...delPortal, marca: 'zattia' })).not.toContain('BDI')
    expect(mensajeParaLaPuerta({ ...delPortal, marca: 'bdi' })).toContain('BDI')
  })

  it('sin nombre ni dirección sigue siendo una frase, no un hueco', () => {
    const m = mensajeParaLaPuerta({ marca: 'bdi', cliente: null, direccion: null, localidad: null })
    expect(m).toContain('Hola!')
    expect(m).not.toContain('null')
    expect(m).not.toContain('undefined')
  })

  it('🔴 el link lleva el mensaje escapado', () => {
    // El mutante es concatenar el texto crudo: el mensaje se corta en el primer `&` o `#`, y una
    // dirección como «San Juan 100 # 3» lo deja por la mitad sin que nadie lo note.
    const link = linkDeWhatsapp('5493415551234', 'timbre 2 & 3 #B')!
    expect(link.startsWith('https://wa.me/5493415551234?text=')).toBe(true)
    expect(link).not.toContain(' ')
    expect(decodeURIComponent(link.split('?text=')[1])).toBe('timbre 2 & 3 #B')
  })

  it('sin teléfono no hay link', () => {
    expect(linkDeWhatsapp('', 'hola')).toBeNull()
    expect(linkDeWhatsapp(null as unknown as string, 'hola')).toBeNull()
  })
})
