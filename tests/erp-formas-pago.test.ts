import { describe, expect, it, vi } from 'vitest'
import { MEDIOS_INICIALES } from '../lib/caja/core.core.js'
import { cuentasSueltas, formasDePago } from '../lib/erp/formas-pago.core.js'

vi.mock('../motor/cuentas/rutas.mjs', () => ({
  rutasVigentes: async () => [{ canal: 'local', medio: 'efectivo', vigente: { cuenta_real_id: 'r1', cuenta_titular: 'Areben', cuenta_nombre: 'Caja local', tasa: null, dias_acreditacion: 0 } },
    { canal: 'local', medio: 'credito', vigente: { cuenta_real_id: 'r2', cuenta_titular: 'Areben', cuenta_nombre: 'Mercado Pago', tasa: 3.5, dias_acreditacion: 2 } }],
}))

/** Las cuentas de GN de la configuración inicial de la Caja, como `cuenta_cobro` del motor. */
const GN = [12921, 25867, 13015, 20595, 20196, 25188, 25172, 25173, 25869]
const cuentas = [
  ...GN.map((g) => ({ id: `c${g}`, nombre: `Cuenta ${g}`, medio: 'x', gn_cuenta_id: g, marca: 'zattia' })),
  { id: 'cc', nombre: 'Cuenta corriente', medio: 'cuenta', gn_cuenta_id: null, marca: 'zattia' },
  { id: 'en', nombre: 'Contraentrega', medio: 'entrega', gn_cuenta_id: null, marca: 'zattia' },
  { id: 'mp', nombre: 'Mercado Pago', medio: 'mp', gn_cuenta_id: 99, marca: 'zattia' },
]
const reglas = { medios: { ...MEDIOS_INICIALES }, transferenciaA: 13015 }

describe('Cargar venta: las formas de pago son las del POS', () => {
  it('las cuatro salen de las MISMAS reglas de la Caja, cada una con su cuenta de cobro', () => {
    const f = formasDePago({ reglas, cuentas, rutas: [], canales: ['local'] })
    expect(f.map((x) => x.clave)).toEqual(['efectivo', 'transferencia', 'debito', 'credito', 'cuenta', 'entrega'])
    expect(Object.fromEntries(f.slice(0, 4).map((x) => [x.clave, x.cuenta]))).toEqual({ efectivo: 'c12921', transferencia: 'c13015', debito: 'c20196', credito: 'c25188' })
  })

  it('el crédito trae sus variantes del POS: 6 cuotas y promo del banco, cada una con su cuenta', () => {
    const credito = formasDePago({ reglas, cuentas, rutas: [], canales: ['local'] }).find((x) => x.clave === 'credito')!
    expect(credito.opciones).toEqual([
      { clave: 'normal', nombre: 'Sin promo', cuenta: 'c25188' }, { clave: 'seis', nombre: '6 cuotas', cuenta: 'c25173' }, { clave: 'promo', nombre: 'Promo del banco', cuenta: 'c25172' },
    ])
  })

  it('si la Caja manda la transferencia a la otra cuenta, el ERP también (no hay una segunda regla)', () => {
    const f = formasDePago({ reglas: { ...reglas, transferenciaA: 20595 }, cuentas, rutas: [], canales: ['local'] })
    expect(f.find((x) => x.clave === 'transferencia')!.cuenta).toBe('c20595')
  })

  it('la RUTA de cada canal sale con la cuenta real, la comisión y los días; sin ruta es null (se dice, ⛔ se inventa)', async () => {
    const { rutasVigentes } = await import('../motor/cuentas/rutas.mjs')
    const rutas = await (rutasVigentes as unknown as () => Promise<never[]>)()
    const f = formasDePago({ reglas, cuentas, rutas, canales: ['local', 'online'] })
    expect(f.find((x) => x.clave === 'credito')!.rutas.local).toEqual({ cuenta: 'Areben · Mercado Pago', tasa: 3.5, dias: 2 })
    expect(f.find((x) => x.clave === 'efectivo')!.rutas.local).toEqual({ cuenta: 'Areben · Caja local', tasa: null, dias: 0 })
    expect(f.find((x) => x.clave === 'efectivo')!.rutas.online).toBeNull()
  })

  it('sin reglas en la Caja de la línea, no se inventan cuentas: las cuatro quedan sin cuenta', () => {
    const f = formasDePago({ reglas: null, cuentas, rutas: [], canales: ['local'] })
    expect(f.slice(0, 4).every((x) => x.cuenta === null)).toBe(true)
  })

  it('lo que ⛔ es del POS (Mercado Pago, feria…) va a «Otra cuenta»', () => {
    const f = formasDePago({ reglas, cuentas, rutas: [], canales: ['local'] })
    expect(cuentasSueltas({ formas: f, cuentas }).map((c: { id: string }) => c.id).sort()).toEqual(['c20595', 'c25867', 'c25869', 'mp'])
  })
})

describe('GET cargar-venta: lleva las formas de pago de cada línea', () => {
  it('lee las reglas de la Caja de CADA línea (Zattia y Stunned) y cuenta de cobro por cuenta de GN', async () => {
    const { datosParaCargar } = await import('../api/_erp-cargar.js')
    const reglasDeCaja = vi.fn(async (l: string) => (l === 'zattia' ? reglas : null))
    const pg = { query: async (sql: string) => {
      if (/from cuenta_cobro/.test(sql)) return { rows: cuentas }
      if (/from canal/.test(sql)) return { rows: [{ id: 'local' }] }
      if (/venta_origen_check/.test(sql)) return { rows: [{ ok: true }] }
      return { rows: [{ hay: true }] }
    } }
    const conMotor = async (_m: string, _q: string, fn: (pg: unknown) => Promise<unknown>) => fn(pg)
    const r = await datosParaCargar({ marca: 'zattia' }, { conMotor, reglasDeCaja }) as { formas: Record<string, { clave: string; cuenta: string | null }[]>; sinReglas: string[] }
    expect(reglasDeCaja.mock.calls.map((c) => c[0]).sort()).toEqual(['stunned', 'zattia'])
    expect(r.formas.zattia.find((f) => f.clave === 'efectivo')!.cuenta).toBe('c12921')
    expect(r.sinReglas).toEqual(['stunned']) // su Caja ⛔ tiene reglas ⇒ la pantalla cae a la lista de cuentas
    expect(r.formas.stunned.find((f) => f.clave === 'efectivo')!.cuenta).toBeNull()
  })
})
