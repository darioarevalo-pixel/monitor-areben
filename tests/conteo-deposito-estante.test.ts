import { describe, it, expect } from 'vitest'
import { agruparVivo, cargarContado, pendientesDeGrupo, terminarVarios, visiblesDeGrupo } from '@/lib/conteo-deposito/core'
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

  it('terminar categoría es estricto: bloquea los talles en blanco con stock, no los que están en 0', () => {
    const rto = ordenDeposito(prods)[0].productos
    const b = rto.find((p) => p.name === 'REMERA B')!
    const c = rto.find((p) => p.name === 'REMERA C')!
    const vS = b.variants.find((v) => v.size === 'S')!
    let st = cargarContado({}, b, vS.vid, '3')
    const vis = visiblesDeGrupo(st, rto)
    // B·M (sistema 2) y C·S (sistema 1) en blanco: bloquean, en orden de estante.
    expect(pendientesDeGrupo(st, vis).map((x) => `${x.producto} ${x.talle} ${x.sistema}`)).toEqual(['REMERA B M 2', 'REMERA C S 1'])

    const vM = b.variants.find((v) => v.size === 'M')!
    st = cargarContado(st, b, vM.vid, '0')
    st = cargarContado(st, c, c.variants[0].vid, '1')
    expect(pendientesDeGrupo(st, vis)).toEqual([])

    const fin = terminarVarios(st, vis, 1000)
    expect(fin[b.pid].estado).toBe('terminado')
    expect(Object.values(fin[b.pid].dif).sort()).toEqual([-2, 0])
    expect(Object.values(fin[c.pid].dif)).toEqual([0])
  })

  it('un talle en blanco con sistema 0 no bloquea', () => {
    const p = agruparVivo(realMap([
      fv({ inventory_id: 9, product_id: '9', product_name: 'TOP', sku: 'TOP-0001-S', size_id: 's', size_name: 'S', available_quantity: 2 }),
      fv({ inventory_id: 10, product_id: '9', product_name: 'TOP', sku: 'TOP-0001-XL', size_id: 'x', size_name: 'XL', available_quantity: 0 }),
    ]))
    const vS = p[0].variants.find((v) => v.size === 'S')!
    const st = cargarContado({}, p[0], vS.vid, '2')
    expect(pendientesDeGrupo(st, p)).toEqual([])
  })
})
