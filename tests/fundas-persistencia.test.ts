import { describe, it, expect } from 'vitest'
import { claveSim, clavePedidos } from '@/lib/fundas/persistencia'

/**
 * La invariante de seguridad del Paso 3: mientras Fundas vive en sombra, las
 * claves llevan `next_` y NUNCA tocan las reales del equipo (`monitor_sim_bdi` /
 * `monitor_pedidos_bdi`). El flip (Paso 5) las adopta pasando `sombra=false`.
 * Si esto se rompiera, un tester pisaría un pedido real sin aviso.
 */
describe('claves de persistencia de Fundas', () => {
  it('en sombra llevan next_ y no son la clave real', () => {
    expect(claveSim('bdi', true)).toBe('monitor_sim_next_bdi')
    expect(clavePedidos('bdi', true)).toBe('monitor_pedidos_next_bdi')
    expect(claveSim('bdi', true)).not.toBe(claveSim('bdi', false))
    expect(clavePedidos('bdi', true)).not.toBe(clavePedidos('bdi', false))
  })

  it('fuera de sombra (flip) usan la clave real del legacy', () => {
    expect(claveSim('bdi', false)).toBe('monitor_sim_bdi')
    expect(clavePedidos('bdi', false)).toBe('monitor_pedidos_bdi')
    // La marca sale de la sesión, no está hardcodeada (crítica #5).
    expect(claveSim('zattia', false)).toBe('monitor_sim_zattia')
  })
})
