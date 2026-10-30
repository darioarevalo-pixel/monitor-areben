import { describe, expect, it } from 'vitest'
import { desdeDoceMeses, resultadoDelMes, ventasDeLinea } from '../api/_erp-inicio.js'
import { acumulado, comoVieneElMes, doceMeses, masDejan, plataCorta, porCanal, rayasRedondas, stockACosto, vendidoDelDia } from '../lib/erp/inicio-panel.core.js'

/**
 * **ERP › Inicio · el panel (tanda 2).** El oráculo de cada gráfico es un número que YA está en otra pantalla:
 * los días, el mes en los 12 y los canales suman el «Vendido» (`mes.vendido`); el stock a costo cuenta las unidades del
 * disponible de Stock; lo que más deja es el `agrupar` de Por producto.
 */
describe('las lecturas agrupadas', () => {
  it('12 meses: del 1 del mes, once antes; cruza el año', () => {
    expect(desdeDoceMeses('2026-10-30')).toBe('2025-11-01')
    expect(desdeDoceMeses('2027-01-05')).toBe('2026-02-01')
    expect(desdeDoceMeses('2026-12-31')).toBe('2026-01-01')
  })

  it('días, meses y canales son la MISMA consulta que el vendido, agrupada (mismo where, sin filtrar estado ni canal)', async () => {
    const sqls: string[] = []
    const db = { query: async (s: string) => { sqls.push(s); return { rows: s.includes('max(date_sale)') ? [{ hasta: '2026-10-19' }] : s.includes('group by 1') ? [] : [{ ventas: 0, vendido: 0, costo: 0, sin_costo: 0 }] } } }
    const r = await resultadoDelMes({ marca: 'zattia', linea: 'zattia', hoy: '2026-10-19' }, { env: {}, conMotor: async (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn(db) }) as Record<string, unknown>
    expect(r).toMatchObject({ dias: [], meses: [], canales: [] })
    const agrupadas = sqls.filter((s) => s.includes('group by 1'))
    const [vendido] = sqls.filter((s) => s.includes('sin_costo'))
    expect(agrupadas).toHaveLength(3)
    for (const s of agrupadas) {
      // La misma tabla de la línea que el vendido (desde 30-oct, la línea reparte cada venta por sus renglones).
      expect(s).toContain(`from ${ventasDeLinea('zattia', {})}`)
      expect(vendido).toContain(`from ${ventasDeLinea('zattia', {})}`)
      expect(s).not.toContain('sale_state')
    }
  })
})

const DIAS = [
  { dia: '2026-09-01', vendido: 100 }, { dia: '2026-09-15', vendido: 50 }, { dia: '2026-09-30', vendido: 25 },
  { dia: '2026-10-01', vendido: 10 }, { dia: '2026-10-03', vendido: 30 },
]

describe('el panel', () => {
  it('el acumulado termina en lo vendido del mes y no mezcla el anterior', () => {
    const a = acumulado(DIAS, '2026-10-01', '2026-10-04')
    expect(a.map((x) => x.total)).toEqual([10, 10, 40, 40])
    const c = comoVieneElMes(DIAS, { desde: '2026-10-01', hasta: '2026-10-04' }, { desde: '2026-09-01' })
    expect(c).toHaveLength(31)
    expect(c[3]).toEqual({ dia: 4, ahora: 40, antes: 100 })
    expect(c[4].ahora).toBeNull() // después de hoy ⛔ se dibuja
    expect(c[29].antes).toBe(175) // el anterior, entero
    expect(c[30].antes).toBeNull() // septiembre no tiene 31
    expect(vendidoDelDia(DIAS, '2026-10-03')).toBe(30)
    expect(vendidoDelDia(DIAS, '2026-10-04')).toBe(0)
  })

  it('12 meses en orden con los vacíos en 0; el de hoy, en curso', () => {
    const m = doceMeses([{ mes: '2026-10', vendido: 40, costo: 10 }, { mes: '2025-11', vendido: 5, costo: 1 }], '2026-10-04')
    expect(m.map((x) => x.mes)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    expect(m[11]).toMatchObject({ nombre: 'Oct', vendido: 40, margen: 30, enCurso: true })
    expect(m[0]).toMatchObject({ nombre: 'Nov', vendido: 5, margen: 4, enCurso: false })
    expect(m[5].vendido).toBe(0)
    // GN sin costo en el mes ⇒ margen VACÍO (⛔ igual a lo vendido)
    expect(doceMeses([{ mes: '2026-03', vendido: 36, costo: 0 }], '2026-10-04')[4]).toMatchObject({ mes: '2026-03', margen: null })
  })

  it('por canal: los nombres de Por producto, suman el total y se juntan los que caen en el mismo nombre', () => {
    const c = porCanal([{ canal: 'Mi Local', ventas: 3, vendido: 60, costo: 30 }, { canal: 'Tienda Nube', ventas: 1, vendido: 40, costo: 10 }])
    expect(c.map((x) => x.nombre)).toEqual(['Local', 'Tienda Nube'])
    expect(c.reduce((a, x) => a + x.vendido, 0)).toBe(100)
    expect(c[1]).toMatchObject({ parte: 0.4, margen: 0.75 })
  })

  it('stock a costo: sólo lo disponible; lo sin costo ⛔ es un 0 callado, se cuenta aparte', () => {
    expect(stockACosto([{ disponible: 3, costo: 100 }, { disponible: 2, costo: null }, { disponible: 0, costo: 999 }]))
      .toEqual({ costo: 300, unidades: 5, sinCosto: 2, productosSinCosto: 1 })
  })

  it('lo que más deja: con margen, de mayor a menor', () => {
    const g = [{ id: 'a', nombre: 'A', margen: 5, vendido: 9, unidades: 1 }, { id: 'b', nombre: 'B', margen: null, vendido: 99, unidades: 1 }, { id: 'c', nombre: 'C', margen: 50, vendido: 90, unidades: 1 }]
    expect(masDejan(g).map((x) => x.id)).toEqual(['c', 'a'])
  })

  it('rayas redondas', () => {
    expect(rayasRedondas(38_000_000)).toEqual([0, 10e6, 20e6, 30e6, 40e6])
    expect(rayasRedondas(65_800_000)).toEqual([0, 20e6, 40e6, 60e6, 80e6])
  })

  it('plata corta para ejes', () => {
    expect(plataCorta(34_136_186)).toBe('34 M')
    expect(plataCorta(3_400_000)).toBe('3,4 M')
    expect(plataCorta(850_000)).toBe('850 mil')
  })
})
