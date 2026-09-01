/**
 * Canjes — la venta del canje que se ENVÍA, escrita directo en Gestión Nube (1-sep-2026).
 *
 * Cuatro cosas que, si se rompen, cuestan stock o plata y no se ven hasta que es tarde:
 *
 *  - **`resolverLineas` no puede mandar a GN un id de Tienda Nube.** Es el defecto más caro del
 *    módulo: lo que la creadora elige por su link viene con ids de TN (medido: 45 de 45), y si uno
 *    se colara, GN descontaría el stock de **otro producto** sin que nada falle.
 *  - **`listoParaVenderEnGn`**, que es la única guarda antes de crear una venta que **no se puede
 *    anular por API**. Su caso más caro es el canje que ya tiene venta: sin ese chequeo, dos toques
 *    son dos ventas y dos veces el stock descontado.
 *  - **el espejo TS↔JS**, porque el botón lo decide la pantalla y el handler lo revalida. Divergen
 *    ⇒ la pantalla ofrece crear algo que el servidor rechaza, o peor, al revés.
 *  - **la nota**, que es lo ÚNICO que en Gestión Nube dice de quién era el canje: todas las ventas
 *    se atribuyen al mismo cliente. Y la escribe una implementación compartida justamente para que
 *    la pantalla no prometa una nota distinta de la que se guarda.
 */
import { describe, it, expect } from 'vitest'
import { listoParaVenderEnGn, ventaGnDisponible, type CanjeItem, type CanjeRow } from '@/lib/canjes/tipos'
// El espejo del handler. Si diverge, el botón dice una cosa y el servidor hace otra.
import { noSePuedeVenderEnGn, ventaGnDisponible as ventaGnDisponibleJS } from '@/lib/canjes/reglas.core.js'
import { notaVentaCanje } from '@/lib/canjes/nota-gn.core.js'
import { DEPOSITO_GN, resolverLineas, type FilaInventarioGn } from '@/lib/canjes/venta-gn'
import { canalDe } from '@/lib/liquidacion/canal.core.js'

function canje(p: Partial<CanjeRow> = {}): CanjeRow {
  return {
    id: 79, persona_id: 7, store: 'bdi', tipo: 'producto', estado: 'acuerdo',
    retiro_local: false, entregado_at: null,
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
    id: 1, canje_id: 79, cantidad: 1, product_id: '1051816', size_id: '195414',
    sku: 'F-0214-17P', nombre: 'STELLAR CASE', variante: 'iPhone 17 Pro',
    costo_unit: null, pvp_unit: 1490,
    origen: 'equipo', estado: 'confirmado', created_at: '2026-08-01T00:00:00.000Z',
    ...p,
  } as CanjeItem
}

/** El inventario de GN como lo devuelve el espejo: una fila por producto × talle × ubicación. */
function inv(p: Partial<FilaInventarioGn> = {}): FilaInventarioGn {
  return {
    product_id: 1051816, size_id: 195414, sku: 'F-0214-17P',
    store_name: DEPOSITO_GN, available_quantity: 18,
    ...p,
  }
}

describe('resolverLineas — de qué sistema es cada id', () => {
  it('🔴 NO usa el product_id del ítem si no existe en el inventario de Gestión Nube', () => {
    // El caso real: lo que elige la creadora trae el id de la VARIANTE DE TIENDA NUBE.
    const elegido = item({ origen: 'persona', product_id: '359143921', size_id: '1514905775' })
    const { lineas, problemas } = resolverLineas([elegido], [inv()], { 1051816: 14990 })

    expect(problemas).toEqual([])
    expect(lineas).toHaveLength(1)
    // Lo que se manda a GN es el artículo de GN, NO el de Tienda Nube.
    expect(lineas[0].product_id).toBe('1051816')
    expect(lineas[0].size_id).toBe('195414')
    expect(lineas[0].via).toBe('sku')
  })

  it('usa el artículo del ítem cuando SÍ existe en Gestión Nube, sin pasar por el SKU', () => {
    const { lineas } = resolverLineas([item()], [inv()], {})
    expect(lineas[0].via).toBe('articulo')
    expect(lineas[0].product_id).toBe('1051816')
  })

  it('🔴 un SKU que da dos artículos distintos NO se resuelve solo: elegir uno sería descontarle a cualquiera', () => {
    const elegido = item({ origen: 'persona', product_id: '359143921', size_id: '99' })
    const { lineas, problemas } = resolverLineas(
      [elegido],
      [inv(), inv({ product_id: 777777, size_id: 12345 })],
      {},
    )
    expect(lineas).toEqual([])
    expect(problemas).toHaveLength(1)
    expect(problemas[0].motivo).toContain('2 artículos distintos')
  })

  it('un SKU que no existe en GN se informa como problema, no se saltea', () => {
    const elegido = item({ origen: 'persona', product_id: '359143921', size_id: '99', sku: 'NO-EXISTE' })
    const { lineas, problemas } = resolverLineas([elegido], [inv()], {})
    expect(lineas).toEqual([])
    expect(problemas[0].motivo).toContain('no existe en Gestión Nube')
  })

  it('un ítem sin SKU ni artículo de GN dice qué hacer, en vez de desaparecer', () => {
    const suelto = item({ origen: 'equipo', product_id: null, size_id: null, sku: null })
    const { lineas, problemas } = resolverLineas([suelto], [inv()], {})
    expect(lineas).toEqual([])
    expect(problemas[0].motivo).toContain('buscador')
  })

  it('el SKU matchea sin importar mayúsculas ni espacios de más', () => {
    const elegido = item({ origen: 'persona', product_id: '359143921', size_id: '99', sku: ' f-0214-17p ' })
    const { lineas } = resolverLineas([elegido], [inv()], {})
    expect(lineas).toHaveLength(1)
    expect(lineas[0].product_id).toBe('1051816')
  })
})

