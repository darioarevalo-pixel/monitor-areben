import { describe, it, expect, vi, beforeEach } from 'vitest'

// La puerta del handler del ERP: cada pedido pide su permiso en su marca (`puedeErp`). ⛔ toca bases:
// los pedidos que pasan la puerta caen en `vista=permisos`, que contesta sin leer nada.
let perfilActual: unknown = null
vi.mock('../api/_auth.js', () => ({ exigirUsuario: async () => perfilActual }))
// Los roles guardados (motor sql/049) ⛔ se leen de una base: acá se eligen. Una marca con `__error` es una base que no respondió.
let guardadosActual: Record<string, unknown> = {}
vi.mock('../api/_erp-permisos-rol.js', async (orig) => ({ ...(await orig<object>()), rolesGuardadosDeMarcas: async () => guardadosActual }))
vi.mock('../api/_facturacion.js', () => ({ arcaConectado: () => false, SIN_ARCA: 'sin certificado', baseFacturacion: () => null, clienteArcaDelEntorno: () => null, repoFacturas: () => null }))

type Resp = { code: number; body: { permiso?: string; permisos?: Record<string, Record<string, boolean>> }; status(c: number): Resp; json(b: unknown): Resp }
const res = () => {
  const r: Resp = { code: 0, body: {}, status(c) { r.code = c; return r }, json(b) { r.body = b as Resp['body']; return r } }
  return r
}
type Handler = (req: unknown, res: unknown) => Promise<unknown>
const cargar = async () => (await import('../api/_erp.js')).default as unknown as Handler
const perfil = (over: Record<string, unknown> = {}) => ({ name: 'Ana', admin: false, cuenta: null, acceso: { bdi: {}, zattia: {} }, funcion: [], ...over })

describe('api/_erp.js · la puerta por rol', () => {
  beforeEach(() => { perfilActual = null; guardadosActual = {} })

  it('🔑 con la llave cerrada, un Local recibe 403 aunque tenga la función (como hasta el 19-oct)', async () => {
    const handler = await cargar()
    perfilActual = perfil({ funcion: ['local'] })
    const r = res()
    await handler({ method: 'GET', query: { vista: 'permisos', marca: 'bdi' }, body: {} }, r)
    expect(r.code).toBe(403)
  })

  it('los interruptores sólo los lee y los cambia el Admin: un Local con el ERP abierto recibe 403', async () => {
    const handler = await cargar()
    perfilActual = perfil({ funcion: ['local'], acceso: { bdi: { erp: true }, zattia: {} } })
    const lee = res()
    await handler({ method: 'GET', query: { vista: 'interruptores' }, body: {} }, lee)
    expect(lee.code).toBe(403)
    const pone = res()
    await handler({ method: 'POST', query: {}, body: { accion: 'poner-interruptor', marca: 'bdi', clave: 'anular', valor: true } }, pone)
    expect(pone.code).toBe(403)
  })

  it('el admin pasa y lee su mapa de permisos', async () => {
    const handler = await cargar()
    perfilActual = perfil({ admin: true })
    const r = res()
    await handler({ method: 'GET', query: { vista: 'permisos', marca: 'bdi' }, body: {} }, r)
    expect(r.code).toBe(200)
    expect(r.body.permisos?.bdi.configurar).toBe(true)
  })

  it('con el ERP abierto a una persona: ve, pero lo de Configuración le da 403 con el permiso que faltó', async () => {
    const handler = await cargar()
    perfilActual = perfil({ funcion: ['local'], acceso: { bdi: { erp: true }, zattia: {} } })
    const ok = res()
    await handler({ method: 'GET', query: { vista: 'permisos', marca: 'bdi' }, body: {} }, ok)
    expect(ok.code).toBe(200)
    expect(ok.body.permisos?.bdi).toMatchObject({ ver: true, cobrar: true, configurar: false })
    const ruta = res()
    await handler({ method: 'POST', query: {}, body: { accion: 'poner-ruta', marca: 'bdi' } }, ruta)
    expect(ruta.code).toBe(403)
    expect(ruta.body.permiso).toBe('configurar')
    // Stunned es Zattia: la llave está sólo en BDI ⇒ ⛔ pasa.
    const otra = res()
    await handler({ method: 'GET', query: { vista: 'permisos', linea: 'stunned' }, body: {} }, otra)
    expect(otra.code).toBe(403)
  })

  it('🔴 el mapa SIN marca (como lo pide el menú) con el ERP en UNA sola: 200 y la otra en false (⛔ 403: el menú lo mostraba todo, 30-oct)', async () => {
    const handler = await cargar()
    perfilActual = perfil({ funcion: ['local'], acceso: { bdi: {}, zattia: { erp: true } } })
    const r = res()
    await handler({ method: 'GET', query: { vista: 'permisos' }, body: {} }, r)
    expect(r.code).toBe(200)
    expect(r.body.permisos?.zattia).toMatchObject({ ver: true, 'cargar-gasto': true, configurar: false, costos: false })
    expect(Object.values(r.body.permisos?.bdi ?? {}).some(Boolean)).toBe(false)
    // Sin el ERP en ninguna ⇒ 403 igual.
    perfilActual = perfil({ funcion: ['local'] })
    const nada = res()
    await handler({ method: 'GET', query: { vista: 'permisos' }, body: {} }, nada)
    expect(nada.code).toBe(403)
  })

  it('roles guardados: pisan la tabla en el mapa de permisos; si la base no respondió, esa marca queda cerrada (sólo Admin)', async () => {
    const handler = await cargar()
    perfilActual = perfil({ funcion: ['administracion'], acceso: { bdi: { erp: true }, zattia: { erp: true } } })
    guardadosActual = { bdi: { cuentas: [] }, zattia: {} }
    const a = res()
    await handler({ method: 'GET', query: { vista: 'permisos' }, body: {} }, a)
    expect(a.body.permisos?.bdi.cuentas).toBe(false) // lo guardado: nadie salvo Admin
    expect(a.body.permisos?.zattia.cuentas).toBe(true)
    guardadosActual = { bdi: { __error: true }, zattia: {} }
    const b = res()
    await handler({ method: 'GET', query: { vista: 'permisos' }, body: {} }, b)
    expect(b.body.permisos?.bdi.facturacion).toBe(false) // la base no respondió ⇒ cerrada, no «el valor por defecto»
    expect(b.body.permisos?.zattia.facturacion).toBe(true)
  })

  it('repartir roles entre permisos: sólo Admin (poner, restablecer y ver la pantalla)', async () => {
    const handler = await cargar()
    perfilActual = perfil({ funcion: ['administracion'], acceso: { bdi: { erp: true }, zattia: { erp: true } } })
    for (const [method, query, body] of [
      ['GET', { vista: 'roles' }, {}],
      ['POST', {}, { accion: 'poner-roles', marca: 'bdi', permiso: 'cuentas', roles: ['local'] }],
      ['POST', {}, { accion: 'restablecer-roles', marca: 'bdi', permiso: 'cuentas' }],
    ] as const) {
      const r = res()
      await handler({ method, query, body }, r)
      expect(r.code).toBe(403)
    }
  })
})
