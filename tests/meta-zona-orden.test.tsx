import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Contenido } from '@/components/meta-ads/zona/ZonaRendimiento'
import type { RespuestaZona } from '@/lib/meta-ads/rendimiento'
import type { Acciones } from '@/components/meta-ads/acciones/tipos'

/**
 * **EL ORDEN VERTICAL DE `/meta-ads`.**
 *
 * 🔴 Bruno, el 5-sep-2026: *«primordialmente en la vista rendimiento tiene que estar los
 * rendimientos más arriba. Está muy muy rara la vista de esta sección, muy larga, comprimida toda
 * hacia la de veredicto, no me convence nada»*. La tabla era el sexto bloque, con ≈1.080 px de
 * contexto encima.
 *
 * 🔑 **Este archivo existe porque el orden es una decisión de producto que NADA miraba.** Es la
 * misma razón por la que `FilaDeKpis` se exportó en su momento: lo que decide la pantalla ⛔ no lo
 * ve el núcleo. Sin esto, la próxima tanda mueve la tabla tres bloques hacia abajo y la suite sigue
 * verde — que es exactamente lo que ya pasó una vez.
 *
 * ⚠️ Se afirma sobre la POSICIÓN en el markup, ⛔ no sobre la existencia: `toContain` de cada bloque
 * pasaría con cualquier orden, que es el test que se ve prendido y no mira nada.
 */

const zona = {
  desde: '2026-08-29',
  hasta: '2026-09-04',
  ventanaJuicio: 7,
  totales: {
    spend: 600000, compras: 84, revenue: 2100000, clicks: 11000, impresiones: 340000,
    carritos: 1400, checkouts: 330, lpv: 6600,
    costoMeta: 7143, pedidos: 113, pedidosDia: 16.1, costoPedidoReal: 5310,
    pctTechoMeta: 95, pctTechoPedidoReal: 71,
  },
  techo: 7558,
  techoCaja: null,
  objetivoPedidos: 25,
  celdas: [],
  caja: [{ fecha: '2026-09-04', gasto: 80000, pedidos: 16, costoPedidoReal: 5000, compras: 12 }],
  marginal: {
    marginal: 6000,
    motivo: '',
    a: { desde: '2026-08-22', hasta: '2026-08-28', dias: 7, gasto: 590000, pedidos: 94, gastoDia: 84000, pedidosDia: 13.4, costoPedido: 6300 },
    b: { desde: '2026-08-29', hasta: '2026-09-04', dias: 7, gasto: 600000, pedidos: 113, gastoDia: 85000, pedidosDia: 16.1, costoPedido: 5310 },
  },
  concentracion: { mayor: null },
} as unknown as NonNullable<RespuestaZona['zona']>

const d = {
  ok: true, linea: 'bdi', dias: 7, hasta: '2026-09-04', zona,
  techo: 7558, techoCaja: null, ficha: { cargadaEl: '2026-08-23', ticket: 23246 },
  meta: null, problemas: [],
} as unknown as RespuestaZona

const ACCIONES = {
  puede: () => false, enCurso: null, onEstado: () => {}, onPresupuesto: () => {},
  onNombre: () => {}, onDuplicar: () => {}, onCrear: () => {}, onEscalar: () => {},
} as unknown as Acciones

const REGLAS = {
  estado: { fase: 'ok', data: { reglas: [] } }, hallazgos: [], cargandoHallazgos: false,
  recargar: () => {}, quitar: () => {},
} as never

const markup = renderToStaticMarkup(
  <Contenido
    d={d}
    ventana={null}
    dias={7}
    acciones={ACCIONES}
    anclado={null}
    onElegir={() => {}}
    vivas={null}
    sinVivo={null}
    lineaViva={'bdi' as never}
    reglas={REGLAS}
  />,
)

/** Dónde aparece cada bloque. `-1` si no está, para que el test diga QUÉ falta y no «-1 < 3». */
const donde = (txt: string) => {
  const i = markup.indexOf(txt)
  expect(i, `«${txt}» tiene que estar en la pantalla`).toBeGreaterThanOrEqual(0)
  return i
}

describe('el orden vertical de la zona de rendimiento', () => {
  it('🔴 LA TABLA VA ARRIBA: antes que el oráculo y antes que la cabecera', () => {
    const tabla = donde('Las pautas')
    expect(tabla).toBeLessThan(donde('Pedidos reales contra Meta'))
    expect(tabla).toBeLessThan(donde('Sale de la'))
  })

  it('los KPIs y la tira de días quedan arriba: son el contexto mínimo y son controles', () => {
    const tabla = donde('Las pautas')
    expect(donde('Costo por compra · Meta')).toBeLessThan(tabla)
    expect(donde('DÍA POR DÍA')).toBeLessThan(tabla)
  })

  it('🔴 el bloque de pendientes YA NO está: quedó un renglón adentro de la card de la tabla', () => {
    expect(markup).not.toContain('Qué hay que decidir')
    expect(markup).not.toContain('Lo que detectaron las automatizaciones')
  })

  it('🔑 y los pedidos de la tienda se declaran como lo que son, ⛔ no como una vara', () => {
    expect(markup).toContain('⛔ no son la vara de la pauta')
    expect(donde('Pedidos de la tienda')).toBeLessThan(donde('Las pautas'))
  })
})
