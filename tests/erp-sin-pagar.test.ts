import { describe, expect, it } from 'vitest'
import { armarFila, VISTAS } from '@/lib/erp/ventas-lista.core.js'
import { armarPedidosSinPagar } from '@/lib/erp/pedidos-tn.core.js'
import { entradaInvalida } from '@/lib/erp/entrada.core.js'
import { permisoErpDe } from '@/lib/permisos.core.js'
import { configuracionDeMarcas, ponerInterruptorErp } from '@/api/_erp-interruptores.js'

// «Los pedidos sin pagar entran a A preparar» (motor sql/040, Darío 26-oct: opción A). El motor guarda el estado en `tn_orden.estado`;
// acá la lista lo respeta: `a_preparar` entra a la vista «A preparar», cualquier otro valor sigue siendo `pedido` (como antes).
const pedido = (estado: string | null) => ({ kind: 'pedido', tienda: 'zattia', tnId: '555', tnNumero: 7001, creadaEn: '2026-10-20T10:00:00Z', total: 30000, estado })
const fila = (estado: string | null) => armarFila(pedido(estado)) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const preparar = VISTAS.find(([k]: [string, ...unknown[]]) => k === 'preparar')![2] as (f: unknown) => boolean
const sinpagar = VISTAS.find(([k]: [string, ...unknown[]]) => k === 'sinpagar')![2] as (f: unknown) => boolean

describe('la lista de Ventas con «sin pagar → a preparar»', () => {
  it('apagado (estado pedido, o sin dato) el sin pagar ⛔ está en A preparar, como hasta hoy', () => {
    for (const e of ['pedido', null, 'listo', 'en_preparacion']) {
      expect(fila(e).estadoKey).toBe('pedido')
      expect(preparar(fila(e))).toBe(false)
      expect(sinpagar(fila(e))).toBe(true)
    }
  })
  it('prendido (estado a_preparar) entra a A preparar y SIGUE en Sin pagar (todavía no cobró)', () => {
    const f = fila('a_preparar')
    expect(f.estadoKey).toBe('a_preparar')
    expect(preparar(f)).toBe(true)
    expect(sinpagar(f)).toBe(true)
    expect(f.cobroKey).toBe('sinpagar')
    expect(f.kind).toBe('pedido') // sigue sin ser una venta: ⛔ número, ⛔ factura
  })
})

describe('los pedidos sin pagar que lee el servidor', () => {
  it('traen el estado del motor', () => {
    const ordenes = [
      { tienda: 'zattia', tn_id: 1, numero: 10, creada_en: '2026-10-20T10:00:00Z', status: 'open', payment_status: 'pending', total: '100', estado: 'a_preparar' },
      { tienda: 'zattia', tn_id: 2, numero: 11, creada_en: '2026-10-20T11:00:00Z', status: 'open', payment_status: 'pending', total: '200', estado: 'pedido' },
      { tienda: 'zattia', tn_id: 3, numero: 12, creada_en: '2026-10-20T12:00:00Z', status: 'open', payment_status: 'pending', total: '300' },
    ]
    const r = armarPedidosSinPagar({ ordenes, lineas: [], ahora: Date.parse('2026-10-21T00:00:00Z') }) as { pedidos: { numero: number; estado: string | null }[] }
    expect(r.pedidos.map((p) => [p.numero, p.estado])).toEqual([[10, 'a_preparar'], [11, 'pedido'], [12, null]])
  })
})

describe('la puerta de la configuración', () => {
  it('el validador deja pasar la vista y la clave nueva como cuerpo; es sólo de Admin', () => {
    expect(entradaInvalida({ method: 'GET', query: { vista: 'configuracion' } })).toBeNull()
    expect(entradaInvalida({ method: 'POST', body: { accion: 'poner-interruptor', marca: 'zattia', clave: 'sin_pagar_a_preparar', valor: true } })).toBeNull()
    expect(permisoErpDe({ method: 'GET', vista: 'configuracion' })).toBe('configurar')
    expect(permisoErpDe({ method: 'POST', accion: 'poner-interruptor' })).toBe('configurar')
  })
  it('lee la base de cada marca y, si una falla, queda apagada (⛔ callada: avisa en el log)', async () => {
    const conMotor = async (marca: string) => (marca === 'bdi' ? { sin_pagar_a_preparar: true } : { status: 500, error: 'sin base' })
    const aviso = console.warn
    console.warn = () => {}
    try {
      expect(await configuracionDeMarcas(['bdi', 'zattia'], { conMotor })).toEqual({ bdi: { sin_pagar_a_preparar: true }, zattia: { sin_pagar_a_preparar: false } })
    } finally { console.warn = aviso }
  })
  it('al prenderla devuelve cuántos pedidos reclasificó; una aprobación (anular) ⛔ trae ese dato', async () => {
    const db = { query: async () => ({ rows: [{ hay: true }], rowCount: 3 }) }
    const conMotor = async (_m: string, _t: string, fn: (d: unknown) => unknown) => fn(db)
    const config = await ponerInterruptorErp({ body: { marca: 'bdi', clave: 'sin_pagar_a_preparar', valor: true }, usuario: 'ana' }, { conMotor }) as Record<string, unknown>
    expect([config.ok, config.reclasificados]).toEqual([true, 3])
    const aprobacion = await ponerInterruptorErp({ body: { marca: 'bdi', clave: 'anular', valor: true }, usuario: 'ana' }, { conMotor }) as Record<string, unknown>
    expect(aprobacion.ok).toBe(true)
    expect(aprobacion).not.toHaveProperty('reclasificados')
  })
  it('sin la migración 040 dice cuál falta (⛔ lanza)', async () => {
    const conMotor = async () => { throw Object.assign(new Error('violates check constraint'), { code: '23514' }) }
    const r = await ponerInterruptorErp({ body: { marca: 'bdi', clave: 'sin_pagar_a_preparar', valor: true }, usuario: 'ana' }, { conMotor }) as { status: number; error: string }
    expect([r.status, /040/.test(r.error)]).toEqual([409, true])
  })
})
