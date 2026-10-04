import { describe, expect, it } from 'vitest'
import { agruparLecturas, claveDe, controles, indexarLocal, leerCodigo, resolverEnLocal, nombresDeEstantes, TOPE_ESTANTES, ubicacionesDe } from '@/lib/ubicaciones-local/core.core.js'
import { skuBase } from '@/lib/conteo-estandar/core'

/**
 * Ubicaciones depósito: el núcleo.
 *
 * 🔑 Los SKU son REALES del Local de Zattia (espejo del 1-oct-2026): `RBT-0137-BE/CR/MA` es la Baby Tee
 * Nex en tres colores, `RBE-0016-38` lleva talle, y Stunned arranca con `STU-`.
 */

describe('claveDe: el producto es el SKU sin color ni talle', () => {
  it.each([
    ['RBT-0137-BE', 'RBT-0137'],
    ['RBT-0137-MA', 'RBT-0137'],
    ['RBE-0016-38', 'RBE-0016'],
    ['STU-REM-0001-S', 'STU-REM-0001'],
    ['rbt-0149', 'RBT-0149'],
    [' RBLU-0028-CT ', 'RBLU-0028'],
    ['', ''],
    [null, ''],
  ])('%s → %s', (sku, clave) => expect(claveDe(sku)).toBe(clave))

  it('🔑 el conteo usa LA MISMA regla (una sola definición de «el producto»)', () => {
    for (const s of ['RBT-0137-BE', 'STU-REM-0001-S', 'CINTO', '']) expect(skuBase(s)).toBe(claveDe(s))
  })
})

describe('leerCodigo: estante o bolsa', () => {
  it('la etiqueta EST- es un estante', () => {
    expect(leerCodigo('EST-A1')).toEqual({ tipo: 'estante', estante: 'A1' })
    expect(leerCodigo('est-b12')).toEqual({ tipo: 'estante', estante: 'B12' })
  })
  it("🔴 el lector con teclado en castellano escribe ' por -", () => {
    expect(leerCodigo("EST'A1")).toEqual({ tipo: 'estante', estante: 'A1' })
    expect(leerCodigo("RBT'0137")).toEqual({ tipo: 'bolsa', codigo: 'RBT-0137', clave: 'RBT-0137' })
  })
  it('cualquier otra cosa es una bolsa, con su clave', () => {
    expect(leerCodigo('RBT-0137')).toEqual({ tipo: 'bolsa', codigo: 'RBT-0137', clave: 'RBT-0137' })
    // la etiqueta de una prenda también llega al producto
    expect(leerCodigo('RBT-0137-BE')).toMatchObject({ tipo: 'bolsa', clave: 'RBT-0137' })
  })
  it('vacío o «EST-» solo no es nada', () => {
    expect(leerCodigo('  ')).toEqual({ tipo: 'vacio' })
    expect(leerCodigo('EST-')).toEqual({ tipo: 'vacio' })
  })
})

describe('agruparLecturas: cada lectura repetida es una bolsa más', () => {
  it('cuenta bolsas y ordena por SKU (numérico)', () => {
    expect(agruparLecturas(['RBT-0137', 'RBT-0101', 'RBT-0137', 'RBT-0137'])).toEqual([
      { clave: 'RBT-0101', bolsas: 1 },
      { clave: 'RBT-0137', bolsas: 3 },
    ])
  })
  it('una lista vacía es un estante vacío', () => expect(agruparLecturas([])).toEqual([]))
})

describe('ubicacionesDe', () => {
  const foto = [
    { estante: 'A2', clave: 'RBT-0137' },
    { estante: 'A1', clave: 'RBT-0137' },
    { estante: 'A1', clave: 'RBT-0101' },
  ]
  it('repartido en dos estantes ⇒ los dos, ordenados', () => expect(ubicacionesDe(foto, 'RBT-0137-BE')).toEqual(['A1', 'A2']))
  it('sin bolsa ⇒ ninguno', () => expect(ubicacionesDe(foto, 'RBT-0999')).toEqual([]))
})

