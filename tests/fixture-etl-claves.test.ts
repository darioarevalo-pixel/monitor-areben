import { describe, it, expect } from 'vitest'
import { verificarClave, CUENTAS } from '../scripts/fixture-etl.mjs'

/**
 * El guard de claves de `scripts/fixture-etl.mjs`.
 *
 * Por qué existe: la Fase S le revocó a `anon` justo lo que el fixture pide, el script siguió
 * bajándolo con la anon key y el job `paridad` del CI quedó **rojo para siempre**: 36 corridas
 * seguidas, en las que su rojo tapó cualquier rojo real. Y el síntoma era un `401` de PostgREST con
 * un warning del workflow que hablaba de *statement timeout*: apuntaba al lado equivocado.
 *
 * Los tres casos malos —la clave falta, es anon, o es la de la otra marca— terminan en el MISMO
 * 401 si nadie los separa antes de la red. Esto los separa, y cada mensaje nombra la variable.
 */

function jwt(payload: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.firmafalsa`
}

const REF_BDI = 'srqzzffmiiescffabtlc'
const REF_ZATTIA = 'avmdktmyseonacxycimz'

describe('fixture-etl: el guard de la clave de servicio', () => {
  it('acepta la clave de servicio del proyecto que corresponde', () => {
    expect(verificarClave('bdi', CUENTAS.bdi.url, jwt({ role: 'service_role', ref: REF_BDI }))).toBe(true)
    expect(verificarClave('zattia', CUENTAS.zattia.url, jwt({ role: 'service_role', ref: REF_ZATTIA }))).toBe(true)
  })

  it('corta si la clave falta, y dice el nombre de la variable que hay que poner', () => {
    expect(() => verificarClave('bdi', CUENTAS.bdi.url, '')).toThrow(/SUPABASE_SERVICE_KEY/)
    expect(() => verificarClave('zattia', CUENTAS.zattia.url, '')).toThrow(/ZATTIA_SUPABASE_SERVICE_KEY/)
    // Y explica por qué no alcanza con la anon, que es lo que estaba puesto antes.
    expect(() => verificarClave('bdi', CUENTAS.bdi.url, '')).toThrow(/unit_cost/)
  })

  it('🔑 corta con la anon key: es la que dejó el CI rojo, y desde afuera se ve igual que un timeout', () => {
    expect(() => verificarClave('bdi', CUENTAS.bdi.url, jwt({ role: 'anon', ref: REF_BDI })))
      .toThrow(/service_role/)
  })

  it('🔑 corta si las claves de las dos marcas están cruzadas — ya estuvieron anotadas al revés', () => {
    expect(() => verificarClave('bdi', CUENTAS.bdi.url, jwt({ role: 'service_role', ref: REF_ZATTIA })))
      .toThrow(/cruzadas/)
    expect(() => verificarClave('zattia', CUENTAS.zattia.url, jwt({ role: 'service_role', ref: REF_BDI })))
      .toThrow(/cruzadas/)
  })

  it('corta si no es un JWT', () => {
    expect(() => verificarClave('bdi', CUENTAS.bdi.url, 'no-es-un-jwt')).toThrow(/JWT/)
  })

  it('las dos cuentas apuntan a la variable de entorno que ya usan los workflows de sync', () => {
    expect(CUENTAS.bdi.varClave).toBe('SUPABASE_SERVICE_KEY')
    expect(CUENTAS.zattia.varClave).toBe('ZATTIA_SUPABASE_SERVICE_KEY')
  })
})
