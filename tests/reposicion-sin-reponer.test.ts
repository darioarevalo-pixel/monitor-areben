import { describe, it, expect } from 'vitest'
import { cfgVentas, decidir } from '@/lib/reposicion/porVentas'
import { apagarProductos, prenderProductos } from '@/lib/reposicion/sinReponer'
import { repoCfgDefault, type RepoCfg, type RepoItem } from '@/lib/reposicion/tipos'

const HOY = '2026-10-26'

function item(over: Partial<RepoItem> = {}): RepoItem {
  return { vid: '1_1', pid: '1', sid: '1', name: 'SHORT CLIFF Negro', size: 'S', sku: '', local: 0, deposito: 10, cats: [], catFallback: 'SHORTS', cat: 'SHORTS', subcat: null, modelo: null, s7: 0, ubic: '', sinProducto: false, vv: 0, diasVivo: 300, ...over }
}
const d = (it: RepoItem, c: RepoCfg) => decidir(it, c, cfgVentas(c), HOY)

describe('lo confirmado en una devolución se apaga de la reposición (26-oct)', () => {
  it('apagado, la reposición no lo pide; sin apagar, sí', () => {
    expect(d(item(), repoCfgDefault()).llevar).toBeGreaterThan(0)
    expect(d(item(), apagarProductos(repoCfgDefault(), ['1'])).llevar).toBe(0)
  })

  it('es definitivo: no vence con el tiempo', () => {
    const c = apagarProductos(repoCfgDefault(), ['1'])
    expect(decidir(item(), c, cfgVentas(c), '2027-10-26').llevar).toBe(0)
  })

  it('sólo apaga ese producto', () => {
    const c = apagarProductos(repoCfgDefault(), ['1'])
    expect(d(item({ pid: '2', vid: '2_1' }), c).llevar).toBeGreaterThan(0)
  })

  it('no frena la devolución: sigue sobrando lo mismo', () => {
    const sobra = item({ local: 9, deposito: 0 })
    expect(d(sobra, apagarProductos(repoCfgDefault(), ['1'])).devolver).toBe(d(sobra, repoCfgDefault()).devolver)
  })

  it('no repite los ya apagados ni toca los demás', () => {
    const c = apagarProductos({ ...repoCfgDefault(), apagados: ['9'] }, ['1', '9', '1'])
    expect(c.apagados).toEqual(['9', '1'])
  })

  it('sin nada nuevo devuelve la misma config', () => {
    const c = { ...repoCfgDefault(), apagados: ['1'] }
    expect(apagarProductos(c, ['1'])).toBe(c)
  })

  it('se prende a mano: vuelve a reponerse', () => {
    const c = prenderProductos(apagarProductos(repoCfgDefault(), ['1', '2']), ['1'])
    expect(c.apagados).toEqual(['2'])
    expect(d(item(), c).llevar).toBeGreaterThan(0)
  })
})
