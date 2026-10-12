import { describe, it, expect } from 'vitest'
import { CFG_VENTAS_DEFAULT, cfgVentas, decidir, decidirTodo, listaDevolver, listaLlevar, modoDe, type CfgVentas } from '@/lib/reposicion/porVentas'
import { leerRepoConfig } from '@/lib/reposicion/cfg'
import { repoCfgDefault, type RepoCfg, type RepoItem } from '@/lib/reposicion/tipos'

const HOY = '2026-10-11'

function item(over: Partial<RepoItem> = {}): RepoItem {
  return { vid: '1_1', pid: '1', sid: '1', name: 'TOP ORSA Negro', size: 'S', sku: '', local: 0, deposito: 10, cats: [], catFallback: 'TOPS', cat: 'TOPS', subcat: null, modelo: null, s7: 0, ubic: '', sinProducto: false, vv: 0, diasVivo: 300, ...over }
}
function cfg(over: Partial<RepoCfg> = {}, ventas: Partial<CfgVentas> = {}): RepoCfg {
  return { ...repoCfgDefault(), ...over, ventas }
}
const d = (it: RepoItem, c: RepoCfg = cfg()) => decidir(it, c, cfgVentas(c), HOY)

describe('objetivo: el mínimo depende de lo que vende (11-oct)', () => {
  it('lo que vende menos de 1 por semana: 2 (1 exhibida + 1 de reserva)', () => {
    expect(d(item({ vv: 0 })).objetivo).toBe(2)
    expect(d(item({ vv: 4 })).objetivo).toBe(2) // 4 en 60 días: 0,5 por semana
  })
  it('lo que vende 1 o más por semana: 3 (1 exhibida + 2 de reserva)', () => {
    expect(d(item({ vv: 9 })).objetivo).toBe(3) // 9 en 60 días: 1,05 por semana
  })
  it('lo que vende mucho: reserva para 2 días', () => {
    // 38 en 60 días ≈ 4,4 por semana → reserva ceil(0,633 × 2) = 2 → objetivo 3
    expect(d(item({ vv: 38 })).objetivo).toBe(3)
    // 120 en 60 días = 2 por día → reserva 4 → objetivo 5
    expect(d(item({ vv: 120 })).objetivo).toBe(5)
  })
  it('manda la mayor entre la última semana y los 60 días (sube rápido)', () => {
    // CORSET FRANK Bordó S: 38 en 60 días, 16 esta semana → 2,29 por día → reserva 5 → 6
    const r = d(item({ vv: 38, s7: 16 }))
    expect(r.objetivo).toBe(6)
    expect(r.pico).toBe(true)
    expect(r.porque).toBe('Pico de venta: 16 esta semana')
  })
  it('una sola venta en la semana no le sube el mínimo a lo que vende poco', () => {
    const r = d(item({ vv: 2, s7: 1 }))
    expect(r.objetivo).toBe(2)
    expect(r.pico).toBe(false)
  })
  it('una semana floja no baja lo que se vende (baja despacio)', () => {
    // CORPIÑO TAYRA Negro S: 23 en 60 días, 1 esta semana → sigue con el ritmo de 60 días
    const r = d(item({ vv: 23, s7: 1 }))
    expect(r.pico).toBe(false)
    expect(r.objetivo).toBe(3)
  })
  it('los topes viejos por producto no se aplican (los usa sólo BDI)', () => {
    const r = d(item({ vv: 120 }), cfg({ topes: { '1': 2 } }))
    expect(r.objetivo).toBe(5)
    expect(r.porque).not.toContain('tope')
  })
})

describe('llevar: se repone lo que se vendió', () => {
  it('de a una: con 1 en el local y objetivo 2, se lleva 1', () => {
    expect(d(item({ local: 1, vv: 0 })).llevar).toBe(1)
  })
  it('con loteMin 2 no se va a buscar una sola, salvo que quede sólo la exhibida', () => {
    const c = cfg({}, { loteMin: 2 })
    expect(d(item({ local: 2, vv: 9 }), c).llevar).toBe(0) // objetivo 3, falta 1
    expect(d(item({ local: 1, vv: 0 }), c).llevar).toBe(1) // sólo la exhibida
  })
  it('se pide lo que falta, sin pasarse del depósito', () => {
    expect(d(item({ local: 1, vv: 38, s7: 16 })).llevar).toBe(5)
    expect(d(item({ local: 0, vv: 120, deposito: 2 })).llevar).toBe(2)
  })
  it('sin stock en depósito, o apagado, no se pide', () => {
    expect(d(item({ local: 0, deposito: 0 })).llevar).toBe(0)
    expect(d(item({ local: 0 }), cfg({ apagados: ['1'] })).llevar).toBe(0)
  })
  it('lo que va a un local en 0 sale para exhibir', () => {
    expect(d(item({ local: 0 })).exhibir).toBe(true)
    expect(d(item({ local: 1 })).exhibir).toBe(false)
    expect(d(item({ local: 0, deposito: 0 })).exhibir).toBe(false) // no se lleva nada
  })
})

