import { describe, it, expect } from 'vitest'
import { buscarPorTelefono, indexarTelefonos, normalizeArgPhone } from '@/lib/crm/telefono.core.js'
import {
  cumplirPendiente,
  registrarContacto,
  setDespacho,
  setPendiente,
  setTenerEnCuenta,
  TOPE_CONTACTOS,
} from '@/lib/crm/seguimiento'
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

/**
 * Los tres campos que se separaron de la nota (📦 despacho · 📌 tener en cuenta · ⏳ pendiente).
 *
 * Escriben en `crm:seg:bdi`, la clave sin backup de 744 clientes que se reescribe ENTERA en cada
 * guardado. Lo que se prueba acá es lo que no avisa cuando falla: que un campo vacío no deje la
 * clave puesta (el mapa engorda para siempre y el diff contra el dump se vuelve ilegible) y que
 * tachar el pendiente no se lleve puesto nada más.
 */
describe('los tres campos del contexto', () => {
  const base: MapaSeguimiento = {
    '1': { cadencia: 'semanal', notas: [{ fecha: '2026-08-01', texto: 'le mandé los ingresos' }] },
    '2': { cadencia: 'mensual' },
  }

  it('guarda el texto sin espacios de más y no toca al otro cliente', () => {
    const r = setTenerEnCuenta(base, 1, '  tiene 4 locales en Santiago  ')
    expect(r['1'].tener_en_cuenta).toBe('tiene 4 locales en Santiago')
    expect(r['2']).toEqual(base['2'])
    // El mapa que llegó no se toca: la capa de arriba compara y persiste el nuevo.
    expect(base['1'].tener_en_cuenta).toBeUndefined()
  })

  it('🔴 vacío BORRA la clave, no la deja en cadena vacía', () => {
    const con = setDespacho(base, 1, 'Vía Cargo, sucursal Catamarca')
    expect(con['1'].despacho).toBe('Vía Cargo, sucursal Catamarca')
    const sin = setDespacho(con, 1, '   ')
    expect('despacho' in sin['1']).toBe(false)
  })

  it('un cliente que nunca se tocó nace con la entrada completa', () => {
    const r = setPendiente({}, 9, 'preguntar por reposición')
    expect(r['9']).toEqual({ cadencia: '', ultimo_contacto: null, proximo_manual: null, notas: [], pendiente: 'preguntar por reposición' })
  })

  it('conserva lo que ya tenía el cliente', () => {
    const r = setPendiente(base, 1, 'controlar recepción')
    expect(r['1'].cadencia).toBe('semanal')
    expect(r['1'].notas).toHaveLength(1)
  })
})

describe('tachar el pendiente', () => {
  const base: MapaSeguimiento = { '1': { cadencia: 'semanal', notas: [], pendiente: 'preguntar por reposición' } }

  it('lo saca de arriba y deja la constancia en las notas', () => {
    const r = cumplirPendiente(base, 1, '2026-08-24')
    expect('pendiente' in r['1']).toBe(false)
    expect(r['1'].notas).toEqual([{ fecha: '2026-08-24', texto: '✅ preguntar por reposición' }])
  })

  it('sin pendiente cargado devuelve el MISMO mapa: no hay POST que hacer', () => {
    const vacio: MapaSeguimiento = { '1': { cadencia: 'semanal', notas: [] } }
    expect(cumplirPendiente(vacio, 1, '2026-08-24')).toBe(vacio)
    // Y tampoco por un cliente que no existe en el mapa.
    expect(cumplirPendiente(vacio, 77, '2026-08-24')).toBe(vacio)
  })

  it('no pisa las notas que ya había: la nueva va primero', () => {
    const con: MapaSeguimiento = { '1': { notas: [{ fecha: '2026-08-01', texto: 'le avisé de los ingresos' }], pendiente: 'controlar recepción' } }
    const r = cumplirPendiente(con, 1, '2026-08-24')
    expect(r['1'].notas?.map((n) => n.texto)).toEqual(['✅ controlar recepción', 'le avisé de los ingresos'])
  })
})
