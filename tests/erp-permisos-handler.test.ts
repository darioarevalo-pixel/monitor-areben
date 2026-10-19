import { describe, it, expect, vi, beforeEach } from 'vitest'

// La puerta del handler del ERP: cada pedido pide su permiso en su marca (`puedeErp`). ⛔ toca bases:
// los pedidos que pasan la puerta caen en `vista=permisos`, que contesta sin leer nada.
let perfilActual: unknown = null
vi.mock('../api/_auth.js', () => ({ exigirUsuario: async () => perfilActual }))
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
  beforeEach(() => { perfilActual = null })

  it('🔑 con la llave cerrada, un Local recibe 403 aunque tenga la función (como hasta el 19-oct)', async () => {
    const handler = await cargar()
    perfilActual = perfil({ funcion: ['local'] })
    const r = res()
    await handler({ method: 'GET', query: { vista: 'permisos', marca: 'bdi' }, body: {} }, r)
    expect(r.code).toBe(403)
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
})
