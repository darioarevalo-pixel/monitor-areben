import { describe, it, expect } from 'vitest'
import { diaDe, firmaItems, indexarMapeo, mapearLineas, planificar } from '../lib/sync-tn/core'
import type { ConfigSync, LedgerRow, OrdenTN, VentaGN } from '../lib/sync-tn/tipos'
import type { SkuMapRow } from '../lib/sku-map/tipos'

/**
 * El motor que decide qué ventas de Tienda Nube se importan a Gestión Nube. Lo que se prueba acá
 * es lo que cuesta caro si falla: **GN no anula ventas por API**, así que una orden que no debía
 * pasar y pasa se convierte en una venta duplicada que hay que ir a borrar a mano en la web de GN.
 * Por eso hay un caso por cada motivo de exclusión y dos de precedencia entre ellos.
 */

const CFG: ConfigSync = { corte: '2026-08-01', soloPagas: true, toleranciaDias: 1 }

const MAPA: SkuMapRow[] = [
  { store: 'stunned', sku: 'STU-REM-0001-S', gn_product_id: '913532', gn_variant_id: '76576', validado: true },
  { store: 'stunned', sku: 'STU-BUZ-0003-L', gn_product_id: '913526', gn_variant_id: '76629', validado: true },
  { store: 'stunned', sku: 'STU-SIN-VALIDAR', gn_product_id: '1', gn_variant_id: '2', validado: false },
]

function orden(over: Partial<OrdenTN> = {}): OrdenTN {
  return {
    id: 900,
    number: 1001,
    cliente: 'Ana',
    total: 42500,
    fecha: '2026-08-05T14:00:00-03:00',
    estado_pago: 'paid',
    estado_orden: 'closed',
    products: [{ product_id: 33, variant_id: 44, sku: 'STU-REM-0001-S', name: 'REMERA', quantity: 1, price: 42500 }],
    ...over,
  }
}

const planDe = (o: OrdenTN[], extra: { ventasGn?: VentaGN[]; procesados?: LedgerRow[]; cfg?: Partial<ConfigSync> } = {}) =>
  planificar({
    ordenes: o,
    ventasGn: extra.ventasGn || [],
    mapa: MAPA,
    procesados: extra.procesados || [],
    cfg: { ...CFG, ...(extra.cfg || {}) },
  })

describe('helpers', () => {
  it('diaDe recorta el día sin construir un Date (el offset ya viene de TN)', () => {
    expect(diaDe('2026-08-05T23:40:00-03:00')).toBe('2026-08-05')
    expect(diaDe(null)).toBe('')
  })

  it('firmaItems es estable ante el reordenamiento de los renglones', () => {
    const a = firmaItems([
      { producto: '1', variante: '10', cantidad: 2 },
      { producto: '2', variante: '20', cantidad: 1 },
    ])
    const b = firmaItems([
      { producto: '2', variante: '20', cantidad: 1 },
      { producto: '1', variante: '10', cantidad: 2 },
    ])
    expect(a).toBe(b)
  })

  it('firmaItems compara ids como texto: GN los manda number y TN string', () => {
    expect(firmaItems([{ producto: 1, variante: 10, cantidad: 2 }])).toBe(
      firmaItems([{ producto: '1', variante: '10', cantidad: 2 }]),
    )
  })

  it('indexarMapeo deja afuera lo no validado y lo que no tiene los dos ids de GN', () => {
    const i = indexarMapeo([...MAPA, { store: 'stunned', sku: 'STU-X', gn_product_id: '9', validado: true }])
    expect(i.size).toBe(2)
    expect(i.has('stu-sin-validar')).toBe(false)
    expect(i.has('stu-x')).toBe(false)
  })

  it('mapearLineas traduce el SKU de TN a product_id + size_id de GN', () => {
    const { lineas, faltantes } = mapearLineas(orden(), indexarMapeo(MAPA))
    expect(faltantes).toEqual([])
    expect(lineas).toEqual([
      { sku: 'STU-REM-0001-S', nombre: 'REMERA', gn_product_id: '913532', gn_variant_id: '76576', quantity: 1, unit_price: 42500 },
    ])
  })
})

