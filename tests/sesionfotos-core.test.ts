import { describe, it, expect } from 'vitest'
import {
  contarCerradas,
  faltantes,
  faseCompleta,
  filaHistorial,
  historialVisible,
  salio,
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
