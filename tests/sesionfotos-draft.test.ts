import { describe, it, expect } from 'vitest'
import {
  buscarProductos,
  draftVacio,
  escanearDraft,
  escaneadasDraft,
  expandirProductos,
  procesarDraft,
  setVarQty,
  totalDraft,
  traerVariante,
  type Draft,
} from '@/lib/sesionfotos/draft'
import { construirMapaBc, escanearSol } from '@/lib/sesionfotos/escaneo'
import type { Producto, Variante } from '@/lib/etl/tipos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import { cargarExpandirLegacy, cargarProcesarLegacy } from './legacy-sesionfotos'

function mkVar(o: { id: string; pid: string; sid?: string; name?: string; size?: string; sku?: string; local?: number; deposito?: number; barcode?: string }): Variante {
  return {
    id: o.id, pid: o.pid, sid: o.sid ?? '0', name: o.name ?? 'Prod', size: o.size ?? 'M',
    stock: (o.local ?? 0) + (o.deposito ?? 0), local: o.local ?? 0, deposito: o.deposito ?? 0,
    sku: o.sku ?? '', barcode: o.barcode ?? '', lastSale: null, daysSinceLast: 0,
    sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0, totalSales: 0, lifespan: 0,
    phase: { label: 'madurez', cls: '' },
  }
}
/** El legacy solo lee id/name/category de allProductos. */
const prod = (id: string, name: string, category = ''): Producto => ({ id, name, category } as unknown as Producto)
/** Forma repoInv del legacy a partir de una Variante del ETL. */
const aRepoInv = (v: Variante) => ({ vid: v.id, pid: v.pid, sid: v.sid, name: v.name, cat: '', size: v.size, sku: v.sku, local: v.local, deposito: v.deposito })

const VARIANTES: Variante[] = [
  mkVar({ id: '1_10', pid: '1', sid: '10', name: 'Remera', size: 'S', sku: 'REM-S', local: 0, deposito: 5, barcode: '111' }),
  mkVar({ id: '1_11', pid: '1', sid: '11', name: 'Remera', size: 'M', sku: 'REM-M', local: 3, deposito: 0, barcode: '112' }),
  mkVar({ id: '1_12', pid: '1', sid: '12', name: 'Remera', size: 'L', sku: 'REM-L', local: 0, deposito: 0, barcode: '113' }), // sin stock
  mkVar({ id: '2_20', pid: '2', sid: '20', name: 'Buzo', size: 'U', sku: 'BUZ-U', local: 2, deposito: 4, barcode: '222' }),
]
const PRODUCTOS: Producto[] = [prod('1', 'Remera', 'REMERAS'), prod('2', 'Buzo', 'BUZOS')]

describe('expandirProductos · paridad con sfDraftDesdeProductos', () => {
  const legacyExpandir = cargarExpandirLegacy(VARIANTES.map(aRepoInv), PRODUCTOS as unknown[])

  it('trae las variantes con stock, ordenadas, sin tildar', () => {
    const legacy = legacyExpandir(['1'])
    const port = expandirProductos(draftVacio(), ['1'], VARIANTES, PRODUCTOS).prods
    expect(port).toEqual(legacy)
    // sanity: solo S y M (L sin stock queda afuera)
    expect(port[0].variantes.map((v) => v.size)).toEqual(['M', 'S'])
  })

  it('no duplica un producto ya presente', () => {
    const d1 = expandirProductos(draftVacio(), ['1'], VARIANTES, PRODUCTOS)
    const d2 = expandirProductos(d1, ['1', '2'], VARIANTES, PRODUCTOS)
    expect(d2.prods.map((p) => p.pid)).toEqual(['1', '2'])
  })
})

