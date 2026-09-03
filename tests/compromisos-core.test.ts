import { describe, it, expect } from 'vitest'
import {
  estaAbierto, puedeIr, porQueNo, prometidoPorAcreedor, prometidoPorCliente,
  sePuedePrometer, restanteTrasConfirmar, type EstadoCompromiso,
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
