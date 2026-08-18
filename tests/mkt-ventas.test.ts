import { describe, it, expect } from 'vitest'
import { escalonVigente, medirElDia, serieDiaria, techoDeLaRampa, type DiaDeVenta } from '@/lib/mkt-ventas/core'
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
