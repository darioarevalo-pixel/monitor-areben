/**
 * Canjes — el orden y los filtros de la lista.
 *
 * Lo que se cuida acá:
 *  - que los **tramos** (que no son los estados) salgan del canje correcto, porque de esa única
 *    derivación salen la etiqueta que se lee Y el orden de la pantalla;
 *  - que `estadoEnCriollo` siga diciendo exactamente lo mismo después de haberla reescrito encima
 *    de `tramoDeCanje` — la no-regresión vive además en `canjes-core.test.ts`;
 *  - que los siete chips filtren lo mismo que filtraban cuando la lógica estaba adentro del
 *    componente;
 *  - y el caso trampa de la fecha: **una sola** fecha manda, la misma que dibuja la columna.
 */
import { describe, it, expect } from 'vitest'
import {
  ABIERTOS, coincideTexto, decorarCanjes, fechaDeLista, filtrarCanjes, ordenarCanjes,
  type CanjeDecorado, type CtxLista, type FiltroCanjes, type FiltroEstado,
} from '@/lib/canjes/lista'
import {
  PESO_TRAMO, estadoEnCriollo, tramoDeCanje,
  type CanjeRow, type EstadoCanje, type TramoCanje,
} from '@/lib/canjes/tipos'

// ── Fixtures ─────────────────────────────────────────────────────────────────────

function canje(p: Partial<CanjeRow> = {}): CanjeRow {
  return {
    id: 1, persona_id: 1, store: 'bdi', tipo: 'producto', estado: 'preparando',
    tope_tipo: 'unidades', tope_unidades: [], pago_estado: 'no_aplica',
    compra_estado: 'pendiente', stock_estado: 'no_aplica', envio_estado: 'pendiente',
    aviso_estado: 'pendiente', contacto_estado: 'pendiente',
    cerrado_incompleto: false, producto_no_conservado: false,
    created_at: '2026-05-01T00:00:00.000Z',
    ...p,
  } as CanjeRow
}

const CTX: CtxLista = {
  personas: new Map([
    [1, { nombre: 'Lucía Méndez', instagram: 'lucia.mkp' }],
    [2, { nombre: 'Ñandú Pérez', instagram: 'nandu' }],
    [3, { nombre: 'Nadia Ruiz', instagram: 'nadia' }],
  ]),
  vencidos: new Map([[9, 2]]),
}

const decorar = (cs: CanjeRow[]) => decorarCanjes(cs, CTX)
const uno = (c: CanjeRow): CanjeDecorado => decorar([c])[0]
const filtro = (p: Partial<FiltroCanjes> = {}): FiltroCanjes =>
  ({ estado: 'todos', store: 'todas', q: '', desde: '', hasta: '', ...p })

// ── El tramo ─────────────────────────────────────────────────────────────────────

