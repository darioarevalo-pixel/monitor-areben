import { describe, it, expect } from 'vitest'
import { buscarPorTelefono, indexarTelefonos, normalizeArgPhone } from '@/lib/crm/telefono.core.js'
import { registrarContacto, TOPE_CONTACTOS } from '@/lib/crm/seguimiento'
import { armarFicha } from '@/lib/crm/panel'
import type { MapaSeguimiento } from '@/lib/crm/tipos'

/**
 * El panel de WhatsApp: lo que puede salir mal y no avisa.
 *
 * Las dos piezas que se prueban acá son las dos que, equivocadas, escriben en la ficha de otra
 * persona o borran el seguimiento — y ninguna de las dos tira error cuando falla:
 *
 *  1. **El cruce por teléfono.** Es lo único que decide de quién es la ficha que se abre. Un cruce
 *     de más y se anota un contacto en el cliente equivocado.
 *  2. **`registrarContacto`.** Escribe en `crm:seg:bdi`, la clave sin backup de 305 clientes.
 */

describe('normalizeArgPhone', () => {
  it('lleva las formas que se cargan a mano a la forma de WhatsApp', () => {
    // Todas éstas son la misma persona, escritas como aparecen en Gestión Nube.
    for (const escrito of ['3834270554', '0383 4270554', '(383) 15 427-0554'.replace('15', ''), '+54 9 383 427-0554', '5493834270554']) {
      expect(normalizeArgPhone(escrito)).toBe('5493834270554')
    }
  })

  it('devuelve vacío cuando no se puede: eso es "sin teléfono"', () => {
    expect(normalizeArgPhone('')).toBe('')
    expect(normalizeArgPhone(null)).toBe('')
    expect(normalizeArgPhone('sin datos')).toBe('')
    expect(normalizeArgPhone('1234')).toBe('')
  })
})

describe('buscar el cliente del chat', () => {
  const padron = [
    { id: 1, phone: '3834270554' },
    { id: 2, phone: '011 5555-4444' },
    { id: 3, phone: '' },
    { id: 4, phone: 'no tiene' },
  ]

  it('cruza exacto sin importar cómo esté escrito el teléfono en la ficha', () => {
    const i = indexarTelefonos(padron)
    expect(buscarPorTelefono(i, '5493834270554')).toEqual({ ids: [1], via: 'exacto' })
    expect(buscarPorTelefono(i, '5491155554444')).toEqual({ ids: [2], via: 'exacto' })
  })

  it('no inventa un cliente para un número que no está', () => {
    const i = indexarTelefonos(padron)
    expect(buscarPorTelefono(i, '5491199998888')).toEqual({ ids: [], via: '' })
    expect(buscarPorTelefono(i, '')).toEqual({ ids: [], via: '' })
  })

  it('rescata por los últimos 8 dígitos al cliente con la característica mal cargada', () => {
    // El caso real: en GN quedó cargado con un dígito de más adelante, así que el normalizado no
    // coincide. Los 8 del final —el abonado— sí.
    const i = indexarTelefonos([{ id: 9, phone: '38834270554' }])
    expect(buscarPorTelefono(i, '5493834270554')).toEqual({ ids: [9], via: 'cola' })
  })

  it('🔴 con dos candidatos por la cola devuelve LOS DOS, no el primero', () => {
    // Elegir uno acá es anotar el contacto en la ficha equivocada, en silencio. El panel pregunta.
    const i = indexarTelefonos([
      { id: 10, phone: '38834270554' },
      { id: 11, phone: '1134270554' },
    ])
    const r = buscarPorTelefono(i, '5493834270554')
    expect(r.via).toBe('cola')
    expect(r.ids.sort()).toEqual([10, 11])
  })

  it('el mismo teléfono en dos fichas devuelve las dos', () => {
    const i = indexarTelefonos([
      { id: 20, phone: '3834270554' },
      { id: 21, phone: '+549 383 4270554' },
    ])
    expect(buscarPorTelefono(i, '5493834270554')).toEqual({ ids: [20, 21], via: 'exacto' })
  })
})

