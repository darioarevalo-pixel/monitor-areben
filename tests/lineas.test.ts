/**
 * El núcleo de líneas (`lib/lineas.core.js`) y el filtro del ETL (`lib/etl/linea.ts`).
 *
 * Lo que estos tests defienden no es aritmética: es que la regla siga **escrita una sola vez**.
 * Antes del 22-ago-2026 «STU ⇒ Stunned» vivía en tres archivos haciendo tres cosas distintas, y «de
 * qué marca cuelga» en cinco, dos de ellas con modos de falla opuestos.
 */

import { describe, it, expect } from 'vitest'
import { baseDeLinea, esStunned, lineaDe, lineasDeMarca, LINEAS } from '@/lib/lineas'
import { esStunned as esStunnedMemo, lineaDe as lineaDeMemo } from '@/lib/memo/foto.core.js'
import { lineaDe as lineaDeConteo } from '@/lib/conteo-estandar/core'
import { marcaDePermisos, puedeVerAlguna } from '@/lib/permisos'
import { filtrarPorLinea } from '@/lib/etl/linea'
import type { PayloadCache } from '@/lib/cache'

describe('esStunned: el prefijo de SKU es la única señal', () => {
  it('reconoce STU en cualquier caja', () => {
    expect(esStunned('STU-001')).toBe(true)
    expect(esStunned('stu-001')).toBe(true)
  })

  it('🔴 un SKU ausente contesta que NO, y eso tiene precio', () => {
    // Medido el 22-ago-2026 en Zattia: 96 productos activos sin SKU, 47 de ellos con venta en la
    // ventana de 30 días ($3,1M). Todos se cuentan como Zattia. Hoy ninguno es de Stunned; el día
    // que carguen uno sin SKU, su plata cae en la línea de al lado sin que falle nada.
    expect(esStunned(null)).toBe(false)
    expect(esStunned(undefined)).toBe(false)
    expect(esStunned('')).toBe(false)
  })

  it('no confunde un SKU que sólo CONTIENE stu', () => {
    expect(esStunned('ZAT-STU-1')).toBe(false)
  })
})

describe('lineaDe: el store va primero y no es decorativo', () => {
  it('🔴 en BDI el prefijo STU no significa nada', () => {
    // Sin el store, una funda de BDI con SKU STU sería un producto de Stunned.
    expect(lineaDe('bdi', 'STU-1')).toBe('bdi')
    expect(lineaDe('zattia', 'STU-1')).toBe('stunned')
    expect(lineaDe('zattia', 'ZAT-1')).toBe('zattia')
  })
})

describe('baseDeLinea: nunca una marca por descarte', () => {
  it('traduce las tres líneas', () => {
    expect(baseDeLinea('bdi')).toBe('bdi')
    expect(baseDeLinea('zattia')).toBe('zattia')
    expect(baseDeLinea('stunned')).toBe('zattia')
  })

  it('🔴 lo desconocido devuelve null, no Zattia', () => {
    expect(baseDeLinea('loquesea')).toBe(null)
    expect(baseDeLinea('')).toBe(null)
    expect(baseDeLinea(undefined as unknown as string)).toBe(null)
  })

  it('Zattia trae a Stunned de la mano', () => {
    expect(lineasDeMarca('zattia')).toEqual(['zattia', 'stunned'])
    expect(lineasDeMarca('bdi')).toEqual(['bdi'])
    expect(LINEAS).toEqual(['bdi', 'zattia', 'stunned'])
  })
})

describe('🔴 marcaDePermisos dejó de contestar por descarte', () => {
  it('sigue mandando Stunned a Zattia', () => {
    expect(marcaDePermisos('stunned')).toBe('zattia')
    expect(marcaDePermisos('bdi')).toBe('bdi')
  })

  it('una store inventada da null, no permisos de Zattia', () => {
    expect(marcaDePermisos('loquesea')).toBe(null)
  })

  it('🔴 y el gate del servidor NIEGA ante esa store, incluso a un admin', () => {
    // `puedeVer` le dice que sí a un admin ANTES de mirar la marca, así que dejar pasar el `null`
    // le abriría el handler con un `?store=` inventado. Éste es el gate; el default seguro es negar.
    const admin = { name: 'Bruno', admin: true, acceso: {}, cuenta: null }
    expect(puedeVerAlguna(admin, 'stunned', ['canjes'])).toBe(true)
    expect(puedeVerAlguna(admin, 'loquesea', ['canjes'])).toBe(false)
  })
})

