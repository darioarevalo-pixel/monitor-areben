import { describe, it, expect } from 'vitest'
import {
  aprobar,
  cerrar,
  contarPendientes,
  devolucionCompleta,
  escanearDevolucion,
  filtrarHistorial,
  pendientes,
  puedeDevolver,
  rechazar,
  unidades,
} from '@/lib/solicitudes-internas/core'
import { construirMapaBc } from '@/lib/sesionfotos/escaneo'
import type { ItemSI, SolicitudInterna } from '@/lib/solicitudes-internas/tipos'

function item(over: Partial<ItemSI> = {}): ItemSI {
  return { vid: 'v1', pid: '1', sid: '10', nombre: 'Remera', variante: 'M', sku: 'REM-M', qty: 1, origen: 'deposito', ...over }
}
function sol(over: Partial<SolicitudInterna> = {}): SolicitudInterna {
  return {
    id: 's1', fecha: '2026-07-10', creado: 1, creadoPor: 'ana', motivo: 'Moldería', tipo: 'retornable',
    descripcion: '', estado: 'aprobada', items: [item()], ...over,
  }
}

describe('aprobación', () => {
  it('pendientes / contarPendientes: sólo consumos en estado pendiente', () => {
    const list = [
      sol({ id: 'a', tipo: 'consumo', estado: 'pendiente' }),
      sol({ id: 'b', tipo: 'consumo', estado: 'aprobada' }),
      sol({ id: 'c', tipo: 'retornable', estado: 'pendiente' }), // retornable no espera aprobación
    ]
    expect(pendientes(list).map((s) => s.id)).toEqual(['a'])
    expect(contarPendientes(list)).toBe(1)
  })

  it('aprobar setea estado + aprobadoPor + fecha, sin mutar el original', () => {
    const s = sol({ tipo: 'consumo', estado: 'pendiente' })
    const a = aprobar(s, 'jefe', '2026-07-18')
    expect(a).toMatchObject({ estado: 'aprobada', aprobadoPor: 'jefe', aprobadoFecha: '2026-07-18' })
    expect(s.estado).toBe('pendiente') // inmutable
  })

  it('rechazar guarda el motivo', () => {
    const r = rechazar(sol({ tipo: 'consumo', estado: 'pendiente' }), 'no autorizado', 'jefe', '2026-07-18')
    expect(r).toMatchObject({ estado: 'rechazada', rechazadoMotivo: 'no autorizado', aprobadoPor: 'jefe' })
  })

  it('cerrar archiva', () => {
    expect(cerrar(sol({ estado: 'retirada' })).estado).toBe('cerrada')
  })
})

describe('filtrarHistorial', () => {
  const list = [
    sol({ id: 'p', tipo: 'consumo', estado: 'pendiente', motivo: 'Consumo', creadoPor: 'bruno' }),
    sol({ id: 'a', estado: 'aprobada', creadoPor: 'ana' }),
    sol({ id: 'r', estado: 'retirada', creadoPor: 'bruno' }),
    sol({ id: 'x', estado: 'cerrada', creadoPor: 'bruno' }),
    sol({ id: 'j', estado: 'rechazada', creadoPor: 'bruno' }),
  ]
  it('activas oculta cerradas y rechazadas', () => {
    expect(filtrarHistorial(list, 'activas', '').map((s) => s.id).sort()).toEqual(['a', 'p', 'r'])
  })
  it('pendientes: sólo estado pendiente', () => {
    expect(filtrarHistorial(list, 'pendientes', '').map((s) => s.id)).toEqual(['p'])
  })
  it('todas: no filtra por estado', () => {
    expect(filtrarHistorial(list, 'todas', '').length).toBe(5)
  })
  it('búsqueda cruza motivo, descripción y quién pidió', () => {
    expect(filtrarHistorial(list, 'todas', 'ana').map((s) => s.id)).toEqual(['a'])
    expect(filtrarHistorial(list, 'todas', 'consumo').map((s) => s.id)).toEqual(['p'])
  })
})

describe('devolución', () => {
  const VARS = [
    { id: 'a', barcode: '779001' },
    { id: 'b', barcode: '779002' },
  ]
  const mapa = construirMapaBc(VARS)

  it('unidades suma cantidades', () => {
    expect(unidades(sol({ items: [item({ qty: 2 }), item({ vid: 'b', qty: 3 })] }))).toBe(5)
  })

  it('puedeDevolver: retornable con venta, retirada o devuelta', () => {
    expect(puedeDevolver(sol({ tipo: 'retornable', estado: 'retirada', ventas: { deposito: { id: 1 } } }))).toBe(true)
    expect(puedeDevolver(sol({ tipo: 'retornable', estado: 'aprobada', ventas: { deposito: { id: 1 } } }))).toBe(false)
    expect(puedeDevolver(sol({ tipo: 'consumo', estado: 'retirada', ventas: { deposito: { id: 1 } } }))).toBe(false)
  })

  it('escanea por barcode: incrementa devuelto y da feedback ok', () => {
    const s = sol({ estado: 'retirada', items: [item({ vid: 'a', barcode: '779001', qty: 2, origen: 'deposito' })] })
    const { sol: ns, resultado } = escanearDevolucion(s, 'deposito', '779001', mapa)
    expect(resultado).toMatchObject({ tipo: 'ok', done: 1, qty: 2 })
    expect(ns.devuelto).toEqual({ a: 1 })
    expect(ns.estado).toBe('retirada') // todavía no completa → estado sin cambiar
  })

  it('al completar todos los ítems pasa a devuelta', () => {
    const s = sol({ estado: 'retirada', items: [item({ vid: 'a', barcode: '779001', qty: 1, origen: 'deposito' })] })
    const { sol: ns } = escanearDevolucion(s, 'deposito', '779001', mapa)
    expect(ns.devuelto).toEqual({ a: 1 })
    expect(ns.estado).toBe('devuelta')
  })

  it('ítem ya completo no incrementa', () => {
    const s = sol({ estado: 'retirada', items: [item({ vid: 'a', barcode: '779001', qty: 1, origen: 'deposito' })], devuelto: { a: 1 } })
    const { sol: ns, resultado } = escanearDevolucion(s, 'deposito', '779001', mapa)
    expect(resultado.tipo).toBe('ya-completo')
    expect(ns.devuelto).toEqual({ a: 1 })
  })

  it('código de otro origen / desconocido → no-encontrado', () => {
    const s = sol({ items: [item({ vid: 'a', barcode: '779001', origen: 'local' })] })
    const { resultado } = escanearDevolucion(s, 'deposito', '779001', mapa) // busca en depósito, la variante está en local
    expect(resultado.tipo).toBe('no-encontrado')
  })

  it('devolucionCompleta exige que todos los ítems vuelvan', () => {
    expect(devolucionCompleta(sol({ items: [item({ vid: 'a', qty: 2 })], devuelto: { a: 2 } }))).toBe(true)
    expect(devolucionCompleta(sol({ items: [item({ vid: 'a', qty: 2 })], devuelto: { a: 1 } }))).toBe(false)
    expect(devolucionCompleta(sol({ items: [] }))).toBe(false)
  })
})