describe('registrarContacto', () => {
  const base: MapaSeguimiento = {
    '100': { cadencia: 'semanal', ultimo_contacto: '2026-08-01', proximo_manual: null, notas: [{ fecha: '2026-08-01', texto: 'quedó en avisar' }] },
    '200': { cadencia: 'mensual', ultimo_contacto: '2026-07-01', proximo_manual: null, notas: [] },
  }

  it('anota el resultado y mueve el último contacto al día de hoy', () => {
    const r = registrarContacto(base, 100, 'pidio_precio', '2026-08-23')
    expect(r['100'].contactos).toEqual([{ fecha: '2026-08-23', resultado: 'pidio_precio' }])
    // Sin esto la cadencia seguiría contando desde el 1 y el cliente volvería a la lista de hoy.
    expect(r['100'].ultimo_contacto).toBe('2026-08-23')
  })

  it('no toca al otro cliente ni muta el mapa que recibió', () => {
    const antes = JSON.stringify(base)
    const r = registrarContacto(base, 100, 'contesto', '2026-08-23')
    expect(JSON.stringify(base)).toBe(antes)
    expect(r['200']).toEqual(base['200'])
  })

  it('conserva lo que ya tenía el cliente', () => {
    const r = registrarContacto(base, 100, 'contesto', '2026-08-23')
    expect(r['100'].cadencia).toBe('semanal')
    expect(r['100'].notas).toEqual(base['100'].notas)
  })

  it('el más nuevo va primero', () => {
    const uno = registrarContacto(base, 100, 'no_contesto', '2026-08-20')
    const dos = registrarContacto(uno, 100, 'contesto', '2026-08-23')
    expect(dos['100'].contactos?.map((c) => c.fecha)).toEqual(['2026-08-23', '2026-08-20'])
  })

  it('un cliente que nunca se tocó nace con la entrada completa', () => {
    const r = registrarContacto(base, 999, 'contesto', '2026-08-23')
    expect(r['999']).toEqual({
      cadencia: '',
      ultimo_contacto: '2026-08-23',
      proximo_manual: null,
      notas: [],
      contactos: [{ fecha: '2026-08-23', resultado: 'contesto' }],
    })
  })

  it('la lista tiene techo: el mapa entero se reescribe en cada guardado', () => {
    let m: MapaSeguimiento = base
    for (let i = 0; i < TOPE_CONTACTOS + 10; i++) m = registrarContacto(m, 100, 'no_contesto', '2026-08-' + String((i % 28) + 1).padStart(2, '0'))
    expect(m['100'].contactos).toHaveLength(TOPE_CONTACTOS)
  })
})

describe('armarFicha', () => {
  const hoy = new Date('2026-08-23T10:00:00')
  const cliente = { id: 500, name: 'Local del Centro', email: '', phone: '3834270554', city: 'Catamarca', province: 'Catamarca' }

  it('calcula la ficha con las ventas del cliente', () => {
    const f = armarFicha(
      {
        cliente,
        ventas: [
          { id: 1, date_sale: '2026-08-10', total_price: '10000', client_id: 500, channel_id: 10, sale_state: 'completed' },
          { id: 2, date_sale: '2026-06-01', total_price: '5000', client_id: 500, channel_id: 10, sale_state: 'completed' },
        ],
        detalles: [{ sale_id: 1, product_name: 'Funda lisa', size: 'U', quantity: 6, unit_price: '1200', total: '7200' }],
      },
      {},
      hoy,
    )
    expect(f.cliente.total_sales).toBe(2)
    expect(f.cliente.total_amount).toBe(15000)
    expect(f.compras.ultima?.items[0].product_name).toBe('Funda lisa')
  })

  it('un cliente sin ninguna venta se dibuja en cero, no explota', () => {
    // Es real: una ficha cargada en GN que todavía no compró, o alguien cuya única venta es técnica.
    const f = armarFicha({ cliente, ventas: [], detalles: [] }, {}, hoy)
    expect(f.cliente.name).toBe('Local del Centro')
    expect(f.cliente.total_sales).toBe(0)
    expect(f.compras.ultima).toBeNull()
  })

  it('🔴 un cliente descartado igual muestra su ficha', () => {
    // Sale de la tabla del CRM a propósito, pero si te está escribiendo EXISTE: mostrarlo como
    // desconocido llevaría a cargarlo de nuevo como lead, o sea a duplicarlo.
    const f = armarFicha(
      { cliente, ventas: [{ id: 1, date_sale: '2026-08-10', total_price: '10000', client_id: 500, channel_id: 10, sale_state: 'completed' }], detalles: [] },
      { '500': { descartado: true } },
      hoy,
    )
    expect(f.cliente.id).toBe(500)
    expect(f.cliente.total_sales).toBe(1)
  })
})
