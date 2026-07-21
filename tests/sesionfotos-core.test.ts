import { describe, it, expect } from 'vitest'
import {
  bloqueoBorrado,
  bloqueoQuitarItem,
  conDescripcion,
  conEstado,
  conRetirado,
  contarCerradas,
  faltantes,
  faseCompleta,
  faseSolicitud,
  filaHistorial,
  historialVisible,
  origenesConItems,
  retiradoCompleto,
  salio,
  sinItemSol,
  sinSolicitud,
  unidadesOrigen,
} from '@/lib/sesionfotos/core'
import { agregarCombinada, faseCompletaCombi } from '@/lib/sesionfotos/combinada'
import type { Origen, Solicitud } from '@/lib/sesionfotos/tipos'
import { cargarCombinadaLegacy, cargarSesionFotosLegacy } from './legacy-sesionfotos'

/**
 * Paridad de la lógica pura de Sesión de fotos: el port (lib/sesionfotos/core)
 * contra las funciones REALES de index.html, extraídas del fuente.
 *
 * No hay fixture del KV (son solicitudes reales con nombres de clientes internos);
 * las funciones son puras, así que se comparan sobre solicitudes armadas a mano
 * que ejercen cada rama: manual vs con venta, nuevo/pendiente, devolución parcial,
 * cada estado del ciclo de vida.
 */

const legacy = cargarSesionFotosLegacy()

/** Ítem con defaults; se pisa lo que interese en cada caso. */
function item(over: Partial<Solicitud['items'][number]> = {}): Solicitud['items'][number] {
  return { vid: 'v1', pid: '1', sid: '10', nombre: 'Remera', variante: 'M', sku: 'REM-M', qty: 1, origen: 'deposito', ...over }
}

/** Solicitud con defaults. */
function sol(over: Partial<Solicitud> = {}): Solicitud {
  return {
    id: 's1', fecha: '2026-07-10', creado: 1_720_000_000_000, creadoPor: 'ana',
    descripcion: 'Sesión otoño', estado: 'pendiente', items: [item()], ...over,
  }
}

/** El conjunto de solicitudes que ejerce las ramas de las funciones puras. */
const CASOS: Array<{ nombre: string; s: Solicitud }> = [
  { nombre: 'pendiente, sin conteos', s: sol() },
  {
    nombre: 'depósito + local, preparado parcial',
    s: sol({
      estado: 'preparada',
      items: [item({ vid: 'a', qty: 3, origen: 'deposito' }), item({ vid: 'b', qty: 2, origen: 'local' })],
      verif: { a: 3, b: 1 },
    }),
  },
  {
    nombre: 'con venta, devolución parcial',
    s: sol({
      estado: 'cargada',
      ventas: { deposito: { id: 555, number: 1201 } },
      items: [item({ vid: 'a', qty: 2 }), item({ vid: 'b', qty: 2, origen: 'local' })],
      verif: { a: 2, b: 2 },
      devuelto: { a: 2, b: 1 },
    }),
  },
  {
    nombre: 'con venta, devolución completa',
    s: sol({
      estado: 'devuelta',
      ventas: { deposito: { id: 555 }, local: { id: 556 } },
      items: [item({ vid: 'a', qty: 1 }), item({ vid: 'b', qty: 1, origen: 'local' })],
      verif: { a: 1, b: 1 },
      devuelto: { a: 1, b: 1 },
    }),
  },
  {
    nombre: 'solo ítems a mano, salió',
    s: sol({
      estado: 'preparada',
      items: [item({ vid: 'man_1', pid: null, sid: null, manual: true, nombre: 'Estampa X', variante: '', sku: '', qty: 2 })],
      verif: { man_1: 2 },
    }),
  },
  {
    nombre: 'solo ítems a mano, todavía pendiente (no salió)',
    s: sol({ estado: 'pendiente', items: [item({ vid: 'man_1', manual: true, qty: 1 })] }),
  },
  {
    nombre: 'nuevo pendiente en GN',
    s: sol({
      items: [item({ vid: 'bc_779', pid: null, sid: null, nuevo: true, pendiente: true, barcode: '779', nombre: '(nuevo sin cargar)', variante: '', sku: '', qty: 1 })],
    }),
  },
  { nombre: 'cerrada', s: sol({ estado: 'cerrada', items: [item({ qty: 1 })], verif: { v1: 1 }, devuelto: { v1: 1 } }) },
  { nombre: 'sin ítems', s: sol({ items: [] }) },
]

