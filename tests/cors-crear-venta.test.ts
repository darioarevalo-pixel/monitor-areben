import { describe, it, expect } from 'vitest'
import { ORIGENES_PROPIOS, corsOrigenPropio } from '@/api/_auth.js'

/**
 * El CORS de `crear-venta`, que es el endpoint que crea ventas reales en Gestión Nube y descuenta
 * stock.
 *
 * Hasta el 13-ago-2026 mandaba `Access-Control-Allow-Origin: *`, o sea que cualquier página de
 * internet que alguien del equipo abriera podía dispararle un POST desde su navegador.
 *
 * 🔑 **Lo que hace que este archivo valga la pena no es el caso feliz, es el otro.** El `*` no era
 * un resto de nada: este endpoint se llama CRUZANDO de dominio a propósito (`lib/sesionfotos`,
 * `lib/reclamos` y `lib/postventa/fallas` le pegan por URL absoluta a producción, porque los tokens
 * de ventas de GN viven solo ahí). Sacar el header del todo —que fue la primera idea— habría dejado
 * a esos tres flujos sin poder crear la venta, en producción y sin aviso. Así que hay dos
 * afirmaciones que amarrar, y perder cualquiera de las dos duele: los propios pasan, el resto no.
 */

function resFalso() {
  const r = {
    code: 0 as number,
    ended: false,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { r.headers[k.toLowerCase()] = String(v) },
    status(c: number) { r.code = c; return r },
    json() { return r },
    end() { r.ended = true; return r },
  }
  return r
}

const llamar = (origin: string | undefined, method = 'POST') => {
  const res = resFalso()
  const corto = corsOrigenPropio({ method, headers: origin ? { origin } : {} }, res, 'POST, OPTIONS')
  return { res, corto }
}

describe('los orígenes propios pasan', () => {
  for (const origen of ORIGENES_PROPIOS) {
    it(`${origen} recibe el header, con SU valor y no un comodín`, () => {
      const { res } = llamar(origen)
      expect(res.headers['access-control-allow-origin']).toBe(origen)
      expect(res.headers['access-control-allow-methods']).toBe('POST, OPTIONS')
      // Los llamadores cross-origin mandan la credencial en el CUERPO y sólo este header.
      expect(res.headers['access-control-allow-headers']).toBe('Content-Type')
    })
  }

  it('el preflight de un origen propio corta con 204', () => {
    const { res, corto } = llamar(ORIGENES_PROPIOS[0], 'OPTIONS')
    expect(corto).toBe(true)
    expect(res.code).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe(ORIGENES_PROPIOS[0])
  })

  it('la lista incluye los dos dominios de producción y localhost', () => {
    // Si alguien saca uno de estos "porque son el mismo deployment", rompe el flujo real: la app se
    // sirve en uno y las ventas se postean al otro.
    expect(ORIGENES_PROPIOS).toContain('https://monitor.arebensrl.com')
    expect(ORIGENES_PROPIOS).toContain('https://monitorareben.vercel.app')
    expect(ORIGENES_PROPIOS).toContain('http://localhost:3000')
  })
})

describe('🔴 cualquier otro origen NO recibe el header', () => {
  const ajenos = [
    'https://sitio-cualquiera.com',
    // El caso que hace que `*.vercel.app` no sirva como lista: ese dominio lo tiene cualquiera.
    'https://algo-de-otro.vercel.app',
    // Parecidos a los propios, que es como se cuela un chequeo hecho con `includes` de substring.
    'https://monitor.arebensrl.com.evil.io',
    'https://evil.io/?https://monitor.arebensrl.com',
    'http://monitor.arebensrl.com',
    'http://localhost:3001',
  ]

  for (const origen of ajenos) {
    it(origen, () => {
      const { res } = llamar(origen)
      expect(res.headers['access-control-allow-origin']).toBeUndefined()
      expect(res.headers['access-control-allow-methods']).toBeUndefined()
    })
  }

  it('un preflight ajeno igual contesta 204, pero sin permiso: al navegador le alcanza', () => {
    const { res, corto } = llamar('https://sitio-cualquiera.com', 'OPTIONS')
    expect(corto).toBe(true)
    expect(res.code).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('sin Origin (curl, scripts, server-to-server) no se manda header y NO se corta', () => {
    // CORS es una regla del navegador, no una autenticación: un curl entra igual. Lo que protege
    // este endpoint es `exigirUsuario`, y por eso sacar el `*` no sustituye al guard.
    const { res, corto } = llamar(undefined)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    expect(corto).toBe(false)
  })
})

describe('cacheabilidad', () => {
  it('siempre va Vary: Origin, aunque el origen no esté permitido', () => {
    // Sin esto un caché intermedio puede servirle a un origen la respuesta armada para otro, y el
    // permiso se filtra por la puerta de atrás.
    for (const o of [ORIGENES_PROPIOS[0], 'https://sitio-cualquiera.com']) {
      expect(llamar(o).res.headers['vary']).toBe('Origin')
    }
  })
})
