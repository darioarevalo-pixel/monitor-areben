import { describe, it, expect } from 'vitest'
import { diagnosticar, leerKey, refDeUrl } from '@/lib/credenciales.core.js'

/**
 * La sonda del PASO 0 de `sql/migrate-rls.sql`.
 *
 * Lo que estos tests amarran no es "que devuelva algo", sino las dos afirmaciones de las que
 * depende una migración que puede dejar al Monitor sin poder guardar:
 *
 *  1. **`efectivo` resuelve el mismo `SERVICE_KEY || KEY` que hacen los handlers.** Si acá se
 *     resolviera distinto, el diagnóstico diría verde sobre una marca que va a romper.
 *  2. **No sale ni un caracter de ninguna clave.** Un diagnóstico que filtra la service key es peor
 *     que no tenerlo: esa clave saltea RLS por diseño y no se revoca, se rota.
 */

// JWTs de juguete: header y firma de relleno, payload real. No son claves de nadie.
const jwt = (payload: object) => `xxx.${Buffer.from(JSON.stringify(payload)).toString('base64')}.yyy`
const ANON_BDI = jwt({ role: 'anon', ref: 'refbdi' })
const SERVICIO_BDI = jwt({ role: 'service_role', ref: 'refbdi' })
const ANON_ZAT = jwt({ role: 'anon', ref: 'refzat' })
const SERVICIO_ZAT = jwt({ role: 'service_role', ref: 'refzat' })

const URLS = { SUPABASE_URL: 'https://refbdi.supabase.co', ZATTIA_SUPABASE_URL: 'https://refzat.supabase.co' }
const TODO_BIEN = {
  ...URLS,
  SUPABASE_KEY: ANON_BDI,
  SUPABASE_SERVICE_KEY: SERVICIO_BDI,
  ZATTIA_SUPABASE_KEY: ANON_ZAT,
  ZATTIA_SUPABASE_SERVICE_KEY: SERVICIO_ZAT,
}
const de = (env: Record<string, string>, marca: string) => diagnosticar(env).marcas.find((m: { marca: string }) => m.marca === marca)!

describe('leerKey: qué dice ser una clave', () => {
  it('lee el rol y el proyecto de un JWT clásico', () => {
    expect(leerKey(SERVICIO_BDI)).toEqual({ rol: 'service_role', ref: 'refbdi' })
    expect(leerKey(ANON_ZAT)).toEqual({ rol: 'anon', ref: 'refzat' })
  })

  it('entiende las claves nuevas opacas, que no son JWT', () => {
    // Si esto devolviera 'ilegible', una rotación a las claves nuevas haría que la sonda diera
    // rojo sobre una configuración correcta — y el rojo falso frena una migración tanto como el
    // problema real.
    expect(leerKey('sb_secret_loquesea')).toEqual({ rol: 'service_role', ref: null })
    expect(leerKey('sb_publishable_loquesea')).toEqual({ rol: 'anon', ref: null })
  })

  it('lo que no reconoce lo llama ilegible, no lo adivina', () => {
    expect(leerKey('cualquier-cosa').rol).toBe('ilegible')
    expect(leerKey(jwt({ role: 'postgres' })).rol).toBe('ilegible')
    expect(leerKey('')).toEqual({ rol: null, ref: null })
    expect(leerKey(undefined)).toEqual({ rol: null, ref: null })
  })
})

describe('refDeUrl', () => {
  it('saca el proyecto del subdominio', () => {
    expect(refDeUrl('https://srqzzffmiiescffabtlc.supabase.co')).toBe('srqzzffmiiescffabtlc')
  })
  it('sin URL no inventa un proyecto', () => {
    expect(refDeUrl('')).toBe(null)
    expect(refDeUrl('https://ejemplo.com')).toBe(null)
  })
})

describe('diagnosticar: la respuesta del PASO 0', () => {
  it('con las dos service keys puestas, las dos marcas están listas', () => {
    const d = diagnosticar(TODO_BIEN)
    expect(d.listoParaRls).toBe(true)
    expect(d.marcas.map((m: { efectivo: string }) => m.efectivo)).toEqual(['service_role', 'service_role'])
  })

  it('🔴 sin service key, `efectivo` cae a anon — que es exactamente lo que RLS rompe', () => {
    // Es el caso que motivó todo esto: el `.env` local no tiene ZATTIA_SUPABASE_SERVICE_KEY. El
    // handler no falla hoy (escribe con la anon), y por eso el problema es invisible hasta que RLS
    // entra. La sonda tiene que decir NO sobre Zattia y SÍ sobre BDI, por separado.
    const env = { ...TODO_BIEN, ZATTIA_SUPABASE_SERVICE_KEY: '' }
    expect(de(env, 'zattia').efectivo).toBe('anon')
    expect(de(env, 'zattia').listoParaRls).toBe(false)
    expect(de(env, 'bdi').listoParaRls).toBe(true)
    expect(diagnosticar(env).listoParaRls).toBe(false)
  })

  it('🔴 una anon pegada en el lugar de la service key no pasa por buena', () => {
    // La variable ESTÁ y el nombre es el correcto: el dashboard de Vercel mostraría todo en orden.
    const env = { ...TODO_BIEN, ZATTIA_SUPABASE_SERVICE_KEY: ANON_ZAT }
    expect(de(env, 'zattia').servicio.presente).toBe(true)
    expect(de(env, 'zattia').servicio.ok).toBe(false)
    expect(de(env, 'zattia').listoParaRls).toBe(false)
  })

  it('🔴 la service key de la OTRA marca tampoco pasa', () => {
    // Rol correcto, variable presente, y sin embargo escribe en la base equivocada.
    const env = { ...TODO_BIEN, ZATTIA_SUPABASE_SERVICE_KEY: SERVICIO_BDI }
    const z = de(env, 'zattia')
    expect(z.servicio.rol).toBe('service_role')
    expect(z.servicio.refCoincide).toBe(false)
    expect(z.listoParaRls).toBe(false)
  })

  it('sin la URL no se declara lista una marca (no hay contra qué comparar)', () => {
    const env = { ...TODO_BIEN, ZATTIA_SUPABASE_URL: '' }
    expect(de(env, 'zattia').listoParaRls).toBe(false)
  })

  it('un entorno vacío no rompe: contesta que no hay nada', () => {
    const d = diagnosticar({})
    expect(d.listoParaRls).toBe(false)
    expect(d.marcas.every((m: { efectivo: string | null }) => m.efectivo === null)).toBe(true)
  })

  it('⛔ la respuesta no contiene ni un fragmento de ninguna clave', () => {
    const serializado = JSON.stringify(diagnosticar(TODO_BIEN))
    for (const clave of [ANON_BDI, SERVICIO_BDI, ANON_ZAT, SERVICIO_ZAT]) {
      expect(serializado).not.toContain(clave)
      // Ni siquiera un prefijo: el payload de un JWT es reversible y el largo ayuda a un ataque.
      expect(serializado).not.toContain(clave.slice(0, 12))
    }
  })
})
