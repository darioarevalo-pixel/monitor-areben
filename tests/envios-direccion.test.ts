import { describe, expect, it } from 'vitest'
import {
  alinear,
  consultaDe,
  limpiarDireccion,
  MOTIVO_SUGERENCIA,
  puntoDeGeoref,
  sugerenciaDePunto,
  variantes,
} from '@/lib/envios/direccion.core.js'

/**
 * De la dirección tipeada por una clienta al punto que el mapa evalúa.
 *
 * 🔴 **El único defecto caro de este módulo es el precio inventado**: una dirección sin altura que
 * igual sale con un número, porque el geocoder contestó un punto cualquiera de la calle entera y el
 * motor no tiene con qué distinguirlo. Medido sobre 200 direcciones reales: **66 de las 100 sin
 * número salían con precio** sin candado, y `"(2000)"` —sólo el código postal— salía **$4.800**.
 *
 * Por eso los tests de acá abajo están escritos alrededor de esas dos mitades: lo que ni se pregunta
 * (`consultaDe`) y lo que se descarta después de preguntar (`sugerenciaDePunto`). No proponer nada es
 * barato —la fila se tipea a mano, como siempre—; proponer $4.300 donde van $9.000 no lo caza nadie.
 */

/** Un cuadrado GeoJSON, en el orden `[lng, lat]` que usa el formato. */
function cuadrado(lngMin: number, latMin: number, lngMax: number, latMax: number) {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lngMin, latMin],
        [lngMax, latMin],
        [lngMax, latMax],
        [lngMin, latMax],
        [lngMin, latMin],
      ],
    ],
  }
}

/** Una caja sobre el centro de Rosario, con precio, como las dieciséis que están en prod. */
const ZONAS = [
  { id: 'z1', nombre: 'Zona 7', tipo: 'servicio', precio: 4500, prioridad: 1, coordinar: false, poligono: cuadrado(-60.72, -32.98, -60.63, -32.93) },
]

/** Lo que contesta Georef, con la forma exacta que devuelve el servicio (medido el 16-ago-2026). */
function respuesta(nomenclatura: string, lat: number, lon: number, altura: number | null) {
  return { nomenclatura, altura: { unidad: null, valor: altura }, ubicacion: { lat, lon } }
}

describe('limpiarDireccion', () => {
  it('corta en calle + altura, que es lo único que Georef entiende', () => {
    // Mandada entera resuelve el 47,5% de las direcciones; cortada acá, el 82,5%.
    expect(limpiarDireccion('Riccheri 1152 4 piso 3')).toMatchObject({ texto: 'Riccheri 1152', altura: 1152 })
    expect(limpiarDireccion('Paraguay 777 Piso 14 Centro (2000)')).toMatchObject({ texto: 'Paraguay 777' })
    expect(limpiarDireccion('San Luis 2370, Rosario')).toMatchObject({ texto: 'San Luis 2370' })
  })

  it('🔴 no corta en "el primer número": hay calles que EMPIEZAN con número', () => {
    // Cortar ahí manda "9" como nombre de calle, y lo que vuelve es cualquier cosa.
    expect(limpiarDireccion('9 de Julio 1250')).toMatchObject({ calle: '9 de Julio', altura: 1250 })
    expect(limpiarDireccion('27 de Febrero 890 depto 2')).toMatchObject({ calle: '27 de Febrero', altura: 890 })
    expect(limpiarDireccion('3 de Febrero 1420')).toMatchObject({ calle: '3 de Febrero', altura: 1420 })
  })

  it('🔴 sin una sola letra antes del número no hay calle', () => {
    // "1776 5" y "2499" son direcciones que quedaron partidas al copiarlas. Mandarlas es pedirle a
    // Georef que invente: con `max: 1` siempre contesta algo.
    expect(limpiarDireccion('1776 5')).toBeNull()
    expect(limpiarDireccion('2499')).toBeNull()
    // 🔴 El caso que salía $4.800: una dirección VACÍA, sólo el código postal entre paréntesis.
    expect(limpiarDireccion('(2000)')).toBeNull()
    expect(limpiarDireccion('   ')).toBeNull()
  })

  it('reconoce la esquina, que no tiene altura pero SÍ es un punto exacto', () => {
    expect(limpiarDireccion('Rioja y Corrientes')).toMatchObject({ esquina: true, texto: 'Rioja y Corrientes' })
    expect(limpiarDireccion('Mendoza esq. Alberdi')).toMatchObject({ esquina: true })
  })

  it('la calle pelada se entiende, pero queda sin altura', () => {
    expect(limpiarDireccion('Cafferata')).toMatchObject({ calle: 'Cafferata', altura: null, esquina: false })
  })
})

