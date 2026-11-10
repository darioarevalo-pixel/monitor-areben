/**
 * «Para reetiquetar» también trae lo que cambió de RÓTULO, ⛔ sólo de precio (Bruno, 10-nov-2026:
 * el Cyber pasó a «OFERTAS» con el mismo precio y la cola no las traía).
 */
import { describe, expect, it } from 'vitest'
import { armarCola, cambioElRotulo, conCambioDeRotulo, type EventoDePrecio } from '@/lib/etiquetas/cola'

const ev = (pid: string, modo: 'poner' | 'sacar', cuando: string, liqNombre = 'CYBER MONDAY ONLINE'): EventoDePrecio => ({
  pid, producto: pid, sku: null, cuando, precioA: modo === 'poner' ? 29990 : null, precioLista: 51490, liqNombre, modo,
})
const ROT = { 'CYBER MONDAY ONLINE': { desde: '2026-11-10T18:00:00Z' } }

describe('conCambioDeRotulo', () => {
  it('la etiqueta impresa ANTES del cambio de rótulo vuelve a la cola (BLUSA CLOE)', () => {
    const eventos = conCambioDeRotulo([ev('cloe', 'poner', '2026-11-01T15:27:11Z')], ROT)
    const c = armarCola(eventos, { cloe: '2026-11-10T14:39:13Z' }, { cloe: 7 })
    expect(c.pendientes.map((f) => f.pid)).toEqual(['cloe'])
    expect(c.pendientes[0].porRotulo).toBe(true)
  })
  it('la impresa DESPUÉS del cambio queda hecha', () => {
    const c = armarCola(conCambioDeRotulo([ev('cloe', 'poner', '2026-11-01T15:27:11Z')], ROT), { cloe: '2026-11-10T19:00:00Z' }, { cloe: 7 })
    expect(c.hechas.map((f) => f.pid)).toEqual(['cloe'])
  })
  it('⛔ toca la que ya salió de la campaña (volvió a lista, sin rótulo)', () => {
    const [e] = conCambioDeRotulo([ev('x', 'sacar', '2026-11-10T12:25:00Z')], ROT)
    expect(e.cuando).toBe('2026-11-10T12:25:00Z')
  })
  it('⛔ toca otra campaña ni una sin sello', () => {
    expect(conCambioDeRotulo([ev('x', 'poner', '2026-11-01T00:00:00Z', 'Feria Online')], ROT)[0].cuando).toBe('2026-11-01T00:00:00Z')
    expect(conCambioDeRotulo([ev('x', 'poner', '2026-11-01T00:00:00Z')], { 'CYBER MONDAY ONLINE': { desde: null } })[0].cuando).toBe('2026-11-01T00:00:00Z')
  })
  it('un precio cambiado DESPUÉS del rótulo manda su propia fecha', () => {
    expect(conCambioDeRotulo([ev('x', 'poner', '2026-11-11T00:00:00Z')], ROT)[0].cuando).toBe('2026-11-11T00:00:00Z')
  })
})

describe('cambioElRotulo', () => {
  const d = { nombreComercial: 'CYBER', etiqueta: { abajo: [{ texto: 'EFT/TRANSF' }] } }
  it('el nombre comercial o los renglones de abajo', () => {
    expect(cambioElRotulo(d, { ...d, nombreComercial: 'OFERTAS' })).toBe(true)
    expect(cambioElRotulo(d, { ...d, etiqueta: { abajo: [{ texto: 'EFECTIVO' }] } })).toBe(true)
  })
  it('⛔ las fechas, la nota o el tamaño', () => {
    expect(cambioElRotulo(d, { ...d, hasta: '2026-11-30', nota: 'x', etiqueta: { ...d.etiqueta, tamPrecio: 30 } })).toBe(false)
  })
})
