import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AireDeHoy, DeUnaLinea, LaFichaContraLaFoto } from '@/components/meta-ads/rentabilidad/Rentabilidad'
import { calcularRentabilidad, costoQueManda, DEFAULTS } from '@/lib/meta-ads/rentabilidad'

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

/**
 * **El aire, que es la única línea de esta pantalla que habla del presente.**
 *
 * 🔴 Hasta el 30-ago-2026 salía de un `costoHoy` TIPEADO que había envejecido: medido ese día, BDI
 * decía 2,70× de aire y tenía 1,17×, y Zattia decía 1,97× y tenía 6,62×. Ahora manda la foto, y lo
 * que este bloque fija son las tres cosas que la pantalla ⛔ no puede volver a hacer:
 *
 *  1. **Pintar un aire mientras la foto se está leyendo.** Los dos números son plausibles, así que
 *     el salto ⛔ no se nota — es el mismo defecto de los $9.101 de arriba, con otra ropa.
 *  2. **Caer al número tipeado sin decirlo.** Sin el motivo escrito, «pagás $2.472» se lee como
 *     medido.
 *  3. **Dibujar el costo sin la ventana.** Cierra en el último día CERRADO de ESA línea, que ⛔ no
 *     es el mismo para todas: el 30-ago BDI cerraba el 29 y Zattia el 26.
 */
describe('el aire de hoy, debajo del techo', () => {
  const foto = { costo: 5697, pedidos: 109, desde: '2026-08-23', hasta: '2026-08-29' }

  it('🔴 mientras se lee la foto ⛔ no dibuja NINGÚN número de aire', () => {
    const html = renderToStaticMarkup(<AireDeHoy vigente={null} medido={undefined} aire={2.7} fichaPropia />)
    expect(html).toContain('Leyendo la foto')
    expect(html).not.toContain('2,7')
    expect(html).not.toContain('×')
  })

  it('con foto dice el costo, el aire, la ventana y sobre cuántos pedidos', () => {
    const html = renderToStaticMarkup(
      <AireDeHoy vigente={costoQueManda({ medido: foto, tipeado: 2472 })} medido={foto} aire={1.17} fichaPropia />,
    )
    expect(html).toContain('5.697')
    expect(html).toContain('1,2× de aire') // `decimal` va a un decimal
    expect(html).toContain('23/08')
    expect(html).toContain('29/08')
    expect(html).toContain('109 pedidos')
  })

  it('🔴 SIN FICHA PROPIA muestra el costo y ⛔ NO el aire: el techo de arriba es prestado', () => {
    // Stunned al 30-ago: $361 por pedido real, medido, y cero ficha. Dividirlo por el techo de las
    // fundas de BDI daría un aire que no es de ninguna de las dos líneas.
    const stunned = { costo: 361, pedidos: 61, desde: '2026-08-07', hasta: '2026-08-13' }
    const html = renderToStaticMarkup(
      <AireDeHoy
        vigente={costoQueManda({ medido: stunned, tipeado: 0 })}
        medido={stunned}
        aire={18.5}
        fichaPropia={false}
      />,
    )
    expect(html).toContain('361')
    expect(html).toContain('sin aire')
    expect(html).toContain('prestado')
    expect(html).not.toContain('de aire')
    expect(html).not.toContain('18,5')
  })

  it('🔴 sin foto cae a la ficha DICIENDO que no está medido', () => {
    const html = renderToStaticMarkup(
      <AireDeHoy vigente={costoQueManda({ medido: null, tipeado: 2472 })} medido={null} aire={2.7} fichaPropia />,
    )
    expect(html).toContain('2.472')
    expect(html).toContain('Sin medir')
  })
})

/**
 * **El aviso de que la ficha quedó vieja.** ⛔ No es una pregunta bloqueante: la foto manda igual.
 * Es lo que impide que el número guardado envejezca para siempre y vuelva a mandar el día que la
 * foto no conteste.
 */
describe('la ficha contra la foto', () => {
  const foto = { costo: 5697, pedidos: 109, desde: '2026-08-23', hasta: '2026-08-29' }
  const pintar = (tipeado: number, puedeEditar = true, fichaPropia = true) => renderToStaticMarkup(
    <LaFichaContraLaFoto
      vigente={costoQueManda({ medido: foto, tipeado })}
      medido={foto}
      tipeado={tipeado}
      fichaPropia={fichaPropia}
      puedeEditar={puedeEditar}
      adoptar={noop}
    />,
  )

  it('avisa con los dos números y la ventana, y ofrece emparejarla', () => {
    const html = pintar(2472)
    expect(html).toContain('2.472')
    expect(html).toContain('5.697')
    expect(html).toContain('57%')
    expect(html).toContain('Emparejar la ficha')
  })

  it('⛔ no molesta cuando la diferencia es de redondeo', () => {
    // 5% no es una ficha vieja: son dos redondeos del mismo número.
    expect(pintar(Math.round(foto.costo * 1.05))).toBe('')
  })

  it('🔴 sin fila guardada ⛔ no dice nada: lo tipeado son los defaults de BDI, ⛔ no «la ficha»', () => {
    expect(pintar(2472, true, false)).toBe('')
  })

  it('quien ⛔ no puede editar ve el aviso y ⛔ no el botón', () => {
    const html = pintar(2472, false)
    expect(html).toContain('quedó vieja')
    expect(html).not.toContain('Emparejar la ficha')
  })
})
