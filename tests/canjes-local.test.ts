/**
 * Canjes — retiro en el local (11-ago-2026).
 *
 * Tres cosas que, si se rompen, cuestan plata o stock y no se ven hasta que es tarde:
 *
 *  - **`listoParaEntregar`**, que es la única guarda antes de crear una venta en Gestión Nube que
 *    NO se puede anular por API. Su caso más caro es `entregado_at`: sin ese chequeo, dos toques
 *    seguidos son dos ventas y dos veces el stock.
 *  - **el espejo TS↔JS** con `noSePuedeEntregar`, porque el botón lo decide de un lado y el handler
 *    del otro. Divergen ⇒ la pantalla ofrece entregar algo que el servidor rechaza, o peor, al revés.
 *  - **`puedeAtenderRetiroLocal`**, que es la rendija por la que alguien SIN la sección Canjes toca
 *    un canje. Si se agranda sin querer, el local pasa a ver el módulo entero de Marketing.
 */
import { describe, it, expect } from 'vitest'
import {
  listoParaEntregar, retiroLocalDisponible,
  type CanjeItem, type CanjeRow,
} from '@/lib/canjes/tipos'
// El espejo del handler. Si diverge, el botón dice una cosa y el servidor hace otra.
import {
  noSePuedeEntregar, retiroLocalDisponible as retiroLocalDisponibleJS,
} from '../api/_canjes-reglas.js'
import { puedeAtenderRetiroLocal } from '@/lib/permisos.core.js'

function canje(p: Partial<CanjeRow> = {}): CanjeRow {
  return {
    id: 31, persona_id: 7, store: 'bdi', tipo: 'producto', estado: 'acuerdo',
    retiro_local: true, entregado_at: null,
    tope_tipo: 'unidades', tope_pvp: null, tope_unidades: [{ cantidad: 3, descripcion: 'fundas' }],
    pago_estado: 'no_aplica', compra_estado: 'pendiente', stock_estado: 'pendiente',
    envio_estado: 'pendiente', aviso_estado: 'pendiente',
    cerrado_incompleto: false, producto_no_conservado: false,
    created_at: '2026-08-01T00:00:00.000Z',
    ...p,
  } as CanjeRow
}

function item(p: Partial<CanjeItem> = {}): CanjeItem {
  return {
    id: 1, canje_id: 31, cantidad: 1, product_id: '900', size_id: '12',
    costo_unit: 4000, pvp_unit: 12000,
    origen: 'equipo', estado: 'confirmado', created_at: '2026-08-01T00:00:00.000Z',
    ...p,
  } as CanjeItem
}

/** Un perfil del monitor, con la forma que leen los permisos. */
const perfil = (acceso: Record<string, Record<string, boolean>>, extra: Record<string, unknown> = {}) =>
  ({ name: 'quien', admin: false, funcion: [], acceso, ...extra }) as never

describe('retiroLocalDisponible', () => {
  it('sólo BDI: es la única marca con local', () => {
    expect(retiroLocalDisponible('bdi')).toBe(true)
    expect(retiroLocalDisponible('zattia')).toBe(false)
    expect(retiroLocalDisponible('stunned')).toBe(false)
    expect(retiroLocalDisponible(null)).toBe(false)
    expect(retiroLocalDisponible(undefined)).toBe(false)
  })

  it('coincide con el espejo del handler', () => {
    for (const s of ['bdi', 'zattia', 'stunned', '', null]) {
      expect(retiroLocalDisponible(s)).toBe(retiroLocalDisponibleJS(s))
    }
  })
})