describe('🔑 la regla está escrita UNA vez: las tres puertas contestan igual', () => {
  it('memo, conteo y el núcleo dicen lo mismo del mismo SKU', () => {
    expect(esStunnedMemo('STU-9')).toBe(esStunned('STU-9'))
    expect(esStunnedMemo(null)).toBe(esStunned(null))
    expect(lineaDeMemo('zattia', 'STU-9')).toBe(lineaDe('zattia', 'STU-9'))
    expect(lineaDeConteo([{ sku: 'STU-9' }])).toBe('stunned')
    expect(lineaDeConteo([{ sku: 'ZAT-1' }])).toBe('zattia')
  })
})

// ── El filtro del ETL ────────────────────────────────────────────────────────

function payload(over: Partial<PayloadCache> = {}): PayloadCache {
  return {
    productos: [
      { id: 1, name: 'Corset', sku: 'ZAT-1', category: 'Corsets', retailer_price: 100, unit_cost: 40, created_at: null },
      { id: 2, name: 'Buzo Stunned', sku: 'STU-1', category: 'Buzos', retailer_price: 200, unit_cost: 80, created_at: null },
      { id: 3, name: 'Sin SKU', sku: null, category: 'Otros', retailer_price: 50, unit_cost: 20, created_at: null },
    ],
    inventario: [
      { product_id: 1, product_name: 'Corset', size_id: 10, size_name: 'S', available_quantity: 5, store_name: 'Local', sku: 'ZAT-1' },
      { product_id: 2, product_name: 'Buzo Stunned', size_id: 10, size_name: 'S', available_quantity: 3, store_name: 'Local', sku: 'STU-1' },
      { product_id: 3, product_name: 'Sin SKU', size_id: 10, size_name: 'S', available_quantity: 1, store_name: 'Local', sku: null },
      // Huérfana de verdad: su producto no está en `productos` (recién cargada en GN).
      { product_id: 99, product_name: 'Nueva Stunned', size_id: 10, size_name: 'S', available_quantity: 2, store_name: 'Local', sku: 'STU-NUEVA' },
      { product_id: 98, product_name: 'Nueva Zattia', size_id: 10, size_name: 'S', available_quantity: 4, store_name: 'Local', sku: 'ZAT-NUEVA' },
    ],
    ventas: [
      { id: 500, date_sale: '2026-08-20', channel: 'online' }, // MIXTA: Zattia + Stunned
      { id: 501, date_sale: '2026-08-20', channel: 'local' }, // sólo Zattia
      { id: 502, date_sale: '2026-08-20', channel: 'local' }, // sin renglón de producto conocido
    ],
    detalles: [
      { sale_id: 500, product_id: 1, size_id: 10, size: 'S', quantity: 1 },
      { sale_id: 500, product_id: 2, size_id: 10, size: 'S', quantity: 1 },
      { sale_id: 501, product_id: 1, size_id: 10, size: 'S', quantity: 1 },
      { sale_id: 502, product_id: 777, size_id: 10, size: 'S', quantity: 1 },
    ],
    vmMes: [{ mes: '2026-08', channel: 'online', cantidad_ventas: 634, total_items: 927 }],
    vmCat: [],
    vmFundas: [],
    colorManual: [],
    syncMeta: null,
    ...over,
  }
}

