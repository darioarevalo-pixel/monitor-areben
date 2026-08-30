import { describe, it, expect, vi, afterEach } from 'vitest'
import { geocodificarEnEscalera } from '@/api/_georef.js'

/**
 * **La provincia del geocoder** (30-ago-2026).
 *
 * 🔴 Hasta hoy `api/_georef.js` mandaba `provincia: 'Santa Fe'` **clavada**, y era verdad mientras
 * el único que lo llamaba era Envíos: la moto sale de Rosario. El PRM pregunta por locales de
 * Flores. Con la provincia clavada, `"Av. Avellaneda 3252"` resuelve **en Santa Fe** y Georef
 * contesta **un punto plausible**, no un error — que es exactamente el geocoder que inventa lejos
 * por el que se descartó Nominatim en la primera prueba.
 *
 * Se probó a mano que la constante era la que viajaba, así que el test mira **el cuerpo del POST**
 * y no el resultado: un mock que devuelva coordenadas lindas pasa igual con la provincia mal.
 *
 * ⚠️ Este archivo existe porque **el cambio no lo cubría nada**: los tests de Envíos no tocan
 * `_georef.js` (`envios-sugerir-handler` no lo importa), así que un default silencioso acá se
 * habría descubierto con un punto equivocado en producción.
 */

function fetchQueRegistra(cuerpos: unknown[]) {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body)
    cuerpos.push(body)
    return {
      ok: true,
      json: async () => ({
        resultados: body.direcciones.map(() => ({
          direcciones: [{ ubicacion: { lat: -34.6295, lon: -58.4635 }, nomenclatura: 'AVELLANEDA 3252, Comuna 7, CABA', altura: { valor: 3252 } }],
        })),
      }),
    }
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('geocodificarEnEscalera', () => {
  it('manda la provincia que le dan, ⛔ no una constante del archivo', async () => {
    const cuerpos: unknown[] = []
    vi.stubGlobal('fetch', fetchQueRegistra(cuerpos))

    await geocodificarEnEscalera([
      { clave: 'pl1', intentos: ['Av. Avellaneda 3252'], localidad: 'Ciudad Autónoma de Buenos Aires', provincia: 'Ciudad Autónoma de Buenos Aires' },
    ])

    const enviado = (cuerpos[0] as { direcciones: { provincia: string }[] }).direcciones[0]
    expect(enviado.provincia).toBe('Ciudad Autónoma de Buenos Aires')
    expect(enviado.provincia).not.toBe('Santa Fe')
  })

  it('cada pedido lleva la SUYA: dos provincias en el mismo lote no se pisan', async () => {
    const cuerpos: unknown[] = []
    vi.stubGlobal('fetch', fetchQueRegistra(cuerpos))

    await geocodificarEnEscalera([
      { clave: 'a', intentos: ['Rodriguez 1062'], localidad: 'Rosario', provincia: 'Santa Fe' },
      { clave: 'b', intentos: ['Av. Avellaneda 3252'], localidad: 'CABA', provincia: 'Ciudad Autónoma de Buenos Aires' },
    ])

    const dirs = (cuerpos[0] as { direcciones: { provincia: string }[] }).direcciones
    expect(dirs.map((d) => d.provincia)).toEqual(['Santa Fe', 'Ciudad Autónoma de Buenos Aires'])
  })

  // 🔴 Un default habría dejado el mismo agujero con otra cara: el que no la manda no se entera, y
  // el que se entera es el punto equivocado tres pantallas después.
  it('sin provincia TIRA, y dice cuáles pedidos son', async () => {
    const espia = vi.fn()
    vi.stubGlobal('fetch', espia)

    await expect(
      geocodificarEnEscalera([{ clave: 'pl9', intentos: ['Av. Avellaneda 3252'], localidad: 'CABA' }]),
    ).rejects.toThrow(/provincia/i)
    // Y no llegó a preguntar nada: el freno está ANTES de gastar la consulta.
    expect(espia).not.toHaveBeenCalled()
  })

  it('el mensaje nombra al pedido que le falta, para poder ir a buscarlo', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(
      geocodificarEnEscalera([{ clave: 'pl9', intentos: ['x 100'], localidad: 'CABA' }]),
    ).rejects.toThrow(/pl9/)
  })
})