describe('descuentoDe — se deduce, no se copia de TN', () => {
  it('sin descuento da 0', () => {
    expect(planDe([orden()]).crear[0].descuento).toBe(0)
  })

  it('lo que la persona pagó de menos por los productos es el descuento', () => {
    // Lista 42.500 · pagó 40.000 de productos + 3.000 de envío ⇒ descuento 2.500.
    const p = planDe([orden({ total: 43000, envio_costo_cliente: 3000 })])
    expect(p.crear[0].descuento).toBe(2500)
  })

  it('nunca es negativo: un total mayor que la lista no inventa un recargo', () => {
    expect(planDe([orden({ total: 50000 })]).crear[0].descuento).toBe(0)
  })

  it('sin total de TN no inventa un descuento', () => {
    expect(planDe([orden({ total: null })]).crear[0].descuento).toBe(0)
  })
})

describe('planificar — el camino feliz', () => {
  it('una orden paga, mapeada y posterior al corte se crea', () => {
    const p = planDe([orden()])
    expect(p.cola).toEqual([])
    expect(p.crear).toHaveLength(1)
    expect(p.crear[0].unidades).toBe(1)
    expect(p.crear[0].lineas[0].gn_product_id).toBe('913532')
    expect(p.resumen).toMatchObject({ ordenes: 1, a_crear: 1, unidades: 1, con_advertencia: 0 })
  })
})

describe('planificar — motivos de exclusión', () => {
  it('anterior al corte', () => {
    const p = planDe([orden({ fecha: '2026-07-31T23:59:00-03:00' })])
    expect(p.crear).toHaveLength(0)
    expect(p.cola[0].motivo).toBe('anterior_al_corte')
  })

  it('sin fecha de corte definida no se propone NADA (posición segura)', () => {
    const p = planDe([orden()], { cfg: { corte: '' } })
    expect(p.crear).toHaveLength(0)
    expect(p.cola[0].motivo).toBe('anterior_al_corte')
    expect(p.cola[0].detalle).toMatch(/corte/i)
  })

  it('ya importada según el ledger', () => {
    const p = planDe([orden()], {
      procesados: [{ store: 'stunned', fuente: 'tn', tipo: 'venta', ref_id: '1001', detalle: { estado: 'ok' } }],
    })
    expect(p.crear).toHaveLength(0)
    expect(p.cola[0].motivo).toBe('ya_importada')
  })

  it('el ledger en dudoso o enviando la manda a revisión, no a crear', () => {
    for (const estado of ['dudoso', 'enviando'] as const) {
      const p = planDe([orden()], {
        procesados: [{ store: 'stunned', fuente: 'tn', tipo: 'venta', ref_id: '1001', detalle: { estado } }],
      })
      expect(p.crear).toHaveLength(0)
      expect(p.cola[0].motivo).toBe('en_revision')
    }
  })

  it('ya en GN por tn_order, aunque el ledger esté vacío', () => {
    const ventasGn: VentaGN[] = [{ id: 5, tn_order: '1001', date_sale: '2026-08-05', detalles: [] }]
    const p = planDe([orden()], { ventasGn })
    expect(p.crear).toHaveLength(0)
    expect(p.cola[0].motivo).toBe('ya_en_gn')
  })

  it('una venta de GN anulada no cuenta como "ya en GN"', () => {
    const ventasGn: VentaGN[] = [{ id: 5, tn_order: '1001', active: false, date_sale: '2026-08-05', detalles: [] }]
    expect(planDe([orden()], { ventasGn }).crear).toHaveLength(1)
  })

  it('cancelada en TN', () => {
    const p = planDe([orden({ cancelada: true })])
    expect(p.crear).toHaveLength(0)
    expect(p.cola[0].motivo).toBe('cancelada')
  })

  it('sin pagar (con soloPagas)', () => {
    const p = planDe([orden({ estado_pago: 'pending' })])
    expect(p.cola[0].motivo).toBe('no_paga')
    expect(planDe([orden({ estado_pago: 'pending' })], { cfg: { soloPagas: false } }).crear).toHaveLength(1)
  })

  it('un solo SKU sin mapeo validado deja la orden ENTERA afuera', () => {
    const o = orden({
      products: [
        { product_id: 33, variant_id: 44, sku: 'STU-REM-0001-S', quantity: 1, price: 1 },
        { product_id: 55, variant_id: 66, sku: 'STU-SIN-VALIDAR', quantity: 1, price: 1 },
      ],
    })
    const p = planDe([o])
    expect(p.crear).toHaveLength(0)
    expect(p.cola[0].motivo).toBe('sku_sin_mapeo')
    expect(p.cola[0].detalle).toContain('STU-SIN-VALIDAR')
  })

  it('cantidad 0 o negativa: GN rechaza el renglón', () => {
    const p = planDe([orden({ products: [{ product_id: 33, variant_id: 44, sku: 'STU-REM-0001-S', quantity: 0, price: 1 }] })])
    expect(p.cola[0].motivo).toBe('cantidad_invalida')
  })
})

