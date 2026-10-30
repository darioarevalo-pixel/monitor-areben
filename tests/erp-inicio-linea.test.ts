import { describe, expect, it } from 'vitest'
import { resultadoDelMes, ventasDeLinea } from '../api/_erp-inicio.js'

describe('Inicio › Resultado de UNA línea (Bruno, 30-oct)', () => {
  it('BDI lee ventas entera; Zattia y Stunned se reparten por la plata de sus renglones (pesos complementarios)', () => {
    expect(ventasDeLinea('bdi')).not.toContain('venta_detalles')
    const z = ventasDeLinea('zattia', {}), s = ventasDeLinea('stunned', {})
    expect(s).toContain('coalesce(lp.stu, 0) / lp.todo')
    expect(z).toContain('(1 - (case when lp.todo > 0 then coalesce(lp.stu, 0) / lp.todo else 0 end))')
    expect(z).not.toContain('union all')
  })

  it('🔴 el peso puede salir de [0, 1] (un renglón negativo) y la otra línea queda NEGATIVA: se cuenta igual, como Norte', () => {
    // Nº 30631 (oct-2026): STU $19.290 y Zattia −$14.490. Con `> 0` se tiraba la parte de Zattia y la venta salía inflada:
    // Zattia + Stunned daban $12.980,63 más que GN (probado en un Postgres local: con `<> 0` la suma cierra al peso).
    for (const l of ['zattia', 'stunned']) {
      const q = ventasDeLinea(l, {})
      expect(q).toMatch(/ <> 0\) vl$/)
      expect(q).not.toMatch(/ > 0\) vl$/)
    }
  })

  it('Stunned suma sus ventas del ERP SÓLO con la llave LECTURAS_STUNNED_ERP (como memo y Norte); Zattia nunca', () => {
    expect(ventasDeLinea('stunned', { LECTURAS_STUNNED_ERP: '1' })).toContain('union all')
    expect(ventasDeLinea('stunned', {})).not.toContain('union all')
    expect(ventasDeLinea('zattia', { LECTURAS_STUNNED_ERP: '1' })).not.toContain('union all')
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
    await resultadoDelMes({ marca: 'zattia', linea: 'stunned', hoy: '2026-10-30' }, { conMotor, env: {} })
    const sumas = sqls.filter((q) => !q.includes('max(date_sale)'))
    expect(sumas).toHaveLength(5)
    expect(sumas.length).toBeGreaterThan(0)
    expect(sumas.every((q) => q.includes('coalesce(lp.stu, 0) / lp.todo'))).toBe(true)
  })
})
