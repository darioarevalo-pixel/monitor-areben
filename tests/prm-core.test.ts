import { describe, it, expect } from 'vitest'
import {
  abiertosOrdenados,
  conReloj,
  consultaDeLocal,
  distanciaKm,
  marcarRepetidos,
  normalizarNombre,
  ordenarPorCercania,
  parsearCsvMaps,
  parsearNota,
  puntoDeUrlMaps,
  ultimaVisita,
  sugerirProveedorGn,
  filaDeLocalSembrado,
  nuevoIdDeLocal,
} from '@/lib/prm/core'
import type { Compromiso, Visita } from '@/lib/prm/tipos'

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Pegar la nota
// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('parsearNota', () => {
  // 🔴 La invariante que más importa: nada se pierde en silencio. Una nota de la que entran 51 de
  // 60 renglones se descubre parado en una galería que no está en la lista.
  it('toda línea no vacía sale en candidatos O en sinEntender, nunca en ninguna', () => {
    const texto = [
      'Los Tres Hermanos - Avellaneda 3252 - jeans, buen precio',
      '',
      '-----------',
      '  ',
      'MODA SUR',
      '1) Punto Once — Nazca 1200',
      '404',
    ].join('\n')

    const { candidatos, sinEntender } = parsearNota(texto)
    const noVacias = texto.split('\n').filter((l) => l.trim()).length
    expect(candidatos.length + sinEntender.length).toBe(noVacias)
    expect(noVacias).toBe(5)
  })

  it('parte "Nombre - dirección - nota"', () => {
    const { candidatos } = parsearNota('Los Tres Hermanos - Avellaneda 3252 - jeans, buen precio')
    expect(candidatos[0]).toMatchObject({
      nombre: 'Los Tres Hermanos',
      direccion: 'Avellaneda 3252',
      nota: 'jeans, buen precio',
    })
  })

  // 🔑 Sin nombre, el nombre pasa a ser la GALERÍA (que es como se lo busca), no el rubro del final.
  it('una dirección suelta con galería se nombra por la galería, no por el rubro', () => {
    const { candidatos } = parsearNota('Av. Avellaneda 2890, gal. Flores Center loc 15 - blusas')
    expect(candidatos[0].nombre).toBe('gal. Flores Center loc 15')
    expect(candidatos[0].galeria).toBe('gal. Flores Center loc 15')
    expect(candidatos[0].direccion).toBe('Av. Avellaneda 2890')
    expect(candidatos[0].nota).toBe('blusas')
  })

  it('un local con nombre solo entra igual, sin dirección', () => {
    const { candidatos } = parsearNota('MODA SUR')
    expect(candidatos[0]).toMatchObject({ nombre: 'MODA SUR', direccion: null, galeria: null })
  })

  it('saca viñetas y numeración', () => {
    const { candidatos } = parsearNota('1) Punto Once — Nazca 1200\n• Otro - Nazca 1300')
    expect(candidatos.map((c) => c.nombre)).toEqual(['Punto Once', 'Otro'])
    expect(candidatos.map((c) => c.direccion)).toEqual(['Nazca 1200', 'Nazca 1300'])
  })

  // Sin este corte, "jeans importados" clasifica como dirección: `limpiarDireccion` devuelve una
  // calle sin altura para cualquier frase que empiece con letras.
  it('un rubro sin altura NO es una dirección', () => {
    const { candidatos } = parsearNota('MODA SUR - jeans importados')
    expect(candidatos[0].direccion).toBeNull()
    expect(candidatos[0].nota).toBe('jeans importados')
  })

  it('lo que no tiene una sola letra queda en sinEntender, con motivo', () => {
    const { candidatos, sinEntender } = parsearNota('-----------\n404')
    expect(candidatos).toHaveLength(0)
    expect(sinEntender.map((s) => s.motivo)).toEqual(['no tiene ni una letra', 'no tiene ni una letra'])
  })

  // ⚠️ El límite conocido, escrito a propósito: la nota real de Bruno arranca con un TÍTULO, y un
  // título tiene la misma forma que un local con nota. Entra como candidato y se saca a mano — que
  // es mejor que un parser que adivina cuál renglón es un encabezado y se come uno de verdad.
  it('un título de la nota entra como candidato (límite conocido)', () => {
    const { candidatos, sinEntender } = parsearNota(
      'FLORES - EFICIENCIA EN VIAJES - COMPROMISOS Y PRODUCTOS INTERESADOS',
    )
    expect(sinEntender).toHaveLength(0)
    expect(candidatos[0].nombre).toBe('FLORES')
    expect(candidatos[0].linea).toContain('EFICIENCIA EN VIAJES')
  })

  it('guarda la línea cruda para poder corregir lo que entendió mal', () => {
    const linea = 'Los Tres Hermanos - Avellaneda 3252 - jeans'
    expect(parsearNota(linea).candidatos[0].linea).toBe(linea)
  })
})

