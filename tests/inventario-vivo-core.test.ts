import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { pickReal, realMap } from '@/lib/inventario-vivo/core'
import type { FilaVivo } from '@/lib/inventario-vivo/tipos'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

function extraer(fuente: string, nombre: string): string {
  const marca = `\nfunction ${nombre}(`
  const i = fuente.indexOf(marca)
  const llaveAbre = fuente.indexOf('{', i + 1)
  let prof = 0
  for (let k = llaveAbre; k < fuente.length; k++) {
    if (fuente[k] === '{') prof++
    else if (fuente[k] === '}' && --prof === 0) return fuente.slice(i + 1, k + 1)
  }
  throw new Error('no balanceó ' + nombre)
}

function legacy(): { _cdepPickReal: (l: FilaVivo[]) => FilaVivo; _cdepRealMap: (r: FilaVivo[]) => Record<string, FilaVivo> } {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  const src = [extraer(html, '_cdepPickReal'), extraer(html, '_cdepRealMap')].join('\n')
  return new Function(`${src}\nreturn { _cdepPickReal, _cdepRealMap };`)() as never
}

function f(over: Partial<FilaVivo>): FilaVivo {
  return { inventory_id: 1, product_id: '10', product_name: 'Cover', size_id: '100', size_name: 'iPhone 15', store_name: 'Deposito Minorista', available_quantity: 5, ...over }
}

describe('pickReal / realMap · paridad con _cdepPickReal/_cdepRealMap', () => {
  const leg = legacy()

  it('sin duplicados devuelve la única', () => {
    const l = [f({})]
    expect(pickReal(l)).toEqual(leg._cdepPickReal(l))
  })

  it('duplicado: elige la de stock>0 sobre la fantasma en 0', () => {
    const l = [f({ inventory_id: 200, available_quantity: 0 }), f({ inventory_id: 201, available_quantity: 7 })]
    expect(pickReal(l)).toBe(l[1])
    expect(pickReal(l)).toEqual(leg._cdepPickReal(l))
  })

  it('varias con stock: la de inventory_id más bajo', () => {
    const l = [f({ inventory_id: 300, available_quantity: 3 }), f({ inventory_id: 250, available_quantity: 9 })]
    expect(pickReal(l).inventory_id).toBe(250)
    expect(pickReal(l)).toEqual(leg._cdepPickReal(l))
  })

  it('todas en 0: la de inventory_id más bajo', () => {
    const l = [f({ inventory_id: 400, available_quantity: 0 }), f({ inventory_id: 350, available_quantity: 0 })]
    expect(pickReal(l).inventory_id).toBe(350)
    expect(pickReal(l)).toEqual(leg._cdepPickReal(l))
  })

  it('realMap agrupa por product_id+size_id y elige la real de cada uno', () => {
    const rows = [
      f({ product_id: '10', size_id: '100', inventory_id: 1, available_quantity: 0 }),
      f({ product_id: '10', size_id: '100', inventory_id: 2, available_quantity: 4 }), // fantasma vs real
      f({ product_id: '10', size_id: '101', inventory_id: 3, available_quantity: 2 }),
      f({ product_id: '11', size_id: '200', inventory_id: 4, available_quantity: 0 }),
    ]
    const port = realMap(rows)
    const leg2 = leg._cdepRealMap(rows)
    expect(Object.keys(port).sort()).toEqual(Object.keys(leg2).sort())
    expect(port['10_100']).toEqual(leg2['10_100'])
    expect(port['10_100'].inventory_id).toBe(2) // la de stock
    expect(port['10_101']).toEqual(leg2['10_101'])
    expect(port['11_200']).toEqual(leg2['11_200'])
  })
})
