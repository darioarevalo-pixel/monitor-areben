import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DeUnaLinea } from '@/components/meta-ads/rentabilidad/Rentabilidad'
import { calcularRentabilidad, DEFAULTS } from '@/lib/meta-ads/rentabilidad'

/**
 * **El primer cuadro de la pantalla de Rentabilidad**, y existe por un defecto que Bruno vio en
 * producción el 22-ago-2026: *«cada vez que cambio de marca, incluso en la de BDI, primero me
 * aparece el rendimiento anterior de BDI de 9 mil pesos de techo por compra»*.
 *
 * El hook arranca en `DEFAULTS` y `DeUnaLinea` va con `key={laLinea}`, así que **cada cambio de
 * pestaña remonta** y repinta ese arranque. Durante un cuadro las cinco tarjetas afirmaban un techo
 * de $9.101 que no es el de ninguna línea guardada.
 *
 * 🔑 **`renderToStaticMarkup` ES el oráculo justo para esto y no una aproximación**: no corre
 * `useEffect`, así que lo que devuelve es exactamente el primer cuadro —el estado en el que el
 * defecto vivía—. Un test que esperara a que la carga termine no podría verlo nunca.
 *
 * ⚠️ Lo que se afirma es **qué NO muestra**. Por eso el número prohibido no está tipeado a mano:
 * sale de `calcularRentabilidad(DEFAULTS)`, así que si alguien mueve `DEFAULTS.unidades` el test
 * sigue defendiendo la misma regla y no una cifra que quedó vieja.
 */
const noop = () => {}

describe('el primer cuadro de Rentabilidad, antes de que llegue la fila', () => {
  const html = renderToStaticMarkup(
    <DeUnaLinea laLinea="zattia" visibles={['bdi', 'zattia']} setLinea={noop} />,
  )

  it('no dibuja NINGÚN número de los defaults mientras carga', () => {
    const r = calcularRentabilidad(DEFAULTS)
    // El techo de los defaults —los $9.101 que Bruno vio— y el ticket, que es el otro número grande.
    for (const prohibido of [Math.round(r.costoMax), Math.round(r.ticket), Math.round(r.contribPedido)]) {
      expect(html).not.toContain(prohibido.toLocaleString('es-AR'))
    }
  })

  it('dice que está leyendo, y de qué línea', () => {
    expect(html).toContain('Leyendo el umbral de')
    expect(html).toContain('Zattia')
  })

  it('deja las pestañas puestas: cambiar de marca no se bloquea mientras carga', () => {
    expect(html).toContain('BDI')
  })
})
