import { describe, expect, it } from 'vitest'
import { ACCIONES, errorDe, leerAccion, textoDeAviso } from '@/lib/erp/catalogo-edicion.core.js'
import { accionDeCatalogo, historialDeProducto } from '@/api/_erp-catalogo.js'
import { permisoErpDe } from '@/lib/permisos.core.js'

// El núcleo es JS sin tipos: la salida se lee como un objeto cualquiera.
const leer = leerAccion as (b: Record<string, unknown>) => Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

describe('leerAccion', () => {
  it('producto-editar: sólo los campos editables y el tipo que el motor espera', () => {
    const r = leer({ accion: 'producto-editar', marca: 'zattia', productId: '12', cambios: { nombre: 'Remera', categoria: null, activo: false } })
    expect(r.entrada).toEqual({ marca: 'zattia', product_id: 12, cambios: { nombre: 'Remera', categoria: null, activo: false } })
  })
  it('un campo que no se edita se rechaza, ⛔ se descarta callado', () => {
    expect(leer({ accion: 'producto-editar', marca: 'bdi', productId: 1, cambios: { proveedor: 'x' } }).error).toBe('No se edita: proveedor')
    expect(leer({ accion: 'variante-editar', marca: 'bdi', productId: 1, sizeId: 2, cambios: { talle: 5 } }).error).toBe('No se edita: talle')
  })
  it('variante-editar pide la variante; variante-agregar lleva talle, SKU y código', () => {
    expect(leer({ accion: 'variante-editar', marca: 'bdi', productId: 1, cambios: { sku: 'A' } }).error).toBe('Falta la variante')
    expect(leer({ accion: 'variante-editar', marca: 'bdi', productId: 1, sizeId: '7', cambios: { barcode: null } }).entrada)
      .toEqual({ marca: 'bdi', product_id: 1, size_id: 7, cambios: { barcode: null } })
    expect(leer({ accion: 'variante-agregar', marca: 'stunned', productId: 3, talle: 'XL', sku: 'S-3', barcode: '779', usuarioFalso: 'x' }).entrada)
      .toEqual({ marca: 'stunned', product_id: 3, talle: 'XL', sku: 'S-3', barcode: '779' })
  })
  it('marca, producto y acción mal ⇒ error', () => {
    expect(leer({ accion: 'producto-editar', marca: 'xx', productId: 1, cambios: { nombre: 'a' } }).error).toBe('Marca inválida')
    expect(leer({ accion: 'producto-editar', marca: 'bdi', productId: 'x', cambios: { nombre: 'a' } }).error).toBe('Falta el producto')
    expect(leer({ accion: 'producto-editar', marca: 'bdi', productId: 1 }).error).toBe('Faltan los cambios')
    expect(leer({ accion: 'otra', marca: 'bdi', productId: 1 }).error).toBe('Acción desconocida')
  })
})

describe('errorDe y avisos', () => {
  it('dice el barcode repetido con la variante que lo tiene', () => {
    expect(errorDe({ error: { codigo: 'BARCODE_REPETIDO', mensaje: 'x', otra: { product_id: 4, size_id: 9 } } }))
      .toEqual({ status: 409, error: 'Ese código de barras ya es de otra variante (producto 4, variante 9).' })
    expect(errorDe({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'x' } }).status).toBe(404)
    expect(errorDe({ error: { codigo: 'ENTRADA_INVALIDA', mensaje: '⛔ Falta quién' } })).toEqual({ status: 400, error: 'no Falta quién' })
  })
  it('el aviso del SKU repetido tiene su texto', () => {
    expect(textoDeAviso('SKU_REPETIDO')).toMatch(/guardó igual/)
  })
})

describe('la puerta', () => {
  const pgSinTabla = { query: async () => ({ rows: [{ hay: false }] }) }
  const conMotor = (pg: unknown) => async (_base: string, _que: string, fn: (pg: unknown) => unknown) => fn(pg)
  it('sin la migración 037 dice cuál falta (⛔ lanza)', async () => {
    const body = { accion: 'producto-editar', marca: 'bdi', productId: 1, cambios: { nombre: 'a' } }
    expect(await accionDeCatalogo({ body, usuario: 'ana' }, { conMotor: conMotor(pgSinTabla) })).toEqual({ status: 409, error: expect.stringMatching(/037/) })
    expect(await historialDeProducto({ marca: 'bdi', productId: 1 }, { conMotor: conMotor(pgSinTabla) })).toEqual({ status: 409, error: expect.stringMatching(/037/) })
  })
  it('sin usuario o con pedido mal armado ⛔ llega a la base', async () => {
    const pg = { query: async () => { throw new Error('no debería consultar') } }
    const body = { accion: 'producto-editar', marca: 'bdi', productId: 1, cambios: { nombre: 'a' } }
    expect((await accionDeCatalogo({ body, usuario: null }, { conMotor: conMotor(pg) })).status).toBe(400)
    expect((await accionDeCatalogo({ body: { ...body, marca: 'xx' }, usuario: 'ana' }, { conMotor: conMotor(pg) })).status).toBe(400)
    expect((await historialDeProducto({ marca: 'bdi', productId: 'x' }, { conMotor: conMotor(pg) })).status).toBe(400)
  })
})

describe('permiso', () => {
  it('editar el producto es sólo de Admin (`configurar`)', () => {
    for (const accion of ACCIONES) expect(permisoErpDe({ method: 'POST', accion })).toBe('configurar')
    expect(permisoErpDe({ method: 'GET', vista: 'producto-historial' })).toBe('configurar')
  })
})
