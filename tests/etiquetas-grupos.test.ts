import { describe, expect, it } from 'vitest'
import { esGrupo, gruposDeCampanias, unirCampanias } from '../lib/etiquetas/grupos'

// Las vivas de Zattia en Etiquetas el 26-nov (medido en prod).
const campanias = [
  { id: 'st', nombre: 'BLACK FRIDAY STUNNED', linea: 'stunned', nombreComercial: 'BLACK STUNNED' },
  { id: 'liq', nombre: 'Black Friday 2026 · Liquidar (10/10)', linea: 'zattia', nombreComercial: 'BLACK ZATTIA' },
  { id: 'bf', nombre: 'Black Friday 2026', linea: 'zattia', nombreComercial: 'BLACK ZATTIA' },
  { id: 'of', nombre: 'OFERTAS', linea: 'zattia', nombreComercial: 'OFERTAS' },
]

describe('Etiquetas · campañas que se etiquetan juntas', () => {
  it('junta las de la misma línea y el mismo rótulo; sola ⛔ arma grupo', () => {
    const g = gruposDeCampanias(campanias)
    expect(g).toHaveLength(1)
    expect(g[0].miembros).toEqual(['liq', 'bf'])
    expect(g[0].nombre).toContain('BLACK ZATTIA')
    expect(esGrupo(g[0].id)).toBe(true)
  })

  it('otra línea con el mismo rótulo ⛔ se mezcla', () => {
    const g = gruposDeCampanias([...campanias, { id: 'x', nombre: 'X', linea: 'stunned', nombreComercial: 'BLACK ZATTIA' }])
    expect(g.map((x) => x.miembros)).toEqual([['liq', 'bf']])
  })

  it('cada producto se queda con el rótulo de SU campaña; el repetido, con la primera y avisado', () => {
    const u = unirCampanias([
      { items: [{ pid: '1' }, { pid: '2' }], rotulo: 'liquidar 10/10' },
      { items: [{ pid: '3' }, { pid: '2' }], rotulo: 'bf 15/10' },
    ])
    expect(u.items.map((i) => i.pid)).toEqual(['1', '2', '3'])
    expect(u.rotuloPorPid).toEqual({ '1': 'liquidar 10/10', '2': 'liquidar 10/10', '3': 'bf 15/10' })
    expect(u.repetidos).toEqual(['2'])
  })
})
