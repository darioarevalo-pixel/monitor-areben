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
      { clave: 'normal', nombre: 'Sin promo', cuenta: 'c25188', pct: 0 }, { clave: 'seis', nombre: '6 cuotas', cuenta: 'c25173', pct: 0 }, { clave: 'promo', nombre: 'Promo del banco', cuenta: 'c25172', pct: 0 },
    ])
  })

  it('ERP sin CG (Bruno 10-nov): aunque la Caja mande la transferencia a CG, en el ERP es la de Areben', () => {
    const f = formasDePago({ reglas: { ...reglas, transferenciaA: 20595, titulares: { areben: 13015, dario: 20595 } }, cuentas, rutas: [], canales: ['local'] })
    expect(f.find((x) => x.clave === 'transferencia')!.cuenta).toBe('c13015')
  })

  it('cada forma trae el % de descuento de su cuenta en la Caja (Nueva venta lo deja editar)', () => {
    const conPct = { ...reglas, cuentas: { 12921: { nombre: 'Efectivo', descuento: 15 }, 13015: { nombre: 'Transferencia', descuento: 10 }, 20196: { nombre: 'Débito', descuento: 10 }, 25188: { nombre: 'Crédito', descuento: 0 }, 25172: { nombre: 'Crédito 10%', descuento: 10 }, 25173: { nombre: '6 cuotas', descuento: 0 } } }
    const f = formasDePago({ reglas: conPct, cuentas, rutas: [], canales: ['local'] })
    expect(Object.fromEntries(f.slice(0, 4).map((x) => [x.clave, x.pct]))).toEqual({ efectivo: 15, transferencia: 10, debito: 10, credito: 0 })
    expect(f.find((x) => x.clave === 'credito')!.opciones!.find((o) => o.clave === 'promo')!.pct).toBe(10)
  })

  it('la RUTA de cada canal sale con la cuenta real, la comisión y los días; sin ruta es null (se dice, ⛔ se inventa)', async () => {
    const { rutasVigentes } = await import('../motor/cuentas/rutas.mjs')
    const rutas = await (rutasVigentes as unknown as () => Promise<never[]>)()
    const f = formasDePago({ reglas, cuentas, rutas, canales: ['local', 'online'] })
    expect(f.find((x) => x.clave === 'credito')!.rutas.local).toEqual({ cuenta: 'Areben · Mercado Pago', cuentaId: 'r2', tasa: 3.5, dias: 2 })
    expect(f.find((x) => x.clave === 'efectivo')!.rutas.local).toEqual({ cuenta: 'Areben · Caja local', cuentaId: 'r1', tasa: null, dias: 0 })
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

  it('«Más» ⛔ ofrece la transferencia a un particular (CG): la cuenta real dice adónde fue', () => {
    const f = formasDePago({ reglas, cuentas, rutas: [], canales: ['local'] })
    expect(cuentasSueltas({ formas: f, cuentas, reglas }).map((c: { id: string }) => c.id).sort()).toEqual(['c25867', 'c25869', 'mp'])
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
    // Stunned ⛔ tiene Caja propia: se leen las de Zattia (dos veces la misma Caja).
    expect(reglasDeCaja.mock.calls.map((c) => c[0])).toEqual(['zattia', 'zattia'])
    expect(r.formas.zattia.find((f) => f.clave === 'efectivo')!.cuenta).toBe('c12921')
  })

  it('🔴 Stunned (leído en prod el 10-nov): con su caja en null, usa las reglas de la Caja de Zattia ⇒ 4 formas con SU cuenta y sin CG en «Más»', async () => {
    const { datosParaCargar } = await import('../api/_erp-cargar.js')
    const deStunned = [...GN.map((g) => ({ id: `s${g}`, nombre: g === 20595 ? 'Transferencia CG' : `Cuenta ${g}`, medio: 'x', gn_cuenta_id: g, marca: 'stunned' }))]
    const reglasDeCaja = vi.fn(async (l: string) => (l === 'zattia' ? { ...reglas, titulares: { areben: 13015, dario: 20595 } } : null))
    const pg = { query: async (sql: string) => {
      if (/from cuenta_cobro/.test(sql)) return { rows: [...cuentas, ...deStunned] }
      if (/from canal/.test(sql)) return { rows: [{ id: 'local' }] }
      if (/venta_origen_check/.test(sql)) return { rows: [{ ok: true }] }
      if (/from cuenta_real/.test(sql)) return { rows: [] }
      return { rows: [{ hay: false }] }
    } }
    const conMotor = async (_m: string, _q: string, fn: (pg: unknown) => Promise<unknown>) => fn(pg)
    const r = await datosParaCargar({ marca: 'zattia' }, { conMotor, reglasDeCaja }) as { formas: Record<string, { clave: string; cuenta: string | null }[]>; sueltas: Record<string, { id: string; nombre: string }[]>; sinReglas: string[] }
    expect(Object.fromEntries(r.formas.stunned.slice(0, 4).map((f) => [f.clave, f.cuenta]))).toEqual({ efectivo: 's12921', transferencia: 's13015', debito: 's20196', credito: 's25188' })
    expect(r.sueltas.stunned.some((c) => /CG/.test(c.nombre))).toBe(false)
    expect(r.sinReglas).toEqual([])
  })

  it('CG ⛔ aparece en «Más» aunque la línea llegue SIN reglas (por el nombre)', () => {
    const conCG = [{ id: 'x', nombre: 'Transferencia CG', medio: 'transferencia', gn_cuenta_id: 20597, marca: 'bdi' }, { id: 'y', nombre: 'Pago Nube', medio: 'otro', gn_cuenta_id: null, marca: 'bdi' }]
    expect(cuentasSueltas({ formas: [], cuentas: conCG, reglas: null }).map((c: { id: string }) => c.id)).toEqual(['y'])
  })
})
