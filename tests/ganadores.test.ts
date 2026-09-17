import { describe, expect, it } from 'vitest'
import { rankingDeTanda, tandasDe, UMBRAL_MIN_POR_MODELO, type ProductoTanda } from '@/lib/ganadores/tipos'
import { ladoDeCanal } from '@/lib/liquidacion/resultado'
import { cartelDeTanda, relojesDeTanda } from '@/lib/ganadores/cartel'

/**
 * Ganadores por tanda (`lib/ganadores/core.js`). Mutantes que tienen que caer acá:
 *   - el umbral con `>` en vez de `>=`;
 *   - `otro` contado como mayorista, o las técnicas contadas de algún lado;
 *   - la señal decidida modelo por modelo en vez de por tanda;
 *   - el reloj minorista arrancando en el alta;
 *   - un mayorista en cero tomado como anticipo.
 */

const canal = (total: number, first: string | null = total ? '2026-09-15' : null) => ({
  total, s7: 0, s15: 0, s30: 0, s90: 0, first, last: first,
})

function prod(id: string, uMin: number, uMay: number, extra: Partial<ProductoTanda> = {}): ProductoTanda {
  return {
    id,
    name: id,
    retailer_price: 14990,
    stock: 100,
    ingresoFecha: '2026-09-11',
    ventasMin: canal(uMin),
    ventasMay: canal(uMay, uMay ? '2026-09-11' : null),
    minOnline: uMin,
    minLocal: 0,
    ...extra,
  }
}

const HOY = new Date('2026-09-16T15:00:00')

describe('ladoDeCanal', () => {
  it('parte los canales de Gestión Nube en los dos lados, y deja afuera técnicas y canjes', () => {
    expect(ladoDeCanal('Mayorista')).toBe('mayorista')
    for (const c of ['Tienda Nube', 'Mi Local', 'Minorista', 'Mercadolibre', 'Whatsapp', 'Revendedor', 'Otro Canal']) {
      expect(ladoDeCanal(c)).toBe('minorista')
    }
    for (const c of ['Ninguno', 'Influencer', '', null]) expect(ladoDeCanal(c)).toBeNull()
  })
})

describe('rankingDeTanda', () => {
  it('sin umbral ⛔ no inventa uno: tira', () => {
    // @ts-expect-error — el parámetro es obligatorio a propósito
    expect(() => rankingDeTanda([prod('A', 1, 1)], { hoy: HOY })).toThrow(/umbral/)
    expect(() => rankingDeTanda([prod('A', 1, 1)], { umbralMinPorModelo: 0, hoy: HOY })).toThrow(/umbral/)
  })

  it('bajo el umbral manda el mayorista (el anticipo), y el orden es el suyo', () => {
    // 3 modelos × umbral 10 = 30 u; hay 29.
    const r = rankingDeTanda([prod('A', 20, 5), prod('B', 8, 50), prod('C', 1, 10)], { umbralMinPorModelo: 10, hoy: HOY })
    expect(r.umbralUnidades).toBe(30)
    expect(r.uMin).toBe(29)
    expect(r.senal).toBe('mayorista')
    expect(r.ruido).toBe(true)
    expect(r.filas.map((f) => f.id)).toEqual(['B', 'C', 'A'])
    expect(r.filas.map((f) => f.puesto)).toEqual([1, 2, 3])
  })

  it('justo en el umbral ya manda el minorista (>=, ⛔ no >)', () => {
    const r = rankingDeTanda([prod('A', 20, 5), prod('B', 9, 50), prod('C', 1, 10)], { umbralMinPorModelo: 10, hoy: HOY })
    expect(r.uMin).toBe(30)
    expect(r.senal).toBe('minorista')
    expect(r.ruido).toBe(false)
    expect(r.progreso).toBe(1)
    expect(r.filas.map((f) => f.id)).toEqual(['A', 'B', 'C'])
  })

  it('la señal es de la TANDA: un modelo con mucho minorista ⛔ no cambia de lado solo', () => {
    // A solo pasa el umbral por modelo (15 ≥ 10), la tanda no (16 < 30).
    const r = rankingDeTanda([prod('A', 15, 1), prod('B', 1, 30), prod('C', 0, 20)], { umbralMinPorModelo: 10, hoy: HOY })
    expect(r.senal).toBe('mayorista')
    const a = r.filas.find((f) => f.id === 'A')!
    expect(a.puesto).toBe(a.puestoMay)
    expect(a.puesto).toBe(3)
  })

  it('un mayorista en CERO ⛔ es un anticipo: manda el minorista, marcado como ruido', () => {
    const r = rankingDeTanda([prod('A', 2, 0), prod('B', 5, 0), prod('C', 0, 0)], { umbralMinPorModelo: 10, hoy: HOY })
    expect(r.senal).toBe('minorista')
    expect(r.ruido).toBe(true)
    expect(r.filas[0].id).toBe('B')
  })

  it('sin ventas de ningún lado lo dice', () => {
    const r = rankingDeTanda([prod('A', 0, 0), prod('B', 0, 0), prod('C', 0, 0)], { umbralMinPorModelo: 10, hoy: HOY })
    expect(r.senal).toBe('sin-ventas')
    expect(r.inicioMin).toBeNull()
    expect(r.filas.every((f) => f.velMin === null)).toBe(true)
  })

  it('el reloj minorista arranca en la PRIMERA VENTA minorista de la tanda, ⛔ no en el alta', () => {
    // Alta 11-sep, primera minorista 15-sep, hoy 16-sep ⇒ 2 días minoristas y 6 mayoristas.
    const r = rankingDeTanda(
      [prod('A', 8, 60), prod('B', 4, 30, { ventasMin: canal(4, '2026-09-16') }), prod('C', 0, 0)],
      { umbralMinPorModelo: 10, hoy: HOY },
    )
    expect(r.inicioMin).toBe('2026-09-15')
    expect(r.diasMin).toBe(2)
    expect(r.diasMay).toBe(6)
    expect(r.filas.find((f) => f.id === 'A')!.velMin).toBe(4)
    expect(r.filas.find((f) => f.id === 'A')!.velMay).toBe(10)
  })

  it('empates comparten puesto, y el desacople sale de los dos puestos', () => {
    const r = rankingDeTanda(
      [prod('HALF', 8, 388), prod('CHERRY', 5, 53), prod('DUA', 5, 127), prod('BAMBI', 1, 233)],
      { umbralMinPorModelo: 1, hoy: HOY },
    )
    const por = Object.fromEntries(r.filas.map((f) => [f.id, f]))
    expect(por.CHERRY.puestoMin).toBe(2)
    expect(por.DUA.puestoMin).toBe(2)
    expect(por.BAMBI.puestoMin).toBe(4)
    // CHERRY: 4º en mayorista, 2º en minorista ⇒ el público lo quiere más.
    expect(por.CHERRY.desacople).toBe(2)
    expect(por.BAMBI.desacople).toBe(2 - 4)
    // Desempate por el otro lado: DUA (127 may) antes que CHERRY (53).
    expect(r.filas.map((f) => f.id)).toEqual(['HALF', 'DUA', 'CHERRY', 'BAMBI'])
  })

  it('el umbral exportado es un número positivo (lo usa la pantalla)', () => {
    expect(UMBRAL_MIN_POR_MODELO).toBeGreaterThan(0)
  })
})

