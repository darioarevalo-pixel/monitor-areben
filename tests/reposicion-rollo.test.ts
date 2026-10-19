import { describe, expect, it } from 'vitest'
import { armarDevolucion, type FilaDevolver } from '../lib/reposicion/rollo'
import { ALTO_MAX } from '../lib/rollo80'

const T0 = Date.UTC(2026, 9, 19, 13, 0)
const partir = (txt: string) => [txt]
const fila = (i: number, n = 1) => ({ it: { sku: `RMI-${String(i).padStart(4, '0')}-M`, name: `MINI ${i}`, size: 'M' }, devolverHoy: n }) as unknown as FilaDevolver
const textos = (p: ReturnType<typeof armarDevolucion>[number]) => p.ops.flatMap((o) => (o.k === 'txt' ? [o.txt] : []))

describe('el papel de devolución en el rollo de 80 mm', () => {
  it('una lista corta sale en un solo papel, sin «Parte»', () => {
    const paginas = armarDevolucion([fila(1, 2), fila(2)], T0, partir, 'Zattia')
    expect(paginas).toHaveLength(1)
    const t = textos(paginas[0])
    expect(t).toContain('DEVOLUCIÓN AL DEPÓSITO')
    expect(t).toContain('3 prendas')
    expect(t.some((x) => x.startsWith('Parte'))).toBe(false)
    expect(t.some((x) => x.startsWith('Preparó'))).toBe(true)
  })

  // 19-oct-2026: la Epson imprimía sólo una parte de la devolución (lo mismo que el chequeo el 14-oct).
  it('una lista larga sale en partes que entran en la impresora, sin perder renglones', () => {
    const filas = Array.from({ length: 50 }, (_, i) => fila(i))
    const paginas = armarDevolucion(filas, T0, partir, 'Zattia')
    expect(paginas.length).toBeGreaterThan(1)
    for (const p of paginas) expect(p.alto).toBeLessThanOrEqual(ALTO_MAX)
    paginas.forEach((p, i) => expect(textos(p)).toContain(`Parte ${i + 1} de ${paginas.length}`))
    for (const p of paginas.slice(0, -1)) expect(textos(p)).toContain('Sigue en el próximo papel.')
    for (const p of paginas.slice(1)) expect(textos(p)).toContain('SKU · Producto')
    const skus = paginas.flatMap(textos).filter((x) => x.startsWith('RMI-'))
    expect(skus).toEqual(filas.map((f) => f.it.sku))
    expect(textos(paginas[paginas.length - 1]).some((x) => x.startsWith('Preparó'))).toBe(true)
  })
})