describe('tramoDeCanje — la única derivación', () => {
  it('un preparando son TRES tramos distintos, no uno', () => {
    // Es la razón de ser de la función: bajo el mismo enum hay tres trabajos de tres personas
    // distintas, y ordenarlos juntos es lo que hacía que "falta comprar" quedara mezclado con lo
    // que ya está viajando por el correo.
    expect(tramoDeCanje(canje())).toBe('comprar')
    expect(tramoDeCanje(canje({ compra_estado: 'hecho' }))).toBe('despachar')
    expect(tramoDeCanje(canje({ compra_estado: 'hecho', envio_estado: 'hecho' }))).toBe('transito')
  })

  it('en enviada distingue mi tarea de la espera de ella', () => {
    expect(tramoDeCanje(canje({ estado: 'enviada' }))).toBe('escribirle')
    expect(tramoDeCanje(canje({ estado: 'enviada', contacto_estado: 'hecho' }))).toBe('respuesta')
  })

  it('los cuatro terminales caen todos en el mismo tramo', () => {
    for (const e of ['cerrado', 'cancelado', 'rechazado', 'no_acepto'] as EstadoCanje[]) {
      expect(tramoDeCanje(canje({ estado: e })), e).toBe('terminal')
    }
  })

  it('sin contacto_estado (un canje ciego) igual dice "falta escribirle"', () => {
    // Un canje de otra marca no trae el pendiente. La respuesta correcta sigue siendo que la pelota
    // es nuestra: suponer que ya se le escribió sería inventar trabajo hecho.
    const ciego = { estado: 'enviada' as EstadoCanje, compra_estado: 'pendiente' as const, envio_estado: 'pendiente' as const }
    expect(tramoDeCanje(ciego)).toBe('escribirle')
  })

  it('estadoEnCriollo sigue saliendo del tramo, sin cambiar una palabra', () => {
    // La no-regresión de la reescritura: si estas dos se despegan, la pantalla diría "Falta
    // despachar" y lo ordenaría como si esperara a la creadora.
    expect(estadoEnCriollo(canje())).toBe('Falta comprar')
    expect(estadoEnCriollo(canje({ compra_estado: 'hecho' }))).toBe('Falta despachar')
    expect(estadoEnCriollo(canje({ compra_estado: 'hecho', envio_estado: 'hecho' }))).toBe('En tránsito')
    expect(estadoEnCriollo(canje({ estado: 'enviada' }))).toBe('Falta escribirle')
    expect(estadoEnCriollo(canje({ estado: 'enviada', contacto_estado: 'hecho' }))).toBe('Esperando su respuesta')
    expect(estadoEnCriollo(canje({ estado: 'propuesta' }))).toBe('Esperando la firma interna')
    expect(estadoEnCriollo(canje({ estado: 'acuerdo' }))).toBe('Acordado')
    expect(estadoEnCriollo(canje({ estado: 'en_curso' }))).toBe('Esperando el contenido')
    expect(estadoEnCriollo(canje({ estado: 'cerrado' }))).toBe('Cerrado')
    expect(estadoEnCriollo(canje({ estado: 'cancelado' }))).toBe('Cancelado')
  })

  it('los nueve tramos tienen un peso, y son todos distintos', () => {
    const tramos: TramoCanje[] = [
      'firma', 'escribirle', 'acordado', 'comprar', 'despachar', 'transito', 'respuesta',
      'contenido', 'terminal',
    ]
    const pesos = tramos.map((t) => PESO_TRAMO[t])
    expect(new Set(pesos).size).toBe(tramos.length)
    // El orden declarado es el que eligió Bruno: primero lo que espera algo nuestro.
    expect([...pesos].sort((a, b) => a - b)).toEqual(pesos)
  })

  it('"abiertos" son los ocho tramos que piden trabajo, y ninguno terminal', () => {
    expect(ABIERTOS).toHaveLength(8)
    expect(ABIERTOS).not.toContain('terminal')
  })
})

// ── La fecha ─────────────────────────────────────────────────────────────────────

describe('fechaDeLista — una sola fecha, la que se ve', () => {
  it('manda acordado_at; sin él, created_at', () => {
    expect(fechaDeLista(canje({ acordado_at: '2026-08-03T12:00:00.000Z' }))).toBe('2026-08-03')
    expect(fechaDeLista(canje())).toBe('2026-05-01')
  })

  it('EL caso trampa: acordado_at afuera del rango deja el canje afuera, aunque created_at entre', () => {
    // Si el filtro mirara `created_at` mientras la columna muestra `acordado_at`, este canje se
    // vería con fecha 3-ago y no aparecería al pedir "del 1 al 5 de agosto". Nadie lo reportaría
    // como bug: se leería como que el filtro anda raro.
    const c = decorar([canje({ created_at: '2026-08-02T00:00:00.000Z', acordado_at: '2026-09-10T00:00:00.000Z' })])
    expect(filtrarCanjes(c, filtro({ desde: '2026-08-01', hasta: '2026-08-05' }))).toHaveLength(0)
    expect(filtrarCanjes(c, filtro({ desde: '2026-09-01' }))).toHaveLength(1)
  })

  it('los extremos entran: "hasta el 5" incluye el 5', () => {
    const c = decorar([canje({ acordado_at: '2026-08-05T23:00:00.000Z' })])
    expect(filtrarCanjes(c, filtro({ hasta: '2026-08-05' }))).toHaveLength(1)
    expect(filtrarCanjes(c, filtro({ desde: '2026-08-05' }))).toHaveLength(1)
    expect(filtrarCanjes(c, filtro({ hasta: '2026-08-04' }))).toHaveLength(0)
  })
})