describe('tandasDe', () => {
  it('agrupa por alta, más reciente primero, y descarta altas sueltas y sin fecha', () => {
    const ps = [
      ...['a', 'b', 'c'].map((id) => ({ id, ingresoFecha: '2026-08-03' })),
      ...['d', 'e', 'f', 'g'].map((id) => ({ id, ingresoFecha: '2026-09-11' })),
      { id: 'h', ingresoFecha: '2026-09-12' },
      { id: 'i', ingresoFecha: null },
    ]
    const t = tandasDe(ps)
    expect(t.map((x) => [x.fecha, x.productos.length])).toEqual([
      ['2026-09-11', 4],
      ['2026-08-03', 3],
    ])
  })
})

describe('cartelDeTanda', () => {
  const base = (p: ProductoTanda[]) => rankingDeTanda(p, { umbralMinPorModelo: 10, hoy: HOY })

  it('dice qué ranking manda, con la cuenta del umbral a la vista', () => {
    const may = cartelDeTanda(base([prod('A', 5, 50), prod('B', 1, 10), prod('C', 0, 3)]), 10)
    expect(may.titulo).toMatch(/mayorista/)
    expect(may.detalle).toContain('lleva 6 de las 30 unidades que hacen falta')
    expect(may.detalle).toContain('3 modelos × 10')

    const min = cartelDeTanda(base([prod('A', 25, 50), prod('B', 5, 10), prod('C', 0, 3)]), 10)
    expect(min.tono).toBe('success')
    expect(min.titulo).toBe('Ordena el público')
    expect(min.detalle).toContain('en 2 días')
  })

  it('el público sin anticipo lo dice como advertencia, ⛔ no como verde', () => {
    const c = cartelDeTanda(base([prod('A', 2, 0), prod('B', 1, 0), prod('C', 0, 0)]), 10)
    expect(c.tono).toBe('warning')
    expect(c.detalle).toMatch(/no compró/)
  })

  it('sin ventas no finge un orden', () => {
    const c = cartelDeTanda(base([prod('A', 0, 0), prod('B', 0, 0), prod('C', 0, 0)]), 10)
    expect(c.tono).toBe('neutral')
    expect(relojesDeTanda(base([prod('A', 0, 0), prod('B', 0, 0), prod('C', 0, 0)]))).toContain('sin ventas todavía')
  })

  it('los relojes nombran los dos arranques', () => {
    const r = base([prod('A', 8, 60), prod('B', 4, 30), prod('C', 0, 0)])
    expect(relojesDeTanda(r)).toBe('Público: 2 días desde su primera venta · Mayorista: 6 días desde el alta')
  })
})
