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

  // En devolución el tope es lo que SALIÓ, no lo que se había pedido: si de 3 se prepararon 2,
  // vuelven 2. Sin esto se aceptaba devolver mercadería que nunca se retiró.
  it('devolución: el tope es lo preparado, no lo pedido', () => {
    const s = sol({ estado: 'cargada', items: [item({ vid: 'a', qty: 3 })], verif: { a: 2 }, devuelto: { a: 2 } })
    const { sol: ns, resultado } = escanearSol(s, 'deposito', 'devolucion', '111', mapa)
    expect(resultado).toMatchObject({ tipo: 'ya-completo', qty: 2 }) // no 3
    expect(ns).toBe(s)
  })

  it('devolución: un ítem que nunca se preparó no se puede escanear', () => {
    const s = sol({ estado: 'cargada', items: [item({ vid: 'a', qty: 2 })], verif: {} })
    const { resultado } = escanearSol(s, 'deposito', 'devolucion', '111', mapa)
    expect(resultado.tipo).toBe('no-encontrado') // no salió: no hay nada que devolver
  })

  it('retiro: el tope sigue siendo lo pedido', () => {
    const s = sol({ items: [item({ vid: 'a', qty: 3 })], verif: { a: 2 } })
    const { resultado } = escanearSol(s, 'deposito', 'retiro', '111', mapa)
    expect(resultado).toMatchObject({ tipo: 'ok', done: 3, qty: 3 })
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

  it('en devolución el techo del ajuste a mano es lo preparado', () => {
    const s = sol({ estado: 'cargada', items: [item({ vid: 'man_1', manual: true, qty: 3 })], verif: { man_1: 1 } })
    const ns = ajustarManualSol(ajustarManualSol(s, 'devolucion', 'man_1', 1), 'devolucion', 'man_1', 1)
    expect(ns.devuelto).toEqual({ man_1: 1 }) // salió 1, vuelve 1: el segundo + no hace nada
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

/**
 * La vista combinada, en DEVOLUCIÓN. Es el agujero que dejó `8d8265e`: la regla «al devolver, el
 * tope es lo que SALIÓ» se llevó a `esperadoEn` y se aplicó en cuatro de los cinco lugares —
 * `escanearCombi` quedó afuera y siguió topeando contra `it.qty`, lo pedido.
 *
 * 🔑 **Los tres casos de arriba son todos de fase `retiro`, y ahí `esperadoEn` ES `i.qty`** — por eso
 * pasaban en verde con el defecto puesto durante tres semanas. El bug sólo existe en la otra mitad
 * del ciclo, así que la única forma de cazarlo era ejercer la fase que nadie estaba ejerciendo.
 *
 * Son el espejo exacto de los de `escanearSol`: mismas tres situaciones, misma expectativa. Que la
 * combinada y el detalle contesten distinto sobre la misma solicitud es el defecto, no un matiz.
 */
describe('escanearCombi · en devolución el tope es lo que SALIÓ', () => {
  const mapa = construirMapaBc([{ id: 'a', barcode: '111' }])
  /** Salida real: se pidieron `qty`, se prepararon `verif`, ya volvieron `devuelto`. */
  const mkDev = (id: string, qty: number, verif: number, devuelto: number) =>
    sol({ id, estado: 'cargada', items: [item({ vid: 'a', qty })], verif: { a: verif }, devuelto: { a: devuelto } })

  // El caso medido: 10 pedidos, 7 salidos, 7 ya devueltos. El detalle rebota el 8º escaneo y la
  // combinada lo aceptaba, registrando una devolución de mercadería que nunca se retiró.
  it('no deja devolver más de lo que salió', () => {
    const sols = [mkDev('s1', 10, 7, 7)]
    const { sols: ns, resultado } = escanearCombi(sols, 'deposito', 'devolucion', '111', mapa)
    expect(resultado.tipo).toBe('ya-completo')
    expect(ns[0].devuelto).toEqual({ a: 7 }) // no 8
  })

  // El segundo mutante: `agregarCombinada` ni lo muestra en la lista, pero se podía escanear igual.
  it('un ítem que nunca salió no se puede devolver', () => {
    const sols = [mkDev('s1', 2, 0, 0)]
    const { resultado } = escanearCombi(sols, 'deposito', 'devolucion', '111', mapa)
    expect(resultado.tipo).toBe('no-encontrado')
  })

  // El `qty` del feedback es el tope de ESTA fase, no lo pedido: con 10/7 la pantalla tiene que
  // decir "1 de 7". Decir "1 de 10" manda a buscar tres unidades que no salieron nunca.
  it('el feedback informa el tope de la fase, no lo pedido', () => {
    const sols = [mkDev('s1', 10, 7, 0)]
    const { resultado } = escanearCombi(sols, 'deposito', 'devolucion', '111', mapa)
    expect(resultado).toMatchObject({ tipo: 'ok', done: 1, qty: 7 })
  })

  // El tope es por solicitud: la primera está llena según SU salida, la segunda todavía tiene lugar.
  it('cae en la siguiente solicitud según el esperado de cada una', () => {
    const sols = [mkDev('s1', 5, 2, 2), mkDev('s2', 5, 3, 0)]
    const { sols: ns, resultado } = escanearCombi(sols, 'deposito', 'devolucion', '111', mapa)
    expect(resultado).toMatchObject({ tipo: 'ok', targetId: 's2', done: 1, qty: 3 })
    expect(ns.find((s) => s.id === 's1')!.devuelto).toEqual({ a: 2 }) // intacta
  })
})
