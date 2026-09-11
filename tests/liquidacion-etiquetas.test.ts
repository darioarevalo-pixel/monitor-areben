/**
 * La vista de Etiquetas sobre una liquidación — lo que decide **qué ve el local**.
 *
 * Es un filtro chico y por eso es peligroso: si se equivoca, no falla nada. La gente sale a la
 * tienda con etiquetas de precios que no rigen, y el error aparece en la percha, no en la pantalla.
 * Los dos errores posibles son opuestos y los dos son caros:
 *
 *  - **de más**: colgar el precio de un sale que todavía no está cargado en la tienda;
 *  - **de menos**: dejar sin etiqueta la mitad de los productos cuando los precios se cargaron a
 *    mano en Gestión Nube y los ítems nunca pasaron por el aplicador.
 */
import { describe, it, expect } from 'vitest'
import { ESTADOS_CAMPANIA_VIVA, pidsAEtiquetar, preciosAEtiquetar } from '../api/_liquidacion.js'

const ITEMS = [
  { pid: '1', estado: 'aplicado' },
  { pid: '2', estado: 'confirmado' },
  { pid: '3', estado: 'definido' },
  { pid: '4', estado: 'descartado' },
  { pid: '5', estado: 'pendiente' },
]

describe('ESTADOS_CAMPANIA_VIVA', () => {
  it('deja afuera borrador y cerrada', () => {
    // Una campaña en borrador tiene precios decididos que NO están en la tienda: etiquetar desde
    // ahí cuelga en la percha un precio que no existe.
    expect(ESTADOS_CAMPANIA_VIVA).toEqual(['en_curso', 'aplicada'])
    expect(ESTADOS_CAMPANIA_VIVA).not.toContain('borrador')
    expect(ESTADOS_CAMPANIA_VIVA).not.toContain('cerrada')
  })
})

describe('pidsAEtiquetar', () => {
  it('con la campaña en curso, sólo los aplicados', () => {
    // `aplicado` es «su precio está puesto en GN ahora». Un `confirmado` está aprobado pero nadie
    // lo escribió todavía.
    expect(pidsAEtiquetar(ITEMS, 'en_curso')).toEqual(['1'])
  })

  it('con la campaña ya aplicada, también los confirmados', () => {
    // Es el caso de los precios cargados a mano en GN: el ítem nunca pasa por el aplicador, y quien
    // marcó la campaña como aplicada es el único que puede decir que están puestos.
    expect(pidsAEtiquetar(ITEMS, 'aplicada')).toEqual(['1', '2'])
  })

  it('nunca los definidos, descartados ni pendientes', () => {
    for (const estado of ['en_curso', 'aplicada']) {
      const salen = pidsAEtiquetar(ITEMS, estado)
      expect(salen).not.toContain('3') // definido: falta la segunda mirada
      expect(salen).not.toContain('4') // descartado: se decidió que NO entra al sale
      expect(salen).not.toContain('5') // pendiente: no tiene precio
    }
  })

  it('devuelve pid, y nada más que pid', () => {
    // Lo que sostiene que esta vista no filtre costo ni margen al local: acá no viaja el ítem.
    expect(pidsAEtiquetar([{ pid: '9', estado: 'aplicado', foto: { costo: 1234 } }], 'aplicada')).toEqual(['9'])
  })

  it('sin ítems no devuelve nada', () => {
    expect(pidsAEtiquetar([], 'aplicada')).toEqual([])
    expect(pidsAEtiquetar(null, 'aplicada')).toEqual([])
  })
})

/**
 * ETIQUETAR POR ANTICIPADO — el precio sale de la campaña, no de Tienda Nube.
 *
 * Es el camino de la feria del local: las prendas se **ocultan** en Tienda Nube para no publicar el
 * precio de remate, así que TN ⛔ no tiene el número y preguntarle devuelve el del sale anterior.
 * Los errores posibles son los mismos dos de arriba y uno más, que es el que muerde:
 *
 *  - **de más**: pegarle a una prenda un número que nadie revisó y que todavía puede cambiar;
 *  - **de menos**: dejar sin precio a la mitad del lote;
 *  - **el caro**: que viaje el COSTO. La feria se vende al costo y el local ⛔ no puede verlo.
 */
describe('preciosAEtiquetar', () => {
  const CON_PRECIO = [
    { pid: '1', estado: 'aplicado', foto: { nombre: 'TOP BELICE' }, decision: { precioSale: 8990 } },
    { pid: '2', estado: 'confirmado', foto: { nombre: 'MINI BLUSH' }, decision: { precioSale: 6990 } },
    { pid: '3', estado: 'definido', foto: { nombre: 'BODY SWEET' }, decision: { precioSale: 12990 } },
    { pid: '4', estado: 'descartado', foto: { nombre: 'SWEATER STUNNED' }, decision: { precioSale: 19990 } },
    { pid: '5', estado: 'pendiente', foto: { nombre: 'TOP SIN DECIDIR' }, decision: {} },
  ]

  it('deja pasar los tres estados con precio y ⛔ no el descartado ni el pendiente', () => {
    // `descartado` se miró y se decidió que NO va: imprimirle una etiqueta lo pone en la mesa.
    expect(preciosAEtiquetar(CON_PRECIO).map((i) => i.pid)).toEqual(['1', '2', '3'])
  })

  it('marca como firme sólo lo que pasó por una segunda mirada', () => {
    // Un `definido` es un precio que nadie revisó: cambiarlo lo devuelve a la cola, y una etiqueta
    // ya pegada hay que ir a SACARLA de la percha.
    const por = Object.fromEntries(preciosAEtiquetar(CON_PRECIO).map((i) => [i.pid, i.firme]))
    expect(por).toEqual({ '1': true, '2': true, '3': false })
  })

  it('⛔ NO deja salir el costo, ni el margen, ni las ventas', () => {
    // 🔴 El candado de la sección. La foto congelada trae costo, markup, margen y ventas7/30/90, y
    // la feria se vende AL COSTO: un `select` en vez de una lista blanca publica el margen de la
    // casa el día que alguien agregue un campo a la foto.
    const [uno] = preciosAEtiquetar([
      { pid: '9', estado: 'confirmado', foto: { nombre: 'X', costo: 8295.89, ventas90: 6, precioNormal: 18990 }, decision: { precioSale: 8990, margen: 7.7, markup: 8.3 } },
    ])
    expect(Object.keys(uno).sort()).toEqual(['firme', 'nombre', 'pid', 'precio'])
    expect(JSON.stringify(uno)).not.toContain('8295')
  })

  it('saltea el que no tiene precio en vez de imprimir $0', () => {
    // Una etiqueta de $0 sale linda y nadie la ve hasta que está colgada en la mesa.
    expect(preciosAEtiquetar([{ pid: '7', estado: 'confirmado', foto: { nombre: 'X' }, decision: { precioSale: 0 } }])).toEqual([])
    expect(preciosAEtiquetar([{ pid: '8', estado: 'confirmado', foto: { nombre: 'X' }, decision: {} }])).toEqual([])
  })

  it('aguanta la lista vacía y la nula', () => {
    expect(preciosAEtiquetar([])).toEqual([])
    expect(preciosAEtiquetar(null)).toEqual([])
  })
})
