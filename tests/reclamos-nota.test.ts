/**
 * La NOTA de las ventas técnicas de post-venta.
 *
 * **Por qué tiene tests propios:** estas ventas van todas al MISMO cliente genérico de Gestión Nube
 * («Reclamo BDI», «Falla», «Cambio»), así que en GN una venta técnica es indistinguible de otra y
 * la nota es el único lugar donde sobrevive de qué caso salió. Si se rompe, el dato **no está en
 * ningún otro lado** y no hay pantalla que se ponga roja: se descubre meses después, con un conteo
 * que no cierra y una venta en $0 que nadie puede explicar.
 */
import { describe, expect, it } from 'vitest'
import { notaVentaTecnica } from '@/lib/reclamos/nota'
import type { DatosNota } from '@/lib/reclamos/nota'

/** El reclamo 12 de BDI, con todo cargado: es la nota más completa que se puede escribir. */
const R12: DatosNota = {
  id: 12,
  numero: 'R-0012',
  orden_tn: '1187',
  cliente: 'Lautaro Mora',
  motivo: 'falla',
  motivo_detalle: 'se descosió el ruedo',
  solicitud_envio: 'EM12345678',
}

describe('notaVentaTecnica', () => {
  it('abre con el número de reclamo, que es la llave para volver al caso', () => {
    expect(notaVentaTecnica('regalada', R12).startsWith('Reclamo R-0012 —')).toBe(true)
  })

  /**
   * 🔴 **Acá el candado es CORRECTO, al revés que en el resto.** Esta cadena ⛔ no se queda en la
   * app: sale como `comments` de la venta técnica y **queda escrita en Gestión Nube**, o sea en el
   * sistema contable, fuera de este repo. Fijarla literal es lo que obliga a que quien renombre un
   * motivo **vea** que está cambiando lo que se escribe afuera.
   *
   * ⚠️ Se actualizó a mano el 27-ago-2026 (`Falla` → `Fallado`) al cambiar `MOTIVO_LABEL`. Las
   * notas ya escritas conservan el rótulo viejo: renombrar ⛔ no reescribe el pasado.
   */
  it('lleva la orden de TN, el cliente de verdad y el motivo: lo que GN no puede decir', () => {
    const nota = notaVentaTecnica('regalada', R12, { usuario: 'bruno' })
    expect(nota).toBe(
      'Reclamo R-0012 — se lo queda el cliente (producto sano) · Orden TN: 1187 · Cliente: Lautaro Mora'
      + ' · Motivo: Fallado — se descosió el ruedo · EM 12345678 · Decidió: bruno · (Monitor)',
    )
  })

  // 🔑 Es la distinción que se perdía hasta el 26-ago-2026: las dos salían por el mismo camino y
  // una unidad impecable terminaba anotada como falla. Si la nota no las separa, en GN vuelven a
  // ser la misma cosa.
  it('dice si el producto estaba SANO o FALLADO, que es lo que las dos ventas no distinguen', () => {
    expect(notaVentaTecnica('regalada', R12)).toContain('producto sano')
    expect(notaVentaTecnica('falla', R12)).toContain('volvió fallada')
    expect(notaVentaTecnica('regalada', R12)).not.toContain('fallada')
  })

  it('las cuatro salidas escriben cuatro cosas distintas', () => {
    const salidas = (['regalada', 'reemplazo', 'falla', 'cambio'] as const).map((s) => notaVentaTecnica(s, R12))
    expect(new Set(salidas).size).toBe(4)
  })

  it('la etiqueta del depósito de fallas viaja SOLO en la salida falla', () => {
    expect(notaVentaTecnica('falla', R12, { barcode: 'F-000123' })).toContain('Etiqueta: F-000123')
    expect(notaVentaTecnica('regalada', R12, { barcode: 'F-000123' })).not.toContain('F-000123')
  })

  it('omite el campo que no vino en vez de escribir "null" o dejar un separador huérfano', () => {
    const nota = notaVentaTecnica('cambio', { id: 7, orden_tn: '1188', cliente: null, motivo_detalle: null })
    expect(nota).toBe('Reclamo R-0007 — lo que se lleva el cliente en el cambio · Orden TN: 1188 · (Monitor)')
    expect(nota).not.toMatch(/null|undefined|·\s*·/)
  })

  it('sin número guardado lo deriva del id: la nota nunca sale sin llave', () => {
    expect(notaVentaTecnica('reemplazo', { id: 7 })).toContain('Reclamo R-0007')
  })

  // Los topes son POR CAMPO y eso es el mecanismo: no alcanza con que la nota entera entre en el
  // recorte a 500 de crear-venta, porque un solo campo largo se comería a todos los demás.
  it('un nombre absurdo se recorta a lo suyo y NO se come los otros datos', () => {
    const nota = notaVentaTecnica('regalada', { ...R12, cliente: 'M'.repeat(400) }, { usuario: 'bruno' })
    expect(nota).toContain('Orden TN: 1187')
    expect(nota).toContain('Decidió: bruno')
    expect(nota).toContain('(Monitor)')
    expect(nota.length).toBeLessThan(300)
  })

  it('la nota más larga posible entra en el campo de GN con aire', () => {
    const nota = notaVentaTecnica(
      'falla',
      {
        id: 999999, numero: 'X'.repeat(60), orden_tn: 'X'.repeat(60), cliente: 'X'.repeat(200),
        motivo: 'no_como_publicado', motivo_detalle: 'X'.repeat(200), solicitud_envio: 'X'.repeat(60),
      },
      { usuario: 'X'.repeat(80), barcode: 'X'.repeat(80) },
    )
    expect(nota.length).toBeLessThan(400)
  })

  it('aplasta el enter de un relato pegado a mano: un campo no puede partir la nota', () => {
    const nota = notaVentaTecnica('falla', { ...R12, motivo_detalle: 'se\ndescosió' })
    expect(nota).not.toMatch(/\n/)
  })
})