describe('procesarDraft · paridad con sfProcesar (asignación de origen)', () => {
  // Draft con casos: stock alcanza en depósito, alcanza en local, no alcanza en
  // ninguno, y con origen fijado a mano (origenManual).
  const draft: Draft = {
    desc: 'Sesión test',
    prods: [
      {
        pid: '1', name: 'Remera', cat: '',
        variantes: [
          { vid: '1_10', sid: '10', size: 'S', sku: 'REM-S', local: 0, deposito: 5, sel: true, qty: 2 }, // dep alcanza
          { vid: '1_11', sid: '11', size: 'M', sku: 'REM-M', local: 3, deposito: 0, sel: true, qty: 2 }, // dep no, local sí
          { vid: '1_12', sid: '12', size: 'L', sku: 'REM-L', local: 1, deposito: 1, sel: true, qty: 5 }, // ninguno alcanza
          { vid: '1_13', sid: '13', size: 'XL', sku: 'REM-XL', local: 9, deposito: 9, sel: true, qty: 1, origenManual: 'local' }, // fijado a mano
          { vid: '1_14', sid: '14', size: 'XXL', sku: 'REM-XXL', local: 9, deposito: 9, sel: false, qty: 3 }, // NO seleccionada
        ],
      },
    ],
    pendientes: [{ barcode: '999', qty: 2, origenManual: 'local' }],
    manuales: [{ mid: 'm1', desc: 'Estampa X', qty: 3 }, { mid: 'm2', desc: '  ', qty: 1 }], // el vacío se descarta
  }
  const meta = { id: 's_test', fecha: '2026-07-18', creado: 123, creadoPor: 'ana' }

  it.each(['deposito', 'local'] as const)('mismos items con prioridad %s', (prio) => {
    const legacyItems = cargarProcesarLegacy(JSON.parse(JSON.stringify(draft)), prio, 'ana')
    const portItems = procesarDraft(draft, prio, meta)!.items
    expect(portItems).toEqual(legacyItems)
  })

  it('devuelve null si no hay nada seleccionado', () => {
    expect(procesarDraft(draftVacio(), 'deposito', meta)).toBeNull()
  })
})

describe('buscarProductos', () => {
  it('agrupa por producto las variantes con stock y matchea por nombre o SKU', () => {
    const r = buscarProductos(VARIANTES, 'rem', new Set())
    expect(r).toHaveLength(1)
    expect(r[0].pid).toBe('1')
    expect(r[0].vars.map((v) => v.size)).toEqual(['M', 'S']) // L sin stock no aparece
    expect(buscarProductos(VARIANTES, 'buz-u', new Set()).map((e) => e.pid)).toEqual(['2']) // por SKU
  })
  it('menos de 2 letras no busca; marca los ya presentes', () => {
    expect(buscarProductos(VARIANTES, 'r', new Set())).toEqual([])
    expect(buscarProductos(VARIANTES, 'rem', new Set(['1']))[0].yaEsta).toBe(true)
  })
})

describe('escanearDraft', () => {
  const mapa = construirMapaBc(VARIANTES)

  // 🔴 Hasta el 21-sep-2026 esto daba qty 2 por UN escaneo: `expandirProductos` deja las variantes
  // con stock en `qty: 1` sin tildar —el default de la casilla— y el escaneo le sumaba encima. Era
  // fiel al legacy, se replicaba para el A/B del iframe (que ya no corre), y pedía el doble.
  it('escanear un barcode existente tilda la variante, cuenta UNA unidad y fija el origen', () => {
    const { draft, resultado } = escanearDraft(draftVacio(), '111', mapa, VARIANTES, 'local', PRODUCTOS)
    // 🔴 El feedback canta DÓNDE CAE, ⛔ no qué chip estaba puesto: la S tiene stock sólo en
    // depósito, así que ahí va aunque se haya escaneado con el chip en Local.
    expect(resultado).toMatchObject({ tipo: 'variante', size: 'S', qty: 1, origen: 'deposito' })
    const v = draft.prods[0].variantes.find((x) => x.vid === '1_10')!
    expect(v).toMatchObject({ sel: true, qty: 1, escaneado: 1, origenManual: 'local' })
    // el chip queda guardado igual: es el único dato cuando el stock ⛔ no puede decidir
    expect(procesarDraft(draft, 'local', { id: 'x', fecha: '2026-09-21', creado: 1, creadoPor: 'l' })!.items[0].origen).toBe('deposito')
  })

  it('escanear dos veces sigue sumando 1 por escaneo', () => {
    let d = draftVacio()
    d = escanearDraft(d, '111', mapa, VARIANTES, 'deposito', PRODUCTOS).draft
    const { draft, resultado } = escanearDraft(d, '111', mapa, VARIANTES, 'deposito', PRODUCTOS)
    expect(resultado).toMatchObject({ qty: 2 })
    const v = draft.prods[0].variantes.find((x) => x.vid === '1_10')!
    expect(v).toMatchObject({ qty: 2, escaneado: 2 })
  })

  // Lo pedido a mano ⛔ no se pisa: el escaneo se le SUMA. Es la otra mitad de la regla de arriba,
  // y sin este test «arrancar en 1» se podría escribir como «poner en 1».
  it('si la variante YA estaba tildada con una cantidad, el escaneo se le suma', () => {
    let d = expandirProductos(draftVacio(), ['1'], VARIANTES, PRODUCTOS)
    d = { ...d, prods: d.prods.map((p) => ({ ...p, variantes: p.variantes.map((v) => (v.vid === '1_10' ? { ...v, sel: true, qty: 3 } : v)) })) }
    const { draft } = escanearDraft(d, '111', mapa, VARIANTES, 'local', PRODUCTOS)
    const v = draft.prods[0].variantes.find((x) => x.vid === '1_10')!
    expect(v).toMatchObject({ qty: 4, escaneado: 1 })
  })

  it('un código desconocido cae a "nuevo" por código de barras', () => {
    const { draft, resultado } = escanearDraft(draftVacio(), '77777', mapa, VARIANTES, 'deposito', PRODUCTOS)
    expect(resultado).toMatchObject({ tipo: 'nuevo', barcode: '77777', qty: 1 })
    expect(draft.pendientes).toEqual([{ barcode: '77777', qty: 1, origenManual: 'deposito' }])
  })

  it('cae al SKU si el código no es un barcode', () => {
    const { resultado } = escanearDraft(draftVacio(), 'buz-u', mapa, VARIANTES, 'deposito', PRODUCTOS)
    expect(resultado).toMatchObject({ tipo: 'variante', size: 'U' })
  })
})