describe('planificar — precedencia entre motivos', () => {
  it('cancelada gana sobre falta de mapeo', () => {
    const o = orden({ cancelada: true, products: [{ product_id: 1, variant_id: 2, sku: 'STU-SIN-VALIDAR', quantity: 1, price: 1 }] })
    expect(planDe([o]).cola[0].motivo).toBe('cancelada')
  })

  it('el corte gana sobre todo lo demás: ni se evalúa el resto', () => {
    const o = orden({ fecha: '2026-07-01T10:00:00-03:00', cancelada: true, estado_pago: 'pending' })
    expect(planDe([o]).cola[0].motivo).toBe('anterior_al_corte')
  })

  it('el ledger gana sobre "cancelada": ya se escribió en GN, y GN no anula por API', () => {
    const p = planDe([orden({ cancelada: true })], {
      procesados: [{ store: 'stunned', fuente: 'tn', tipo: 'venta', ref_id: '1001', detalle: { estado: 'ok' } }],
    })
    expect(p.cola[0].motivo).toBe('ya_importada')
  })
})

describe('planificar — el duplicado cargado a mano', () => {
  const ventaManual = (over: Partial<VentaGN> = {}): VentaGN => ({
    id: 77,
    number: '27827',
    date_sale: '2026-08-05',
    channel: 'Mi Local',
    tn_order: null,
    detalles: [{ product_id: 913532, size_id: 76576, quantity: 1 }],
    ...over,
  })

  it('misma firma y misma fecha: se propone igual, pero con advertencia', () => {
    const p = planDe([orden()], { ventasGn: [ventaManual()] })
    expect(p.crear).toHaveLength(1)
    expect(p.crear[0].advertencias).toHaveLength(1)
    expect(p.crear[0].advertencias[0]).toMatchObject({ tipo: 'duplicado_manual', gn_venta_id: '77', canal: 'Mi Local' })
    expect(p.resumen.con_advertencia).toBe(1)
  })

  it('la misma firma 5 días después NO es sospecha: la tolerancia funciona', () => {
    const p = planDe([orden()], { ventasGn: [ventaManual({ date_sale: '2026-08-10' })] })
    expect(p.crear[0].advertencias).toEqual([])
  })

  it('otra cantidad no es la misma venta', () => {
    const p = planDe([orden()], { ventasGn: [ventaManual({ detalles: [{ product_id: 913532, size_id: 76576, quantity: 2 }] })] })
    expect(p.crear[0].advertencias).toEqual([])
  })

  it('una venta de GN anulada no dispara la sospecha', () => {
    const p = planDe([orden()], { ventasGn: [ventaManual({ archived: true })] })
    expect(p.crear[0].advertencias).toEqual([])
  })
})