// ── Los chips ────────────────────────────────────────────────────────────────────

describe('filtrarCanjes — los siete chips filtran lo mismo que antes', () => {
  const lista = decorar([
    canje({ id: 1, estado: 'propuesta' }),
    canje({ id: 2, estado: 'enviada' }),
    canje({ id: 3, estado: 'acuerdo' }),
    canje({ id: 4, estado: 'preparando', compra_estado: 'hecho', envio_estado: 'hecho' }),
    canje({ id: 5, estado: 'en_curso' }),
    canje({ id: 6, estado: 'cerrado' }),
    canje({ id: 7, estado: 'cancelado' }),
    canje({ id: 9, estado: 'en_curso' }), // el que tiene 2 entregables vencidos
  ])
  const ids = (f: FiltroEstado) => filtrarCanjes(lista, filtro({ estado: f })).map((c) => c.id)

  it('abiertos = todo lo que sigue pidiendo trabajo', () => {
    expect(ids('abiertos')).toEqual([1, 2, 3, 4, 5, 9])
  })

  it('cada chip específico trae lo suyo', () => {
    expect(ids('respuesta')).toEqual([2])
    expect(ids('aprobacion')).toEqual([1])
    expect(ids('transito')).toEqual([4])
    expect(ids('vencidos')).toEqual([9])
    expect(ids('cerrados')).toEqual([6])
  })

  it('"todos" no filtra nada, ni siquiera los cancelados', () => {
    expect(ids('todos')).toHaveLength(8)
  })

  it('un despachado que ya llegó sale de la cola de tránsito', () => {
    // El único evento que lo saca es `entregado_at`: anotar un intento de entrega no alcanza.
    const llegó = decorar([canje({ id: 4, compra_estado: 'hecho', envio_estado: 'hecho', entregado_at: '2026-06-01T00:00:00.000Z' })])
    expect(filtrarCanjes(llegó, filtro({ estado: 'transito' }))).toHaveLength(0)
  })
})

describe('filtrarCanjes — marca y texto', () => {
  const lista = decorar([
    canje({ id: 1, persona_id: 1, store: 'bdi', titulo: 'Cápsula invierno' }),
    canje({ id: 2, persona_id: 2, store: 'zattia' }),
  ])

  it('la marca filtra, y "todas" no', () => {
    expect(filtrarCanjes(lista, filtro({ store: 'zattia' })).map((c) => c.id)).toEqual([2])
    expect(filtrarCanjes(lista, filtro({ store: 'todas' }))).toHaveLength(2)
  })

  it('busca por nombre, por @, por número y por título', () => {
    const busca = (q: string) => filtrarCanjes(lista, filtro({ q })).map((c) => c.id)
    expect(busca('lucía')).toEqual([1])
    expect(busca('lucia.mkp')).toEqual([1])
    expect(busca('C-0002')).toEqual([2])
    expect(busca('cápsula')).toEqual([1])
  })

  it('no importan ni las mayúsculas ni los acentos', () => {
    // Quien la conoce por el nombre lo tipea como puede: nadie va a poner la tilde de "Lucía" en el
    // buscador, y "ÑANDU" tiene que encontrar a "Ñandú".
    expect(coincideTexto(uno(canje({ persona_id: 1 })), 'LUCIA')).toBe(true)
    expect(coincideTexto(uno(canje({ persona_id: 2 })), 'nandu perez')).toBe(true)
    expect(coincideTexto(uno(canje({ persona_id: 1 })), 'zzz')).toBe(false)
  })

  it('un buscador vacío no filtra', () => {
    expect(coincideTexto(uno(canje()), '   ')).toBe(true)
  })
})

