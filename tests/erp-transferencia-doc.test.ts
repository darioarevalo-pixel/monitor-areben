import { describe, expect, it } from 'vitest'
import { ACCIONES, errorDe, leerAccion, leerRenglones, textoDeAviso } from '@/lib/erp/transferencia-doc.core.js'
import { permisoErpDe } from '@/lib/permisos.core.js'

// El núcleo es JS sin tipos: la salida se lee como un objeto cualquiera.
const leer = leerAccion as (b: Record<string, unknown>) => Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const ID = '0b9a1f2e-3c4d-4e5f-8a6b-7c8d9e0f1a2b'

describe('leerAccion', () => {
  it('crear: sólo lo que el motor usa, ⛔ lo que el navegador agrega', () => {
    const r = leer({ accion: 'transferencia-crear', linea: 'zattia', desde: 'deposito', hacia: 'local', usuarioFalso: 'x',
      renglones: [{ product_id: 1, size_id: 2, cantidad: 3, sku: 'A-1', extra: 'x' }] })
    expect(r.entrada).toEqual({ linea: 'zattia', desde: 'deposito', hacia: 'local', origen: 'libre', origen_ref: undefined, nota: undefined,
      renglones: [{ product_id: 1, size_id: 2, cantidad: 3, sku: 'A-1', barcode: null }] })
  })
  it('crear de Reposición lleva el armado', () => {
    const r = leer({ accion: 'transferencia-crear', linea: 'bdi', desde: 'deposito_minorista', hacia: 'local', origen: 'reposicion', origen_ref: 'a1:t1' })
    expect(r.entrada.origen).toBe('reposicion')
    expect(r.entrada.origen_ref).toBe('a1:t1')
  })
  it('línea, depósitos, id y prendas mal ⇒ error', () => {
    expect((leer({ accion: 'transferencia-crear', linea: 'xx', desde: 'a', hacia: 'b' })).error).toBe('Línea inválida')
    expect((leer({ accion: 'transferencia-crear', linea: 'bdi', desde: 'a' })).error).toMatch(/de dónde sale/)
    expect((leer({ accion: 'transferencia-enviar', linea: 'bdi', transferenciaId: 'no' })).error).toBe('Falta la transferencia')
    expect((leer({ accion: 'transferencia-armar', linea: 'bdi', transferenciaId: ID, renglones: 'x' })).error).toMatch(/mal armadas/)
    expect((leer({ accion: 'transferencia-armar', linea: 'bdi', transferenciaId: ID, renglones: [null] })).error).toMatch(/mal armadas/)
    expect((leer({ accion: 'otra', linea: 'bdi', transferenciaId: ID })).error).toBe('Acción desconocida')
  })
  it('enviar acepta el id de GN; cancelar lleva el motivo', () => {
    expect((leer({ accion: 'transferencia-enviar', linea: 'bdi', transferenciaId: ID, gn_transfer_id: 8139 })).entrada).toEqual({ gn_transfer_id: '8139' })
    expect((leer({ accion: 'transferencia-cancelar', linea: 'bdi', transferenciaId: ID, motivo: 'no hace falta' })).entrada).toEqual({ motivo: 'no hace falta' })
  })
  it('sin renglones ⇒ lista vacía; un renglón que no es objeto ⇒ null', () => {
    expect(leerRenglones(undefined)).toEqual([])
    expect(leerRenglones([1])).toBeNull()
  })
})

describe('errorDe y avisos', () => {
  it('dice el error en palabras de la pantalla', () => {
    expect(errorDe({ error: { codigo: 'SIN_PRENDAS', mensaje: 'x' } })).toEqual({ status: 409, error: 'No hay nada escaneado para transferir.' })
    expect(errorDe({ error: { codigo: 'ESTADO_INVALIDO', mensaje: 'La transferencia T-3 está en transito' } }).error).toMatch(/Volvé a leer/)
    expect(errorDe({ error: { codigo: 'ENTRADA_INVALIDA', mensaje: '⛔ cantidad' } })).toEqual({ status: 400, error: 'no cantidad' })
  })
  it('texto de los avisos', () => {
    expect(textoDeAviso({ codigo: 'SIN_STOCK_EN_LIBRO', sku: 'A-1', libro: 2, armada: 3 })).toMatch(/A-1.*2.*3/)
  })
})

describe('permisos', () => {
  it('cada acción pide su permiso y la lista es de lectura', () => {
    for (const a of ACCIONES) expect(permisoErpDe({ method: 'POST', accion: a })).toBe('ajustar')
    expect(permisoErpDe({ method: 'GET', vista: 'transferencias-doc' })).toBe('ver')
  })
})
