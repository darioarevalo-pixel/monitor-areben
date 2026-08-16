import { describe, expect, it } from 'vitest'
import {
  planDeImportacion,
  precioSugerido,
  puntoEnPoligono,
  validarZona,
  zonaSaleEse,
  zonasDelPunto,
  zonasDesdeExport,
} from '@/lib/envios/zonas.core.js'

/**
 * El mapa de zonas de reparto.
 *
 * 🔴 **El defecto que estos tests existen para cazar es uno solo: que proponga el precio equivocado
 * con cara de seguro.** No proponer nada es barato —la dirección queda sin precio, alguien lo tipea
 * como hasta ahora, y mandar el envío a un día ya está bloqueado sin precio—. Proponer $3.000 donde
 * van $8.000 no lo caza nadie: el ticket sale, el cadete cobra de menos y la diferencia se la come
 * la única persona que no mira la pantalla.
 *
 * Por eso los casos de acá abajo son los cuatro que producen ese número plausible: el par de
 * coordenadas dado vuelta, el borde compartido entre dos zonas pegadas, el agujero, y el empate
 * entre zonas que cobran distinto.
 *
 * Las coordenadas son de Rosario de verdad —no un cuadrado en el (0,0)— justamente para que el par
 * dado vuelta caiga afuera y el test lo note.
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

/** El centro de Rosario, y una caja que lo contiene. */
const CENTRO = { lat: -32.9587, lng: -60.6939 }
const CAJA = cuadrado(-60.72, -32.98, -60.66, -32.93)

describe('puntoEnPoligono', () => {
  it('dice que sí adentro y que no afuera', () => {
    expect(puntoEnPoligono(CENTRO.lat, CENTRO.lng, CAJA)).toBe(true)
    expect(puntoEnPoligono(-32.9587, -60.5, CAJA)).toBe(false)
    expect(puntoEnPoligono(-33.5, -60.6939, CAJA)).toBe(false)
  })

  it('🔴 no da vuelta el par: los argumentos son (lat, lng) y el GeoJSON es [lng, lat]', () => {
    // El mismo punto con los dos números al revés cae en medio del Atlántico, no en Rosario.
    expect(puntoEnPoligono(CENTRO.lng, CENTRO.lat, CAJA)).toBe(false)
  })

  it('el borde cuenta como adentro, y los vértices también', () => {
    expect(puntoEnPoligono(-32.95, -60.72, CAJA)).toBe(true) // sobre el lado de la izquierda
    expect(puntoEnPoligono(-32.98, -60.72, CAJA)).toBe(true) // vértice
  })

  it('un agujero resta: adentro del hueco es afuera del polígono', () => {
    const conHueco = {
      type: 'Polygon',
      coordinates: [
        CAJA.coordinates[0],
        [
          [-60.7, -32.96],
          [-60.68, -32.96],
          [-60.68, -32.95],
          [-60.7, -32.95],
          [-60.7, -32.96],
        ],
      ],
    }
    expect(puntoEnPoligono(-32.955, -60.69, conHueco)).toBe(false) // adentro del hueco
    expect(puntoEnPoligono(-32.94, -60.69, conHueco)).toBe(true) // afuera del hueco, adentro de la caja
    // El borde del agujero sigue siendo parte del polígono, igual que en turf.
    expect(puntoEnPoligono(-32.955, -60.7, conHueco)).toBe(true)
  })

  it('un MultiPolygon vale si cae en cualquiera de sus partes', () => {
    const dosPedazos = {
      type: 'MultiPolygon',
      coordinates: [CAJA.coordinates, cuadrado(-60.65, -32.95, -60.62, -32.92).coordinates],
    }
    expect(puntoEnPoligono(CENTRO.lat, CENTRO.lng, dosPedazos)).toBe(true)
    expect(puntoEnPoligono(-32.93, -60.63, dosPedazos)).toBe(true)
    expect(puntoEnPoligono(-32.99, -60.5, dosPedazos)).toBe(false)
  })

  it('no explota con geometría rota', () => {
    expect(puntoEnPoligono(CENTRO.lat, CENTRO.lng, null as never)).toBe(false)
    expect(puntoEnPoligono(CENTRO.lat, CENTRO.lng, { type: 'Point', coordinates: [1, 2] } as never)).toBe(false)
    expect(puntoEnPoligono(CENTRO.lat, CENTRO.lng, { type: 'Polygon', coordinates: [] } as never)).toBe(false)
  })
})

