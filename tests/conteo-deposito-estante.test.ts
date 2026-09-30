import { describe, it, expect } from 'vitest'
import { agruparVivo, cargarContado, planTerminarGrupo, terminarVarios, visiblesDeGrupo } from '@/lib/conteo-deposito/core'
import { ordenDeposito } from '@/lib/conteo-estandar/core'
import { realMap } from '@/lib/inventario-vivo/core'
import type { FilaVivo } from '@/lib/inventario-vivo/tipos'

// Vista «Por estante» del Conteo de Depósito (Zattia): orden por SKU + terminar categoría.
function fv(over: Partial<FilaVivo>): FilaVivo {
  return { inventory_id: 1, product_id: '10', product_name: 'X', product_code: 'X', size_id: '1', size_name: 'S', store_name: 'Deposito ', barcode: '', available_quantity: 0, fuente: 'vivo', ...over }
}
const filas: FilaVivo[] = [
  fv({ inventory_id: 1, product_id: '1', product_name: 'REMERA B', sku: 'RTO-0013-S', size_id: 'a', size_name: 'S', available_quantity: 3 }),
  fv({ inventory_id: 2, product_id: '1', product_name: 'REMERA B', sku: 'RTO-0013-M', size_id: 'b', size_name: 'M', available_quantity: 2 }),
  fv({ inventory_id: 3, product_id: '2', product_name: 'REMERA A', sku: 'RTO-0002-S', size_id: 'c', size_name: 'S', available_quantity: 0 }),
  fv({ inventory_id: 4, product_id: '3', product_name: 'BUZO', sku: 'STU-BUZ-0001-S', size_id: 'd', size_name: 'S', available_quantity: 4 }),
  fv({ inventory_id: 5, product_id: '4', product_name: 'REMERA C', sku: 'RTO-0020-S', size_id: 'e', size_name: 'S', available_quantity: 1 }),
]
const prods = agruparVivo(realMap(filas))

describe('Conteo de Depósito · por estante', () => {
  it('agruparVivo conserva el SKU de cada variante', () => {
    expect(prods.find((p) => p.pid === '1')!.variants.map((v) => v.sku).sort()).toEqual(['RTO-0013-M', 'RTO-0013-S'])
  })

  it('agrupa por categoría del SKU y ordena como el estante', () => {
    const g = ordenDeposito(prods)
    expect(g.map((x) => x.grupo)).toEqual(['RTO', 'STU-BUZ'])
    expect(g[0].productos.map((p) => p.name)).toEqual(['REMERA A', 'REMERA B', 'REMERA C'])
  })

  it('muestra solo lo que tiene stock, y un producto en 0 entra en cuanto se le carga algo', () => {
    const rto = ordenDeposito(prods)[0].productos
    expect(visiblesDeGrupo({}, rto).map((p) => p.name)).toEqual(['REMERA B', 'REMERA C'])
    const a = rto.find((p) => p.name === 'REMERA A')!
    const st = cargarContado({}, a, a.variants[0].vid, '2')
    expect(visiblesDeGrupo(st, rto).map((p) => p.name)).toEqual(['REMERA A', 'REMERA B', 'REMERA C'])
  })

  it('terminar categoría: termina lo cargado, y lo que no se tocó con stock queda aparte', () => {
    const rto = ordenDeposito(prods)[0].productos
    const b = rto.find((p) => p.name === 'REMERA B')!
    const vS = b.variants.find((v) => v.size === 'S')!
    const st = cargarContado({}, b, vS.vid, '3')
    const plan = planTerminarGrupo(st, visiblesDeGrupo(st, rto))
    expect(plan.aTerminar.map((p) => p.name)).toEqual(['REMERA B'])
    // El talle M quedó en blanco con 2 en sistema: va a quedar en 0.
    expect(plan.blancosConStock).toEqual([{ producto: 'REMERA B', talle: 'M', sistema: 2 }])
    expect(plan.sinCargarConStock.map((p) => p.name)).toEqual(['REMERA C'])

    const fin = terminarVarios(st, [...plan.aTerminar, ...plan.sinCargarConStock], 1000)
    expect(fin[b.pid].estado).toBe('terminado')
    expect(Object.values(fin[b.pid].dif).sort()).toEqual([-2, 0])
    const c = rto.find((p) => p.name === 'REMERA C')!
    expect(fin[c.pid].estado).toBe('terminado')
    expect(Object.values(fin[c.pid].dif)).toEqual([-1])
  })
})