describe('resolverLineas — con qué precio se valúa', () => {
  it('🔴 manda el precio de Gestión Nube, no el del canje (hoy la vitrina activa está 10x abajo)', () => {
    // Medido el 1-sep-2026: la vitrina "Girlhood Collection" tiene sus 19 ítems a $1.490 y esas
    // fundas valen $14.990 en GN. La venta se valúa para saber cuánto costó lo regalado: con el
    // número de la vitrina, esa valuación no sirve.
    const { lineas } = resolverLineas([item({ pvp_unit: 1490 })], [inv()], { 1051816: 14990 })
    expect(lineas[0].unit_price).toBe(14990)
    expect(lineas[0].precio_de).toBe('gn')
  })

  it('si GN no tiene precio, cae al del canje y lo dice', () => {
    const { lineas } = resolverLineas([item({ pvp_unit: 12990 })], [inv()], { 1051816: null })
    expect(lineas[0].unit_price).toBe(12990)
    expect(lineas[0].precio_de).toBe('canje')
  })
})

describe('resolverLineas — el stock que se muestra', () => {
  it('cuenta el del depósito del que sale, no el del local', () => {
    const { lineas } = resolverLineas(
      [item()],
      [inv({ available_quantity: 18 }), inv({ store_name: 'Local', available_quantity: 3 })],
      {},
    )
    expect(lineas[0].stock_deposito).toBe(18)
  })

  it('sin fila del depósito el stock es null (desconocido), no 0 (no hay)', () => {
    // El cero afirma: diría "no hay" cuando lo que pasa es que no sabemos.
    const { lineas } = resolverLineas([item()], [inv({ store_name: 'Local' })], {})
    expect(lineas[0].stock_deposito).toBeNull()
  })
})