/** Zonas normalizadas, como las va a guardar la base. */
const ROSARIO = { nombre: 'Rosario centro', tipo: 'servicio', precio: 3000, prioridad: 1, poligono: CAJA }
const FISHERTON = {
  nombre: 'Fisherton',
  tipo: 'servicio',
  precio: 5500,
  prioridad: 2,
  poligono: cuadrado(-60.72, -32.96, -60.7, -32.94),
}
const NO_VAMOS = {
  nombre: 'La zona brava',
  tipo: 'exclusion',
  precio: null,
  prioridad: 1,
  poligono: cuadrado(-60.715, -32.955, -60.705, -32.945), // un pedazo adentro de Fisherton
}

describe('precioSugerido', () => {
  it('una sola zona: propone su precio y dice de cuál salió', () => {
    const r = precioSugerido(CENTRO.lat, CENTRO.lng, [ROSARIO])
    expect(r.estado).toBe('sugerido')
    expect(r.precio).toBe(3000)
    expect(r.zona?.nombre).toBe('Rosario centro')
  })

  it('afuera de todo: sin_zona y sin precio', () => {
    const r = precioSugerido(-31.4, -64.18, [ROSARIO, FISHERTON]) // Córdoba
    expect(r.estado).toBe('sin_zona')
    expect(r.precio).toBe(null)
  })

  it('🔴 la exclusión gana aunque el servicio tenga más prioridad', () => {
    const encimaDeLosDos = { lat: -32.95, lng: -60.71 }
    expect(zonasDelPunto(encimaDeLosDos.lat, encimaDeLosDos.lng, [FISHERTON, NO_VAMOS])).toHaveLength(2)
    const r = precioSugerido(encimaDeLosDos.lat, encimaDeLosDos.lng, [
      { ...FISHERTON, prioridad: 99 },
      NO_VAMOS,
    ])
    expect(r.estado).toBe('no_vamos')
    expect(r.precio).toBe(null)
    expect(r.zona?.nombre).toBe('La zona brava')
  })

  it('entre dos servicios superpuestos gana el de mayor prioridad', () => {
    const enLosDos = { lat: -32.95, lng: -60.71 }
    expect(zonasDelPunto(enLosDos.lat, enLosDos.lng, [ROSARIO, FISHERTON])).toHaveLength(2)
    expect(precioSugerido(enLosDos.lat, enLosDos.lng, [ROSARIO, FISHERTON]).precio).toBe(5500)
    // Y no depende del orden en que vinieron.
    expect(precioSugerido(enLosDos.lat, enLosDos.lng, [FISHERTON, ROSARIO]).precio).toBe(5500)
  })

  it('sin prioridad escrita se lee 1', () => {
    const enLosDos = { lat: -32.95, lng: -60.71 }
    const sinPrioridad = { ...FISHERTON, prioridad: undefined }
    // Empatan en 1 y cobran distinto ⇒ no elige ninguno (ver el caso de abajo).
    expect(precioSugerido(enLosDos.lat, enLosDos.lng, [ROSARIO, sinPrioridad]).estado).toBe('ambigua')
  })

  it('🔴 dos zonas empatadas que cobran distinto NO devuelven precio', () => {
    const enLosDos = { lat: -32.95, lng: -60.71 }
    const r = precioSugerido(enLosDos.lat, enLosDos.lng, [ROSARIO, { ...FISHERTON, prioridad: 1 }])
    expect(r.estado).toBe('ambigua')
    expect(r.precio).toBe(null)
    // Las dos candidatas viajan, que es lo que la pantalla tiene que mostrar para poder desempatar.
    expect(r.zonas.map((z: { nombre: string }) => z.nombre).sort()).toEqual(['Fisherton', 'Rosario centro'])
  })

  it('empatadas con el MISMO precio no es ambigüedad: el número es uno solo', () => {
    const enLosDos = { lat: -32.95, lng: -60.71 }
    const r = precioSugerido(enLosDos.lat, enLosDos.lng, [ROSARIO, { ...FISHERTON, prioridad: 1, precio: 3000 }])
    expect(r.estado).toBe('sugerido')
    expect(r.precio).toBe(3000)
  })

  it('sin zonas cargadas contesta sin_zona, no explota', () => {
    expect(precioSugerido(CENTRO.lat, CENTRO.lng, []).estado).toBe('sin_zona')
    expect(precioSugerido(CENTRO.lat, CENTRO.lng, null as never).estado).toBe('sin_zona')
  })
})