describe('totalDraft', () => {
  it('suma seleccionadas + pendientes + manuales', () => {
    const d: Draft = {
      desc: '', prods: [{ pid: '1', name: 'R', cat: '', variantes: [{ vid: 'a', sid: '0', size: 'S', sku: '', local: 0, deposito: 9, sel: true, qty: 2 }, { vid: 'b', sid: '0', size: 'M', sku: '', local: 0, deposito: 9, sel: false, qty: 5 }] }],
      pendientes: [{ barcode: '9', qty: 3, origenManual: 'deposito' }],
      manuales: [{ mid: 'm', desc: 'x', qty: 4 }],
    }
    expect(totalDraft(d)).toBe(2 + 3 + 4) // la no-seleccionada (5) no cuenta
  })
})

/**
 * El caso del 2-sep-2026: el SKU de Gestión Nube lleva guiones (`RVE-0047-NG`) y la etiqueta que
 * se escanea es el mismo código sin ellos (`RVE0047NG`). Escanear el SKU de un producto que SÍ
 * existe lo mandaba a la caja de «nuevos sin cargar».
 */
describe('escanearDraft · el SKU también se prueba normalizado (10-sep-2026)', () => {
  const VARS: Variante[] = [mkVar({ id: '9_90', pid: '9', sid: '90', name: 'VESTIDO BLAZE', size: 'NEGRO', sku: 'RVE-0047-NG', deposito: 4, barcode: '' })]
  const PRODS: Producto[] = [prod('9', 'VESTIDO BLAZE')]
  const mapa = construirMapaBc(VARS)

  it('encuentra la variante escaneando el SKU sin guiones', () => {
    const { resultado } = escanearDraft(draftVacio(), 'RVE0047NG', mapa, VARS, 'deposito', PRODS)
    expect(resultado).toMatchObject({ tipo: 'variante', nombre: 'VESTIDO BLAZE', size: 'NEGRO' })
  })

  it('lo que no cruza con nada sigue yendo a «nuevo»', () => {
    const { resultado } = escanearDraft(draftVacio(), 'RMI0055CR', mapa, VARS, 'deposito', PRODS)
    expect(resultado).toMatchObject({ tipo: 'nuevo', barcode: 'RMI0055CR' })
  })
})

describe('procesarDraft · un «a mano» con forma de código guarda el código', () => {
  const meta = { id: 's_cod', fecha: '2026-09-02', creado: 1, creadoPor: 'lorena' }

  it('el código escaneado viaja en barcode, no sólo en el nombre', () => {
    const d: Draft = { ...draftVacio(), manuales: [{ mid: 'm1', desc: 'RVE0047NG', qty: 1 }] }
    const i = procesarDraft(d, 'deposito', meta)!.items[0]
    expect(i).toMatchObject({ nombre: 'RVE0047NG', barcode: 'RVE0047NG', manual: true, nuevo: true, sku: '' })
  })

  it('una descripción de verdad NO se guarda como código', () => {
    const d: Draft = { ...draftVacio(), manuales: [{ mid: 'm2', desc: 'Remera estampa X', qty: 2 }] }
    const i = procesarDraft(d, 'deposito', meta)!.items[0]
    expect(i.nombre).toBe('Remera estampa X')
    expect(i.barcode).toBeUndefined()
  })
})

