import { describe, expect, it } from 'vitest'
import { resultadoDelMes, ventasDeLinea } from '../api/_erp-inicio.js'

describe('Inicio › Resultado de UNA línea (Bruno, 30-oct)', () => {
  it('BDI lee ventas entera; Zattia y Stunned se reparten por la plata de sus renglones (pesos complementarios)', () => {
    expect(ventasDeLinea('bdi')).not.toContain('venta_detalles')
    const z = ventasDeLinea('zattia'), s = ventasDeLinea('stunned')
    expect(s).toContain('coalesce(lp.stu, 0) / lp.todo')
    expect(z).toContain('(1 - (case when lp.todo > 0 then coalesce(lp.stu, 0) / lp.todo else 0 end))')
    expect(z).toContain("v.marca in ('zattia')")
    expect(s).toContain("v.marca in ('stunned')")
  })

  it('🔴 el peso puede salir de [0, 1] (un renglón negativo) y la otra línea queda NEGATIVA: se cuenta igual, como Norte', () => {
    // Nº 30631 (oct-2026): STU $19.290 y Zattia −$14.490. Con `> 0` se tiraba la parte de Zattia y la venta salía inflada:
    // Zattia + Stunned daban $12.980,63 más que GN (probado en un Postgres local: con `<> 0` la suma cierra al peso).
    for (const l of ['zattia', 'stunned']) {
      const q = ventasDeLinea(l)
      expect(q).toMatch(/ <> 0\s+union all/)
      expect(q).not.toMatch(/ > 0\s+union all/)
    }
  })

  it('cada línea suma SUS ventas del ERP, por el corte (`erp_corte`), ⛔ por una variable, y las que ya están en el espejo ⛔ otra vez', () => {
    for (const l of ['bdi', 'zattia', 'stunned']) {
      const q = ventasDeLinea(l)
      expect(q).toContain('union all')
      expect(q).toContain(`v.marca in ('${l}')`)
      expect(q).toContain('from erp_corte c where c.linea = v.marca and v.ocurrida_en >= c.instante')
      expect(q).toContain('not exists (select 1 from ventas g where g.id = e.id)')
      expect(q).not.toContain('LECTURAS')
    }
  })

  it('en Zattia la línea es obligatoria y en BDI ⛔ se acepta otra', async () => {
    const conMotor = async () => { throw new Error('no debería tocar la base') }
    expect(await resultadoDelMes({ marca: 'zattia' }, { conMotor })).toMatchObject({ status: 400 })
    expect(await resultadoDelMes({ marca: 'bdi', linea: 'stunned' }, { conMotor })).toMatchObject({ status: 400 })
  })

  it('cada suma lee de la tabla de la línea, con el período como $1..$2', async () => {
    const sqls: string[] = []
    const pg = { query: async (sql: string) => { sqls.push(sql); return { rows: sql.includes('max(date_sale)') ? [{ hasta: '2026-10-30' }] : sql.includes('group by 1') ? [] : [{ ventas: 0, vendido: 0, costo: 0, sin_costo: 0 }] } } }
    const conMotor = async (_m: string, _q: string, fn: (db: unknown) => unknown) => fn(pg)
    await resultadoDelMes({ marca: 'zattia', linea: 'stunned', hoy: '2026-10-30' }, { conMotor })
    const sumas = sqls.filter((q) => !q.includes('max(date_sale)') && !q.includes('from erp_corte where linea'))
    expect(sumas).toHaveLength(5)
    expect(sumas.length).toBeGreaterThan(0)
    expect(sumas.every((q) => q.includes('coalesce(lp.stu, 0) / lp.todo'))).toBe(true)
  })

  it('el aviso «Gestión Nube llega hasta…» es de la línea que sigue en GN: la que ya cortó ⛔ lo lleva', async () => {
    const leer = async (cortada: boolean) => {
      const pg = { query: async (sql: string, p?: unknown[]) => ({ rows: sql.includes('from erp_corte where linea') ? (cortada && p?.[0] === 'stunned' ? [{}] : []) : sql.includes('max(date_sale)') ? [{ hasta: '2026-10-30' }] : sql.includes('group by 1') ? [] : [{ ventas: 0, vendido: 0, costo: 0, sin_costo: 0 }] }) }
      const conMotor = async (_m: string, _q: string, fn: (db: unknown) => unknown) => fn(pg)
      return await resultadoDelMes({ marca: 'zattia', linea: 'stunned', hoy: '2026-10-30' }, { conMotor }) as { gnHasta: string | null }
    }
    expect((await leer(true)).gnHasta).toBeNull()
    expect((await leer(false)).gnHasta).toBe('2026-10-30')
  })
})