describe('zonasDesdeExport', () => {
  const zonaCruda = (meta: Record<string, unknown>, geometry: unknown = CAJA) => ({
    meta,
    feature: { type: 'Feature', properties: {}, geometry },
  })

  it('traduce las etiquetas del editor', () => {
    const { zonas, problemas } = zonasDesdeExport([
      zonaCruda({ name: 'Funes', type: 'service', price: 8000, priority: 2 }),
      zonaCruda({ name: 'No vamos', type: 'exclude' }),
    ])
    expect(problemas).toEqual([])
    expect(zonas[0]).toMatchObject({ nombre: 'Funes', tipo: 'servicio', precio: 8000, prioridad: 2 })
    expect(zonas[1]).toMatchObject({ nombre: 'No vamos', tipo: 'exclusion', precio: null, prioridad: 1 })
  })

  it('acepta el precio como texto, que es lo que devuelve el prompt del mapa', () => {
    const { zonas } = zonasDesdeExport([zonaCruda({ name: 'VGG', type: 'service', price: '6500' })])
    expect(zonas[0].precio).toBe(6500)
  })

  it('🔴 un servicio con precio cero o ausente NO entra, y dice por qué', () => {
    for (const price of [0, null, undefined, '', 'gratis']) {
      const { zonas, problemas } = zonasDesdeExport([zonaCruda({ name: 'Rota', type: 'service', price })])
      expect(zonas).toEqual([])
      expect(problemas).toHaveLength(1)
      expect(problemas[0]).toMatchObject({ zona: 'Rota' })
      expect(problemas[0].motivo).toMatch(/precio/i)
    }
  })

  it('deja afuera la zona sin polígono, la sin nombre y la de tipo desconocido', () => {
    const { zonas, problemas } = zonasDesdeExport([
      zonaCruda({ name: 'Sin dibujo', type: 'service', price: 3000 }, null),
      zonaCruda({ name: '', type: 'service', price: 3000 }),
      zonaCruda({ name: 'Rara', type: 'otra_cosa', price: 3000 }),
    ])
    expect(zonas).toEqual([])
    // El que tiene nombre se nombra; el que no, se ubica por su posición en el archivo.
    expect(problemas.map((p: { zona: string }) => p.zona)).toEqual(['Sin dibujo', 'zona #2', 'Rara'])
    expect(problemas[0].motivo).toMatch(/polígono/i)
    expect(problemas[1].motivo).toMatch(/nombre/i)
    expect(problemas[2].motivo).toMatch(/desconocido/i)
  })

  it('una zona rota no se lleva puestas a las sanas', () => {
    const { zonas, problemas } = zonasDesdeExport([
      zonaCruda({ name: 'Rota', type: 'service', price: 0 }),
      zonaCruda({ name: 'Sana', type: 'service', price: 4300 }),
    ])
    expect(zonas.map((z: { nombre: string }) => z.nombre)).toEqual(['Sana'])
    expect(problemas).toHaveLength(1)
  })

  it('el export vacío no es un error: es no haber importado todavía', () => {
    expect(zonasDesdeExport([])).toEqual({ zonas: [], problemas: [] })
  })

  it('un archivo que no es una lista de zonas se rechaza entero', () => {
    const { zonas, problemas } = zonasDesdeExport({ cualquier: 'cosa' } as never)
    expect(zonas).toEqual([])
    expect(problemas).toHaveLength(1)
  })

  it('el ajuste suma a todos los precios de servicio, y la exclusión sigue sin precio', () => {
    const { zonas } = zonasDesdeExport(
      [
        zonaCruda({ name: 'Zona Centro', type: 'service', price: 3000 }),
        zonaCruda({ name: 'Roldán', type: 'service', price: 11000 }),
        zonaCruda({ name: 'Alvear', type: 'exclude' }),
      ],
      { ajuste: 1000 },
    )
    expect(zonas.map((z: { precio: number | null }) => z.precio)).toEqual([4000, 12000, null])
  })

  it('🔴 el ajuste NO crea el precio que falta: se valida el del archivo primero', () => {
    // Con el aumento aplicado antes de validar, esta zona entraría valiendo $1.000 — un número
    // plausible, inventado, y para un barrio entero.
    const { zonas, problemas } = zonasDesdeExport([zonaCruda({ name: 'Rota', type: 'service', price: 0 })], { ajuste: 1000 })
    expect(zonas).toEqual([])
    expect(problemas).toHaveLength(1)
  })

  it('un ajuste negativo que deja el precio en cero o menos tampoco entra', () => {
    const { zonas, problemas } = zonasDesdeExport([zonaCruda({ name: 'Centro', type: 'service', price: 3000 })], { ajuste: -3000 })
    expect(zonas).toEqual([])
    expect(problemas[0].motivo).toMatch(/ajuste/i)
  })

  it('de punta a punta: del JSON del mapa a un precio', () => {
    const { zonas } = zonasDesdeExport([
      zonaCruda({ name: 'Rosario centro', type: 'service', price: 3000, priority: 1 }),
      zonaCruda({ name: 'Fisherton', type: 'service', price: 5500, priority: 2 }, FISHERTON.poligono),
    ])
    expect(precioSugerido(CENTRO.lat, CENTRO.lng, zonas).precio).toBe(3000)
    expect(precioSugerido(-32.95, -60.71, zonas).precio).toBe(5500)
  })
})