/**
 * 🔑 **Lo escaneado en el borrador nace PREPARADO** (21-sep-2026).
 *
 * Lo trajo Administración: escaneó 140 prendas ya separadas con «¿Ya los separaste? Escaneálos»,
 * apretó Procesar y la solicitud salió con los 140 renglones **en `0/1`, sin un solo tilde**.
 * `procesarDraft` armaba los `items` y tiraba el escaneo: `verif` —que es lo que dibuja el tilde y
 * lo que decide qué sale en la venta de GN— nacía vacío.
 *
 * El oráculo es la EQUIVALENCIA, ⛔ no un `verif` esperado escrito a mano: escanear en el borrador
 * y escanear en el detalle son el mismo hecho físico, así que tienen que dar la misma solicitud.
 * Un `verif` hardcodeado acá se rompería igual que se rompió el código.
 */
describe('procesarDraft · lo escaneado nace preparado (21-sep-2026)', () => {
  const mapa = construirMapaBc(VARIANTES)
  const meta = { id: 's_prep', fecha: '2026-09-21', creado: 1, creadoPor: 'lorena' }

  it('escanear en el borrador == crear y escanear en el detalle (verif y estado)', () => {
    const codigos = ['111', '111', '222'] // dos unidades de la S y una del buzo

    // Camino A: escanear en el borrador.
    let d = draftVacio()
    for (const c of codigos) d = escanearDraft(d, c, mapa, VARIANTES, 'local', PRODUCTOS).draft
    const porBorrador = procesarDraft(d, 'local', meta)!

    // Camino B: la misma solicitud sin escanear, y los mismos códigos por el detalle. Se pasa por
    // los DOS orígenes porque en la pantalla cada sector escanea SU grupo, y un código que no es de
    // ese grupo rebota sin tocar nada.
    const sinEscanear = { ...porBorrador, verif: undefined, estado: 'pendiente' as const }
    let porDetalle = sinEscanear as Solicitud
    for (const o of ['deposito', 'local'] as const) for (const c of codigos) porDetalle = escanearSol(porDetalle, o, 'retiro', c, mapa).sol

    expect(porBorrador.verif).toEqual(porDetalle.verif)
    expect(porBorrador.estado).toBe(porDetalle.estado)
    // sanity: es el caso completo, así que los dos llegan a `preparada`
    expect(porBorrador.estado).toBe('preparada')
    expect(porBorrador.verif).toEqual({ '1_10': 2, '2_20': 1 })
  })

  it('mixto: lo del buscador NO lleva clave, y la solicitud no llega a preparada', () => {
    let d = traerVariante(draftVacio(), '2', '2_20', VARIANTES, PRODUCTOS) // a mano, sin escanear
    d = escanearDraft(d, '111', mapa, VARIANTES, 'local', PRODUCTOS).draft
    const sol = procesarDraft(d, 'local', meta)!
    expect(sol.verif).toEqual({ '1_10': 1 })
    expect('2_20' in sol.verif!).toBe(false) // ⛔ ausente, NO un 0: un 0 significa "lo busqué y no está"
    expect(sol.estado).not.toBe('preparada')
  })

  it('un borrador sin ningún escaneo ⛔ ni siquiera trae la clave `verif`', () => {
    const d = traerVariante(draftVacio(), '1', '1_10', VARIANTES, PRODUCTOS)
    const sol = procesarDraft(d, 'local', meta)!
    expect('verif' in sol).toBe(false) // `{}` le cambiaría el JSON a toda solicitud, y el cajón diffea por JSON
    expect(sol.estado).toBe('pendiente')
  })

  it('un código que todavía no está en GN también nace preparado', () => {
    const d = escanearDraft(draftVacio(), '77777', mapa, VARIANTES, 'deposito', PRODUCTOS).draft
    const sol = procesarDraft(d, 'deposito', meta)!
    expect(sol.verif).toEqual({ bc_77777: 1 })
  })

  it('lo tipeado «sin código» ⛔ no se marca: nadie lo escaneó', () => {
    const d: Draft = { ...draftVacio(), manuales: [{ mid: 'm1', desc: 'Remera estampa X', qty: 2 }] }
    const sol = procesarDraft(d, 'deposito', meta)!
    expect('verif' in sol).toBe(false)
  })

  it('bajar la cantidad a mano después de escanear topea lo preparado', () => {
    let d = draftVacio()
    for (let n = 0; n < 3; n++) d = escanearDraft(d, '111', mapa, VARIANTES, 'local', PRODUCTOS).draft
    d = setVarQty(d, '1', '1_10', 1)
    const sol = procesarDraft(d, 'local', meta)!
    expect(sol.items[0].qty).toBe(1)
    expect(sol.verif).toEqual({ '1_10': 1 }) // ⛔ no 3: preparado nunca es más que lo pedido
  })

  it('un CONSUMO escaneado entero sigue esperando aprobación', () => {
    let d = draftVacio('Repuesto', 'consumo')
    d = escanearDraft(d, '111', mapa, VARIANTES, 'local', PRODUCTOS).draft
    const sol = procesarDraft(d, 'local', meta)!
    expect(sol.verif).toEqual({ '1_10': 1 })
    expect(sol.estado).toBe('pendiente') // escanear la mercadería ⛔ no es aprobar el gasto
  })

  it('escaneadasDraft cuenta lo mismo que procesarDraft marca', () => {
    let d = traerVariante(draftVacio(), '2', '2_20', VARIANTES, PRODUCTOS)
    d = escanearDraft(d, '111', mapa, VARIANTES, 'local', PRODUCTOS).draft
    d = escanearDraft(d, '111', mapa, VARIANTES, 'local', PRODUCTOS).draft
    const sol = procesarDraft(d, 'local', meta)!
    const marcadas = Object.values(sol.verif || {}).reduce((a, n) => a + n, 0)
    expect(escaneadasDraft(d)).toBe(marcadas)
    expect(totalDraft(d)).toBe(marcadas + 1) // la del buscador entra sin marcar
  })
})