describe('listoParaEntregar', () => {
  it('con un producto cargado y el acuerdo hecho, se puede', () => {
    expect(listoParaEntregar(canje(), [item()]).ok).toBe(true)
    expect(listoParaEntregar(canje({ estado: 'preparando' }), [item()]).ok).toBe(true)
  })

  it('sin nada cargado no se entrega: la venta saldría vacía', () => {
    const r = listoParaEntregar(canje(), [])
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/Cargá lo que se lleva/)
  })

  it('un item quitado o sin stock no cuenta como cargado', () => {
    expect(listoParaEntregar(canje(), [item({ estado: 'quitado' })]).ok).toBe(false)
    expect(listoParaEntregar(canje(), [item({ estado: 'sin_stock' })]).ok).toBe(false)
  })

  it('🔴 ya entregado NO se vuelve a entregar: es la guarda contra la venta duplicada', () => {
    const r = listoParaEntregar(canje({ entregado_at: '2026-08-10T12:00:00.000Z' }), [item()])
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/ya figura entregado/)
  })

  it('un item sin artículo de Gestión Nube frena: sin eso el stock no baja', () => {
    expect(listoParaEntregar(canje(), [item({ size_id: null })]).ok).toBe(false)
    expect(listoParaEntregar(canje(), [item({ product_id: null })]).ok).toBe(false)
  })

  it('antes del acuerdo no hay nada que entregar', () => {
    for (const estado of ['propuesta', 'enviada', 'rechazado', 'no_acepto', 'cerrado'] as const) {
      expect(listoParaEntregar(canje({ estado }), [item()]).ok).toBe(false)
    }
  })

  it('un canje que no es de retiro no se entrega desde el local', () => {
    expect(listoParaEntregar(canje({ retiro_local: false }), [item()]).ok).toBe(false)
  })

  it('una marca sin local no entrega, aunque la fila diga que sí', () => {
    expect(listoParaEntregar(canje({ store: 'zattia' }), [item()]).ok).toBe(false)
  })

  it('pasarse del tope frena, con el motivo en criollo', () => {
    const r = listoParaEntregar(canje(), [item({ id: 1, cantidad: 4 })])
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/Se pasa del acuerdo/)
  })

  it('⛔ llevarse MENOS de lo autorizado es un caso normal, no un error', () => {
    // Autorizadas 3, se lleva 2: el tope es un techo, no una cuota.
    expect(listoParaEntregar(canje(), [item({ id: 1, cantidad: 2 })]).ok).toBe(true)
  })

  it('coincide con el espejo del handler en todos los casos de borde', () => {
    const casos: Array<[Partial<CanjeRow>, CanjeItem[]]> = [
      [{}, [item()]],
      [{}, []],
      [{ entregado_at: '2026-08-10T00:00:00.000Z' }, [item()]],
      [{ retiro_local: false }, [item()]],
      [{ store: 'zattia' }, [item()]],
      [{ estado: 'propuesta' }, [item()]],
      [{}, [item({ size_id: null })]],
      [{}, [item({ cantidad: 4 })]],
      [{}, [item({ cantidad: 2 })]],
    ]
    for (const [p, items] of casos) {
      const ts = listoParaEntregar(canje(p), items)
      const js = noSePuedeEntregar(canje(p), items)
      expect(ts.ok, JSON.stringify(p)).toBe(js == null)
      if (!ts.ok) expect(ts.motivo, JSON.stringify(p)).toBe(js)
    }
  })
})

describe('puedeAtenderRetiroLocal', () => {
  it('quien ve Cupones en BDI atiende el mostrador', () => {
    expect(puedeAtenderRetiroLocal(perfil({ bdi: { cupones: true } }))).toBe(true)
  })

  it('la función `local` alcanza: Cupones es de su área y no hace falta tildar nada', () => {
    expect(puedeAtenderRetiroLocal(perfil({}, { funcion: ['local'] }))).toBe(true)
  })

  it('ver Cupones sólo en Zattia NO abre el local de BDI', () => {
    expect(puedeAtenderRetiroLocal(perfil({ zattia: { cupones: true } }))).toBe(false)
  })

  it('marketing sin Cupones no entra, aunque tenga Canjes', () => {
    expect(puedeAtenderRetiroLocal(perfil({ bdi: { canjes: true } }))).toBe(false)
  })

  it('la cuenta fija le gana: clavado a Zattia no atiende el local de BDI', () => {
    expect(puedeAtenderRetiroLocal(perfil({ bdi: { cupones: true } }, { cuenta: 'zattia' }))).toBe(false)
  })

  it('la excepción negativa lo saca aunque su función se lo diera', () => {
    expect(puedeAtenderRetiroLocal(perfil({ bdi: { '-cupones': true } }, { funcion: ['local'] }))).toBe(false)
  })

  it('sin perfil, no', () => {
    expect(puedeAtenderRetiroLocal(null)).toBe(false)
  })
})
