/**
 * La UNIDAD: el destino y la recepción, **por producto**.
 *
 * Lo que se prueba acá no es una estructura de datos: es que un reclamo de dos productos pueda
 * decir la verdad. Hasta el 25-ago-2026 tenía un solo destino y una sola recepción para todo, y
 * medido antes de tocar nada **3 de los 10 reclamos de BDI ya tienen dos productos** — así que el
 * caso no es hipotético, es el 30 %.
 *
 * El oráculo es el mostrador: qué hay que buscar adentro de la caja, y qué falta cuando llegó uno.
 */
import { describe, expect, it } from 'vitest'
import {
  aplicarDestinos, deDondeVuelve, destinoDeUnidad, laUnidadVuelve, loQueFaltaLlegar,
  recibirUnidades, trabaParaRecibir, unidadesQueVuelven,
  type FilaConUnidades, type ItemReclamo,
} from '@/lib/reclamos/tipos'

const AHORA = '2026-08-25T12:00:00.000Z'
const buzo: ItemReclamo = { producto: 'Buzo', cantidad: 1 }
const gorra: ItemReclamo = { producto: 'Gorra', cantidad: 1 }

/** Una falla de dos productos que vuelve entera: el caso normal. */
const dos: FilaConUnidades = { motivo: 'falla', destino_prenda: 'stock', retorno_decidido: true, items: [buzo, gorra] }

describe('el destino es de la unidad, y el del reclamo es su default', () => {
  it('la unidad sin destino propio usa el del reclamo', () => {
    expect(destinoDeUnidad(buzo, dos)).toBe('stock')
    expect(destinoDeUnidad({ ...buzo, destino: 'perdida' }, dos)).toBe('perdida')
  })

  it('se esperan sólo las que vuelven: la que se queda el cliente ⛔ no', () => {
    const mixto: FilaConUnidades = { ...dos, items: [buzo, { ...gorra, destino: 'perdida' }] }
    expect(unidadesQueVuelven(mixto).unidades.map((u) => u.item.producto)).toEqual(['Buzo'])
  })

  /**
   * ⚠️ `'falla'` está sobrecargado: significa "vuelve como falla" cuando se pidió el retorno, y
   * "se la queda el cliente y sale del stock" cuando no. Por eso hacen falta los dos datos.
   */
  it('una falla vuelve sólo si se pidió el retorno', () => {
    expect(laUnidadVuelve('falla', true)).toBe(true)
    expect(laUnidadVuelve('falla', false)).toBe(false)
    expect(laUnidadVuelve('stock', false)).toBe(true)
    expect(laUnidadVuelve('perdida', true)).toBe(false)
    expect(laUnidadVuelve('no_salio', true)).toBe(false)
  })

  it('en un pedido mal armado lo que vuelve es lo que se mandó POR ERROR', () => {
    // El producto que compró es el único que nunca salió del depósito: esperarlo es esperar algo
    // que está en el estante de acá.
    expect(deDondeVuelve('mal_armado')).toBe('items_correctos')
    expect(deDondeVuelve('falla')).toBe('items')
    const ma: FilaConUnidades = {
      motivo: 'mal_armado', destino_prenda: 'stock', retorno_decidido: true,
      items: [{ producto: 'LO QUE COMPRÓ', cantidad: 1 }],
      items_correctos: [{ producto: 'LO QUE LE LLEGÓ', cantidad: 1 }],
    }
    expect(unidadesQueVuelven(ma).campo).toBe('items_correctos')
    expect(unidadesQueVuelven(ma).unidades.map((u) => u.item.producto)).toEqual(['LO QUE LE LLEGÓ'])
  })
})