/**
 * 🔴 **El caso de las 63** (21-sep-2026). Administración escaneó 140 prendas de Zattia con el chip
 * «Sacás de:» en **Depósito** —donde arranca, porque la config de Reposición dice
 * `prioridadRetiro: 'deposito'`— y **las 140 tenían stock 0 en depósito**: 63 quedaron marcadas en
 * un lado que el sistema mismo contradecía, y crear la venta habría descontado de una sucursal que
 * ⛔ no las tiene. Nadie avisó nada.
 */
describe('escanearDraft · el chip ⛔ no puede marcar contra el stock (21-sep-2026)', () => {
  // Stock como el de Zattia: todo en el local, cero en depósito.
  const ZATTIA: Variante[] = [
    mkVar({ id: 'z_1', pid: 'z', sid: '1', name: 'BABY TEE ZEST', size: 'BLANCO', sku: 'RBT-0141-BL', local: 3, deposito: 0, barcode: '900' }),
    mkVar({ id: 'z_2', pid: 'z', sid: '2', name: 'BABY TEE ZEST', size: 'NEGRO', sku: 'RBT-0141-NG', local: 5, deposito: 0, barcode: '901' }),
  ]
  const PRODS: Producto[] = [prod('z', 'BABY TEE ZEST')]
  const mapa = construirMapaBc(ZATTIA)
  const meta = { id: 's_63', fecha: '2026-09-21', creado: 1, creadoPor: 'lorena' }

  it('escaneadas con el chip en Depósito, igual salen del Local', () => {
    let d = draftVacio()
    for (const c of ['900', '901']) d = escanearDraft(d, c, mapa, ZATTIA, 'deposito', PRODS).draft
    const sol = procesarDraft(d, 'deposito', meta)!
    expect(sol.items.map((i) => i.origen)).toEqual(['local', 'local'])
    expect(sol.verif).toEqual({ z_1: 1, z_2: 1 }) // y siguen naciendo preparadas
  })

  it('el feedback del escaneo dice Local, ⛔ no el chip: si mintiera, nadie miraría la lista', () => {
    const { resultado } = escanearDraft(draftVacio(), '900', mapa, ZATTIA, 'deposito', PRODS)
    expect(resultado).toMatchObject({ tipo: 'variante', origen: 'local' })
  })

  it('pero si el stock alcanza en los DOS, manda el chip: ahí sí es una pregunta real', () => {
    const AMBOS = ZATTIA.map((v) => ({ ...v, deposito: 9, local: 9, stock: 18 }))
    const d = escanearDraft(draftVacio(), '900', construirMapaBc(AMBOS), AMBOS, 'deposito', PRODS).draft
    expect(procesarDraft(d, 'local', meta)!.items[0].origen).toBe('deposito')
  })
})
