/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import { corregirPrecio, precioPendienteACuenta } from '../motor/venta/correccion.mjs'

const V = '92f4f76d-35e2-47d3-ab56-9fffc5976fc4'
const L = '11111111-1111-1111-1111-111111111111'

/** Base de mentira: lo justo para `corregirPrecio` sobre una venta con o sin compra a cuenta. */
type Previa = { id: string; total_antes: number; total_despues: number }
type Pedido = { id: string; empresa_id: string; total: number; unidades: number; lineas: { product_id: number; size_id: number; cantidad: number; precio: number }[] }
function base({ aCuenta, previas = [], pedido = null }: { aCuenta: boolean; previas?: Previa[]; pedido?: Pedido | null }) {
  const historial: { antes: unknown; despues: unknown }[] = []
  const correcciones = previas.map((p, i) => ({ ...p, tipo: 'precio', motivo: 'vieja', creada_en: i }))
  const cuenta: { ref: string; monto: number; tipo: string }[] = aCuenta ? [{ ref: `venta:${V}`, monto: 1000, tipo: 'compra' }] : []
  let n = 0
  const db = {
    query: async (sql: string, p: unknown[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim()
      const rows = (r: unknown[]) => ({ rows: r })
      if (/^(begin|commit|rollback)$/.test(s)) return rows([])
      if (s.startsWith('select to_regclass')) return rows([{ hay: true }])
      if (s.startsWith('select id, empresa_id, marca, numero')) return rows([{ id: V, empresa_id: 'areben', marca: 'bdi', numero: '33952', tipo: 'venta', estado: 'confirmada', total: 1000, prueba: false }])
      if (s.startsWith('select id::text, empresa_id, numero, estado')) return rows([{ id: V, empresa_id: 'areben', numero: '33952', estado: 'confirmada' }])
      if (s.startsWith('select 1 from venta_factura')) return rows([])
      if (s.includes('venta_original_id')) return rows([{ hay: false }])
      if (s.includes('from venta_linea l')) return rows([{ id: L, n: 1, cantidad: 10, sku: 'X', precio: 100, importe: 1000 }])
      if (s.startsWith('select total_despues::float as t')) return rows(correcciones.length ? [{ t: correcciones.at(-1)!.total_despues }] : [])
      if (s.includes('from venta_pago')) return rows([{ cobrado: aCuenta ? 1000 : 1000 }])
      if (s.includes("tipo = 'compra'")) return rows(cuenta.filter((c) => c.tipo === 'compra').map(() => ({ cliente_id: 'c', marca: 'bdi', empresa_id: 'areben', prueba: false })))
      if (s.startsWith('insert into venta_correccion (')) {
        const id = `k${++n}`
        correcciones.push({ id, total_antes: p[4] as number, total_despues: p[5] as number, tipo: 'precio', motivo: p[3] as string, creada_en: 100 + n })
        return rows([{ id, creada_en: 'ahora' }])
      }
      if (s.startsWith('insert into venta_correccion_linea')) return rows([])
      if (s.startsWith('select k.id::text, k.motivo')) {
        return rows(correcciones.filter((k) => k.total_despues !== k.total_antes && !cuenta.some((c) => c.ref === `venta:${V}:correccion:${k.id}`))
          .map((k) => ({ id: k.id, motivo: k.motivo, monto: k.total_despues - k.total_antes })))
      }
      if (s.startsWith('insert into cuenta_movimiento')) { cuenta.push({ ref: p[3] as string, monto: p[4] as number, tipo: 'correccion' }); return rows([]) }
      if (s.startsWith('select id::text, empresa_id, total::float as total, unidades, lineas from pedido_mayorista')) return rows(pedido ? [{ ...pedido }] : [])
      if (s.startsWith('select cl.venta_linea_id::text as id')) return rows(previas.length ? [{ id: L, precio_despues: 101.103 }] : [])
      if (s.startsWith('select id::text, product_id, size_id from venta_linea')) return rows([{ id: L, product_id: 7, size_id: 70 }])
      if (s.startsWith('update pedido_mayorista')) { Object.assign(pedido!, { lineas: JSON.parse(p[1] as string), total: p[2] }); return rows([]) }
      if (s.startsWith('insert into pedido_mayorista_cambio')) { historial.push({ antes: JSON.parse(p[2] as string), despues: JSON.parse(p[3] as string) }); return rows([]) }
      throw new Error(`consulta no esperada: ${s.slice(0, 80)}`)
    },
  }
  return { db, cuenta, correcciones, historial }
}

describe('corregir precio de una venta a cuenta', () => {
  it('la diferencia va a la cuenta corriente y ⛔ queda diferencia suelta', async () => {
    const { db, cuenta } = base({ aCuenta: true })
    const r: any = await corregirPrecio(db, { venta_id: V, motivo: 'precio', usuario: 'dario', lineas: [{ n: 1, precio: 110 }] })
    expect(r.ok).toBe(true)
    expect(r.correccion).toMatchObject({ total_antes: 1000, total_despues: 1100, cobrado: 1100, diferencia: 0, cuenta: [{ correccion: 'k1', monto: 100 }] })
    expect(cuenta.filter((c) => c.tipo === 'correccion')).toEqual([{ ref: `venta:${V}:correccion:k1`, monto: 100, tipo: 'correccion' }])
  })

  it('pone al día las correcciones viejas que ⛔ movieron la cuenta, una sola vez', async () => {
    const { db, cuenta } = base({ aCuenta: true, previas: [{ id: 'a', total_antes: 1000, total_despues: 935.4 }, { id: 'b', total_antes: 935.4, total_despues: 1011.03 }] })
    const r = await precioPendienteACuenta(db, { venta_id: V, usuario: 'dario' })
    expect(r).toEqual({ ok: true, cargado: [{ correccion: 'a', monto: -64.6 }, { correccion: 'b', monto: 75.63 }] })
    expect(await precioPendienteACuenta(db, { venta_id: V, usuario: 'dario' })).toEqual({ ok: true, cargado: [] })
    expect(cuenta.filter((c) => c.tipo === 'correccion')).toHaveLength(2)
  })

  it('sin cuenta corriente ⛔ toca la cuenta y la diferencia queda a la vista', async () => {
    const { db, cuenta } = base({ aCuenta: false })
    const r: any = await corregirPrecio(db, { venta_id: V, motivo: 'precio', usuario: 'dario', lineas: [{ n: 1, precio: 90 }] })
    expect(r.correccion).toMatchObject({ total_despues: 900, cobrado: 1000, diferencia: -100, cuenta: [] })
    expect(cuenta).toHaveLength(0)
    expect(await precioPendienteACuenta(db, { venta_id: V, usuario: 'dario' })).toMatchObject({ ok: false, error: { codigo: 'NO_A_CUENTA' } })
  })

  it('el pedido del panel toma el precio corregido y el total (⛔ pisa la corrección en el próximo cambio)', async () => {
    const pedido: Pedido = { id: 'p', empresa_id: 'areben', total: 1000, unidades: 11, lineas: [{ product_id: 7, size_id: 70, cantidad: 10, precio: 100 }, { product_id: 8, size_id: 80, cantidad: 1, precio: 5 }] }
    const { db, historial } = base({ aCuenta: true, pedido })
    await corregirPrecio(db, { venta_id: V, motivo: 'precio', usuario: 'dario', lineas: [{ n: 1, precio: 110 }] })
    expect(pedido.total).toBe(1100)
    expect(pedido.lineas).toEqual([{ product_id: 7, size_id: 70, cantidad: 10, precio: 110 }, { product_id: 8, size_id: 80, cantidad: 1, precio: 5 }])
    expect(historial).toHaveLength(1)
  })
})
