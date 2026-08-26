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
  aplicarDestinos, deDondeVuelve, descontarUnidades, DESTINO_LABEL, destinoDe, destinoDeUnidad,
  laUnidadVuelve, loQueFaltaDescontar, loQueFaltaLlegar,
  recibirUnidades, trabaParaRecibir, unidadesQueVuelven,
  type FilaConUnidades, type ItemReclamo,
} from '@/lib/reclamos/tipos'
import { DESTINOS } from '@/lib/reclamos/unidades.core.js'

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

/**
 * ── La partición del descuento: `falla` vs `regalada` (26-ago-2026) ──────────────────────────────
 *
 * 🔴 **Se construyó en verde y ése es el punto de este bloque.** `destinoDe(motivo, false, …)` —o
 * sea "no vuelve"— **no lo assertaba ningún test**: la línea contestaba `'falla'` para todo, y
 * cambiarla a `'regalada'` no puso una sola prueba en rojo. El agujero no era del cambio, era de la
 * cobertura: el caso "el cliente se lo queda" es justo el que decide a qué cliente de Gestión Nube
 * va la venta técnica, y por lo tanto si el ledger de Fallas se ensucia con mercadería sana.
 *
 * El oráculo es el depósito: qué sale del stock, con qué papel, y cuál de las dos listas queda
 * mintiendo si se elige mal.
 */
describe('el descuento se parte en dos: la fallada y la sana', () => {
  it('la que NO vuelve y está sana es `regalada`, no una falla', () => {
    // Los cuatro casos donde el producto está impecable y el cliente se lo queda.
    for (const m of ['talle', 'arrepentimiento', 'no_esperaba', 'excedente'] as const) {
      expect(destinoDe(m, false, null), m).toBe('regalada')
    }
  })

  it('la FALLADA sigue yendo a `falla` aunque no vuelva — quedársela no la vuelve sana', () => {
    expect(destinoDe('falla', false, 'inutil')).toBe('falla')
    expect(destinoDe('falla', true, 'inutil')).toBe('falla')
  })

  it('y la que vuelve sana sigue yendo a stock', () => {
    expect(destinoDe('talle', true, null)).toBe('stock')
  })

  /**
   * 🔴 La lista blanca del handler. Si `regalada` no está acá, la pantalla ofrece un destino que el
   * servidor rechaza — y el error aparece recién al guardar la decisión.
   */
  it('`regalada` es un destino válido para el servidor y tiene etiqueta', () => {
    expect(DESTINOS).toContain('regalada')
    expect(DESTINO_LABEL.regalada).toBeTruthy()
    // El compilador exige que `DESTINO_LABEL` cubra el tipo; esto exige lo mismo al revés.
    for (const d of DESTINOS) expect(DESTINO_LABEL[d as keyof typeof DESTINO_LABEL], d).toBeTruthy()
  })

  it('una regalada ⛔ no vuelve NUNCA, ni con el retorno pedido', () => {
    expect(laUnidadVuelve('regalada', true)).toBe(false)
    expect(laUnidadVuelve('regalada', false)).toBe(false)
  })
})

describe('lo que falta descontar de Gestión Nube', () => {
  const regalado: FilaConUnidades = { motivo: 'excedente', destino_prenda: 'regalada', items: [buzo] }

  it('la regalada sin sellar es lo que falta sacar del stock', () => {
    expect(loQueFaltaDescontar(regalado).map((u) => u.item.producto)).toEqual(['Buzo'])
  })

  it('sellada, ya no falta', () => {
    expect(loQueFaltaDescontar({ ...regalado, items: [{ ...buzo, baja_at: AHORA }] })).toEqual([])
  })

  /**
   * 🔑 La fallada la descuenta el alta en Fallas, que además la valúa. Contarla también acá la
   * restaría **dos veces** del mismo stock.
   */
  it('la fallada ⛔ NO entra: ésa la descuenta el alta en Fallas', () => {
    expect(loQueFaltaDescontar({ motivo: 'falla', destino_prenda: 'falla', items: [buzo] })).toEqual([])
  })

  it('y la que vuelve a stock tampoco: no salió para siempre', () => {
    expect(loQueFaltaDescontar({ motivo: 'talle', destino_prenda: 'stock', items: [buzo] })).toEqual([])
  })

  /**
   * 🔴 En un `mal_armado` lo que se le regala es **lo que se mandó por error**, que vive en
   * `items_correctos`. Lo que compró nunca salió del depósito: descontarlo sacaría del stock una
   * unidad que sigue en el estante. Es el mismo defecto que ya mordió en la bandeja de retornos.
   */
  it('en un `mal_armado` mira `items_correctos`, no lo que el cliente compró', () => {
    const mal: FilaConUnidades = {
      motivo: 'mal_armado', destino_prenda: 'regalada',
      items: [buzo], items_correctos: [gorra],
    }
    expect(loQueFaltaDescontar(mal).map((u) => u.item.producto)).toEqual(['Gorra'])
  })

  it('el destino propio del ítem gana sobre el del reclamo, en los dos sentidos', () => {
    const mixto: FilaConUnidades = {
      motivo: 'talle', destino_prenda: 'stock',
      items: [buzo, { ...gorra, destino: 'regalada' }],
    }
    expect(loQueFaltaDescontar(mixto).map((u) => u.item.producto)).toEqual(['Gorra'])
    const alReves: FilaConUnidades = {
      motivo: 'talle', destino_prenda: 'regalada',
      items: [buzo, { ...gorra, destino: 'stock' }],
    }
    expect(loQueFaltaDescontar(alReves).map((u) => u.item.producto)).toEqual(['Buzo'])
  })
})