describe('paridad con index.html · funciones puras', () => {
  it.each(CASOS)('sfSalio · $nombre', ({ s }) => {
    expect(salio(s)).toBe(legacy.sfSalio(s))
  })

  it.each(CASOS)('sfFaltantes · $nombre', ({ s }) => {
    const a = legacy.sfFaltantes(s).map((x) => ({ vid: x.vid, falta: x.falta }))
    const b = faltantes(s).map((x) => ({ vid: x.vid, falta: x.falta }))
    expect(b).toEqual(a)
  })

  it.each(CASOS)('sfFaseCompleta (retiro y devolución) · $nombre', ({ s }) => {
    expect(faseCompleta(s, 'retiro')).toBe(legacy.sfFaseCompleta(s, 'retiro'))
    expect(faseCompleta(s, 'devolucion')).toBe(legacy.sfFaseCompleta(s, 'devolucion'))
  })
})

describe('derivaciones del historial', () => {
  it('cuenta unidades por origen', () => {
    const s = sol({ items: [item({ vid: 'a', qty: 3, origen: 'deposito' }), item({ vid: 'b', qty: 2, origen: 'local' }), item({ vid: 'c', qty: 4, origen: 'deposito' })] })
    expect(unidadesOrigen(s, 'deposito')).toBe(7)
    expect(unidadesOrigen(s, 'local')).toBe(2)
  })

  it('filaHistorial marca "por devolver" solo si salió, no está cerrada ni devuelta', () => {
    const conVenta = CASOS.find((c) => c.nombre === 'con venta, devolución parcial')!.s
    const f = filaHistorial(conVenta)
    expect(f.porDevolver).toBe(1) // b: pedidos 2, devuelto 1
    expect(f.dep).toBe(2)
    expect(f.loc).toBe(2)

    // Devuelta: no muestra el badge aunque falte (el legacy corta en estado devuelta).
    const devuelta = CASOS.find((c) => c.nombre === 'con venta, devolución completa')!.s
    expect(filaHistorial(devuelta).porDevolver).toBe(0)

    // Pendiente sin salir: tampoco.
    expect(filaHistorial(sol()).porDevolver).toBe(0)
  })

  it('historialVisible oculta las cerradas salvo que se pidan; contarCerradas las cuenta', () => {
    const data = CASOS.map((c) => c.s)
    const cerradas = contarCerradas(data)
    expect(cerradas).toBe(1)
    expect(historialVisible(data, false)).toHaveLength(data.length - cerradas)
    expect(historialVisible(data, true)).toHaveLength(data.length)
  })
})

describe('mutaciones puras (SF-4)', () => {
  const lista: Solicitud[] = [
    sol({ id: 'a', estado: 'pendiente', descripcion: 'Uno' }),
    sol({ id: 'b', estado: 'preparada', descripcion: 'Dos' }),
  ]

  it('conEstado cambia solo la solicitud del id y no muta el original', () => {
    const out = conEstado(lista, 'b', 'cerrada')
    expect(out.find((s) => s.id === 'b')!.estado).toBe('cerrada')
    expect(out.find((s) => s.id === 'a')!.estado).toBe('pendiente')
    expect(lista.find((s) => s.id === 'b')!.estado).toBe('preparada') // inmutable
    expect(out).not.toBe(lista)
  })

  it('conDescripcion cambia solo la descripción del id', () => {
    const out = conDescripcion(lista, 'a', 'Editada')
    expect(out.find((s) => s.id === 'a')!.descripcion).toBe('Editada')
    expect(out.find((s) => s.id === 'b')!.descripcion).toBe('Dos')
    expect(lista.find((s) => s.id === 'a')!.descripcion).toBe('Uno')
  })

  it('son idempotentes al aplicarse dos veces (base del merge por-solicitud)', () => {
    const once = conEstado(lista, 'a', 'devuelta')
    const twice = conEstado(once, 'a', 'devuelta')
    expect(twice.map((s) => s.estado)).toEqual(once.map((s) => s.estado))
  })
})