/**
 * Importar es la única operación de la pantalla que puede pisar trabajo ajeno, y la regla que la
 * hace segura es una asimetría que no se ve mirando el resultado: **el dibujo manda desde el mapa,
 * el precio manda desde la app**. Sin ella, corregir un polígono y re-importar revierte los precios
 * de las dieciséis zonas al valor que el archivo tenía el día que se exportó, en silencio.
 */
describe('planDeImportacion', () => {
  const zonaCruda = (meta: Record<string, unknown>, geometry: unknown = CAJA) => ({
    meta,
    feature: { type: 'Feature', properties: {}, geometry },
  })
  const enLaBase = [
    { id: 'z1', nombre: 'Zona Centro', tipo: 'servicio', precio: 4000, prioridad: 1, coordinar: false, dias: null, turnos: null, poligono: CAJA },
  ]

  it('🔴 re-importar el archivo NO pisa el precio que se editó en la app', () => {
    // El archivo sigue diciendo $3.000 (es el export viejo); en la app ya está el aumento.
    const plan = planDeImportacion(
      [zonaCruda({ name: 'Zona Centro', type: 'service', price: 3000 }, FISHERTON.poligono)],
      enLaBase,
    )
    expect(plan.nuevas).toEqual([])
    expect(plan.actualizadas).toHaveLength(1)
    expect(plan.actualizadas[0].precio).toBe(4000) // el de la app, no el del archivo
    expect(plan.actualizadas[0].poligono).toEqual(FISHERTON.poligono) // el dibujo sí se actualiza
    expect(plan.actualizadas[0].cambios).toContain('el dibujo')
  })

  it('una zona nueva sí toma el precio del archivo', () => {
    const plan = planDeImportacion([zonaCruda({ name: 'Fisherton 1', type: 'service', price: 5600 })], enLaBase)
    expect(plan.nuevas).toHaveLength(1)
    expect(plan.nuevas[0].precio).toBe(5600)
    expect(plan.ausentes.map((z: { nombre: string }) => z.nombre)).toEqual(['Zona Centro'])
  })

  it('sin cambios en el dibujo no propone tocar nada', () => {
    const plan = planDeImportacion([zonaCruda({ name: 'Zona Centro', type: 'service', price: 3000 })], enLaBase)
    expect(plan.actualizadas).toEqual([])
    expect(plan.iguales).toHaveLength(1)
  })

  it('🔴 una zona que está en la base y no viene en el archivo NO se borra', () => {
    const plan = planDeImportacion([], enLaBase)
    expect(plan.ausentes.map((z: { nombre: string }) => z.nombre)).toEqual(['Zona Centro'])
    expect(plan.actualizadas).toEqual([])
  })

  it('si el mapa la convierte en exclusión, el precio se va', () => {
    const plan = planDeImportacion([zonaCruda({ name: 'Zona Centro', type: 'exclude' }, FISHERTON.poligono)], enLaBase)
    expect(plan.actualizadas[0].tipo).toBe('exclusion')
    expect(plan.actualizadas[0].precio).toBe(null)
    expect(plan.actualizadas[0].cambios.join(' ')).toMatch(/NO VAMOS/)
  })

  it('reconoce la zona aunque el nombre venga con otra caja o con espacios', () => {
    const plan = planDeImportacion([zonaCruda({ name: '  zona centro ', type: 'service', price: 3000 })], enLaBase)
    expect(plan.nuevas).toEqual([])
    expect(plan.iguales).toHaveLength(1)
  })

  it('las marcas que el mapa no conoce (coordinar, días, turnos) se respetan', () => {
    const conMarcas = [{ ...enLaBase[0], coordinar: true, dias: [2, 4], turnos: ['mañana'] }]
    const plan = planDeImportacion([zonaCruda({ name: 'Zona Centro', type: 'service', price: 3000 }, FISHERTON.poligono)], conMarcas)
    expect(plan.actualizadas[0]).toMatchObject({ coordinar: true, dias: [2, 4], turnos: ['mañana'] })
  })

  it('el ajuste sólo llega a las zonas nuevas, que son las que toman precio del archivo', () => {
    const plan = planDeImportacion(
      [
        zonaCruda({ name: 'Zona Centro', type: 'service', price: 3000 }, FISHERTON.poligono),
        zonaCruda({ name: 'Roldán', type: 'service', price: 11000 }),
      ],
      enLaBase,
      { ajuste: 1000 },
    )
    expect(plan.nuevas[0].precio).toBe(12000)
    expect(plan.actualizadas[0].precio).toBe(4000)
  })
})

