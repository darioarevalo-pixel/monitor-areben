import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FilaDeKpis } from '@/components/meta-ads/zona/ZonaRendimiento'
import { toneTokens } from '@/components/ui/tokens'
import { totalesVivos, ventanaZona, type RespuestaZona, type TotalesVivos } from '@/lib/meta-ads/rendimiento'

/**
 * **La fila de KPIs de la zona de Rendimiento: que cambie cuando se cambia la ventana.**
 *
 * 🔴 Bruno, caminando `/meta-ads` el 30-ago-2026: *«cambio la fecha en rendimiento con hoy, ayer o
 * hace 3 días pero no cambian los resultados»*. Era cierto, y **el núcleo no podía verlo**: el
 * defecto vivía en qué objeto lee cada tarjeta, que es cableado de pantalla. Es la misma lección
 * que dejó el respaldo del Embudo esta mañana — probar la función pura ⛔ no prueba la decisión de
 * quien la llama.
 *
 * 🔑 **`renderToStaticMarkup` es el oráculo justo**: lo que se afirma es el número **dibujado**, y
 * los dos casos se comparan contra la MISMA zona. Si las tarjetas volvieran a leer `z.totales` en
 * modo vivo, los dos markup serían idénticos y estos tests se caen.
 */

const zona = {
  desde: '2026-08-23',
  hasta: '2026-08-29',
  ventanaJuicio: 7,
  totales: {
    spend: 700000, compras: 60, revenue: 1600000, clicks: 9000, impresiones: 400000,
    carritos: 300, checkouts: 120, lpv: 8000,
    costoMeta: 11666, pedidos: 100, pedidosDia: 14.3, costoPedidoReal: 7000, pctTecho: 105,
  },
  techo: 6668,
  techoCaja: null,
  objetivoPedidos: 22,
  celdas: [],
  caja: [],
  marginal: { marginal: 13388, motivo: '' },
  concentracion: { mayor: { pieza: 'AD02 - GIRLHOOD COLLECTION', pct: 52, cajas: 3, nombres: 2 } },
} as unknown as NonNullable<RespuestaZona['zona']>

/** Hoy: gastó $80.000 y Meta le atribuye 20 compras ⇒ $4.000 c/u, el 60% del techo. */
const HOY: TotalesVivos = totalesVivos(
  [{ spend: 80000, impresiones: 50000, clicks: 1200, compras: 20, revenue: 240000 }] as never,
  6668,
)

const pinta = (tv: TotalesVivos | null) =>
  renderToStaticMarkup(
    <FilaDeKpis z={zona} tv={tv} techo={6668} ventana={tv ? ventanaZona('hoy') : null} />,
  )

