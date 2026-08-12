/**
 * La NOTA de una venta importada de Tienda Nube.
 *
 * Importa: todas las ventas online de Stunned se atribuyen al MISMO cliente genérico de GN, así que
 * `client_name` dice siempre lo mismo. Esta nota es el ÚNICO lugar donde queda quién compró, por
 * cuánto y con qué. Si se rompe, el dato no está en ningún otro lado.
 */
import { describe, expect, it } from 'vitest'
// JS plano a propósito: la comparten `api/crear-venta.js` (que la escribe) y el dry-run de
// Integraciones (que la muestra antes de que alguien apriete Importar).
import { notaTnImport } from '@/lib/sync-tn/nota.core.js'

// Los datos reales de la orden #112 de stunned.com.ar, la primera que va a pasar por acá.
const ORDEN_112 = { cliente: 'Lautaro Mora', fecha_tn: '2026-08-11', total_tn: 38241, pago: 'wire_transfer' }

describe('notaTnImport', () => {
  it('pone el número de orden y el nombre, que es para lo que existe', () => {
    const nota = notaTnImport('112', ORDEN_112)
    expect(nota).toContain('#Orden: 112')
    expect(nota).toContain('Lautaro Mora')
  })

  it('copia el prefijo de la integración nativa de TN, para que en GN se lean igual', () => {
    expect(notaTnImport('112', ORDEN_112).startsWith('De Tienda Nube. #Orden: 112')).toBe(true)
  })

  it('suma fecha, total y forma de pago separados por " | "', () => {
    expect(notaTnImport('112', ORDEN_112)).toBe('De Tienda Nube. #Orden: 112 | Cliente: Lautaro Mora | Fecha: 2026-08-11 | Total TN: 38.241 | Pago: Transferencia')
  })

  it('omite el campo que no vino en vez de escribir "null" o dejar un separador huérfano', () => {
    const nota = notaTnImport('113', { cliente: null, fecha_tn: '2026-08-11', total_tn: null, pago: undefined })
    expect(nota).toBe('De Tienda Nube. #Orden: 113 | Fecha: 2026-08-11')
    expect(nota).not.toMatch(/null|undefined|\|\s*\|/)
  })

  it('sobrevive a una orden sin ningún dato: queda el número, que nunca falta', () => {
    expect(notaTnImport('114', {})).toBe('De Tienda Nube. #Orden: 114')
  })

  it('traduce la forma de pago: en GN la lee una persona, no un programa', () => {
    expect(notaTnImport('112', { pago: 'wire_transfer' })).toContain('Pago: Transferencia')
    expect(notaTnImport('112', { pago: 'credit_card' })).toContain('Pago: Tarjeta de crédito')
    expect(notaTnImport('112', { pago: 'MercadoPago' })).toContain('Pago: Mercado Pago')
  })

  it('un medio de pago que no conocemos pasa TAL CUAL, no se convierte en "Otro"', () => {
    // TN suma medios cuando quiere. Una nota que dice `mobbex` sirve; una que dice "Otro", no.
    expect(notaTnImport('112', { pago: 'mobbex' })).toContain('Pago: mobbex')
  })

  it('no deja pasar un total 0 ni uno que no es número', () => {
    expect(notaTnImport('115', { total_tn: 0 })).not.toContain('Total TN')
    expect(notaTnImport('116', { total_tn: 'ochenta' })).not.toContain('Total TN')
  })

  it('aplasta los saltos de línea: un nombre con enter no puede partir la nota', () => {
    expect(notaTnImport('117', { cliente: 'Ana\n  Pérez' })).toContain('Cliente: Ana Pérez')
  })

  it('un nombre absurdo se recorta y NO se come a los demás datos', () => {
    // Éste es el motivo real del recorte por campo. Sin él, el nombre desplaza a la fecha, al total
    // y a la forma de pago, que es justo lo que la nota viene a preservar.
    const nota = notaTnImport('118', { ...ORDEN_112, cliente: 'M'.repeat(500) })
    expect(nota).toContain('#Orden: 118')
    expect(nota).toContain('Fecha: 2026-08-11')
    expect(nota).toContain('Total TN: 38.241')
    expect(nota).toContain('Pago: Transferencia')
    expect(nota).toContain('…')
  })

  it('con todos los campos en su máximo, la nota sigue siendo chica', () => {
    // El tope de `comments` de GN no lo conocemos. Lo que sí controlamos es que la nota no pueda
    // crecer sin límite: los topes por campo la dejan MUY por debajo de cualquier tope plausible.
    const nota = notaTnImport('9'.repeat(30), { cliente: 'A'.repeat(500), fecha_tn: '2026-08-11', total_tn: 999999999, pago: 'P'.repeat(300) })
    expect(nota.length).toBeLessThan(250)
  })
})
