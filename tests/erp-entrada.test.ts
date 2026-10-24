import { describe, expect, it, vi } from 'vitest'
import { ACCIONES, entradaInvalida } from '@/lib/erp/entrada.core.js'
import { ACCIONES as ACCIONES_CATALOGO } from '@/lib/erp/catalogo-edicion.core.js'
import { ACCIONES as ACCIONES_TRANSFERENCIA } from '@/lib/erp/transferencia-doc.core.js'

const get = (query: Record<string, unknown>) => entradaInvalida({ method: 'GET', query: { recurso: 'erp', nc: '1729000000000', ...query } })
const post = (body: unknown) => entradaInvalida({ method: 'POST', query: { recurso: 'erp' }, body })

describe('ERP › la puerta de entrada (forma del pedido)', () => {
  it('pasan los pedidos que arma hoy `lib/erp/cliente.ts`', () => {
    expect(get({ vista: 'facturacion', mes: '2026-10' })).toBeNull()
    expect(get({ mes: '2026-10' })).toBeNull()
    expect(get({ vista: 'cobros', marca: 'zattia', desde: '2026-10-01', hasta: '2026-10-21', prueba: '0' })).toBeNull()
    expect(get({ vista: 'cuenta-cliente', marca: 'zattia', cliente: 'abc', linea: 'stunned', prueba: '1', desde: '', hasta: '' })).toBeNull()
    expect(get({ vista: 'conciliacion', tienda: 'stunned' })).toBeNull()
    expect(get({ vista: 'stock', marca: 'bdi', q: 'remera negra' })).toBeNull()
    expect(post({ accion: 'facturar', marca: 'bdi', ventaIds: ['1', '2'], mes: '2026-10' })).toBeNull()
    expect(post({ accion: 'poner-ruta', marca: 'zattia', linea: '' })).toBeNull()
    expect(post({ accion: 'poner-ruta', marca: 'zattia', linea: null })).toBeNull()
    expect(post({ accion: 'cargar-venta', marca: 'zattia', lineas: [{ sku: 'X', cantidad: 1 }], pagos: [{ medio: 'efectivo', monto: 100 }] })).toBeNull()
  })

  it('🔑 una vista o acción que ⛔ está nombrada contesta 400 (nace cerrada)', () => {
    expect(get({ vista: 'todo' })).toMatchObject({ status: 400, campo: 'vista' })
    expect(post({ accion: 'borrar-todo' })).toMatchObject({ status: 400, campo: 'accion' })
    expect(post({})).toMatchObject({ status: 400, campo: 'accion' })
    expect(post('accion=cerrar')).toMatchObject({ status: 400 })
  })

  it('marca, fecha, mes y prueba con su formato', () => {
    expect(get({ vista: 'stock-lista', marca: 'otra' })).toMatchObject({ campo: 'marca' })
    expect(get({ vista: 'movimientos', marca: 'bdi', desde: '21/10/2026' })).toMatchObject({ campo: 'desde' })
    expect(get({ vista: 'facturas', mes: '2026-1' })).toMatchObject({ campo: 'mes' })
    expect(get({ vista: 'cobros', marca: 'bdi', prueba: 'si' })).toMatchObject({ campo: 'prueba' })
    expect(post({ accion: 'anular', marca: 'BDI' })).toMatchObject({ campo: 'marca' })
  })

  it('⛔ parámetros repetidos ni sin tope, aunque ⛔ estén nombrados', () => {
    expect(get({ vista: 'ventas', marca: 'bdi', q: ['a', 'b'] })).toMatchObject({ campo: 'q' })
    expect(get({ vista: 'ventas', marca: 'bdi', q: 'x'.repeat(201) })).toMatchObject({ campo: 'q' })
    expect(get({ vista: 'stock-lista', marca: 'bdi', otro: ['1', '2'] })).toMatchObject({ campo: 'otro' })
  })

  it('el cuerpo tiene tope de largo, de cantidad y de hondura, y dice dónde', () => {
    expect(post({ accion: 'facturar', marca: 'bdi', ventaIds: Array.from({ length: 1001 }, (_, i) => String(i)) })).toMatchObject({ campo: 'ventaIds' })
    expect(post({ accion: 'cargar-venta', marca: 'bdi', lineas: [{ nota: 'x'.repeat(5001) }] })).toMatchObject({ campo: 'lineas.0.nota' })
    let hondo: Record<string, unknown> = {}
    const raiz = hondo
    for (let i = 0; i < 10; i++) { hondo.a = {}; hondo = hondo.a as Record<string, unknown> }
    expect(post({ accion: 'cambiar', marca: 'zattia', x: raiz })).toMatchObject({ status: 400 })
  })

  it('cada acción que despacha `api/_erp.js` está en la lista (y ninguna de más)', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync('api/_erp.js', 'utf8')
    const enHandler = new Set([...src.matchAll(/accion === '([a-z-]+)'/g)].map((m) => m[1]))
    // `cargar-costo` y `nota-venta`/`cobrar-venta` se despachan por mapa, junto a su hermana.
    for (const a of ['cargar-costo', 'nota-venta', 'cobrar-venta', 'sembrar-reglas', 'simular-reglas', 'prender-caja-reglas']) enHandler.add(a)
    // Las de las puertas con su propio módulo (transferencia como documento, editar el producto) se despachan por su lista.
    for (const a of [...ACCIONES_TRANSFERENCIA, ...ACCIONES_CATALOGO]) enHandler.add(a)
    expect([...ACCIONES].sort()).toEqual([...enHandler].sort())
  })
})

describe('api/_erp.js · la puerta de entrada en el handler', () => {
  it('un admin con una vista desconocida recibe 400 con el campo, antes de leer nada', async () => {
    vi.doMock('../api/_auth.js', () => ({ exigirUsuario: async () => ({ name: 'Ana', admin: true, acceso: { bdi: {}, zattia: {} }, funcion: [] }) }))
    vi.doMock('../api/_facturacion.js', () => ({ arcaConectado: () => false, SIN_ARCA: 'sin certificado', baseFacturacion: () => null, clienteArcaDelEntorno: () => null, repoFacturas: () => null }))
    const handler = (await import('../api/_erp.js')).default as unknown as (req: unknown, res: unknown) => Promise<unknown>
    const r = { code: 0, body: {} as Record<string, unknown>, status(c: number) { r.code = c; return r }, json(b: Record<string, unknown>) { r.body = b; return r } }
    await handler({ method: 'GET', query: { vista: 'stock', marca: 'bdi', q: ['a', 'b'] }, body: {} }, r)
    expect(r.code).toBe(400)
    expect(r.body.campo).toBe('q')
  })
})
