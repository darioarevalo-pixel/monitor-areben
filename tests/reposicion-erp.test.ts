/**
 * REPOSICIÓN DIRECTO DE AREBEN GESTIÓN (Darío, 25-nov-2026). Lo que no se ve si falla:
 * - una venta contada dos veces (la copia de GN y la del ERP) o ninguna vez alrededor del corte;
 * - las ventas online de BDI descontando del local (BDI repone sólo por el local; Zattia también por el online);
 * - una ventana de días inventada que haga una consulta gigante;
 * - una fila del libro con el SKU de otra línea mezclada en la lista.
 */
import { describe, expect, it } from 'vitest'
import { CANALES_LOCAL, MAX_DIAS, SQL_VENTAS_LOCAL, inventarioDelLibro, leerDias, mapaDeVentas } from '../lib/reposicion/erp.core.js'

describe('las ventas del local', () => {
  it('cada venta vive en UN sistema: lo de GN antes del corte, lo del ERP después', () => {
    expect(SQL_VENTAS_LOCAL).toMatch(/gn_sale_id is not null and \(c\.instante is null or v\.ocurrida_en < c\.instante\)/)
    expect(SQL_VENTAS_LOCAL).toMatch(/gn_sale_id is null and c\.instante is not null and v\.ocurrida_en >= c\.instante/)
  })
  it('⛔ las de prueba ni las anuladas', () => {
    expect(SQL_VENTAS_LOCAL).toContain('not v.prueba')
    expect(SQL_VENTAS_LOCAL).toContain("v.estado <> 'anulada'")
  })
  it('el día es el argentino', () => {
    expect(SQL_VENTAS_LOCAL.match(/America\/Argentina\/Buenos_Aires/g)).toHaveLength(2)
  })
  it('BDI sólo el local; Zattia local + online', () => {
    expect(CANALES_LOCAL).toEqual({ bdi: ['local'], zattia: ['local', 'online'] })
  })
  it('mapaDeVentas arma pid_sid → unidades, sin ceros', () => {
    expect(mapaDeVentas([{ vid: '1_2', cant: 3 }, { vid: '4_5', cant: 0 }, { vid: '6_7', cant: '2' }])).toEqual({ '1_2': 3, '6_7': 2 })
  })
})

describe('leerDias', () => {
  it('acepta la lista y saca repetidos', () => expect(leerDias('7,60,7')).toEqual([7, 60]))
  it('rechaza vacío, basura, cero, más del techo y más de 4 ventanas', () => {
    for (const q of [undefined, '', 'x', '7,abc', '0', String(MAX_DIAS + 1), '1,2,3,4,5', '-3', '7.5']) expect(leerDias(q), String(q)).toBeNull()
  })
})

describe('inventarioDelLibro', () => {
  const fila = (linea: string, sku: string, q: number) => ({ linea, product_id: 1, product_name: 'X', size_id: 2, size_name: 'M', store_name: 'Local', available_quantity: q, sku, barcode: null })
  it('saca la línea del renglón y deja sólo lo de las líneas pedidas con su SKU', () => {
    const r = inventarioDelLibro('zattia', ['zattia', 'stunned'], [fila('zattia', 'TOP-1', 3), fila('zattia', 'STU-1', 1), fila('stunned', 'STU-2', 2)])
    expect(r.map((x: { sku: string }) => x.sku)).toEqual(['TOP-1', 'STU-2'])
    expect(r[0]).not.toHaveProperty('linea')
  })
})