describe('la fila de KPIs sigue a la ventana elegida', () => {
  const foto = pinta(null)
  const vivo = pinta(HOY)

  it('🔴 con «Hoy» los números NO son los de la foto — es el defecto que se reportó', () => {
    expect(foto).not.toBe(vivo)
    // El gasto de la ventana de juicio ⛔ no puede quedar dibujado mientras arriba dice «Hoy».
    expect(foto).toContain('700.000')
    expect(vivo).not.toContain('700.000')
    expect(vivo).toContain('80.000')
  })

  it('el costo por compra vivo sale de lo de hoy, y su % del techo también', () => {
    expect(vivo).toContain('4.000')
    expect(vivo).toContain('60% del techo')
    // El de la foto es otro número y otra vara: $7.000 por PEDIDO REAL, 105% del techo.
    expect(foto).toContain('7.000')
    expect(foto).toContain('105% del techo')
  })

  it('🔴🔑 en vivo la tarjeta cambia de RÓTULO: lo que se muestra es Meta, ⛔ no la caja', () => {
    expect(foto).toContain('Pedidos reales')
    expect(foto).toContain('Costo por pedido')
    expect(vivo).toContain('Compras')
    expect(vivo).toContain('Costo por compra')
    // ⛔ Nunca las dos cosas: «Pedidos reales» arriba de un número de Meta es el defecto con otra ropa.
    expect(vivo).not.toContain('Pedidos reales</')
  })

  it('y dice que los pedidos reales de hoy NO existen, con el último día cerrado', () => {
    expect(vivo).toContain('la caja cierra el día')
    expect(vivo).toContain('2026-08-29')
    // En la foto ese renglón sobra: los pedidos reales están y son la tarjeta de al lado.
    expect(foto).not.toContain('la caja cierra el día')
  })

  it('🔴 el marginal y la concentración ⛔ no se disfrazan de hoy: dicen su ventana', () => {
    expect(vivo).toContain('13.388')
    // 🔑 **Cada una se afirma en su propio renglón, y ⛔ no con un `toContain` de la frase suelta.**
    // Las dos tarjetas la escriben, así que buscarla pelada la da por puesta en las dos teniendo
    // sólo una: sacarle la ventana al marginal dejaba este test VERDE. 📌 La misma trampa que un
    // ancla de mutante que aparece dos veces en el archivo.
    expect(vivo).toContain('el pedido que se sumó · 7 días cerrados')
    expect(vivo).toContain('cajas · 7 días cerrados')
    expect(foto).not.toContain('7 días cerrados')
  })

  it('sin compras hoy el costo se calla y el % también: ⛔ no dice «va bien»', () => {
    const sinCompras = pinta(totalesVivos([{ spend: 30000, compras: 0, revenue: 0 }] as never, 6668))
    expect(sinCompras).toContain('sin techo cargado')
    expect(sinCompras).not.toContain('% del techo')
  })

  it('sin techo cargado tampoco colorea nada, en las dos ventanas', () => {
    expect(pinta(totalesVivos([{ spend: 80000, compras: 20, revenue: 1 }] as never, 0))).toContain('sin techo cargado')
  })
})

/**
 * 🔴 **La tarjeta tiene que DECIR sobre cuántos nombres está sumando.**
 *
 * El 52% sale de fusionar «AD02 - GIRLHOOD COLLECTION» con su gemelo « -  ADV+ -18/8», y esa
 * fusión sale del NOMBRE: puede juntar dos videos distintos que compartan la base. Callarla
 * dibujaría un 52% que no se puede vetar. 📌 `firmaDePieza` en `rendimiento.core.js`.
 */
describe('la tarjeta de la pieza más grande declara la fusión', () => {
  const conPieza = (mayor: Record<string, unknown>) =>
    renderToStaticMarkup(
      <FilaDeKpis
        z={{ ...zona, concentracion: { mayor } } as unknown as NonNullable<RespuestaZona['zona']>}
        tv={null}
        techo={6668}
        ventana={null}
      />,
    )

  it('con más de un nombre lo dice, y muestra el de la variante que más gastó', () => {
    const html = conPieza({ pieza: 'AD02 - GIRLHOOD COLLECTION', pct: 52, cajas: 3, nombres: 2 })
    expect(html).toContain('AD02 - GIRLHOOD COLLECTION')
    expect(html).toContain('+1 nombre')
    expect(html).toContain('en 3 cajas')
  })

  it('con tres nombres lo dice en plural', () => {
    expect(conPieza({ pieza: 'AD01 - FUNDA PINTEREST - SHINY - 13/8', pct: 11, cajas: 5, nombres: 3 }))
      .toContain('+2 nombres')
  })

  it('⛔ con un solo nombre ⛔ no inventa el renglón', () => {
    expect(conPieza({ pieza: 'AD 04 - REEL TIKTOK FUNDAS VARIAS', pct: 18, cajas: 1, nombres: 1 }))
      .not.toContain('nombre')
  })

  it('🔴 el 52% pinta la tarjeta de AVISO, y el 32% del nombre exacto ⛔ nunca llegaba', () => {
    // 🔑 El oráculo es el COLOR, ⛔ no que los dos markup difieran: difieren igual por el «52%».
    // `tone` sólo pinta con acento, así que se afirma contra el token de `warning` de verdad.
    const advertencia = toneTokens.warning.fg
    expect(conPieza({ pieza: 'P', pct: 52, cajas: 3, nombres: 2 })).toContain(advertencia)
    expect(conPieza({ pieza: 'P', pct: 32, cajas: 1, nombres: 1 })).not.toContain(advertencia)
  })
})