// ── El orden ─────────────────────────────────────────────────────────────────────

describe('ordenarCanjes — primero lo que espera algo nuestro', () => {
  it('los nueve tramos salen en el orden que eligió Bruno', () => {
    const revuelto = decorar([
      canje({ id: 1, estado: 'cerrado' }),
      canje({ id: 2, estado: 'en_curso' }),
      canje({ id: 3, estado: 'enviada', contacto_estado: 'hecho' }),
      canje({ id: 4, estado: 'preparando', compra_estado: 'hecho', envio_estado: 'hecho' }),
      canje({ id: 5, estado: 'preparando', compra_estado: 'hecho' }),
      canje({ id: 6, estado: 'preparando' }),
      canje({ id: 7, estado: 'acuerdo' }),
      canje({ id: 8, estado: 'enviada' }),
      canje({ id: 9, estado: 'propuesta' }),
    ])
    expect(ordenarCanjes(revuelto).map((c) => c.id)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1])
  })

  it('adentro del tramo, el más viejo arriba: es lo que más traba', () => {
    const lista = decorar([
      canje({ id: 1, estado: 'propuesta', created_at: '2026-08-01T00:00:00.000Z' }),
      canje({ id: 2, estado: 'propuesta', created_at: '2026-06-01T00:00:00.000Z' }),
      canje({ id: 3, estado: 'propuesta', created_at: '2026-07-01T00:00:00.000Z' }),
    ])
    expect(ordenarCanjes(lista).map((c) => c.id)).toEqual([2, 3, 1])
  })

  it('pero los terminales van al revés: lo recién cerrado arriba', () => {
    // Ahí no hay nada que destrabar; lo que se busca es lo último que pasó.
    const lista = decorar([
      canje({ id: 1, estado: 'cerrado', acordado_at: '2026-06-01T00:00:00.000Z' }),
      canje({ id: 2, estado: 'cerrado', acordado_at: '2026-08-01T00:00:00.000Z' }),
    ])
    expect(ordenarCanjes(lista).map((c) => c.id)).toEqual([2, 1])
  })

  it('desempata por nombre con el locale puesto', () => {
    // Sin `localeCompare(…, 'es')`, la Ñ se va después de la Z y "Ñandú" quedaría al fondo.
    const lista = decorar([
      canje({ id: 1, persona_id: 2, estado: 'propuesta' }), // Ñandú Pérez
      canje({ id: 2, persona_id: 3, estado: 'propuesta' }), // Nadia Ruiz
      canje({ id: 3, persona_id: 1, estado: 'propuesta' }), // Lucía Méndez
    ])
    expect(ordenarCanjes(lista).map((c) => c._persona)).toEqual(['Lucía Méndez', 'Nadia Ruiz', 'Ñandú Pérez'])
  })

  it('con todo empatado el orden es estable, no al azar', () => {
    const lista = decorar([
      canje({ id: 7, persona_id: 1, estado: 'propuesta' }),
      canje({ id: 3, persona_id: 1, estado: 'propuesta' }),
    ])
    expect(ordenarCanjes(lista).map((c) => c.id)).toEqual([3, 7])
  })

  it('no toca la lista que recibe', () => {
    const lista = decorar([canje({ id: 1, estado: 'cerrado' }), canje({ id: 2, estado: 'propuesta' })])
    ordenarCanjes(lista)
    expect(lista.map((c) => c.id)).toEqual([1, 2])
  })
})