describe('controles contra el stock del Local', () => {
  const fila = (sku: string, q: number) => ({ sku, product_name: `P ${sku}`, available_quantity: q })

  it('bolsa escaneada y el Local en 0 ⇒ «bolsa sin stock»', () => {
    const r = controles([{ estante: 'A1', clave: 'RBT-0137' }], [fila('RBT-0137-BE', 0), fila('RBT-0137-CR', 0)])
    expect(r.bolsaSinStock).toEqual([{ clave: 'RBT-0137', nombre: 'P RBT-0137-BE', estantes: ['A1'] }])
  })

  it('bolsa escaneada de un producto que el Local ni tiene ⇒ también avisa', () => {
    expect(controles([{ estante: 'B3', clave: 'RTO-0065' }], []).bolsaSinStock).toHaveLength(1)
  })

  it('más de 3 en una variante y ninguna bolsa ⇒ «stock sin bolsa»', () => {
    const r = controles([], [fila('RBT-0137-BE', 5), fila('RBT-0137-CR', 1)])
    expect(r.stockSinBolsa).toEqual([{ clave: 'RBT-0137', nombre: 'P RBT-0137-BE', enLocal: 6, maxVariante: 5 }])
  })

  it('🔑 hasta 3 por variante y sin bolsa ⇒ ⛔ no avisa: puede estar todo colgado', () => {
    const r = controles([], [fila('RBT-0137-BE', 3), fila('RBT-0137-CR', 3), fila('RBT-0137-MA', 2)])
    expect(r.stockSinBolsa).toEqual([])
  })

  it('con bolsa y con stock ⇒ ningún aviso', () => {
    const r = controles([{ estante: 'A1', clave: 'RBT-0137' }], [fila('RBT-0137-BE', 9)])
    expect(r).toEqual({ bolsaSinStock: [], stockSinBolsa: [] })
  })

  it('un stock negativo de GN no tapa el de otra variante', () => {
    const r = controles([{ estante: 'A1', clave: 'RBT-0137' }], [fila('RBT-0137-BE', -1), fila('RBT-0137-CR', 2)])
    expect(r.bolsaSinStock).toEqual([])
  })
})

describe('nombresDeEstantes: lo que se tipea para imprimir las etiquetas de estante', () => {
  it('sueltos y rangos, con o sin la letra repetida, sin repetidos', () => {
    expect(nombresDeEstantes('A1-A3, b1-2 REJA a2')).toEqual({ nombres: ['A1', 'A2', 'A3', 'B1', 'B2', 'REJA'], invalidos: [], recortado: false })
  })
  it("`EST-A1` es A1, y el `'` del lector en castellano es un guion", () => {
    expect(nombresDeEstantes("EST-A1 EST'A2 A3..A4").nombres).toEqual(['A1', 'A2', 'A3', 'A4'])
  })
  it('🔴 lo que no entiende lo DEVUELVE, ⛔ no lo descarta callado', () => {
    expect(nombresDeEstantes('A5-A2 A1-B3 ABCDEFGHI ok').invalidos).toEqual(['A5-A2', 'A1-B3', 'ABCDEFGHI'])
  })
  it('un rango desmedido es un error de tipeo, no 1000 hojas', () => {
    expect(nombresDeEstantes('A1-A1000')).toEqual({ nombres: [], invalidos: ['A1-A1000'], recortado: false })
    const r = nombresDeEstantes('A1-A40 B1-B40')
    expect(r.nombres).toHaveLength(TOPE_ESTANTES)
    expect(r.recortado).toBe(true)
  })
})

describe('resolverEnLocal: la bolsa se reconoce en el teléfono, con la regla del servidor', () => {
  const idx = indexarLocal([
    { sku: 'RBT-0137-BE', barcode: 'RBT0137BE', name: 'Remera Bita', qty: 2, img: null },
    { sku: 'RBT-0137-NG', barcode: '7790001', name: 'Remera Bita', qty: 3, img: 'https://x/1.jpg' },
    { sku: 'PAN-0009-NG', barcode: '7790002', name: 'Pantalón', qty: 0 },
    { sku: null, barcode: '7790003', name: 'Sin SKU', qty: 5 },
  ])
  const leer = (t: string) => leerCodigo(t) as { codigo: string; clave: string }

  it('por la etiqueta de la bolsa: suma el stock de todos los colores y toma la primera foto', () => {
    expect(resolverEnLocal(idx, leer('RBT-0137'))).toEqual({ clave: 'RBT-0137', nombre: 'Remera Bita', img: 'https://x/1.jpg', enLocal: 5 })
  })
  it("con el lector en castellano (' por -) también", () => {
    expect(resolverEnLocal(idx, leer("RBT'0137"))?.clave).toBe('RBT-0137')
  })
  it('por el código de barras de la prenda, incluso el SKU sin guiones', () => {
    expect(resolverEnLocal(idx, leer('7790001'))?.clave).toBe('RBT-0137')
    expect(resolverEnLocal(idx, leer('RBT0137BE'))?.clave).toBe('RBT-0137')
  })
  it('con stock 0 se reconoce igual (es el aviso de «sin stock», no «no figura»)', () => {
    expect(resolverEnLocal(idx, leer('PAN-0009'))?.enLocal).toBe(0)
  })
  it('lo que no tiene SKU o no está en el Local da null', () => {
    expect(resolverEnLocal(idx, leer('7790003'))).toBeNull()
    expect(resolverEnLocal(idx, leer('ZZZ-9999'))).toBeNull()
  })
})
