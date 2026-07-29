import { describe, it, expect } from 'vitest'
import { computarDatos } from '@/lib/etl/computar'
import { construirInv } from '@/lib/reposicion/inventario'
import { aplicarCats, reporte } from '@/lib/reposicion/core'
import { repoCfgDefault } from '@/lib/reposicion/tipos'
import { indexarTn } from '@/lib/tn'
import type { EntradaETL, ContextoETL } from '@/lib/etl/tipos'

/**
 * Un producto recién cargado en Gestión Nube entra a la tabla `inventario` antes que a
 * `productos` (el sync escribe las dos por separado). Reposición y Etiquetas cruzan una contra
 * la otra, y antes DESCARTABAN en silencio lo que no matcheaba: el stock desaparecía de la
 * pantalla sin cartel ni contador. Estos tests fijan que eso no vuelva a pasar.
 *
 * Caso real que lo destapó: VESTIDO DAHLIA (Zattia, product_id 1045414), cargado el 28-jul-2026
 * con 14 unidades en depósito, invisible en Reposición.
 */

const VESTIDO = {
  product_id: 1045414,
  product_name: 'VESTIDO DAHLIA',
  size_id: 76647,
  size_name: 'Variante Única',
  sku: 'RVE-0044',
  barcode: 'RVE0044',
}

describe('Reposición: stock sin producto en el catálogo', () => {
  const inventario = [
    { ...VESTIDO, available_quantity: 14, store_name: 'Deposito ' },
    { ...VESTIDO, available_quantity: 0, store_name: 'Local' },
  ]

  it('la variante entra al reporte aunque el producto no esté en el catálogo', () => {
    // `prodById` vacío = el catálogo cacheado todavía no tiene el producto.
    const inv = construirInv(inventario, {}, indexarTn([]), {})
    expect(inv).toHaveLength(1)
    expect(inv[0]).toMatchObject({
      pid: '1045414',
      name: 'VESTIDO DAHLIA',
      sku: 'RVE-0044',
      deposito: 14,
      local: 0,
      sinProducto: true,
    })
    // Sin producto no hay categoría: cae en el respaldo y con él en el mínimo por defecto.
    expect(aplicarCats(inv, [])[0].cat).toBe('(sin categoría)')
  })

  it('y llega hasta el reporte final, que es lo que se ve en pantalla', () => {
    const inv = construirInv(inventario, {}, indexarTn([]), {})
    expect(reporte(inv, repoCfgDefault(), false)).toHaveLength(1)
  })

  it('con el producto ya sincronizado, `sinProducto` queda en false y toma su categoría', () => {
    const prodById = { '1045414': { id: 1045414, category: 'VESTIDOS', sku: 'RVE-0044', name: 'VESTIDO DAHLIA' } }
    // `aplicarCats` es el paso que elige la categoría efectiva; el componente lo encadena igual.
    const inv = aplicarCats(construirInv(inventario, prodById, indexarTn([]), {}), [])
    expect(inv[0].sinProducto).toBe(false)
    expect(inv[0].cat).toBe('VESTIDOS')
  })
})

describe('ETL: allVariantesHuerfanas', () => {
  const ctx: ContextoETL = { today: new Date('2026-07-29T12:00:00.000Z'), colorManualMap: {} }
  const base: EntradaETL = {
    productos: [],
    ventas: [],
    detalles: [],
    inventario: [],
    vmMes: [],
    vmCat: [],
    vmFundas: [],
    syncMeta: null,
  }

  const conocido = { product_id: 900, product_name: 'TOP AUREA', size_id: 1, size_name: 'S', sku: 'RTO-0345', barcode: 'RTO0345' }

  it('separa las variantes cuyo producto no está en el catálogo, sin tocar allVariantes', () => {
    const datos = computarDatos(
      {
        ...base,
        productos: [{ id: 900, name: 'TOP AUREA', active: 1, retailer_price: 100, category: 'TOPS' }],
        inventario: [
          { ...conocido, available_quantity: 3, store_name: 'Local' },
          { ...VESTIDO, available_quantity: 14, store_name: 'Deposito ' },
        ],
      } as EntradaETL,
      ctx,
    )

    expect(datos.allVariantes.map((v) => v.pid)).toEqual(['900'])
    expect(datos.allVariantesHuerfanas).toHaveLength(1)
    expect(datos.allVariantesHuerfanas[0]).toMatchObject({
      pid: '1045414',
      name: 'VESTIDO DAHLIA',
      sku: 'RVE-0044',
      barcode: 'RVE0044',
      stock: 14,
    })
  })

  it('el barcode sobrevive: es lo que hace falta para poder etiquetarlo', () => {
    const datos = computarDatos(
      { ...base, inventario: [{ ...VESTIDO, available_quantity: 14, store_name: 'Deposito ' }] } as EntradaETL,
      ctx,
    )
    expect(datos.allVariantes).toHaveLength(0)
    expect(datos.allVariantesHuerfanas[0].barcode).toBe('RVE0044')
  })

  it('sin huérfanas queda vacío, no undefined', () => {
    const datos = computarDatos(base, ctx)
    expect(datos.allVariantesHuerfanas).toEqual([])
  })
})
