import { describe, it, expect } from 'vitest'
import { escalonVigente, losQueMasSalieron, medirElDia, resumenPorCanal, serieDiaria, techoDeLaRampa, unidadDeLaMeta, type DiaDeVenta } from '@/lib/mkt-ventas/core'
import type { Producto } from '@/lib/etl/tipos'
import type { FilaDetalle, FilaVenta } from '@/lib/etl/tipos'
import type { MetaGuardada } from '@/lib/norte/persistencia'

/**
 * El objetivo del sector y el contador diario (sección `mkt-ventas`).
 *
 * 🔑 **Lo que se prueba acá son las REGLAS, no los números de producción.** Los números se cotejan
 * contra `psql` al abrir la pantalla —una serie que da 16 compras el 17-ago es una afirmación sobre
 * el dato de hoy, no sobre el código—. Acá vive lo que tiene que seguir siendo cierto: qué cuenta
 * como compra, qué canal entra, y cuál de los tres escalones de la rampa manda hoy.
 */

const venta = (id: number, fecha: string, channel: string): FilaVenta => ({ id, date_sale: fecha, channel })
const renglon = (sale_id: number, quantity: number | null): FilaDetalle => ({ sale_id, product_id: 1, size_id: null, size: null, quantity })

const meta = (o: Partial<MetaGuardada> & { key: string; objetivo: number }): MetaGuardada => ({
  label: o.key, medidor: 'ventas-dia', canal: 'online', fechaObjetivo: '', orden: 0, activa: true, ...o,
})

describe('serieDiaria: qué cuenta como compra y como funda', () => {
  const ventas = [
    venta(1, '2026-08-17', 'Tienda Nube'),
    venta(2, '2026-08-17', 'Tienda Nube'),
    venta(3, '2026-08-17', 'Mi Local'),
    venta(4, '2026-08-16', 'Tienda Nube'),
  ]
  const detalles = [renglon(1, 2), renglon(1, 1), renglon(2, 3), renglon(3, 9), renglon(4, 1)]

  it('cuenta compras por fila de venta y fundas por renglón', () => {
    const s = serieDiaria(ventas, detalles, 'online', '2026-08-17', 2)
    expect(s).toEqual([
      { fecha: '2026-08-16', compras: 1, unidades: 1 },
      { fecha: '2026-08-17', compras: 2, unidades: 6 },
    ])
  })

  /**
   * 🔴 El caso que separa los dos denominadores. Una compra sin renglones —o con la cantidad en
   * cero— **igual es una compra**: si `compras` se dedujera de los renglones, el objetivo de
   * «100 compras diarias» contaría de menos y nada fallaría.
   */
  it('una venta sin unidades sigue siendo una compra', () => {
    const s = serieDiaria([venta(9, '2026-08-17', 'Tienda Nube')], [], 'online', '2026-08-17', 1)
    expect(s[0]).toEqual({ fecha: '2026-08-17', compras: 1, unidades: 0 })
  })

  it('el canal lo decide canalDe: Mi Local no entra en online', () => {
    const s = serieDiaria(ventas, detalles, 'online', '2026-08-17', 1)
    expect(s[0].compras).toBe(2)
    expect(serieDiaria(ventas, detalles, 'local', '2026-08-17', 1)[0]).toEqual({ fecha: '2026-08-17', compras: 1, unidades: 9 })
  })

  /**
   * ⚠️ **Mercadolibre NO es `online` para `canalDe`**, y esto lo deja escrito. Es una venta por
   * internet y la clasificación canónica la manda a `otro`; medido en BDI son 7 pedidos en 30 días,
   * así que hoy no mueve el objetivo — pero el día que crezca, esta línea es la que dice por qué el
   * contador no la ve.
   */
  it('Mercadolibre cae en «otro», no en online', () => {
    const ml = [venta(7, '2026-08-17', 'Mercadolibre')]
    expect(serieDiaria(ml, [renglon(7, 1)], 'online', '2026-08-17', 1)[0].compras).toBe(0)
    expect(serieDiaria(ml, [renglon(7, 1)], null, '2026-08-17', 1)[0].compras).toBe(1)
  })

  it('sin canal cuenta todo junto', () => {
    expect(serieDiaria(ventas, detalles, null, '2026-08-17', 1)[0]).toEqual({ fecha: '2026-08-17', compras: 3, unidades: 15 })
  })

  /** Un domingo sin ventas es un dato. Saltearlo dejaría las flechitas moviéndose de a saltos. */
  it('devuelve el día en cero y en orden, aunque no haya ninguna venta', () => {
    const s = serieDiaria([venta(1, '2026-08-17', 'Tienda Nube')], [renglon(1, 1)], 'online', '2026-08-18', 3)
    expect(s.map((d) => d.fecha)).toEqual(['2026-08-16', '2026-08-17', '2026-08-18'])
    expect(s.map((d) => d.compras)).toEqual([0, 1, 0])
  })

  it('lo de afuera de la ventana no entra', () => {
    const s = serieDiaria(ventas, detalles, 'online', '2026-08-17', 1)
    expect(s).toHaveLength(1)
    expect(s[0].compras).toBe(2)
  })
})