describe('variantes — la escalera', () => {
  it('saca los nombres de pila DE A UNO, no sólo el primero', () => {
    // 🔑 "Leandro N. Alem 1517" únicamente resuelve como "Alem 1517", y "Olegario Victor Andrade
    // 1961" como "Andrade 1961": sacar el primer nombre no alcanza.
    const v = variantes(limpiarDireccion('Leandro N. Alem 1517'))
    expect(v[0]).toBe('Leandro N. Alem 1517')
    expect(v).toContain('Alem 1517')
  })

  it('prueba sin el prefijo: "Av San Martin" no resuelve y "San Martin" sí', () => {
    const v = variantes(limpiarDireccion('Av San Martin 1200'))
    expect(v[0]).toBe('Av San Martin 1200')
    expect(v).toContain('San Martin 1200')
  })

  it('🔴 a la esquina no le saca palabras: "y Corrientes" es otra consulta, no un cruce', () => {
    expect(variantes(limpiarDireccion('Rioja y Corrientes'))).toEqual(['Rioja y Corrientes'])
  })

  it('la primera forma es siempre la más fiel, y no hay repetidas', () => {
    const v = variantes(limpiarDireccion('Moreno 1192'))
    expect(v[0]).toBe('Moreno 1192')
    expect(new Set(v).size).toBe(v.length)
  })

  it('una dirección con veinte palabras no cuesta veinte vueltas de consultas', () => {
    const v = variantes(limpiarDireccion('a b c d e f g h i j k l m n 1234'))
    expect(v.length).toBeLessThanOrEqual(5)
  })
})

describe('consultaDe — el candado, primera mitad: qué NI SE PREGUNTA', () => {
  it('con calle, altura y localidad, pregunta', () => {
    const c = consultaDe({ direccion: 'Riccheri 1152 4 piso 3', localidad: 'Rosario' })
    expect(c.estado).toBeUndefined()
    expect(c.intentos?.[0]).toBe('Riccheri 1152')
    expect(c.localidad).toBe('Rosario')
  })

  it('🔴 sin altura no pregunta: es el caso que salía con precio 66 de 100 veces', () => {
    expect(consultaDe({ direccion: 'Cafferata', localidad: 'Rosario' }).estado).toBe('sin_altura')
    expect(consultaDe({ direccion: 'Bv Oroño', localidad: 'Rosario' }).estado).toBe('sin_altura')
  })

  it('🔴 sin localidad tampoco: la diferencia entre Rosario y Funes la decide ese dato', () => {
    // Preguntar sólo por la provincia hace que la calle de Funes matchee su homónima de Rosario y
    // devuelva un punto PRECISO en la zona equivocada — $4.300 donde van $9.000.
    expect(consultaDe({ direccion: 'Rodriguez 1062', localidad: '' }).estado).toBe('sin_localidad')
    expect(consultaDe({ direccion: 'Rodriguez 1062', localidad: null }).estado).toBe('sin_localidad')
    expect(consultaDe({ direccion: 'Rodriguez 1062' }).estado).toBe('sin_localidad')
  })

  it('la localidad rara viaja igual, y falla: no se reintenta sin ella', () => {
    // "Entre esmeralda y chacabuco" vino así en una orden real. La consulta no encuentra nada y la
    // fila queda sin propuesta, que es lo barato. Reintentar sin localidad arruina las de Funes.
    const c = consultaDe({ direccion: 'Garay Bis 47', localidad: 'Entre esmeralda y chacabuco' })
    expect(c.estado).toBeUndefined()
    expect(c.localidad).toBe('Entre esmeralda y chacabuco')
  })

  it('sin dirección no hay nada que preguntar', () => {
    expect(consultaDe({ direccion: '(2000)', localidad: 'Rosario' }).estado).toBe('sin_direccion')
    expect(consultaDe({}).estado).toBe('sin_direccion')
  })

  it('la esquina sí pregunta, aunque no tenga altura', () => {
    expect(consultaDe({ direccion: 'Rioja y Corrientes', localidad: 'Rosario' }).estado).toBeUndefined()
  })

  it('todos los motivos tienen texto: una fila sin precio y sin explicación no se puede trabajar', () => {
    const motivos = MOTIVO_SUGERENCIA as Record<string, string>
    for (const estado of ['sin_direccion', 'sin_localidad', 'sin_altura', 'no_ubicada', 'punto_impreciso', 'sin_zona', 'no_vamos', 'ambigua']) {
      expect(motivos[estado]).toBeTruthy()
    }
  })
})

