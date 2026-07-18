import { describe, it, expect } from 'vitest'
import {
  ajustarManualSol,
  construirMapaBc,
  escanearCombi,
  escanearSol,
  vidDeBarcode,
} from '@/lib/sesionfotos/escaneo'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import { cargarBcVidLegacy } from './legacy-sesionfotos'

function item(over: Partial<Solicitud['items'][number]> = {}): Solicitud['items'][number] {
  return { vid: 'v1', pid: '1', sid: '10', nombre: 'Remera', variante: 'M', sku: 'REM-M', qty: 1, origen: 'deposito', ...over }
}
function sol(over: Partial<Solicitud> = {}): Solicitud {
  return { id: 's1', fecha: '2026-07-10', creado: 1, creadoPor: 'ana', descripcion: '', estado: 'pendiente', items: [item()], ...over }
}

describe('sfBcVid · paridad con index.html', () => {
  // Variantes con barcodes que ejercen: normal, con ceros a la izquierda, vacío.
  const variantes = [
    { id: '1_10', barcode: '0000000002301' },
    { id: '1_11', barcode: '779123' },
    { id: '2_20', barcode: '   0042 ' },
    { id: '3_30', barcode: null },
  ]
  const legacy = cargarBcVidLegacy(variantes)
  const mapa = construirMapaBc(variantes)

  const CODES = ['0000000002301', '2301', '000002301', '779123', '0779123', '0042', '42', 'NOPE', '', '  779123  ']
  it.each(CODES)('resuelve igual el código "%s"', (code) => {
    expect(vidDeBarcode(code, mapa)).toBe(legacy(code))
  })
})

describe('escanearSol · preparado y devolución', () => {
  const mapa = construirMapaBc([{ id: 'a', barcode: '111' }, { id: 'b', barcode: '222' }])

  it('suma por código de barras y devuelve ok con el conteo', () => {
    const s = sol({ items: [item({ vid: 'a', qty: 2 })] })
    const { sol: ns, resultado } = escanearSol(s, 'deposito', 'retiro', '111', mapa)
    expect(resultado).toMatchObject({ tipo: 'ok', done: 1, qty: 2 })
    expect(ns.verif).toEqual({ a: 1 })
    expect(ns.estado).toBe('pendiente') // todavía falta 1
  })

  it('al completar la fase retiro pasa a preparada', () => {
    const s = sol({ items: [item({ vid: 'a', qty: 1 })] })
    const { sol: ns } = escanearSol(s, 'deposito', 'retiro', '111', mapa)
    expect(ns.verif).toEqual({ a: 1 })
    expect(ns.estado).toBe('preparada')
  })

  it('al completar la fase devolución pasa a devuelta', () => {
    const s = sol({ estado: 'cargada', items: [item({ vid: 'a', qty: 1 })], verif: { a: 1 } })
    const { sol: ns } = escanearSol(s, 'deposito', 'devolucion', '111', mapa)
    expect(ns.devuelto).toEqual({ a: 1 })
    expect(ns.estado).toBe('devuelta')
  })

  it('no pasa de la cantidad pedida (ya-completo)', () => {
    const s = sol({ items: [item({ vid: 'a', qty: 1 })], verif: { a: 1 } })
    const { sol: ns, resultado } = escanearSol(s, 'deposito', 'retiro', '111', mapa)
    expect(resultado.tipo).toBe('ya-completo')
    expect(ns).toBe(s) // sin cambios
  })

  it('cae al SKU si el código no matchea un barcode', () => {
    const s = sol({ items: [item({ vid: 'a', sku: 'REM-XL', qty: 2 })] })
    const { resultado } = escanearSol(s, 'deposito', 'retiro', 'rem-xl', mapa)
    expect(resultado.tipo).toBe('ok')
  })

  it('cae al barcode del ítem nuevo (sin cargar en GN)', () => {
    const s = sol({ items: [item({ vid: 'bc_999', sku: '', barcode: '999', nuevo: true, qty: 1 })] })
    const { resultado } = escanearSol(s, 'deposito', 'retiro', '999', mapa)
    expect(resultado.tipo).toBe('ok')
  })

  it('el código que no está en ese origen da no-encontrado', () => {
    const s = sol({ items: [item({ vid: 'a', origen: 'local', qty: 1 })] })
    const { resultado } = escanearSol(s, 'deposito', 'retiro', '111', mapa)
    expect(resultado.tipo).toBe('no-encontrado')
  })
})

describe('ajustarManualSol · clamp y transición', () => {
  it('suma y resta clampeado a [0, qty]', () => {
    let s = sol({ items: [item({ vid: 'man_1', manual: true, qty: 2 })] })
    s = ajustarManualSol(s, 'retiro', 'man_1', 1)
    expect(s.verif).toEqual({ man_1: 1 })
    s = ajustarManualSol(s, 'retiro', 'man_1', 1)
    expect(s.verif).toEqual({ man_1: 2 })
    expect(s.estado).toBe('preparada') // completó
    s = ajustarManualSol(s, 'retiro', 'man_1', 1) // no pasa de 2
    expect(s.verif).toEqual({ man_1: 2 })
    s = ajustarManualSol(s, 'retiro', 'man_1', -5) // no baja de 0
    expect(s.verif).toEqual({ man_1: 0 })
  })
})

describe('escanearCombi · cae en la primera con lugar', () => {
  const mapa = construirMapaBc([{ id: 'a', barcode: '111' }])
  const mkSol = (id: string, verif: Record<string, number>) =>
    sol({ id, items: [item({ vid: 'a', qty: 1 })], verif })

  it('suma en la primera solicitud que tenga lugar', () => {
    const sols = [mkSol('s1', { a: 1 }), mkSol('s2', {})] // s1 ya completa, s2 no
    const { sols: ns, resultado } = escanearCombi(sols, 'deposito', 'retiro', '111', mapa)
    expect(resultado).toMatchObject({ tipo: 'ok', targetId: 's2' })
    expect(ns.find((s) => s.id === 's2')!.verif).toEqual({ a: 1 })
    expect(ns.find((s) => s.id === 's1')!.verif).toEqual({ a: 1 }) // intacta
  })

  it('si están todas completas, ya-completo', () => {
    const sols = [mkSol('s1', { a: 1 }), mkSol('s2', { a: 1 })]
    const { resultado } = escanearCombi(sols, 'deposito', 'retiro', '111', mapa)
    expect(resultado.tipo).toBe('ya-completo')
  })

  it('si no está en ninguna, no-encontrado', () => {
    const sols = [mkSol('s1', {})]
    const { resultado } = escanearCombi(sols, 'deposito', 'retiro', 'ZZZ', mapa)
    expect(resultado.tipo).toBe('no-encontrado')
  })
})