describe('escalonVigente: cuál de los tres manda hoy', () => {
  // La rampa real de BDI, cargada por Bruno el 18-ago-2026.
  const rampa = [
    meta({ key: '25', objetivo: 25, fechaObjetivo: '2026-09-08' }),
    meta({ key: '50', objetivo: 50, fechaObjetivo: '2026-09-30' }),
    meta({ key: '100', objetivo: 100, fechaObjetivo: '2026-10-31' }),
  ]

  it('manda la fecha futura más cercana, no la primera de la lista', () => {
    expect(escalonVigente(rampa, '2026-08-18')?.key).toBe('25')
    expect(escalonVigente(rampa, '2026-09-09')?.key).toBe('50')
    expect(escalonVigente(rampa, '2026-10-01')?.key).toBe('100')
  })

  /** El día del vencimiento todavía cuenta: el escalón se juega hasta esa fecha inclusive. */
  it('el día de la fecha objetivo sigue siendo su escalón', () => {
    expect(escalonVigente(rampa, '2026-09-08')?.key).toBe('25')
  })

  /**
   * 🔑 Vencida la rampa entera devuelve el **techo**, no `null`: que se haya pasado el calendario no
   * borra el objetivo, y una pantalla sin barra el 1-nov se leería como que se rompió.
   */
  it('pasadas todas, queda el techo', () => {
    expect(escalonVigente(rampa, '2026-12-01')?.key).toBe('100')
  })

  it('una meta apagada no puede ser escalón', () => {
    const conApagada = [meta({ key: 'apagada', objetivo: 5, fechaObjetivo: '2026-08-20', activa: false }), ...rampa]
    expect(escalonVigente(conApagada, '2026-08-18')?.key).toBe('25')
  })

  it('sin metas activas devuelve null, que no es un objetivo en cero', () => {
    expect(escalonVigente([], '2026-08-18')).toBeNull()
    expect(escalonVigente([meta({ key: 'x', objetivo: 10, activa: false })], '2026-08-18')).toBeNull()
  })

  it('una meta suelta sin fecha igual sirve de escalón', () => {
    expect(escalonVigente([meta({ key: 'suelta', objetivo: 40 })], '2026-08-18')?.key).toBe('suelta')
  })
})

describe('techoDeLaRampa: el número que va en el título', () => {
  it('es el objetivo más grande de las activas', () => {
    const rampa = [meta({ key: '25', objetivo: 25 }), meta({ key: '100', objetivo: 100 }), meta({ key: '50', objetivo: 50 })]
    expect(techoDeLaRampa(rampa)?.objetivo).toBe(100)
  })

  it('no mira las apagadas', () => {
    const r = [meta({ key: '25', objetivo: 25 }), meta({ key: '900', objetivo: 900, activa: false })]
    expect(techoDeLaRampa(r)?.objetivo).toBe(25)
  })

  it('sin metas, null', () => {
    expect(techoDeLaRampa([])).toBeNull()
  })
})

describe('medirElDia: la unidad la decide el medidor', () => {
  const dia: DiaDeVenta = { fecha: '2026-08-17', compras: 16, unidades: 28 }

  it('ventas-dia mide compras y unidades-dia mide fundas', () => {
    expect(medirElDia(meta({ key: 'a', objetivo: 100, medidor: 'ventas-dia' }), dia).valor).toBe(16)
    expect(medirElDia(meta({ key: 'b', objetivo: 100, medidor: 'unidades-dia' }), dia).valor).toBe(28)
  })

  /**
   * 🔑 `null` **con motivo**, nunca cero: un `$0/día` afirma «no deja nada», y lo que pasa es que
   * la contribución sale del dashboard y por esta pantalla no pasa. Es la regla de `medirMeta`.
   */
  it('los medidores de plata devuelven null y dicen por qué', () => {
    const m = medirElDia(meta({ key: 'c', objetivo: 100, medidor: 'contrib-dia' }), dia)
    expect(m.valor).toBeNull()
    expect(m.motivo).toMatch(/dashboard/)
  })

  it('un día que no está en los datos tampoco es cero', () => {
    const m = medirElDia(meta({ key: 'd', objetivo: 100 }), null)
    expect(m.valor).toBeNull()
    expect(m.motivo).toBeTruthy()
  })
})