describe('normalizarNombre', () => {
  it('iguala tildes, mayúsculas y puntuación', () => {
    expect(normalizarNombre('Galería Súper-Moda')).toBe(normalizarNombre('galeria super moda'))
  })
})

describe('marcarRepetidos', () => {
  it('marca el que ya está y no filtra nada', () => {
    const { candidatos } = parsearNota('MODA SUR\nOtro Local')
    const marcados = marcarRepetidos(candidatos, [{ id: 'pl1', nombre: 'moda sur' }])
    expect(marcados).toHaveLength(2)
    expect(marcados[0].yaExiste).toBe('pl1')
    expect(marcados[1].yaExiste).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// El recorrido
// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('ordenarPorCercania', () => {
  // Tres puntos sobre Av. Avellaneda cargados en zigzag: el orden de carga camina 2 cuadras de más.
  const cerca = { id: 'a', lat: -34.6295, lng: -58.4635 }
  const medio = { id: 'b', lat: -34.6301, lng: -58.4680 }
  const lejos = { id: 'c', lat: -34.6310, lng: -58.4740 }

  it('ordena por cercanía desde el punto de arranque', () => {
    const { orden } = ordenarPorCercania([lejos, cerca, medio], { lat: -34.6293, lng: -58.4620 })
    expect(orden).toEqual(['a', 'b', 'c'])
  })

  it('los que no tienen punto van al final Y salen nombrados', () => {
    const { orden, sinPunto } = ordenarPorCercania(
      [{ id: 'z', lat: null, lng: null }, lejos, cerca],
      { lat: -34.6293, lng: -58.4620 },
    )
    expect(orden).toEqual(['a', 'c', 'z'])
    expect(sinPunto).toEqual(['z'])
  })

  it('sin punto de arranque el orden es estable entre corridas', () => {
    const a = ordenarPorCercania([lejos, cerca, medio]).orden
    const b = ordenarPorCercania([medio, lejos, cerca]).orden
    expect(a).toEqual(b)
  })

  it('sin paradas no explota', () => {
    expect(ordenarPorCercania([])).toEqual({ orden: [], sinPunto: [] })
  })

  it('distanciaKm mide de verdad', () => {
    // Avellaneda 2800 a Avellaneda 3600 son ~1 km sobre la misma avenida.
    const d = distanciaKm(cerca, lejos)
    expect(d).toBeGreaterThan(0.7)
    expect(d).toBeLessThan(1.6)
  })
})

describe('consultaDeLocal', () => {
  const base = { id: 'pl1', localidad: 'Ciudad Autónoma de Buenos Aires', provincia: 'Ciudad Autónoma de Buenos Aires' }

  // 🔴 Si la provincia no viajara, Georef busca en la que tenga clavada el otro archivo y contesta
  // un punto plausible en la provincia equivocada. Es el modo de falla que se está evitando.
  it('la provincia del local viaja en la consulta', () => {
    const c = consultaDeLocal({ ...base, direccion: 'Av. Avellaneda 3252' })
    expect(c).toMatchObject({ clave: 'pl1', provincia: 'Ciudad Autónoma de Buenos Aires' })
    expect('intentos' in c && c.intentos[0]).toBe('Av. Avellaneda 3252')
  })

  it('una dirección sin altura no se pregunta, y dice por qué', () => {
    expect(consultaDeLocal({ ...base, direccion: 'Av. Avellaneda' })).toEqual({ motivo: 'la dirección no tiene altura' })
  })

  it('sin dirección no se pregunta', () => {
    expect(consultaDeLocal({ ...base, direccion: null })).toEqual({ motivo: 'sin dirección' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Los compromisos
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const HOY = '2026-08-30'
function comp(p: Partial<Compromiso>): Compromiso {
  return {
    id: 'pc1', local_id: 'pl1', visita_id: null, que: 'me guarda 20', de_quien: 'ellos',
    para_cuando: null, cumplido_en: null, cumplido_nota: null, creado_en: '2026-08-01T10:00:00Z',
    ...p,
  }
}

describe('conReloj', () => {
  it('separa vencido, hoy, por venir, sin fecha y cumplido', () => {
    const r = conReloj(
      [
        comp({ id: 'a', para_cuando: '2026-08-20' }),
        comp({ id: 'b', para_cuando: HOY }),
        comp({ id: 'c', para_cuando: '2026-09-05' }),
        comp({ id: 'd' }),
        comp({ id: 'e', para_cuando: '2026-08-20', cumplido_en: '2026-08-21T12:00:00Z' }),
      ],
      HOY,
    )
    expect(r.map((x) => x.situacion)).toEqual(['vencido', 'hoy', 'por_venir', 'sin_fecha', 'cumplido'])
    expect(r[0].dias).toBe(10)
    expect(r[2].dias).toBe(6)
  })

  // 🔴 El error que en este repo ya se cometió cuatro veces: medir la espera con un campo que se
  // mueve al editar. Acá se afirma que el reloj cuelga de `creado_en` y de nada más.
  it('diasEsperando sale de creado_en, no de la fecha comprometida', () => {
    const [r] = conReloj([comp({ creado_en: '2026-08-01T10:00:00Z', para_cuando: '2026-08-29' })], HOY)
    expect(r.diasEsperando).toBe(29)
    expect(r.dias).toBe(1)
  })

  it('sin fecha no cuenta como vencido', () => {
    const [r] = conReloj([comp({ para_cuando: null })], HOY)
    expect(r.situacion).toBe('sin_fecha')
    expect(r.dias).toBeNull()
  })
})

describe('abiertosOrdenados', () => {
  it('saca los cumplidos y pone lo vencido primero y lo sin fecha al final', () => {
    const r = abiertosOrdenados(
      [
        comp({ id: 'sinfecha' }),
        comp({ id: 'porvenir', para_cuando: '2026-09-10' }),
        comp({ id: 'cumplido', para_cuando: '2026-08-10', cumplido_en: '2026-08-11T00:00:00Z' }),
        comp({ id: 'vencido', para_cuando: '2026-08-15' }),
        comp({ id: 'hoy', para_cuando: HOY }),
      ],
      HOY,
    )
    expect(r.map((c) => c.id)).toEqual(['vencido', 'hoy', 'porvenir', 'sinfecha'])
  })

  it('entre dos vencidos, primero el que hace más que espera', () => {
    const r = abiertosOrdenados(
      [
        comp({ id: 'nuevo', para_cuando: '2026-08-25', creado_en: '2026-08-24T10:00:00Z' }),
        comp({ id: 'viejo', para_cuando: '2026-08-25', creado_en: '2026-06-01T10:00:00Z' }),
      ],
      HOY,
    )
    expect(r.map((c) => c.id)).toEqual(['viejo', 'nuevo'])
  })
})

describe('ultimaVisita', () => {
  const v = (p: Partial<Visita>): Visita => ({
    id: 'pv1', local_id: 'pl1', fecha: '2026-08-01', quien: null, opinion: null, puntaje: null,
    compre: false, que_compre: null, fotos: [], creado_en: '2026-08-01T10:00:00Z', ...p,
  })

  it('devuelve la más reciente por fecha', () => {
    expect(ultimaVisita([v({ id: 'a', fecha: '2026-07-01' }), v({ id: 'b', fecha: '2026-08-20' })])?.id).toBe('b')
  })

  it('nunca fui es null, y es distinto de fui y no anoté', () => {
    expect(ultimaVisita([])).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Los lugares guardados de Google Maps
// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('parsearCsvMaps', () => {
  // La forma real del export de Takeout: Title, Note, URL — y títulos con coma adentro.
  // Takeout entrecomilla lo que lleva comas — el título y la URL, que trae el punto adentro.
  const CSV = [
    'Title,Note,URL',
    '"Los Tres Hermanos, local 23",jeans,"https://www.google.com/maps/place/x/@-34.6295,-58.4635,17z"',
    'MODA SUR,,"https://maps.google.com/?q=-34.6301,-58.4680"',
    'Sin punto,solo el nombre,https://maps.app.goo.gl/abc123',
    ',huérfana,"https://maps.google.com/?q=-34.6,-58.4"',
  ].join('\n')

  it('lee título, nota y el punto, respetando las comillas', () => {
    const { candidatos } = parsearCsvMaps(CSV)
    expect(candidatos[0].nombre).toBe('Los Tres Hermanos, local 23')
    expect(candidatos[0].nota).toBe('jeans')
    expect(candidatos[0].lat).toBeCloseTo(-34.6295, 4)
    expect(candidatos[1].lng).toBeCloseTo(-58.468, 4)
  })

  // ⚠️ Un link corto no trae coordenadas y eso NO puede descartar el lugar: entra sin punto y lo
  // geocodifica el servidor como a cualquier otro.
  it('una URL sin coordenadas entra igual, sin punto', () => {
    const { candidatos } = parsearCsvMaps(CSV)
    const sinPunto = candidatos.find((c) => c.nombre === 'Sin punto')
    expect(sinPunto).toBeDefined()
    expect(sinPunto?.lat).toBeNull()
  })

  it('la misma invariante que la nota: nada se pierde en silencio', () => {
    const { candidatos, sinEntender } = parsearCsvMaps(CSV)
    expect(candidatos.length + sinEntender.length).toBe(4)
    expect(sinEntender[0].motivo).toBe('la fila no trae título')
  })

  // 🔴 El modo de falla que casi se cuela: un CSV pasado por una planilla pierde las comillas, la
  // URL se parte en tres columnas y el punto —el único dato de ubicación que trae este archivo—
  // desaparece sin que nada avise.
  it('si la URL viene SIN comillas, el punto se encuentra igual', () => {
    const { candidatos } = parsearCsvMaps(
      'Title,Note,URL\nMODA SUR,jeans,https://www.google.com/maps/place/x/@-34.6295,-58.4635,17z',
    )
    expect(candidatos).toHaveLength(1)
    expect(candidatos[0].nombre).toBe('MODA SUR')
    expect(candidatos[0].lat).toBeCloseTo(-34.6295, 4)
    expect(candidatos[0].lng).toBeCloseTo(-58.4635, 4)
  })

  it('un archivo que no es el de Maps lo dice, no lo adivina', () => {
    const { candidatos, sinEntender } = parsearCsvMaps('a,b,c\n1,2,3')
    expect(candidatos).toHaveLength(0)
    expect(sinEntender[0].motivo).toContain('Title')
  })
})

describe('puntoDeUrlMaps', () => {
  it('lee las dos formas de la URL', () => {
    expect(puntoDeUrlMaps('https://x/@-34.6295,-58.4635,17z')).toEqual({ lat: -34.6295, lng: -58.4635 })
    expect(puntoDeUrlMaps('https://maps.google.com/?q=-34.63,-58.46')).toEqual({ lat: -34.63, lng: -58.46 })
  })

  it('un link corto no inventa un punto', () => {
    expect(puntoDeUrlMaps('https://maps.app.goo.gl/abc123')).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// La ficha que nace de una orden de compra
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 🔑 La arman DOS llamadores —`api/_oc-webhook.js` y `scripts/sembrar-prm.mjs`— y por eso la fila
 * se decide acá. Lo que estos tests fijan es lo que se rompería callado: una ficha con zona, una
 * ficha de un proveedor que no existe, y una ficha sin motivo escrito.
 */
describe('filaDeLocalSembrado', () => {
  const base = { id: 'pl1_abc', proveedorId: 650, nombre: 'YASANA', origen: 'Sembrado al llegar OC-0466' }

  it('arma la fila con el estado medido, no con un default', () => {
    // `compro` es la verdad: tiene órdenes de compra confirmadas.
    expect(filaDeLocalSembrado(base)).toEqual({
      id: 'pl1_abc',
      nombre: 'YASANA',
      estado: 'compro',
      proveedor_id_ingresos: 650,
      creado_por: 'sembrado',
      nota: 'Sembrado al llegar OC-0466. Falta clasificarle la zona.',
    })
  })

  it('🔴 ⛔ NO le pone zona, y la nota la pide', () => {
    // La recorrida filtra por zona: un proveedor al que se le compra por mail no puede entrar a un
    // viaje a Flores por accidente. Adivinarla por el nombre está medido y descartado.
    expect(filaDeLocalSembrado(base)).not.toHaveProperty('zona')
    expect(filaDeLocalSembrado(base).nota).toContain('Falta clasificarle la zona')
  })

  it('un proveedor sin nombre igual tiene ficha, con su número', () => {
    // Sin ficha sus OCs no se ven desde el PRM, que es peor que una ficha con un nombre feo.
    expect(filaDeLocalSembrado({ ...base, nombre: '   ' }).nombre).toBe('Proveedor #650')
    expect(filaDeLocalSembrado({ ...base, nombre: null }).nombre).toBe('Proveedor #650')
  })

  it('🔴 `0` ⛔ no es un proveedor: tira', () => {
    // `Number(null)` es 0, y `enteroDe` del webhook devuelve 0 cuando el campo no vino. Un 0 que
    // pase deja UNA ficha fantasma compartida por todas las órdenes sin proveedor.
    expect(() => filaDeLocalSembrado({ ...base, proveedorId: 0 })).toThrow(/proveedorId/)
    expect(() => filaDeLocalSembrado({ ...base, proveedorId: -1 })).toThrow(/proveedorId/)
    expect(() => filaDeLocalSembrado({ ...base, proveedorId: NaN })).toThrow(/proveedorId/)
  })

  it('🔑 el id y el motivo van obligatorios: ⛔ no se inventan acá adentro', () => {
    expect(() => filaDeLocalSembrado({ ...base, id: '' })).toThrow(/id/)
    expect(() => filaDeLocalSembrado({ ...base, origen: '' })).toThrow(/origen/)
  })
})

describe('nuevoIdDeLocal', () => {
  it('arma el id con el prefijo que espera la tabla', () => {
    expect(nuevoIdDeLocal({ ahora: 1756800000000, azar: 'x7k2q1' })).toBe('pl1756800000000_x7k2q1')
  })

  it('🔑 el reloj y el azar van OBLIGATORIOS', () => {
    // Si los tomara de adentro, el llamador no podría hacer reproducible ni una siembra ni un test.
    expect(() => nuevoIdDeLocal({ ahora: NaN, azar: 'x' })).toThrow(/ahora/)
    expect(() => nuevoIdDeLocal({ ahora: 1, azar: '' })).toThrow(/azar/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Sugerir el proveedor de Gestión Nube
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 🔑 Sugerir ⛔ no es adivinar: acá nada se escribe solo, lo acepta una persona con un click. Lo que
 * estos tests fijan es **cuándo NO hay que sugerir**, que es la mitad que importa: una sugerencia
 * entre dos parecidos es la que se acepta sin mirar.
 */
describe('sugerirProveedorGn', () => {
  const CATALOGO = ['Contamina', 'Boucle', 'Play Urban', 'ALMA', 'NOX', 'ACRIS JEANS', 'Maysix']

  it('el mismo nombre, en cualquier caja, es exacta', () => {
    expect(sugerirProveedorGn('alma', CATALOGO)).toEqual({ nombre: 'ALMA', seguridad: 'exacta' })
    expect(sugerirProveedorGn('Acris Jeans', CATALOGO)).toEqual({ nombre: 'ACRIS JEANS', seguridad: 'exacta' })
  })

  it('🔴 el ESPACIO de más ⛔ no lo separa: sigue siendo exacta', () => {
    // Medido: `PLAYURBAN` en el padrón y `Play Urban` en Gestión Nube. Es el mismo proveedor
    // escrito por dos personas, y la primera versión de esta función lo dejaba afuera.
    expect(sugerirProveedorGn('PLAYURBAN', CATALOGO)).toEqual({ nombre: 'Play Urban', seguridad: 'exacta' })
  })

  it('el nombre largo contra el corto es PROBABLE, y se dice', () => {
    // Así crecen estos nombres: la marca primero. Medido: 2 de los 28.
    expect(sugerirProveedorGn('CONTAMINA BY LATTE CHIC', CATALOGO)).toEqual({ nombre: 'Contamina', seguridad: 'probable' })
    expect(sugerirProveedorGn('BOUCLE LOCAL', CATALOGO)).toEqual({ nombre: 'Boucle', seguridad: 'probable' })
  })

  it('🔴 compara por PREFIJO y ⛔ no por «contiene»', () => {
    // El caso que separa las dos reglas: la palabra está, pero **en el medio**. Con «contiene»
    // esto sugiere `Contamina` para un local que se llama de otra manera y arranca con otra marca.
    // 🔑 Sin esta línea el mutante «prefijo → contiene» SOBREVIVE: las otras dos las tapaba el
    // mínimo de 4 letras.
    expect(sugerirProveedorGn('LATTE CHIC DE CONTAMINA', CATALOGO)).toBeNull()
    expect(sugerirProveedorGn('TIENDA MAYSIX CENTRO', CATALOGO)).toBeNull()
    expect(sugerirProveedorGn('LATTE CHIC', CATALOGO)).toBeNull()
    expect(sugerirProveedorGn('CASA NOX SRL', CATALOGO)).toBeNull()
  })

  it('🔴 una palabra de menos de 4 letras ⛔ no sugiere medio catálogo', () => {
    expect(sugerirProveedorGn('NOX BUENOS AIRES', CATALOGO)).toBeNull()
  })

  it('🔴 con DOS candidatos ⛔ no sugiere NADA', () => {
    // Una sugerencia entre dos parecidos es la que se acepta sin mirar, y es justo el caso en que
    // hay que mirar.
    expect(sugerirProveedorGn('BOUCLE LOCAL', ['Boucle', 'Boucle Local Sur'])).toBeNull()
  })

  it('el que no está en el catálogo ⛔ no inventa nada', () => {
    // Los 4 que entraron el 1-sep todavía no tienen productos en Gestión Nube.
    expect(sugerirProveedorGn('YASANA', CATALOGO)).toBeNull()
    expect(sugerirProveedorGn('', CATALOGO)).toBeNull()
    expect(sugerirProveedorGn('ALMA', [])).toBeNull()
  })
})