describe('devolver: lo que sobra vuelve al depósito', () => {
  it('TOP ORSA: 9 en el local, no vende → devuelve 7', () => {
    expect(d(item({ local: 9, deposito: 0, vv: 0 })).devolver).toBe(7)
  })
  it('lo nuevo no se devuelve, y el ritmo se mide sobre su vida', () => {
    const r = d(item({ local: 9, vv: 6, diasVivo: 10 }))
    expect(r.nuevo).toBe(true)
    expect(r.devolver).toBe(0)
    expect(r.dias).toBe(10)
    // 6 en 10 días = 0,6 por día → reserva ceil(1,2) = 2 → objetivo 3
    expect(r.objetivo).toBe(3)
  })
})

describe('modos: todo exhibido / cantidad fija', () => {
  it('OUTLET «SIN CAMBIO» y ACCESORIO son todo exhibido por el nombre', () => {
    expect(modoDe(item({ name: 'OUTLET 2 - SIN CAMBIO' }), CFG_VENTAS_DEFAULT, HOY).modo).toBe('exhibido')
    expect(modoDe(item({ name: 'ACCESORIO NRO 1 LILA (SIN CAMBIO)' }), CFG_VENTAS_DEFAULT, HOY).modo).toBe('exhibido')
    const r = d(item({ name: 'OUTLET 2 - SIN CAMBIO', local: 30, deposito: 5 }))
    expect([r.llevar, r.devolver, r.objetivo]).toEqual([0, 0, null])
  })
  it('la marca por producto le gana al nombre y a la categoría', () => {
    const c = cfg({}, { modosProd: { '1': { modo: 'ventas' } }, modosCat: { TOPS: { modo: 'exhibido' } } })
    expect(modoDe(item({ name: 'OUTLET 2 - SIN CAMBIO' }), cfgVentas(c), HOY).origen).toBe('producto')
  })
  it('una marca vencida no existe', () => {
    const c = cfg({}, { modosCat: { TOPS: { modo: 'exhibido', hasta: '2026-10-10' } } })
    expect(modoDe(item(), cfgVentas(c), HOY).modo).toBe('ventas')
  })
  it('cantidad fija: se lleva y se devuelve contra ese número', () => {
    const c = cfg({}, { modosCat: { BIKINIS: { modo: 'fija', n: 6 } } })
    expect(d(item({ cat: 'BIKINIS', local: 2 }), c).llevar).toBe(4) // falta 4
    expect(d(item({ cat: 'BIKINIS', local: 9 }), c).devolver).toBe(3)
  })
})

describe('listas', () => {
  const c = cfg()
  const inv = [
    item({ vid: 'a', pid: 'a', name: 'B', local: 9, deposito: 0, vv: 0 }), // objetivo 2 → sobran 7, no vende
    item({ vid: 'b', pid: 'b', name: 'A', local: 20, deposito: 0, vv: 30 }), // 3,5/sem → objetivo 3 → sobran 17
    item({ vid: 'c', pid: 'c', name: 'C', local: 1, deposito: 10, vv: 0 }), // objetivo 2 → llevar 1
  ]
  const filas = decidirTodo(inv, c, HOY)
  it('llevar sale con lo que hay que traer', () => {
    expect(listaLlevar(filas).map((f) => [f.it.vid, f.d.llevar])).toEqual([['c', 1]])
  })
  it('devolver: primero lo que no vende, con tope diario', () => {
    const r = listaDevolver(filas, 10)
    const porVid = Object.fromEntries(r.filas.map((f) => [f.it.vid, f.devolverHoy]))
    expect(porVid).toEqual({ a: 7, b: 3 })
    expect(r.total).toBe(24)
    expect(r.pendiente).toBe(14)
  })
  it('sin tope sale la lista entera (la limpieza)', () => {
    expect(listaDevolver(filas, null).pendiente).toBe(0)
  })
})