describe('resumenPorCanal: cómo viene la venta en general', () => {
  // Mediodía local del 18-ago: `cortesDeVentas` recorta desde ahí hacia atrás conservando la hora.
  const AHORA = new Date('2026-08-18T12:00:00')
  const ventas = [
    venta(1, '2026-08-18', 'Tienda Nube'),
    venta(2, '2026-08-17', 'Tienda Nube'),
    venta(3, '2026-08-18', 'Mi Local'),
    venta(4, '2026-08-18', 'Mayorista'),
    venta(5, '2026-08-18', 'Ninguno'),
  ]
  const detalles = [renglon(1, 2), renglon(2, 3), renglon(3, 1), renglon(4, 500), renglon(5, 9)]

  it('parte los tres canales, en compras y en unidades', () => {
    expect(resumenPorCanal(ventas, detalles, AHORA, 30)).toEqual([
      { canal: 'online', compras: 2, unidades: 5 },
      { canal: 'local', compras: 1, unidades: 1 },
      { canal: 'mayorista', compras: 1, unidades: 500 },
    ])
  })

  /**
   * 🔴 **La ventana la decide `cortesDeVentas`, la MISMA del ETL** — no un `hoy - N` propio. Es lo
   * que hace que estos números y el `sales30` del ranking de al lado signifiquen los mismos 30
   * días: la primera versión recortaba por su cuenta y quedaba desfasada un día.
   */
  it('7 días recorta lo que 30 incluye, con el corte del ETL', () => {
    const viejas = [venta(9, '2026-08-01', 'Tienda Nube')]
    const r7 = resumenPorCanal([...ventas, ...viejas], [...detalles, renglon(9, 7)], AHORA, 7)
    const r30 = resumenPorCanal([...ventas, ...viejas], [...detalles, renglon(9, 7)], AHORA, 30)
    expect(r7.find((c) => c.canal === 'online')).toEqual({ canal: 'online', compras: 2, unidades: 5 })
    expect(r30.find((c) => c.canal === 'online')).toEqual({ canal: 'online', compras: 3, unidades: 12 })
  })

  /**
   * 🔑 **Los tres canales NO suman el total de la marca, y es a propósito.** El canal vacío cae en
   * `tecnica` por `canalDe` —sesión de fotos, fallas— y ésas no son venta. Si algún día el resumen
   * pretende ser el total, esta línea es la que hay que mirar antes.
   */
  it('la venta técnica queda afuera de los tres', () => {
    const total = resumenPorCanal(ventas, detalles, AHORA, 30).reduce((a, c) => a + c.unidades, 0)
    expect(total).toBe(506)
    expect(serieDiaria(ventas, detalles, null, '2026-08-18', 2).reduce((a, d) => a + d.unidades, 0)).toBe(515)
  })


})

const prod = (id: string, s7: number, s30: number): Producto =>
  ({ id, name: `P${id}`, sku: null, sales7: s7, sales30: s30, stock: 10, lifespan: 5 }) as unknown as Producto

describe('losQueMasSalieron', () => {
  const ps = [prod('a', 1, 50), prod('b', 9, 10), prod('c', 0, 0), prod('d', 4, 30)]

  it('ordena por la ventana pedida, y las dos ventanas ordenan distinto', () => {
    expect(losQueMasSalieron(ps, 30).map((p) => p.id)).toEqual(['a', 'd', 'b'])
    expect(losQueMasSalieron(ps, 7).map((p) => p.id)).toEqual(['b', 'd', 'a'])
  })

  it('el que no vendió nada no entra: un ranking con ceros no es un ranking', () => {
    expect(losQueMasSalieron(ps, 30).map((p) => p.id)).not.toContain('c')
  })

  it('corta en los primeros', () => {
    expect(losQueMasSalieron(ps, 30, 2).map((p) => p.id)).toEqual(['a', 'd'])
  })

  it('no reordena el array que le pasan', () => {
    const original = ps.map((p) => p.id)
    losQueMasSalieron(ps, 7)
    expect(ps.map((p) => p.id)).toEqual(original)
  })
})

/**
 * 🔴 **Zattia no vende fundas.** El catálogo de `MEDIDORES` está escrito en BDI («Fundas por día que
 * salen») porque nació con Norte, que es Dirección. Esta pantalla existe en las dos marcas.
 */
describe('unidadDeLaMeta: la unidad en la palabra de la marca', () => {
  it('el medidor de unidades habla de lo que vende cada marca', () => {
    expect(unidadDeLaMeta('unidades-dia', 'fundas')).toBe('fundas/día')
    expect(unidadDeLaMeta('unidades-dia', 'prendas')).toBe('prendas/día')
  })

  // Una compra es una compra, venda fundas o prendas: acá NO se traduce.
  it('el medidor de compras dice lo mismo en las dos', () => {
    expect(unidadDeLaMeta('ventas-dia', 'fundas')).toBe(unidadDeLaMeta('ventas-dia', 'prendas'))
    expect(unidadDeLaMeta('ventas-dia', 'prendas')).toBe('ventas/día')
  })

  /**
   * ⚠️ **Límite conocido, escrito para que se vea**: los medidores de plata siguen diciendo la
   * palabra del catálogo (`$/funda`). Hoy no se ve —son de Dirección y Zattia no tiene ninguna meta
   * cargada— y traducirlos pediría tocar `MEDIDORES`, que es lo que Norte **escribe en la base**
   * como espejo de la fila. El día que Zattia tenga una meta de plata, esta línea es la que avisa.
   */
  it('un medidor de plata sigue diciendo lo del catálogo — límite conocido', () => {
    expect(unidadDeLaMeta('contrib-unidad', 'prendas')).toBe('$/funda')
  })
})
