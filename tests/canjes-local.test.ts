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
} from '@/lib/canjes/reglas.core.js'
import { puedeAtenderRetiroLocal } from '@/lib/permisos.core.js'
import {
  deDondeElige, fundasPorModelo, modeloEnLaVitrina, modelosDeLaVitrina, stockDelModelo,
} from '@/lib/canjes/modelos'

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

/**
 * 🔴 Esto salió de un fallo real: `leerCanjesDelLocal` no mandaba `store` y la pestaña abría con
 * "store inválido (usá bdi, zattia o stunned)". El handler lo exige **antes** de mirar la vista, así
 * que ninguna lectura sirve sin él — y una vista nueva es justo donde se olvida.
 */
describe('leerCanjesDelLocal — la URL', () => {
  it('manda `store`, que el handler exige siempre', async () => {
    const visto: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      visto.push(String(url))
      return { ok: true, json: async () => ({ ok: true, canjes: [] }) } as unknown as Response
    }) as typeof fetch
    try {
      const { leerCanjesDelLocal } = await import('@/lib/canjes/cliente')
      await leerCanjesDelLocal()
    } finally {
      globalThis.fetch = original
    }
    expect(visto).toHaveLength(1)
    expect(visto[0]).toContain('vista=local')
    expect(visto[0]).toContain('store=bdi')
  })
})

/**
 * 🔴 De acá salió un problema con plata adentro: **se cayeron dos canjes** por acordar con alguien
 * que tenía un celular viejo del que no había fundas. El modelo era texto libre y nadie lo cruzaba.
 *
 * Lo que se prueba es lo que decide ese "sí o no": que agrupar por variante encuentre las fundas y
 * deje afuera lo que no lo es, que el local se cuente aparte del depósito, y que un modelo tipeado
 * de cualquier forma matchee — un "no tenemos" falso es exactamente el error que esto viene a
 * evitar, en el otro sentido.
 */
describe('fundasPorModelo', () => {
  const inv = (size: string | null, store: string, n: number) =>
    ({ size_name: size, store_name: store, available_quantity: n })

  it('agrupa por modelo sumando las ubicaciones, y cuenta el local aparte', () => {
    const r = fundasPorModelo([
      inv('iPhone 15', 'Local', 4),
      inv('iPhone 15', 'Deposito Minorista', 10),
      inv('iPhone 15', 'Deposito Mayorista', 6),
    ])
    expect(r).toEqual([{ modelo: 'iPhone 15', total: 20, local: 4 }])
  })

  it('lo que no es una funda queda afuera: la variante no es un modelo', () => {
    expect(fundasPorModelo([
      inv('Variante Única', 'Local', 7),
      inv('Rosa', 'Local', 3),
      inv(null, 'Local', 5),
    ])).toEqual([])
  })

  it('un modelo en cero no entra: para el que decide es lo mismo que no venderlo', () => {
    expect(fundasPorModelo([inv('iPhone 12', 'Local', 0)])).toEqual([])
  })

  it('ordena del más nuevo al más viejo, que es como se pregunta', () => {
    const r = fundasPorModelo([
      inv('iPhone 12', 'Local', 1),
      inv('iPhone 16 Pro', 'Local', 1),
      inv('iPhone 14', 'Local', 1),
    ])
    expect(r.map((m) => m.modelo)).toEqual(['iPhone 16 Pro', 'iPhone 14', 'iPhone 12'])
  })

  it('🔴 un modelo que el orden canónico no conoce va al FONDO, no al tope', () => {
    // Caso real del catálogo: la variante dice `iPhone 16 E` y `ORDEN_IPHONE` tiene `iPhone 16e`.
    // Invirtiendo el comparador a secas encabezaba el desplegable, arriba del iPhone 17.
    const r = fundasPorModelo([
      inv('iPhone 16 E', 'Local', 20),
      inv('iPhone 17 Pro', 'Local', 5),
      inv('iPhone 13', 'Local', 5),
    ])
    expect(r.map((m) => m.modelo)).toEqual(['iPhone 17 Pro', 'iPhone 13', 'iPhone 16 E'])
  })
})