describe('sellar lo que ya salió de Gestión Nube', () => {
  const dosRegalados: FilaConUnidades = {
    motivo: 'excedente', destino_prenda: 'regalada', items: [buzo, gorra],
  }

  it('sin índices sella todas y no queda nada pendiente', () => {
    const r = descontarUnidades(dosRegalados, null, AHORA, '14231')
    expect(r.descontadas).toBe(2)
    expect(r.faltan).toBe(0)
    expect(r.seDescontoTodo).toBe(true)
    expect(r.lista.map((i) => i.baja_venta)).toEqual(['14231', '14231'])
  })

  it('con índices sella sólo ésa, y la otra sigue pendiente', () => {
    const r = descontarUnidades(dosRegalados, [1], AHORA, '14231')
    expect(r.descontadas).toBe(1)
    expect(r.faltan).toBe(1)
    expect(r.seDescontoTodo).toBe(false)
    expect(r.lista[0].baja_at).toBeUndefined()
    expect(r.lista[1].baja_at).toBe(AHORA)
  })

  /** Los índices llegan del JSON del POST: un "1" de texto tiene que sellar la unidad 1. */
  it('acepta el índice como texto', () => {
    expect(descontarUnidades(dosRegalados, ['1'] as unknown as number[], AHORA, null).descontadas).toBe(1)
  })

  /**
   * ⚠️ Volver a sellar ⛔ no pisa la fecha ni el número: pisarlos borraría a qué venta técnica hay
   * que ir a mirar si el stock no cierra. Mismo criterio que `recibirUnidades`.
   */
  it('volver a sellar una que ya estaba no le pisa la fecha ni la venta', () => {
    const ya: FilaConUnidades = {
      ...dosRegalados, items: [{ ...buzo, baja_at: '2026-01-01T00:00:00.000Z', baja_venta: '111' }, gorra],
    }
    const r = descontarUnidades(ya, null, AHORA, '999')
    expect(r.descontadas).toBe(1)
    expect(r.lista[0].baja_at).toBe('2026-01-01T00:00:00.000Z')
    expect(r.lista[0].baja_venta).toBe('111')
    expect(r.lista[1].baja_venta).toBe('999')
  })

  /**
   * 🔴 **El mutante que sobrevivió a la primera pasada.** El test de arriba pasa `null` (todas las
   * que faltan), y por ahí la ya sellada nunca entra. El caso que muerde es el índice EXPLÍCITO
   * apuntando a una unidad ya sellada — que es exactamente lo que manda la pantalla si alguien
   * aprieta dos veces con la lista vieja en la mano. Sin este filtro, el segundo click le pisa la
   * fecha y el número de venta, y se pierde a qué venta técnica ir a mirar.
   */
  it('un índice explícito sobre una ya sellada ⛔ no la pisa', () => {
    const ya: FilaConUnidades = {
      ...dosRegalados, items: [{ ...buzo, baja_at: '2026-01-01T00:00:00.000Z', baja_venta: '111' }, gorra],
    }
    const r = descontarUnidades(ya, [0], AHORA, '999')
    expect(r.descontadas).toBe(0)
    expect(r.lista[0].baja_at).toBe('2026-01-01T00:00:00.000Z')
    expect(r.lista[0].baja_venta).toBe('111')
    // Y la que sí faltaba sigue sin sellarse: no se pidió.
    expect(r.lista[1].baja_at).toBeUndefined()
    expect(r.faltan).toBe(1)
  })

  it('sella en `items_correctos` cuando el caso es `mal_armado`', () => {
    const mal: FilaConUnidades = {
      motivo: 'mal_armado', destino_prenda: 'regalada', items: [buzo], items_correctos: [gorra],
    }
    const r = descontarUnidades(mal, null, AHORA, '14231')
    expect(r.campo).toBe('items_correctos')
    expect(r.lista[0].baja_at).toBe(AHORA)
  })
})