describe('la config de ventas sobrevive al ida y vuelta', () => {
  it('leerRepoConfig conserva `ventas` (la pantalla guarda la config entera)', async () => {
    const orig = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, config: { mins: {}, apagados: [], ventas: { minimo: 4, modosCat: { BIKINIS: { modo: 'exhibido' } } }, ventasStunned: { minimo: 2 } } }))) as typeof fetch
    try {
      const c = await leerRepoConfig('zattia')
      expect(cfgVentas(c).minimo).toBe(4)
      expect(cfgVentas(c).modosCat.BIKINIS.modo).toBe('exhibido')
      expect(cfgVentas(c).topeDevolucion).toBe(30) // default relleno
      expect(cfgVentas(c, 'stunned').minimo).toBe(2) // Stunned con lo suyo
      expect(cfgVentas(c, 'stunned').modosCat).toEqual({}) // y sin heredar las marcas de Zattia
    } finally {
      globalThis.fetch = orig
    }
  })
  it('leerRepoConfig conserva la campaña con etiqueta propia (si no, el próximo guardado la borra)', async () => {
    const orig = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, config: { mins: {}, apagados: [], campaniaEtiqueta: 'l1788656536418_tdukfi' } }))) as typeof fetch
    try {
      expect((await leerRepoConfig('zattia')).campaniaEtiqueta).toBe('l1788656536418_tdukfi')
    } finally {
      globalThis.fetch = orig
    }
  })
})

describe('Zattia y Stunned no comparten condiciones', () => {
  it('cada línea decide con su config', () => {
    const c = cfg({}, { minimoBajo: 2 })
    c.ventasStunned = { minimoBajo: 4 }
    expect(decidirTodo([item({ local: 9, deposito: 0 })], c, HOY, 'zattia')[0].d.devolver).toBe(7)
    expect(decidirTodo([item({ local: 9, deposito: 0 })], c, HOY, 'stunned')[0].d.devolver).toBe(5)
  })
})

describe('el orden de las listas', () => {
  it('devolver (local) va por SKU, con los números en orden de número; sin SKU al final', () => {
    const inv = [
      item({ vid: '1', pid: '1', name: 'Z', sku: 'RTO-0101-BL', local: 9, deposito: 0 }),
      item({ vid: '2', pid: '2', name: 'A', sku: '', local: 9, deposito: 0 }),
      item({ vid: '3', pid: '3', name: 'M', sku: 'RTO-0100-NG', local: 9, deposito: 0 }),
      item({ vid: '4', pid: '4', name: 'B', sku: 'RTO-0099-NG', local: 9, deposito: 0 }),
    ]
    const r = listaDevolver(decidirTodo(inv, cfg(), HOY), null)
    expect(r.filas.map((f) => f.it.sku)).toEqual(['RTO-0099-NG', 'RTO-0100-NG', 'RTO-0101-BL', ''])
  })
  it('llevar (depósito) va por ubicación y, sin ubicación, por SKU', () => {
    const inv = [
      item({ vid: '1', pid: '1', sku: 'RTO-0001', ubic: '', local: 0 }),
      item({ vid: '2', pid: '2', sku: 'RTO-0009', ubic: '3-1', local: 0 }),
      item({ vid: '3', pid: '3', sku: 'RTO-0005', ubic: '1-2', local: 0 }),
    ]
    expect(listaLlevar(decidirTodo(inv, cfg(), HOY)).map((f) => f.it.sku)).toEqual(['RTO-0005', 'RTO-0009', 'RTO-0001'])
  })
})

describe('sin etiqueta de precio (bikinis en la caja «todo a $5.000», Darío 12-oct)', () => {
  const c = cfg({}, { sinPrecio: { '1': {} } })
  it('todo lo que se lleva va con alarma y nada «para exhibir» con etiquetas', () => {
    const r = d(item({ local: 0 }), c)
    expect(r.llevar).toBeGreaterThan(0)
    expect(r.soloAlarma).toBe(true)
    expect(r.exhibir).toBe(false)
  })
  it('no cambia cuánto se lleva', () => {
    expect(d(item({ local: 0 }), c).llevar).toBe(d(item({ local: 0 })).llevar)
  })
  it('con la fecha vencida no aplica', () => {
    const r = d(item({ local: 0 }), cfg({}, { sinPrecio: { '1': { hasta: '2026-10-10' } } }))
    expect(r.soloAlarma).toBe(false)
    expect(r.exhibir).toBe(true)
  })
  it('si no se lleva nada, no se marca', () => {
    expect(d(item({ local: 5, deposito: 0 }), c).soloAlarma).toBe(false)
  })
})
