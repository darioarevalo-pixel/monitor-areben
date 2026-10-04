import { describe, expect, it } from 'vitest'
import { avisoDeRenglon, claveSku, estaSinArmar, indicePorSku, pedidosSinArmar } from '@/lib/caja/pedidos-web.core.js'

/**
 * Caja v2 · W1: los pedidos web sin armar (4-oct-2026). Órdenes REALES de Zattia leídas de
 * tiendanube-audit el 4-oct (recortadas, sin cliente ni dirección): una por cada estado que
 * tiene que quedar afuera, y la #7153 (VESTIDO AIXA Rojo), que ese día estaba por empaquetar
 * con 1 sola libre en el Local.
 */
const O = {
  "sinArmar": {
    "number": 7153,
    "fecha": "2026-10-03T21:05:48+0000",
    "pagado_en": "2026-10-03T21:05:48+0000",
    "estado_pago": "paid",
    "estado_orden": "open",
    "envio_estado": "unpacked",
    "envio_tipo": "ship",
    "envio": "Envío Cadeteria Rosario y alrededores",
    "cancelada": false,
    "products": [
      {
        "product_id": 307778851,
        "variant_id": 1367859876,
        "name": "VESTIDO AIXA (Rojo)",
        "sku": "RVE-0022-RO",
        "quantity": 1
      }
    ]
  },
  "empaquetada": {
    "number": 7149,
    "fecha": "2026-10-03T16:12:16+0000",
    "pagado_en": "2026-10-03T16:12:18+0000",
    "estado_pago": "paid",
    "estado_orden": "open",
    "envio_estado": "unshipped",
    "envio_tipo": "ship",
    "envio": "Envío Nube - Correo Argentino Clásico a domicilio",
    "cancelada": false,
    "products": [
      {
        "product_id": 329713943,
        "variant_id": 1467273216,
        "name": "SWEATER DAKOTA (VERDE MILITAR)",
        "sku": "RSW-0026-VEM",
        "quantity": 1
      }
    ]
  },
  "cerrada": {
    "number": 7154,
    "fecha": "2026-10-03T21:39:25+0000",
    "pagado_en": "2026-10-03T21:41:37+0000",
    "estado_pago": "paid",
    "estado_orden": "closed",
    "envio_estado": "delivered",
    "envio_tipo": "pickup",
    "envio": "Zattia Store",
    "cancelada": false,
    "products": [
      {
        "product_id": 368521393,
        "variant_id": 1600484300,
        "name": "TOP AZURI (CHOCOLATE)",
        "sku": "RTO-0409-CT",
        "quantity": 1
      }
    ]
  },
  "cancelada": {
    "number": 7126,
    "fecha": "2026-10-01T18:14:41+0000",
    "pagado_en": "2026-10-03T14:27:42+0000",
    "estado_pago": "paid",
    "estado_orden": "cancelled",
    "envio_estado": "unpacked",
    "envio_tipo": "pickup",
    "envio": "Zattia Store",
    "cancelada": true,
    "products": [
      {
        "product_id": 317351598,
        "variant_id": 1405842824,
        "name": "CORPIÑO GAIA - FUCSIA (S)",
        "sku": "BKC-0005-FC-S",
        "quantity": 1
      },
      {
        "product_id": 309021223,
        "variant_id": 1373604136,
        "name": "BOMBACHA AYLA - FUCSIA (S)",
        "sku": "BKB-0001-FC-S",
        "quantity": 1
      }
    ]
  },
  "pendientePago": {
    "number": 7158,
    "fecha": "2026-10-04T01:34:15+0000",
    "pagado_en": null,
    "estado_pago": "pending",
    "estado_orden": "open",
    "envio_estado": "unpacked",
    "envio_tipo": "pickup",
    "envio": "Punto de retiro",
    "cancelada": false,
    "products": [
      {
        "product_id": 312479294,
        "variant_id": 1386135517,
        "name": "CORPIÑO NYA - NEGRO (S)",
        "sku": "BKC-0003-NG-S",
        "quantity": 1
      },
      {
        "product_id": 312479380,
        "variant_id": 1386136076,
        "name": "BOMBACHA NYA - NEGRA (S)",
        "sku": "BKB-0003-NG-S",
        "quantity": 1
      }
    ]
  },
  "conSinSku": {
    "number": 6966,
    "fecha": "2026-09-28T00:36:10+0000",
    "pagado_en": null,
    "estado_pago": "paid",
    "estado_orden": "open",
    "envio_estado": "unshipped",
    "envio_tipo": "pickup",
    "envio": "Zattia Store",
    "cancelada": false,
    "products": [
      {
        "product_id": 328289042,
        "variant_id": 1460272045,
        "name": "TOP FREYA (NEGRO)",
        "sku": "RTO-0147-NG",
        "quantity": 1
      },
      {
        "product_id": 326012825,
        "variant_id": 1449312517,
        "name": "BOMBACHA AYLA - CHAMPAGNE (L)",
        "sku": "",
        "quantity": 1
      },
      {
        "product_id": 326012635,
        "variant_id": 1449311961,
        "name": "CORPIÑO AYLA - CHAMPAGNE (M)",
        "sku": "",
        "quantity": 1
      }
    ]
  },
  "vieja": {
    "number": 6984,
    "fecha": "2026-09-28T02:45:00+0000",
    "pagado_en": null,
    "estado_pago": "paid",
    "estado_orden": "open",
    "envio_estado": "unpacked",
    "envio_tipo": "ship",
    "envio": "Envío Cadeteria Rosario y alrededores",
    "cancelada": false,
    "products": [
      {
        "product_id": 328289065,
        "variant_id": 1460272163,
        "name": "TOP MOVE (BLANCO)",
        "sku": "RTO-0149-BL",
        "quantity": 1
      },
      {
        "product_id": 368521353,
        "variant_id": 1600484159,
        "name": "SHORT SOLEIL (38)",
        "sku": "RSH-0108-38",
        "quantity": 1
      },
      {
        "product_id": 336741716,
        "variant_id": 1497121445,
        "name": "JEAN WORN (38)",
        "sku": "RJE-0016-38",
        "quantity": 1
      },
      {
        "product_id": 368521382,
        "variant_id": 1600484284,
        "name": "TOP ORBIT (NEGRO)",
        "sku": "RTO-0405-NG",
        "quantity": 1
      }
    ]
  }
} as const

