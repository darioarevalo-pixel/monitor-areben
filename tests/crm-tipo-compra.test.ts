import { describe, expect, it } from 'vitest'
import { tipoDeCompra } from '@/lib/crm/tipo-compra'
import type { FilaDetalle, FilaVenta } from '@/lib/crm/tipos'

const HOY = new Date('2026-11-18T12:00:00Z')
const venta = (id: number, channel_id = 10): FilaVenta => ({ id, date_sale: '2026-11-01', total_price: 0, client_id: 1, channel_id, sale_state: 'Cerrado' })
const MODELOS = ['13', '14', '15', '16', '16 PRO', '16 PRO MAX', '17', '17 PRO']
const lineas = (sale_id: number, nombre: string, modelos: string[], q = 2): FilaDetalle[] =>
  modelos.map((size) => ({ sale_id, product_name: nombre, size, quantity: q, unit_price: 0, total: 0 }))

describe('tipoDeCompra', () => {
  it('lleva 6+ modelos por diseño → pack', () => {
    const t = tipoDeCompra([venta(1)], [...lineas(1, 'TWINKLE CASE', MODELOS), ...lineas(1, 'JELLY CASE', MODELOS)], HOY)
    expect(t?.tipo).toBe('pack')
    expect(t?.pct).toBe(100)
  })
  it('pocos modelos por diseño → suelto', () => {
    const det = ['A CASE', 'B CASE', 'C CASE', 'D CASE', 'E CASE', 'F CASE'].flatMap((n) => lineas(1, n, ['16', '17'], 3))
    expect(tipoDeCompra([venta(1)], det, HOY)?.tipo).toBe('suelto')
  })
  it('mitad y mitad → a veces', () => {
    const det = [...lineas(1, 'A CASE', MODELOS, 1), ...lineas(1, 'B CASE', ['16', '17'], 4), ...lineas(1, 'C CASE', ['15'], 4)]
    expect(tipoDeCompra([venta(1)], det, HOY)?.tipo).toBe('a-veces')
  })
  it('compras de hace más de 150 días no cuentan', () => {
    const vieja: FilaVenta = { ...venta(1), date_sale: '2026-05-01' }
    expect(tipoDeCompra([vieja], lineas(1, 'A CASE', MODELOS, 5), HOY)).toBeNull()
  })
  it('solo cuenta compras mayoristas y fundas; con poco no dice nada', () => {
    expect(tipoDeCompra([venta(1, 3)], lineas(1, 'A CASE', MODELOS, 5), HOY)).toBeNull()
    expect(tipoDeCompra([venta(1)], lineas(1, 'AURICULARES', MODELOS, 5), HOY)).toBeNull()
    expect(tipoDeCompra([venta(1)], lineas(1, 'A CASE', ['16'], 5), HOY)).toBeNull()
  })
})
