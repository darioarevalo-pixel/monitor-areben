import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BloqueEstrellas } from '@/components/prm/MovimientoProveedor'
import { estrellas, type ProductoMovimiento, type VentaMovimiento } from '@/lib/prm/movimiento'

/**
 * **El bloque de la recompra, dibujado.**
 *
 * 🔑 **Lo que se mira acá ⛔ no son los números: es qué dice cuando NO hay un número.** Las cuentas
 * ya las clava `tests/prm-estrellas.test.ts`; lo que ⛔ ningún test de núcleo puede ver es que la
 * pantalla pinte un `0` donde el núcleo devolvió `null`, y ése es el defecto caro: un «stock 0»
 * manda a Flores a comprar algo de lo que puede haber una pila, y un «se termina en 0 días» sobre
 * algo que nunca se vendió lo pone primero en la lista de urgencias.
 *
 * ⚠️ **`renderToStaticMarkup` alcanza porque este componente ⛔ no tiene estado**: recibe las filas
 * ya calculadas. Es justamente para eso que está separado del que hace el fetch.
 */
const HOY = '2026-09-08'

const prod = (id: string, unidades: number, desde: string | null): ProductoMovimiento => ({
  clave: `zattia:${id}`,
  store: 'zattia',
  producto_id: id,
  nombre: id,
  sku: `SKU-${id}`,
  unidades,
  desde,
  hasta: desde,
})
const venta = (id: string, fecha: string, unidades: number): VentaMovimiento => ({
  store: 'zattia',
  producto_id: id,
  fecha,
  unidades,
})

const dibujar = (
  productos: ProductoMovimiento[],
  ventas: VentaMovimiento[],
  opciones: { stock?: Map<string, number> | null; stockMudo?: string[]; stockAl?: string | null } = {},
) =>
  renderToStaticMarkup(
    <BloqueEstrellas
      e={estrellas(productos, ventas, HOY, { dias: 30, stock: opciones.stock ?? null })}
      ventana={30}
      onVentana={() => {}}
      stockMudo={opciones.stockMudo ?? []}
      stockAl={opciones.stockAl ?? null}
    />,
  )

describe('el bloque de la recompra · los ceros que ⛔ no son ceros', () => {
  it('🔴 el que ⛔ no vendió nada ⛔ NO dice «se termina en 0 días»', () => {
    const html = dibujar([prod('MUDO', 10, '2026-09-01')], [])
    expect(html).toContain('MUDO')
    expect(html).not.toContain('en 0 d')
    expect(html).not.toContain('ya lo colocó')
  })

  it('🔴 el que llegó HOY ⛔ no dibuja un ritmo de 0: dibuja un guion', () => {
    const html = dibujar([prod('RECIEN', 10, HOY)], [venta('RECIEN', HOY, 3)])
    expect(html).toContain('hace 0 d')
    expect(html).toContain('—')
  })

  it('🔴 sin stock leído la celda dice «—» y ⛔ NO 0', () => {
    const html = dibujar([prod('P', 10, '2026-09-01')], [venta('P', '2026-09-03', 2)], { stock: null })
    // El 0 sólo podría venir del stock: las demás celdas son 10, 2, 20% y un plazo.
    expect(html).not.toMatch(/>0</)
  })

  it('el stock en 0 SÍ se dibuja: quedarse sin nada es lo más urgente que hay', () => {
    const html = dibujar([prod('P', 10, '2026-09-01')], [venta('P', '2026-09-03', 2)], {
      stock: new Map([['zattia:P', 0]]),
    })
    expect(html).toMatch(/>0</)
  })

  it('🔴 con la marca muda lo DICE, en vez de dejar la columna en blanco', () => {
    const html = dibujar([prod('P', 10, '2026-09-01')], [], { stockMudo: ['zattia'] })
    expect(html).toContain('no se pudo leer')
  })
})

describe('el bloque de la recompra · lo que afirma la pantalla', () => {
  it('el que ya colocó todo lo suyo se dice con palabras, ⛔ no con un 0', () => {
    const html = dibujar([prod('TERRA', 5, '2026-08-11')], [venta('TERRA', '2026-08-21', 5)])
    expect(html).toContain('ya lo colocó')
  })

  it('🔴 dice que el stock ⛔ NO se resta de la compra, con la medición adentro', () => {
    const html = dibujar([prod('P', 10, '2026-09-01')], [venta('P', '2026-09-03', 2)])
    expect(html).toContain('no se restan entre sí')
    expect(html).toContain('97')
  })

  it('marca con ⭐ lo mismo que avisa el mail, y ⛔ no otra cosa', () => {
    const html = dibujar(
      [prod('CALIENTE', 12, '2026-09-01'), prod('TIBIO', 60, '2026-09-01')],
      [venta('CALIENTE', '2026-09-03', 7), venta('TIBIO', '2026-09-03', 5)],
    )
    expect(html).toContain('⭐ CALIENTE')
    expect(html).not.toContain('⭐ TIBIO')
  })

  it('🔴 sin productos nuevos lo explica, y nombra los repuestos: un vacío mudo se lee como un dato que falta', () => {
    const productos: ProductoMovimiento[] = [
      { ...prod('REPUESTO', 20, '2026-06-17'), hasta: '2026-09-01' },
    ]
    const html = dibujar(productos, [])
    expect(html).toContain('Ninguna orden suya trajo un producto nuevo')
    expect(html).toContain('volvieron a entrar')
  })

  it('cuándo se sincronizó el stock va A LA VISTA: ese espejo lo aprieta una persona', () => {
    const html = dibujar([prod('P', 10, '2026-09-01')], [], { stockAl: '8/9, 11:45 a. m.' })
    expect(html).toContain('8/9, 11:45')
    expect(html).toContain('no se actualiza solo')
  })
})
