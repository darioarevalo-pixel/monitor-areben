import { describe, expect, it } from 'vitest'
import { ACCIONES, errorDe, leerAccion, leerPorRenglon, leerSalen, textoDeAviso } from '@/lib/erp/salida.core.js'
import { entradaInvalida } from '@/lib/erp/entrada.core.js'
import { permisoErpDe } from '@/lib/permisos.core.js'

// El núcleo es JS sin tipos: la salida se lee como un objeto cualquiera.
const leer = leerAccion as (b: Record<string, unknown>) => Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const ID = '0b9a1f2e-3c4d-4e5f-8a6b-7c8d9e0f1a2b'

describe('leerAccion', () => {
  it('crear: sólo lo que el motor usa, ⛔ lo que el navegador agrega', () => {
    const r = leer({ accion: 'salida-crear', linea: 'zattia', tipo: 'foto', ref: ' sol-9 ', usuarioFalso: 'x', gn_sale_ids: { deposito: 987, otro: 5 },
      renglones: [{ product_id: 1, size_id: 2, deposito: 'deposito', cantidad: 3, sku: 'A-1', extra: 'x' }] })
    expect(r.entrada).toEqual({ linea: 'zattia', tipo: 'foto', ref: 'sol-9', detalle: undefined, gn_sale_ids: { deposito: '987' },
      renglones: [{ product_id: 1, size_id: 2, deposito: 'deposito', cantidad: 3, sku: 'A-1', barcode: null }] })
  })
  it('línea, tipo, solicitud, id y productos mal ⇒ error', () => {
    expect(leer({ accion: 'salida-crear', linea: 'xx', tipo: 'foto', ref: 'a', renglones: [] }).error).toBe('Línea inválida')
    expect(leer({ accion: 'salida-crear', linea: 'bdi', tipo: 'regalo', ref: 'a', renglones: [] }).error).toMatch(/tipo/)
    expect(leer({ accion: 'salida-crear', linea: 'bdi', tipo: 'foto', ref: ' ', renglones: [] }).error).toMatch(/solicitud/)
    expect(leer({ accion: 'salida-crear', linea: 'bdi', tipo: 'foto', ref: 'a', renglones: 'x' }).error).toMatch(/mal armados/)
    expect(leer({ accion: 'salida-devolver', linea: 'bdi', salidaId: 'no' }).error).toBe('Falta la salida')
    expect(leer({ accion: 'salida-devolver', linea: 'bdi', salidaId: ID, renglones: [{ n: 'x' }] }).error).toMatch(/mal armados/)
    expect(leer({ accion: 'salida-devolver', linea: 'bdi', salidaId: ID, renglones: [{ n: 1, cantidad: 1.5 }] }).error).toMatch(/mal armados/)
    expect(leer({ accion: 'otra', linea: 'bdi', salidaId: ID }).error).toBe('Acción desconocida')
  })
  it('devolver y cerrar leen sólo sus números; cancelar lleva el motivo', () => {
    expect(leer({ accion: 'salida-devolver', linea: 'bdi', salidaId: ID, renglones: [{ n: 1, cantidad: 2, danada: 9 }] }).entrada).toEqual({ renglones: [{ n: 1, cantidad: 2 }] })
    expect(leer({ accion: 'salida-cerrar', linea: 'bdi', salidaId: ID, renglones: [{ n: 2, consumida: '2', perdida: 0, cantidad: 7 }] }).entrada)
      .toEqual({ renglones: [{ n: 2, consumida: 2, perdida: 0 }] })
    expect(leer({ accion: 'salida-cancelar', linea: 'bdi', salidaId: ID, motivo: 'se escaneó mal' }).entrada).toEqual({ motivo: 'se escaneó mal' })
  })
  it('las listas mal armadas ⇒ null', () => {
    expect(leerSalen(undefined)).toBeNull()
    expect(leerSalen([1])).toBeNull()
    expect(leerPorRenglon([{ cantidad: 1 }], ['cantidad'])).toBeNull()
  })
})

describe('errorDe y avisos', () => {
  it('dice el error en palabras de la pantalla y FALTA_CONTAR lleva la lista', () => {
    expect(errorDe({ error: { codigo: 'NO_ENCONTRADA', mensaje: 'x' } })).toEqual({ status: 404, error: 'No está esa salida.' })
    expect(errorDe({ error: { codigo: 'ENTRADA_INVALIDA', mensaje: '⛔ cantidad' } })).toEqual({ status: 400, error: 'no cantidad' })
    const f = errorDe({ error: { codigo: 'FALTA_CONTAR', mensaje: 'Hay productos', renglones: [{ n: 2, diferencia: 2 }] } }) as { status: number, faltan?: unknown }
    expect([f.status, f.faltan]).toEqual([409, [{ n: 2, diferencia: 2 }]])
  })
  it('texto de los avisos', () => {
    expect(textoDeAviso({ codigo: 'SIN_COSTO', sku: 'A-1' })).toMatch(/A-1.*costo/)
    expect(textoDeAviso({ codigo: 'SIN_STOCK_EN_LIBRO', sku: 'A-1', libro: 2, sale: 3 })).toMatch(/A-1.*2.*3/)
  })
})

describe('la puerta y los permisos', () => {
  it('cada acción pide `ajustar` y la vista es de lectura', () => {
    for (const a of ACCIONES) expect(permisoErpDe({ method: 'POST', accion: a })).toBe('ajustar')
    expect(permisoErpDe({ method: 'GET', vista: 'salidas' })).toBe('ver')
  })
  it('la vista y las acciones pasan la puerta de entrada; una vista inventada ⛔', () => {
    expect(entradaInvalida({ method: 'GET', query: { vista: 'salidas', marca: 'bdi', ref: 'sol-1' } })).toBeNull()
    for (const accion of ACCIONES) expect(entradaInvalida({ method: 'POST', body: { accion, linea: 'bdi' } })).toBeNull()
    expect(entradaInvalida({ method: 'GET', query: { vista: 'salidas-x' } })).not.toBeNull()
  })
})