const AHORA = Date.parse('2026-10-04T15:00:00Z')
const todas = Object.values(O) as unknown as Parameters<typeof pedidosSinArmar>[0]

describe('caja · pedidos web sin armar', () => {
  it('sin armar = pagada, ⛔ cancelada y POR EMPAQUETAR (`unpacked`)', () => {
    expect(estaSinArmar(O.sinArmar)).toBe(true)
    expect(estaSinArmar(O.vieja)).toBe(true)
  })

  it('🔴 la EMPAQUETADA que espera retiro (abierta, `unshipped`) ⛔ cuenta: su prenda ya ⛔ está en la percha', () => {
    expect(O.empaquetada.estado_orden).toBe('open')
    expect(estaSinArmar(O.empaquetada)).toBe(false)
  })

  it('⛔ cerrada, ⛔ cancelada, ⛔ sin pagar', () => {
    expect(estaSinArmar(O.cerrada)).toBe(false)
    expect(estaSinArmar(O.cancelada)).toBe(false)
    expect(estaSinArmar(O.pendientePago)).toBe(false)
  })

  it('del más viejo al más nuevo, con las horas desde que se pagó', () => {
    const p = pedidosSinArmar(todas, AHORA)
    expect(p.map((x) => x.numero)).toEqual([6984, 7153])
    const aixa = p.find((x) => x.numero === 7153)!
    expect(aixa.horas).toBe(Math.floor((AHORA - Date.parse(O.sinArmar.pagado_en!)) / 3_600_000))
    expect(aixa.prendas).toEqual([expect.objectContaining({ sku: 'RVE-0022-RO', cantidad: 1 })])
  })

  it('las líneas sin SKU se CUENTAN (⛔ se esconden) y ⛔ entran al índice', () => {
    // La #6966 real ya estaba empaquetada: se la pone por empaquetar para tener líneas sin SKU.
    const p = pedidosSinArmar([{ ...O.conSinSku, envio_estado: 'unpacked' }] as never, AHORA)
    expect(p.find((x) => x.numero === 6966)!.sinSku).toBe(2)
    expect(Object.keys(indicePorSku(p))).not.toContain('')
  })

  it('el índice junta por SKU y suma la cantidad del mismo pedido', () => {
    const por = indicePorSku([
      { numero: 1, prendas: [{ sku: 'A-1', cantidad: 1 }, { sku: 'A-1', cantidad: 2 }] },
      { numero: 2, prendas: [{ sku: 'A-1', cantidad: 1 }] },
    ] as never)
    expect(por['A-1']).toEqual([{ numero: 1, cantidad: 3 }, { numero: 2, cantidad: 1 }])
  })

  it('sin la hora de ahora ⛔ calcula (⛔ Date.now() adentro)', () => {
    expect(() => pedidosSinArmar(todas, undefined as never)).toThrow(/ahoraMs/)
  })
})

describe('caja · el aviso del renglón', () => {
  const porSku = indicePorSku(pedidosSinArmar(todas, AHORA))

  it('el AIXA Rojo con 1 libre en el Local: está separada, lo libre alcanza', () => {
    const a = avisoDeRenglon({ sku: 'RVE-0022-RO', local: 1, enCarrito: 1, porSku })
    expect(a?.tipo).toBe('separada')
    expect(a?.texto).toMatch(/#7153/)
  })

  it('🔴 con 0 libres en el Local la de la percha ES la del pedido: el pedido queda sin stock', () => {
    const a = avisoDeRenglon({ sku: 'RVE-0022-RO', local: 0, enCarrito: 1, porSku })
    expect(a?.tipo).toBe('sin_stock')
    expect(a?.texto).toMatch(/#7153.*queda sin stock/)
  })

  it('cuenta las del carrito: la 2ª unidad de la misma prenda ya ⛔ alcanza', () => {
    expect(avisoDeRenglon({ sku: 'RVE-0022-RO', local: 1, enCarrito: 2, porSku })?.tipo).toBe('sin_stock')
  })

  it('el SKU se compara sin mayúsculas ni espacios', () => {
    expect(claveSku('  rve-0022-ro ')).toBe('RVE-0022-RO')
    expect(avisoDeRenglon({ sku: ' rve-0022-ro', local: 3, enCarrito: 1, porSku })?.tipo).toBe('separada')
  })

  it('una prenda en ningún pedido, o sin SKU ⇒ sin aviso', () => {
    expect(avisoDeRenglon({ sku: 'RVE-0022-NG', local: 0, enCarrito: 1, porSku })).toBeNull()
    expect(avisoDeRenglon({ sku: '', local: 0, enCarrito: 1, porSku })).toBeNull()
  })

  it('sin el stock o el carrito ⛔ adivina', () => {
    expect(() => avisoDeRenglon({ sku: 'RVE-0022-RO', local: null, enCarrito: 1, porSku } as never)).toThrow()
  })
})