describe('puntoDeGeoref — el candado, segunda mitad: lo que contestó, ¿es exacto?', () => {
  it('con altura, es preciso', () => {
    expect(puntoDeGeoref(respuesta('RICCHIERI 1152, Rosario, Santa Fe', -32.9464, -60.6639, 1152))).toMatchObject({
      preciso: true,
      lat: -32.9464,
      lng: -60.6639,
    })
  })

  it('🔴 sin altura NO es preciso, aunque venga con punto y con cara de bueno', () => {
    // Es la respuesta literal de Georef a "Cafferata": nombre de calle, coordenadas, y un punto
    // cualquiera de las treinta cuadras.
    expect(puntoDeGeoref(respuesta('CAFFERATA, Rosario, Santa Fe', -32.9985, -60.6836, null))?.preciso).toBe(false)
  })

  it('la esquina es precisa: la nomenclatura dice (ESQUINA …)', () => {
    const p = puntoDeGeoref(respuesta('RIOJA (ESQUINA AV CORRIENTES), Rosario, Santa Fe', -32.9468, -60.6426, null))
    expect(p).toMatchObject({ preciso: true, esquina: true })
  })

  it('sin punto no hay nada', () => {
    expect(puntoDeGeoref(null)).toBeNull()
    expect(puntoDeGeoref({ nomenclatura: 'X', ubicacion: {} })).toBeNull()
  })
})

describe('sugerenciaDePunto — sólo `sugerido` trae precio', () => {
  it('con punto preciso adentro de una zona, propone el precio CON el nombre', () => {
    const s = sugerenciaDePunto(respuesta('RICCHIERI 1152, Rosario, Santa Fe', -32.9464, -60.6639, 1152), ZONAS)
    expect(s).toMatchObject({ estado: 'sugerido', precio: 4500 })
    // 🔑 El nombre viaja al lado del número: "$4.500" solo no se puede revisar de un vistazo.
    expect(s.zona?.nombre).toBe('Zona 7')
  })

  it('🔴 con el punto de la calle entera NO propone nada, aunque caiga adentro de la zona', () => {
    // El punto de "Cafferata" cae afuera de la caja de este test, así que se le da uno que cae
    // ADENTRO: lo que lo frena tiene que ser la falta de altura, no la geometría.
    const s = sugerenciaDePunto(respuesta('CAFFERATA, Rosario, Santa Fe', -32.9464, -60.6639, null), ZONAS)
    expect(s.estado).toBe('punto_impreciso')
    expect(s.precio).toBeNull()
  })

  it('sin respuesta del geocoder, `no_ubicada` y sin precio', () => {
    expect(sugerenciaDePunto(null, ZONAS)).toMatchObject({ estado: 'no_ubicada', precio: null })
  })

  it('afuera del mapa es `sin_zona`, no un precio por defecto', () => {
    const s = sugerenciaDePunto(respuesta('X 100, Pérez, Santa Fe', -32.99, -60.77, 100), ZONAS)
    expect(s).toMatchObject({ estado: 'sin_zona', precio: null })
  })

  it('empatadas que cobran distinto: `ambigua`, sin precio y con los dos nombres', () => {
    const dos = [
      ...ZONAS,
      { id: 'z2', nombre: 'Zona 8', tipo: 'servicio', precio: 6000, prioridad: 1, coordinar: false, poligono: cuadrado(-60.72, -32.98, -60.63, -32.93) },
    ]
    const s = sugerenciaDePunto(respuesta('RICCHIERI 1152, Rosario, Santa Fe', -32.9464, -60.6639, 1152), dos)
    expect(s).toMatchObject({ estado: 'ambigua', precio: null })
    expect(s.zonas).toEqual(['Zona 7', 'Zona 8'])
  })
})

describe('alinear — la respuesta por lote, al lado de lo que se preguntó', () => {
  it('devuelve la primera dirección de cada resultado, en el mismo orden', () => {
    const consultas = [{ direccion: 'A 1' }, { direccion: 'B 2' }]
    const r = alinear(consultas, [{ direcciones: [{ nomenclatura: 'A' }] }, { direcciones: [] }])
    expect(r[0]).toMatchObject({ nomenclatura: 'A' })
    expect(r[1]).toBeNull()
  })

  it('🔴 largo distinto TIRA ERROR: acomodar como se pueda cruza los precios de todas', () => {
    // Un elemento de menos deja a cada clienta con el punto de la siguiente: precisos, plausibles y
    // ajenos. No hay forma de verlo mirando la pantalla, así que no se sigue.
    expect(() => alinear([{ direccion: 'A 1' }, { direccion: 'B 2' }], [{ direcciones: [] }])).toThrow(/1 para 2/)
    expect(() => alinear([{ direccion: 'A 1' }], null)).toThrow()
  })
})