describe('zonaSaleEse — la regla de Funes', () => {
  const FUNES = { nombre: 'Funes', dias: [2, 4], turnos: ['mañana'] }

  it('sin restricción sale siempre', () => {
    expect(zonaSaleEse({ nombre: 'Centro', dias: null, turnos: null }, 1, 'tarde')).toBe(true)
    expect(zonaSaleEse({ nombre: 'Centro', dias: [], turnos: [] }, 0, 'mañana')).toBe(true)
    expect(zonaSaleEse(null, 1, 'tarde')).toBe(true)
  })

  it('Funes sale martes y jueves a la mañana, y nada más', () => {
    expect(zonaSaleEse(FUNES, 2, 'mañana')).toBe(true)
    expect(zonaSaleEse(FUNES, 4, 'mañana')).toBe(true)
    expect(zonaSaleEse(FUNES, 2, 'tarde')).toBe(false) // el día está bien, el turno no
    expect(zonaSaleEse(FUNES, 1, 'mañana')).toBe(false) // el turno está bien, el día no
    expect(zonaSaleEse(FUNES, 6, 'tarde')).toBe(false)
  })
})

describe('validarZona', () => {
  const buena = { nombre: 'Funes', tipo: 'servicio', precio: 9000, prioridad: 10, poligono: CAJA }

  it('una zona bien formada no tiene problemas', () => {
    expect(validarZona(buena)).toEqual([])
    expect(validarZona({ ...buena, tipo: 'exclusion', precio: null })).toEqual([])
    expect(validarZona({ ...buena, dias: [2, 4], turnos: ['mañana'] })).toEqual([])
  })

  it('🔴 rechaza el servicio sin precio y la exclusión con precio', () => {
    expect(validarZona({ ...buena, precio: 0 }).join(' ')).toMatch(/precio/)
    expect(validarZona({ ...buena, precio: null }).join(' ')).toMatch(/precio/)
    expect(validarZona({ ...buena, tipo: 'exclusion', precio: 9000 }).join(' ')).toMatch(/no cobra/)
  })

  it('rechaza lo que la base rechazaría con un 500 críptico', () => {
    expect(validarZona({ ...buena, nombre: '  ' }).join(' ')).toMatch(/nombre/)
    expect(validarZona({ ...buena, tipo: 'otra' }).join(' ')).toMatch(/tipo/)
    expect(validarZona({ ...buena, poligono: null }).join(' ')).toMatch(/poligono/)
    expect(validarZona({ ...buena, dias: [7] }).join(' ')).toMatch(/dias/)
    expect(validarZona({ ...buena, turnos: ['siesta'] }).join(' ')).toMatch(/turnos/)
  })
})
