import { describe, it, expect } from 'vitest'
import {
  colaDeCobranza, diasPara, estaAbierto, puedeIr, porQueNo, prometidoPorAcreedor,
  prometidoPorCliente, sePuedePrometer, restanteTrasConfirmar,
  type Compromiso, type EstadoCompromiso,
} from '@/lib/compromisos/core'

const c = (estado: EstadoCompromiso, monto: number, acreedor = 'a1', cliente: string | null = 'cli1') =>
  ({ estado, monto, acreedor_id: acreedor, cliente_id: cliente })

describe('qué compromisos siguen ocupando plata', () => {
  it('los prometidos y los transferidos sí; los confirmados y los cancelados no', () => {
    expect(estaAbierto({ estado: 'prometido' })).toBe(true)
    expect(estaAbierto({ estado: 'transferido' })).toBe(true)
    // Un confirmado ya bajó la deuda en el ledger: contarlo de nuevo sería contarlo dos veces.
    expect(estaAbierto({ estado: 'confirmado' })).toBe(false)
    expect(estaAbierto({ estado: 'cancelado' })).toBe(false)
  })
})

describe('de qué estado se puede pasar a cuál', () => {
  it('se puede confirmar derecho, sin pasar por transferido', () => {
    // El cliente muchas veces transfiere mientras se está hablando.
    expect(puedeIr('prometido', 'confirmado')).toBe(true)
  })

  it('se puede volver de transferido a prometido: dijo que pagó y no era', () => {
    expect(puedeIr('transferido', 'prometido')).toBe(true)
  })

  it('🔑 un confirmado no vuelve atrás: ya escribió pagos reales en otro sistema', () => {
    for (const destino of ['prometido', 'transferido', 'cancelado'] as EstadoCompromiso[]) {
      expect(puedeIr('confirmado', destino)).toBe(false)
    }
    expect(porQueNo('confirmado', 'prometido')).toMatch(/ya impactó en el dashboard/)
  })

  it('un cancelado se reabre: cancelar no movió un peso', () => {
    expect(puedeIr('cancelado', 'prometido')).toBe(true)
  })

  it('el motivo se explica en criollo, no con un código', () => {
    expect(porQueNo('prometido', 'confirmado')).toBeNull()
    expect(porQueNo('prometido', 'prometido')).toBe('Ya está en ese estado.')
  })
})

describe('cuánta plata hay prometida sin confirmar', () => {
  it('suma solo lo abierto, por acreedor', () => {
    const m = prometidoPorAcreedor([
      c('prometido', 100_000),
      c('transferido', 50_000),
      c('confirmado', 900_000),   // ya bajó la deuda de verdad
      c('cancelado', 700_000),    // se cayó
      c('prometido', 30_000, 'a2'),
    ])
    expect(m.get('a1')).toBe(150_000)
    expect(m.get('a2')).toBe(30_000)
  })

  it('lo mismo del lado del cliente, salteando los que no lo tienen cargado', () => {
    const m = prometidoPorCliente([
      c('prometido', 100_000, 'a1', 'cli1'),
      c('prometido', 20_000, 'a2', 'cli1'),
      c('prometido', 5_000, 'a1', null),
    ])
    expect(m.get('cli1')).toBe(120_000)
    expect(m.size).toBe(1)
  })

  it('los centavos no se van sumando solos', () => {
    const m = prometidoPorAcreedor([c('prometido', 0.1), c('prometido', 0.2)])
    expect(m.get('a1')).toBe(0.3)
  })
})

describe('cuánto se le puede prometer todavía', () => {
  // El caso que evita prometer dos veces sobre la misma deuda: el dashboard dice que se le deben
  // 492.838, pero ya hay 200.000 camino a él que el dashboard no ve.
  it('descuenta lo que ya está prometido acá', () => {
    expect(sePuedePrometer(492_838, 200_000)).toBe(292_838)
  })

  it('si ya se prometió todo (o de más), no se puede prometer nada', () => {
    expect(sePuedePrometer(492_838, 492_838)).toBe(0)
    expect(sePuedePrometer(100_000, 150_000)).toBe(0)
  })
})

describe('cuando el cliente transfiere de menos', () => {
  // Decidido con Darío: se cierra por lo que entró y se anota uno nuevo por lo que falta.
  it('dice cuánto quedaría para el compromiso nuevo', () => {
    expect(restanteTrasConfirmar(500_000, 300_000)).toBe(200_000)
  })

  it('si entró todo, no queda nada que anotar', () => {
    expect(restanteTrasConfirmar(500_000, 500_000)).toBe(0)
  })

  it('si entró de más tampoco: el excedente no es una promesa pendiente', () => {
    expect(restanteTrasConfirmar(500_000, 600_000)).toBe(0)
  })
})