describe('recibir de a una', () => {
  it('con una tildada, el reclamo NO está recibido: falta la otra', () => {
    const r = recibirUnidades(dos, [0], AHORA)
    expect(r.campo).toBe('items')
    expect(r.lista[0].recibida_at).toBe(AHORA)
    expect(r.lista[1].recibida_at).toBeUndefined()
    expect(r.todoLlego).toBe(false)
    expect(r.faltan).toBe(1)
  })

  it('sin decir cuáles, llegó todo', () => {
    const r = recibirUnidades(dos, null, AHORA)
    expect(r.lista.every((i) => i.recibida_at === AHORA)).toBe(true)
    expect(r.todoLlego).toBe(true)
  })

  it('volver a tildar una que ya estaba ⛔ no le pisa la fecha', () => {
    const antes = '2026-08-01T00:00:00.000Z'
    const conUna: FilaConUnidades = { ...dos, items: [{ ...buzo, recibida_at: antes }, gorra] }
    const r = recibirUnidades(conUna, null, AHORA)
    expect(r.lista[0].recibida_at).toBe(antes)
    expect(r.lista[1].recibida_at).toBe(AHORA)
  })

  it('un índice que no se esperaba no cuenta como recibido', () => {
    // Tildar la unidad que se queda el cliente diría que volvió algo que nadie mandó.
    const mixto: FilaConUnidades = { ...dos, items: [buzo, { ...gorra, destino: 'perdida' }] }
    const r = recibirUnidades(mixto, [1], AHORA)
    expect(r.recibidas).toBe(0)
    expect(r.lista[1].recibida_at).toBeUndefined()
  })
})

/**
 * 🔑 **El cero afirma.** Sin traba, un reclamo que no espera nada contestaría "llegó todo"
 * —`todoLlego` sobre una lista vacía es `true`— y pasaría a `recibido` sin que nadie haya abierto
 * una caja. El caso probable es el `mal_armado` al que no se le cargó qué le llegó por error.
 */
describe('lo que impide recibir', () => {
  it('se puede recibir cuando hay algo esperado', () => {
    expect(trabaParaRecibir(dos)).toBeNull()
  })

  it('un mal armado sin cargar qué le llegó por error ⛔ no se puede recibir, y lo dice', () => {
    const sinCargar: FilaConUnidades = { motivo: 'mal_armado', destino_prenda: 'stock', retorno_decidido: true, items: [buzo], items_correctos: [] }
    expect(trabaParaRecibir(sinCargar)).toContain('qué le llegó por error')
  })

  it('un reclamo donde el cliente se queda todo tampoco espera nada', () => {
    expect(trabaParaRecibir({ ...dos, destino_prenda: 'perdida' })).toContain('no espera ningún producto')
  })
})

describe('el destino por producto viaja como un mapa, ⛔ no reenviando los productos', () => {
  it('pisa el destino del índice que se le diga y deja el resto igual', () => {
    const r = aplicarDestinos([buzo, gorra], { 1: 'perdida' })
    expect(r.lista?.[0]).toEqual(buzo)
    expect(r.lista?.[1]).toEqual({ ...gorra, destino: 'perdida' })
  })

  it('vacío en un índice lo devuelve al destino del reclamo, sin dejar la clave puesta', () => {
    // Un `destino: null` guardado se lee igual pero se ve como una decisión tomada.
    const conDestino: ItemReclamo = { ...buzo, destino: 'falla' }
    const r = aplicarDestinos([conDestino], { 0: null })
    expect(r.lista?.[0]).toEqual(buzo)
    expect('destino' in (r.lista?.[0] || {})).toBe(false)
  })

  it('un índice que no existe y un destino inventado se rechazan', () => {
    expect(aplicarDestinos([buzo], { 5: 'stock' }).error).toBeTruthy()
    // El de al lado del último: con un solo producto, el índice 1 ya no existe.
    expect(aplicarDestinos([buzo], { 1: 'stock' }).error).toBeTruthy()
    expect(aplicarDestinos([buzo], { 0: 'stock' }).error).toBeFalsy()
    expect(aplicarDestinos([buzo], { 0: 'regalado' as never }).error).toBeTruthy()
    expect(aplicarDestinos([buzo], ['stock'] as never).error).toBeTruthy()
  })

  it('sin mapa no toca nada', () => {
    expect(aplicarDestinos([buzo, gorra], null).lista).toEqual([buzo, gorra])
  })
})

describe('lo que falta llegar', () => {
  it('es lo que se espera menos lo ya tildado', () => {
    const conUna: FilaConUnidades = { ...dos, items: [{ ...buzo, recibida_at: AHORA }, gorra] }
    expect(loQueFaltaLlegar(conUna).map((u) => u.item.producto)).toEqual(['Gorra'])
    expect(loQueFaltaLlegar({ ...dos, items: dos.items.map((i) => ({ ...i, recibida_at: AHORA })) })).toEqual([])
  })
})