describe('borrar y quitar-item (SF-4c)', () => {
  it('bloqueoBorrado: admin siempre puede; no-admin no si salió y falta devolver', () => {
    const salida = sol({ estado: 'cargada', ventas: { deposito: { id: 1 } }, items: [item({ vid: 'a', qty: 2 })], devuelto: { a: 1 } })
    expect(bloqueoBorrado(salida, true)).toBeNull() // admin
    expect(bloqueoBorrado(salida, false)).toMatch(/ya salió/) // no-admin bloqueado
    // devuelta o cerrada: se puede aunque haya salido
    expect(bloqueoBorrado({ ...salida, estado: 'devuelta' }, false)).toBeNull()
    expect(bloqueoBorrado({ ...salida, estado: 'cerrada' }, false)).toBeNull()
    // no salió: se puede
    expect(bloqueoBorrado(sol({ estado: 'pendiente' }), false)).toBeNull()
  })

  it('sinSolicitud quita por id', () => {
    const lista = [sol({ id: 'a' }), sol({ id: 'b' })]
    expect(sinSolicitud(lista, 'a').map((s) => s.id)).toEqual(['b'])
    expect(lista).toHaveLength(2) // inmutable
  })

  it('bloqueoQuitarItem bloquea si ya hay ventas', () => {
    expect(bloqueoQuitarItem(sol({ ventas: { deposito: { id: 1 } } }))).toMatch(/ventas/)
    expect(bloqueoQuitarItem(sol())).toBeNull()
  })

  it('sinItemSol quita el ítem, deja rastro y borra su conteo', () => {
    const s = sol({
      items: [item({ vid: 'a', nombre: 'Rem', qty: 2 }), item({ vid: 'b', nombre: 'Buzo', qty: 1, origen: 'local' })],
      verif: { a: 1, b: 1 },
      devuelto: { a: 2 },
    })
    const ns = sinItemSol(s, 'a', { por: 'ana', motivo: 'no había stock', fecha: '2026-07-18' })
    expect(ns.items.map((i) => i.vid)).toEqual(['b'])
    expect(ns.verif).toEqual({ b: 1 }) // borró a
    expect(ns.devuelto).toEqual({}) // borró a
    expect(ns.eliminados).toHaveLength(1)
    expect(ns.eliminados![0]).toMatchObject({ vid: 'a', nombre: 'Rem', qty: 2, origen: 'deposito', por: 'ana', motivo: 'no había stock', fecha: '2026-07-18' })
    expect(s.items).toHaveLength(2) // inmutable
  })

  it('sinItemSol no crea verif/devuelto si no existían', () => {
    const s = sol({ items: [item({ vid: 'a' })] })
    const ns = sinItemSol(s, 'a', { por: '', motivo: '', fecha: '2026-07-18' })
    expect(ns.verif).toBeUndefined()
    expect(ns.devuelto).toBeUndefined()
  })
})

