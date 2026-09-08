import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SkelCelda } from '@/components/ui'

/**
 * **La barrita que late mientras un número viaja.**
 *
 * 🔴 Existe por un reporte de Bruno del 8-sep-2026 sobre la lista del PRM: *«estaría bueno que
 * marque algo como cargando, en vez de que marque en cero los resultados»*. La celda ya decía «…» y
 * ⛔ no «0» —o sea que ya no afirmaba «no vendió nada»—, **pero evitar la mentira ⛔ no es lo mismo
 * que decir la verdad**: en una tabla de 34 filas los tres puntitos se leen como la celda vacía de
 * un dato que no está.
 *
 * 🔑 Lo que se clava acá es lo único que ⛔ no puede volver atrás: que **⛔ no dibuje texto**. Un
 * carácter adentro de una celda numérica siempre se va a poder leer como un valor.
 */
describe('SkelCelda', () => {
  const html = renderToStaticMarkup(<SkelCelda />)

  it('🔴 ⛔ NO dibuja texto: nada adentro de una celda numérica puede leerse como un valor', () => {
    expect(html.replace(/<[^>]*>/g, '').trim()).toBe('')
    expect(html).not.toContain('…')
    expect(html).not.toContain('0')
  })

  it('dice que está cargando para quien ⛔ no lo ve', () => {
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('aria-label="Cargando"')
  })

  it('usa el esqueleto del kit y ⛔ no una animación propia', () => {
    expect(html).toContain('mo-skel')
  })

  it('el ancho se puede pedir: una celda de tabla y una tarjeta de KPI ⛔ no miden lo mismo', () => {
    expect(renderToStaticMarkup(<SkelCelda ancho={40} />)).toContain('width:40px')
  })
})