describe('filtrarPorLinea', () => {
  it('parte los productos por el SKU, y el que no tiene SKU queda en Zattia', () => {
    expect(filtrarPorLinea(payload(), 'stunned').productos.map((p) => p.id)).toEqual([2])
    expect(filtrarPorLinea(payload(), 'zattia').productos.map((p) => p.id)).toEqual([1, 3])
  })

  it('los detalles siguen al producto', () => {
    const par = (d: { sale_id: number | string; product_id: number | string | null }) => `${d.sale_id}/${d.product_id}`
    expect(filtrarPorLinea(payload(), 'stunned').detalles.map(par)).toEqual(['500/2'])
    expect(filtrarPorLinea(payload(), 'zattia').detalles.map(par)).toEqual(['500/1', '501/1'])
    // El renglón del producto que no está en `productos` (777) no es de ninguna línea.
    expect(filtrarPorLinea(payload(), 'zattia').detalles.map(par)).not.toContain('502/777')
  })

  it('🔴 el inventario TAMBIÉN se filtra: si no, todas las variantes de la otra línea se vuelven huérfanas', () => {
    // Éste es el mutante que sale solo. `computarDatos` llama huérfana a la fila de stock cuyo
    // producto no está en `productos`; sin filtrar el inventario, filtrar productos las fabrica.
    const stu = filtrarPorLinea(payload(), 'stunned')
    expect(stu.inventario.map((i) => i.product_id)).toEqual([2, 99])
    const zat = filtrarPorLinea(payload(), 'zattia')
    expect(zat.inventario.map((i) => i.product_id)).toEqual([1, 3, 98])
  })

  it('la huérfana de verdad se reparte por su propio SKU', () => {
    expect(filtrarPorLinea(payload(), 'stunned').inventario.some((i) => i.product_id === 99)).toBe(true)
    expect(filtrarPorLinea(payload(), 'zattia').inventario.some((i) => i.product_id === 99)).toBe(false)
  })

  it('🔴 una venta entra sólo si TIENE UN RENGLÓN de la línea', () => {
    // La primera versión no filtraba `ventas` —«la mixta es de las dos, así que no se filtra»— y eso
    // dejaba también las que no tienen NADA de la línea. Se vio caminando: «Cómo viene la venta» de
    // Stunned decía 1 prenda online con 140 compras, porque `serieDiaria` cuenta las compras desde
    // `ventas` y las unidades desde `detalles`.
    expect(filtrarPorLinea(payload(), 'stunned').ventas.map((v) => v.id)).toEqual([500])
    expect(filtrarPorLinea(payload(), 'zattia').ventas.map((v) => v.id)).toEqual([500, 501])
  })

  it('🔑 la venta MIXTA queda en las dos: el ticket no se corta al medio', () => {
    // Mismo criterio que Norte y el Memo, y por eso la fila «Ventas» no suma a lo ancho. Medido en
    // prod: de 634 ventas, 620 tienen renglón de Zattia y 19 de Stunned — 5 cuentan en las dos.
    const z = filtrarPorLinea(payload(), 'zattia').ventas.map((v) => v.id)
    const st = filtrarPorLinea(payload(), 'stunned').ventas.map((v) => v.id)
    expect(z).toContain(500)
    expect(st).toContain(500)
  })

  it('⚠️ la venta sin ningún renglón conocido no se le regala a ninguna línea', () => {
    // Medido: 1 de 634 en producción. No es de ninguna, así que no entra en ninguna.
    expect(filtrarPorLinea(payload(), 'zattia').ventas.some((v) => v.id === 502)).toBe(false)
    expect(filtrarPorLinea(payload(), 'stunned').ventas.some((v) => v.id === 502)).toBe(false)
  })

  it('🔴 las vistas materializadas por mes pasan INTACTAS: no se pueden partir', () => {
    // Por esto «Ventas mensuales» no lleva selector. Si un día lo llevara sin tocar esto, mostraría
    // el total de la marca con el rótulo de una línea.
    expect(filtrarPorLinea(payload(), 'stunned').vmMes).toEqual(payload().vmMes)
  })

  it('las dos líneas juntas devuelven el catálogo entero, sin repetir ni perder', () => {
    const ids = [...filtrarPorLinea(payload(), 'zattia').productos, ...filtrarPorLinea(payload(), 'stunned').productos].map((p) => p.id)
    expect(ids.sort()).toEqual([1, 2, 3])
  })

  it('en BDI no hay nada que partir', () => {
    const p = payload()
    expect(filtrarPorLinea(p, 'bdi')).toBe(p)
  })
})
