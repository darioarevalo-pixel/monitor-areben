import { describe, it, expect } from 'vitest'
import { abrirProducto, agruparVivo, calcularAjuste, separarYaAjustados, setCount, terminarProducto } from '@/lib/conteo-deposito/core'
import { realMap } from '@/lib/inventario-vivo/core'
import type { FilaVivo } from '@/lib/inventario-vivo/tipos'

// 30-sep-2026: el Excel se importó, el historial no se guardó y lo terminado podía volver a
// «Generar el ajuste» — `nuevo = vivo + dif` sumaba la diferencia OTRA vez.
function fv(over: Partial<FilaVivo>): FilaVivo {
  return { inventory_id: 1, product_id: '1', product_name: 'SWEATER SEATTLE', product_code: '89110', size_id: 'n', size_name: 'NEGRO', store_name: 'Deposito ', barcode: 'RSW0066NG', available_quantity: 18, fuente: 'vivo', ...over }
}
const antes = [fv({}), fv({ inventory_id: 2, size_id: 'g', size_name: 'GRIS TOPO', barcode: 'RSW0066GRT', available_quantity: 6 })]
const prod = agruparVivo(realMap(antes))[0]
const negro = prod.variants.find((v) => v.size === 'NEGRO')!
const gris = prod.variants.find((v) => v.size === 'GRIS TOPO')!
let st = abrirProducto({}, prod)
st = setCount(st, prod.pid, negro.vid, '15')
st = setCount(st, prod.pid, gris.vid, '9')
st = terminarProducto(st, prod, 1000)

describe('Conteo de Depósito · freno al doble ajuste', () => {
  it('la primera vez ajusta normal', () => {
    const pv = separarYaAjustados(calcularAjuste([prod], st, realMap(antes), 'Deposito ', 'zattia', null))
    expect(pv.rows.map((r) => [r.variante, r.nuevo])).toEqual([['NEGRO', 15], ['GRIS TOPO', 9]])
    expect(pv.yaAjustados).toEqual([])
  })

  it('con el Excel ya importado no vuelve a ajustar, y el registro queda con lo que hay', () => {
    const despues = [fv({ available_quantity: 15 }), fv({ inventory_id: 2, size_id: 'g', size_name: 'GRIS TOPO', barcode: 'RSW0066GRT', available_quantity: 9 })]
    const sinFreno = calcularAjuste([prod], st, realMap(despues), 'Deposito ', 'zattia', null)
    expect(sinFreno.rows.map((r) => r.nuevo)).toEqual([12, 12]) // el doble ajuste que se evita
    const pv = separarYaAjustados(sinFreno)
    expect(pv.rows).toEqual([])
    expect(pv.yaAjustados!.map((r) => r.variante)).toEqual(['NEGRO', 'GRIS TOPO'])
    expect(pv.resumen).toMatchObject({ lineas: 0, mas: 0, menos: 0, unidades_ajustadas: 0 })
    expect(pv.registro.map((x) => [x.variante, x.contado, x.nuevo_stock])).toEqual([['NEGRO', 15, 15], ['GRIS TOPO', 9, 9]])
  })

  it('si sólo una variante se importó, la otra sigue en el Excel', () => {
    const mitad = [fv({ available_quantity: 15 }), fv({ inventory_id: 2, size_id: 'g', size_name: 'GRIS TOPO', barcode: 'RSW0066GRT', available_quantity: 6 })]
    const pv = separarYaAjustados(calcularAjuste([prod], st, realMap(mitad), 'Deposito ', 'zattia', null))
    expect(pv.rows.map((r) => [r.variante, r.nuevo])).toEqual([['GRIS TOPO', 9]])
    expect(pv.resumen).toMatchObject({ lineas: 1, mas: 1, menos: 0, unidades_ajustadas: 3 })
  })
})
