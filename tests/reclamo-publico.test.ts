import { describe, it, expect } from 'vitest'
// Handler JS de api/: se importa solo la función pura, sin tocar Supabase ni Blob.
import { paraElCliente } from '@/api/_reclamo.js'

/**
 * El portal del cliente es **lo único de Devoluciones abierto a internet**: se entra con un token,
 * sin sesión, desde un celular. `paraElCliente` es la última barrera antes de que algo salga.
 *
 * Este test le pasa una fila con TODO lo sensible adentro —costos, márgenes, ids de Gestión Nube,
 * montos a devolver, el propio token— y verifica que nada de eso viaje. Importa porque un campo de
 * más no rompe ninguna pantalla: simplemente se filtra, en silencio, hacia afuera.
 */

/** Una fila como la que devuelve la base, con todo lo que NO debe salir. */
const FILA = {
  id: 42,
  store: 'bdi',
  orden_tn: '20700',
  estado: 'esperando_cliente',
  motivo: 'falla',
  token: 'a'.repeat(64),
  token_vence: '2026-08-11T00:00:00Z',
  cliente: 'Carla florencia Ietta',
  monto_producto: 15283,
  monto_total: 21212,
  costo_caso: 9000,
  gn_venta_id: '998877',
  pago_metodo: 'wire_transfer',
  items: [
    {
      producto: 'WEAVE CASE CHERRY (iPhone 11)', variante: 'iPhone 11', cantidad: '1',
      // Nada de esto puede llegar al cliente:
      sku: 'F-0026-11-CH', precio: '8990.00', pagado: 7641.5, costo: 2000, pvp_feria: 3500,
      product_id: '294663910', size_id: '77', variant_id: '1316406298',
    },
  ],
  fotos: [{ url: 'https://blob/x.jpg', at: '2026-07-27T00:00:00Z', por: 'cliente' }],
  relato_cliente: 'Vino con una mancha',
}

describe('lo que ve el cliente en el link público', () => {
  const salida = paraElCliente(FILA)
  const json = JSON.stringify(salida)

  it('trae lo justo para que sepa de qué reclamo se trata', () => {
    expect(salida.numero).toBe('R-0042') // derivado del id 42
    expect(salida.orden).toBe('20700')
    expect(salida.productos).toHaveLength(1)
    expect(salida.productos[0].producto).toContain('WEAVE CASE')
    expect(salida.fotos).toEqual(['https://blob/x.jpg'])
    expect(salida.relato).toBe('Vino con una mancha')
  })

  // El corazón del test: la plata y el negocio no salen a internet.
  it.each([
    ['el costo del producto', '2000'],
    ['el PVP de feria', '3500'],
    ['el precio de lista', '8990'],
    ['lo que se le va a devolver', '21212'],
    ['lo que nos cuesta el caso', '9000'],
    ['el id de la venta en GN', '998877'],
    ['los ids de la variante', '294663910'],
    ['el SKU', 'F-0026-11-CH'],
    ['el propio token', 'aaaaaaaa'],
  ])('no filtra %s', (_que, valor) => {
    expect(json).not.toContain(valor)
  })

  it('tampoco filtra el nombre del cliente ni la forma de pago', () => {
    expect(json).not.toContain('Ietta')
    expect(json).not.toContain('wire_transfer')
  })

  it('avisa si todavía puede subir fotos', () => {
    expect(salida.puedeSubir).toBe(true)
    expect(paraElCliente({ ...FILA, fotos: Array.from({ length: 6 }, () => ({ url: 'u' })) }).puedeSubir).toBe(false)
  })

  it('sin ítems ni fotos no rompe', () => {
    const vacio = paraElCliente({ id: 1, estado: 'borrador' })
    expect(vacio.productos).toEqual([])
    expect(vacio.fotos).toEqual([])
  })
})