describe('stockDelModelo', () => {
  const lista = [{ modelo: 'iPhone 13', total: 12, local: 3 }]

  it('encuentra el modelo aunque se tipee distinto', () => {
    for (const t of ['iPhone 13', 'iphone 13', 'IPHONE 13', ' iphone13 ']) {
      expect(stockDelModelo(lista, t)?.total, t).toBe(12)
    }
  })

  it('un modelo del que no hay devuelve null: es el cartel rojo', () => {
    expect(stockDelModelo(lista, 'iPhone 8')).toBeNull()
  })

  it('sin modelo cargado no dice ni que sí ni que no', () => {
    expect(stockDelModelo(lista, '')).toBeNull()
    expect(stockDelModelo(lista, null)).toBeNull()
  })

  it('🔴 NO confunde un modelo con otro que lo contiene', () => {
    // "iPhone 1" no puede matchear la fila de "iPhone 13", ni al revés.
    expect(stockDelModelo(lista, 'iPhone 1')).toBeNull()
  })
})

/**
 * 🔑 Bruno lo cazó al toque: **si el canje tiene vitrina, ella elige de ahí y de ningún otro lado**.
 * Contestar con el stock general —"hay 2.945 fundas"— cuando esa vitrina no tiene ninguna de su
 * modelo es la misma mentira que el texto libre, con más números encima.
 */
describe('deDondeElige', () => {
  it('con retiro manda el local, aunque tenga vitrina colgada', () => {
    // El mostrador carga con el buscador de Gestión Nube; la vitrina no interviene.
    expect(deDondeElige(true, true)).toBe('local')
    expect(deDondeElige(true, false)).toBe('local')
  })

  it('con envío manda la vitrina si la hay, y el stock si no', () => {
    expect(deDondeElige(false, true)).toBe('vitrina')
    expect(deDondeElige(false, false)).toBe('stock')
  })
})

describe('modelosDeLaVitrina', () => {
  const item = (valores: string[], activo = true) => ({ activo, opciones: [{ valores }] })

  it('lista los modelos que ofrece, con de cuántos productos', () => {
    const r = modelosDeLaVitrina([
      item(['iPhone 15']),
      item(['iPhone 15']),
      item(['iPhone 13']),
    ])
    // El orden es el de la vitrina (`facetaDeLaVitrina`): del más nuevo al más viejo, el mismo que
    // ve ella en el link. No se re-ordena acá, justamente para que no se despeguen.
    expect(r).toEqual([
      { modelo: 'iPhone 15', total: 2, local: 2 },
      { modelo: 'iPhone 13', total: 1, local: 1 },
    ])
  })

  it('lo apagado a mano no cuenta: no se lo ofrece', () => {
    const r = modelosDeLaVitrina([item(['iPhone 15']), item(['iPhone 13'], false), item(['iPhone 12'])])
    expect(r.map((m) => m.modelo)).toEqual(['iPhone 15', 'iPhone 12'])
  })

  it('lo NEUTRO no suma a ningún modelo', () => {
    // Los accesorios de BDI que sólo tienen color no son de ningún modelo: se pueden ofrecer igual,
    // pero no son "una funda para su celular", que es la pregunta.
    const r = modelosDeLaVitrina([item(['iPhone 15']), item(['iPhone 13']), item(['Rosa'])])
    expect(r.reduce((a, m) => a + m.total, 0)).toBe(2)
  })

  it('una vitrina que no factea por modelo devuelve vacío, y la pregunta vuelve al stock', () => {
    expect(modelosDeLaVitrina([item(['S']), item(['M']), item(['L'])])).toEqual([])
    // Con un solo modelo tampoco hay faceta (`facetaDeLaVitrina` pide dos).
    expect(modelosDeLaVitrina([item(['iPhone 15'])])).toEqual([])
  })
})

describe('modeloEnLaVitrina', () => {
  const lista = [{ modelo: 'iPhone 11/12', total: 3, local: 3 }, { modelo: 'iPhone 15 Pro', total: 1, local: 1 }]

  it('🔑 respeta la palabra de la tienda: `iPhone 11/12` no es un modelo canónico', () => {
    // Pasarlo por `modeloDe` lo rompería (devolvería "iPhone 11"), y ese valor es el que la
    // creadora ve y elige en el link.
    expect(modeloEnLaVitrina(lista, 'iPhone 11/12')?.total).toBe(3)
    expect(modeloEnLaVitrina(lista, 'iphone 11/12')?.total).toBe(3)
  })

  it('un modelo que la vitrina no ofrece devuelve null: es el cartel rojo', () => {
    expect(modeloEnLaVitrina(lista, 'iPhone 8')).toBeNull()
    expect(modeloEnLaVitrina(lista, '')).toBeNull()
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