describe('vista combinada · paridad con index.html', () => {
  // Dos solicitudes que comparten una variante (a) y tienen ítems propios, con un
  // manual y ambos orígenes, para ejercer suma por vid, no-suma de manuales y orden.
  const SOLS: Solicitud[] = [
    sol({
      id: 's1',
      estado: 'preparada',
      items: [
        item({ vid: 'a', nombre: 'Remera', qty: 2, origen: 'deposito' }),
        item({ vid: 'b', nombre: 'Buzo', qty: 1, origen: 'local' }),
        item({ vid: 'man_1', nombre: 'Estampa X', variante: '', sku: '', manual: true, qty: 2, origen: 'deposito' }),
      ],
      verif: { a: 2, b: 0, man_1: 1 },
    }),
    sol({
      id: 's2',
      estado: 'cargada',
      ventas: { deposito: { id: 9, number: 77 } },
      items: [
        item({ vid: 'a', nombre: 'Remera', qty: 3, origen: 'deposito' }),
        item({ vid: 'c', nombre: 'Campera', qty: 1, origen: 'deposito' }),
      ],
      verif: { a: 1, c: 1 },
      devuelto: { a: 3 },
    }),
  ]
  const ids = SOLS.map((s) => s.id)
  const legacy = cargarCombinadaLegacy(SOLS)

  it.each(['retiro', 'devolucion'] as const)('_sfCombiAgg coincide por origen · fase %s', (fase) => {
    for (const origen of ['deposito', 'local'] as Origen[]) {
      const a = legacy._sfCombiAgg(ids, origen, fase).map((x) => ({ nombre: x.nombre, variante: x.variante, sku: x.sku, ped: x.ped, conf: x.conf, manual: !!x.manual }))
      const b = agregarCombinada(SOLS, origen, fase).map((x) => ({ nombre: x.nombre, variante: x.variante, sku: x.sku, ped: x.ped, conf: x.conf, manual: !!x.manual }))
      expect(b).toEqual(a)
    }
  })

  it.each(['retiro', 'devolucion'] as const)('sfFaseCompletaCombi coincide · fase %s', (fase) => {
    expect(faseCompletaCombi(SOLS, fase)).toBe(legacy.sfFaseCompletaCombi(ids, fase))
  })
})

describe('sesionfotos/core — separado vs retirado', () => {
  const conVenta = (over = {}) =>
    sol({ estado: 'cargada', items: [item({ origen: 'deposito' }), item({ vid: 'v2', origen: 'local' })], ventas: { deposito: { id: 1 }, local: { id: 2 } }, ...over })

  it('origenesConItems detecta los dos orígenes', () => {
    expect(origenesConItems(conVenta()).sort()).toEqual(['deposito', 'local'])
    expect(origenesConItems(sol({ items: [item({ origen: 'local' })] }))).toEqual(['local'])
  })

  it('retiradoCompleto: false hasta que TODOS los orígenes estén retirados', () => {
    const s = conVenta()
    expect(retiradoCompleto(s)).toBe(false)
    expect(retiradoCompleto({ ...s, retirado: { deposito: true } })).toBe(false)
    expect(retiradoCompleto({ ...s, retirado: { deposito: true, local: true } })).toBe(true)
  })

  it('retiradoCompleto: false si no hay venta (nada separado)', () => {
    expect(retiradoCompleto(sol({ estado: 'preparada', retirado: { deposito: true } }))).toBe(false)
  })

  it('faseSolicitud: cargada = separado; retirado cuando está todo', () => {
    const s = conVenta()
    expect(faseSolicitud(s)).toBe('separado')
    expect(faseSolicitud({ ...s, retirado: { deposito: true, local: true } })).toBe('retirado')
    expect(faseSolicitud(sol({ estado: 'pendiente' }))).toBe('pendiente')
    expect(faseSolicitud(sol({ estado: 'devuelta' }))).toBe('devuelta')
  })

  it('conRetirado marca el origen de la solicitud correcta', () => {
    const lista = [conVenta({ id: 'a' }), conVenta({ id: 'b' })]
    const out = conRetirado(lista, 'a', 'local', true)
    expect(out[0].retirado).toEqual({ local: true })
    expect(out[1].retirado).toBeUndefined()
  })
})