describe('listoParaVenderEnGn — la guarda de lo irreversible', () => {
  const items = [item()]

  it('deja crear la venta de un canje acordado, con envío y con productos', () => {
    expect(listoParaVenderEnGn(canje(), items).ok).toBe(true)
  })

  it('🔴 NO deja crear una segunda venta: GN no anula por API y el stock bajaría dos veces', () => {
    const r = listoParaVenderEnGn(canje({ gn_venta_number: '30596' }), items)
    expect(r.ok).toBe(false)
    expect(r.motivo).toContain('30596')
    // También por id solo: puede quedar guardado uno y no el otro.
    expect(listoParaVenderEnGn(canje({ gn_venta_id: 1428579 }), items).ok).toBe(false)
  })

  it('no deja crearla si la compra ya figura hecha (la orden se cargó por Tienda Nube)', () => {
    expect(listoParaVenderEnGn(canje({ compra_estado: 'hecho' }), items).ok).toBe(false)
  })

  it('el canje de retiro en el local va por el otro camino, y lo dice', () => {
    const r = listoParaVenderEnGn(canje({ retiro_local: true }), items)
    expect(r.ok).toBe(false)
    expect(r.motivo).toContain('mostrador')
  })

  it('antes del acuerdo no hay nada que despachar', () => {
    expect(listoParaVenderEnGn(canje({ estado: 'propuesta' }), items).ok).toBe(false)
    expect(listoParaVenderEnGn(canje({ estado: 'enviada' }), items).ok).toBe(false)
    expect(listoParaVenderEnGn(canje({ estado: 'preparando' }), items).ok).toBe(true)
  })

  it('sin productos vivos no hay venta (los quitados y los sin stock no cuentan)', () => {
    expect(listoParaVenderEnGn(canje(), []).ok).toBe(false)
    expect(listoParaVenderEnGn(canje(), [item({ estado: 'quitado' })]).ok).toBe(false)
  })

  it('respeta el tope del acuerdo', () => {
    const cuatro = [item({ id: 1, cantidad: 4 })]
    expect(listoParaVenderEnGn(canje(), cuatro).ok).toBe(false)
  })

  it('sólo BDI: las otras marcas no tienen cliente ni ubicaciones configuradas en GN', () => {
    expect(ventaGnDisponible('bdi')).toBe(true)
    expect(ventaGnDisponible('zattia')).toBe(false)
    expect(listoParaVenderEnGn(canje({ store: 'zattia' }), items).ok).toBe(false)
  })

  it('espejo TS↔JS: el handler y la pantalla contestan lo mismo', () => {
    expect(ventaGnDisponibleJS('bdi')).toBe(ventaGnDisponible('bdi'))
    for (const c of [canje(), canje({ gn_venta_number: '30596' }), canje({ retiro_local: true }), canje({ estado: 'propuesta' })]) {
      expect(noSePuedeVenderEnGn(c, items)).toBe(listoParaVenderEnGn(c, items).motivo)
    }
  })
})

describe('la nota de la venta', () => {
  it('lleva el número del canje y el nombre de la persona, que es lo que pidió Bruno', () => {
    expect(notaVentaCanje({ numero: 'C-0079', quien: 'Sofía Pérez', modo: 'envio' }))
      .toBe('Canje C-0079 — Sofía Pérez — envío (Monitor)')
  })

  it('distingue el envío del retiro en el local', () => {
    expect(notaVentaCanje({ numero: 'C-0079', quien: 'Sofía Pérez', modo: 'local' }))
      .toBe('Canje C-0079 — Sofía Pérez — retiro en el local (Monitor)')
  })

  it('un nombre vacío se dice, no deja un hueco que se lee como error del sistema', () => {
    expect(notaVentaCanje({ numero: 'C-0079', quien: null, modo: 'envio' }))
      .toBe('Canje C-0079 — sin nombre — envío (Monitor)')
  })

  it('un nombre con un enter no puede partir la nota', () => {
    expect(notaVentaCanje({ numero: 'C-0079', quien: 'Sofía\n  Pérez', modo: 'envio' }))
      .toBe('Canje C-0079 — Sofía Pérez — envío (Monitor)')
  })

  it('🔴 el número del canje sobrevive a un nombre absurdo: con él se llega a la ficha', () => {
    const nota = notaVentaCanje({ numero: 'C-0079', quien: 'x'.repeat(500), modo: 'envio' })
    expect(nota.startsWith('Canje C-0079 — ')).toBe(true)
    expect(nota.length).toBeLessThan(150)
  })
})

describe('el canal de la venta del canje', () => {
  it('🔴 "Influencer" —el canal REAL de los canjes— NO cuenta como minorista', () => {
    // Es el canal 15 de Gestión Nube (`CANJE_CHANNEL`). Sin esta clasificación, cada canje entra al
    // precio promedio minorista como una venta de $0 y lo hunde. El caso que lo hace caro: son
    // ventas reales para el ETL (cuentan en rotación y CRM, que es lo que Bruno quiso) pero no son
    // plata — las dos cosas a la vez.
    expect(canalDe('Influencer')).toBe('tecnica')
    expect(canalDe('influencer')).toBe('tecnica')
  })

  it('y también el canal propio "Canjes", para cuando GN lo habilite en el selector', () => {
    expect(canalDe('Canje')).toBe('tecnica')
    expect(canalDe('Canjes')).toBe('tecnica')
  })

  it('el 12 "Ninguno" —lo que se usaba antes— sigue cayendo en técnica', () => {
    expect(canalDe('Ninguno')).toBe('tecnica')
  })

  it('y no se lleva puesto a ningún otro canal', () => {
    expect(canalDe('Tienda Nube')).toBe('online')
    expect(canalDe('Mi Local')).toBe('local')
    expect(canalDe('Mayorista')).toBe('mayorista')
    expect(canalDe('Mercadolibre')).toBe('otro')
  })
})