// ─── La cola de cobranza (la pestaña "Pagos" del panel) ───────────────────────

const fila = (
  id: string,
  estado: EstadoCompromiso,
  { monto = 1000, fecha = null as string | null, creado = '2026-09-01T10:00:00Z', confirmado = null as string | null } = {},
) => ({ id, estado, monto, fecha_prometida: fecha, creado_en: creado, confirmado_en: confirmado }) as unknown as Compromiso

describe('cuántos días faltan para lo prometido', () => {
  it('cuenta días, no horas: hoy es 0 y ayer es -1', () => {
    expect(diasPara('2026-09-03', '2026-09-03')).toBe(0)
    expect(diasPara('2026-09-02', '2026-09-03')).toBe(-1)
    expect(diasPara('2026-09-10', '2026-09-03')).toBe(7)
  })

  it('sin fecha prometida no inventa un número', () => {
    expect(diasPara(null, '2026-09-03')).toBeNull()
  })

  it('cruza el cambio de mes sin equivocarse', () => {
    expect(diasPara('2026-09-01', '2026-08-30')).toBe(2)
  })
})

describe('la cola de cobranza', () => {
  it('🔑 separa lo que espera trabajo nuestro de lo que espera al cliente', () => {
    const cola = colaDeCobranza([
      fila('a', 'prometido'),
      fila('b', 'transferido'),
      fila('c', 'confirmado'),
      fila('d', 'cancelado'),
    ])
    // Un "dice que transfirió" se resuelve mirando el banco; un "prometido" sólo se puede reclamar.
    expect(cola.porConfirmar.map((c) => c.id)).toEqual(['b'])
    expect(cola.esperando.map((c) => c.id)).toEqual(['a'])
    expect(cola.cerradas.map((c) => c.id)).toEqual(['c', 'd'])
  })

  it('lo más vencido arriba, y lo que nunca se agendó al final', () => {
    const cola = colaDeCobranza([
      fila('sin-fecha', 'prometido', { creado: '2026-08-01T10:00:00Z' }),
      fila('para-el-10', 'prometido', { fecha: '2026-09-10' }),
      fila('vencida', 'prometido', { fecha: '2026-08-20' }),
    ])
    expect(cola.esperando.map((c) => c.id)).toEqual(['vencida', 'para-el-10', 'sin-fecha'])
  })

  it('entre las que no tienen fecha, primero la más vieja: es la que más hace que no se mueve', () => {
    const cola = colaDeCobranza([
      fila('nueva', 'prometido', { creado: '2026-09-02T10:00:00Z' }),
      fila('vieja', 'prometido', { creado: '2026-07-02T10:00:00Z' }),
    ])
    expect(cola.esperando.map((c) => c.id)).toEqual(['vieja', 'nueva'])
  })

  it('las cerradas se leen al revés: lo último que pasó, primero', () => {
    const cola = colaDeCobranza([
      fila('vieja', 'confirmado', { confirmado: '2026-08-01T10:00:00Z' }),
      fila('ultima', 'confirmado', { confirmado: '2026-09-02T10:00:00Z' }),
    ])
    expect(cola.cerradas.map((c) => c.id)).toEqual(['ultima', 'vieja'])
  })

  it('el total es lo prometido sin entrar: no cuenta lo confirmado ni lo caído', () => {
    const cola = colaDeCobranza([
      fila('a', 'prometido', { monto: 100_000 }),
      fila('b', 'transferido', { monto: 50_000 }),
      // Lo confirmado ya bajó la deuda en el ledger del dashboard: sumarlo acá sería contarlo dos
      // veces, que es justo el error que este número existe para evitar.
      fila('c', 'confirmado', { monto: 900_000 }),
      fila('d', 'cancelado', { monto: 900_000 }),
    ])
    expect(cola.totalAbierto).toBe(150_000)
  })

  it('no toca la lista que le dan', () => {
    const entrada = [fila('b', 'prometido', { fecha: '2026-09-10' }), fila('a', 'prometido', { fecha: '2026-08-01' })]
    const copia = [...entrada]
    colaDeCobranza(entrada)
    expect(entrada).toEqual(copia)
  })
})
