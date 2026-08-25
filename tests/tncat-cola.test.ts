import { describe, it, expect } from 'vitest'
import {
  armarCola,
  filtrarCola,
  historialDe,
  ordenarCola,
  resumenCola,
  unidadesEsperando,
  type FilaCola,
} from '@/lib/tncat/cola'
import { cruzarParaSesion } from '@/lib/tncat/a-sesion-fotos'
import type { Variante } from '@/lib/etl/tipos'
import type { ProductoFchk, VarianteFchk } from '@/lib/tncat/tipos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'

/** Variante de Gestión Nube (el destino del cruce). */
const gn = (o: { id: string; pid: string; sku?: string; barcode?: string; local?: number; deposito?: number; name?: string }): Variante =>
  ({
    id: o.id, pid: o.pid, sid: o.id.split('_')[1] ?? '0', name: o.name ?? 'Prenda', size: 'U',
    stock: (o.local ?? 0) + (o.deposito ?? 0), local: o.local ?? 0, deposito: o.deposito ?? 0,
    sku: o.sku ?? '', barcode: o.barcode ?? '', lastSale: null, daysSinceLast: 0,
    sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0, totalSales: 0, lifespan: 0,
    phase: { label: 'madurez', cls: '' },
  }) as unknown as Variante

/** Variante de Tienda Nube. Sin `image_url` = está esperando una foto. */
const tnv = (o: { color?: string | null; foto?: string | null; sku?: string; barcode?: string; desde?: string; id?: string }): VarianteFchk => ({
  color: 'color' in o ? o.color : 'NEGRO',
  image_url: o.foto ?? null,
  sku: o.sku ?? null,
  barcode: o.barcode ?? null,
  created_at: o.desde ?? null,
  id: o.id ?? null,
})

const tnp = (id: string, name: string, variantes: VarianteFchk[], published = true): ProductoFchk => ({ id, name, variantes, published })

const sol = (o: { id: string; fecha: string; vids: string[]; fotos?: Solicitud['fotos'] }): Solicitud =>
  ({
    id: o.id, fecha: o.fecha, creado: 0, creadoPor: 'test', descripcion: '', estado: 'cerrada',
    items: o.vids.map((vid) => ({ vid, pid: vid.split('_')[0], sid: vid.split('_')[1], nombre: 'x', variante: 'x', sku: '', qty: 1, origen: 'deposito' as const })),
    ...(o.fotos ? { fotos: o.fotos } : {}),
  }) as unknown as Solicitud

/** 1-ene-2026 a mediodía: el «ahora» de todos los tests que miden días. */
const AHORA = new Date('2026-01-01T12:00:00Z').getTime()

describe('armarCola — el renglón por variante', () => {
  it('una variante que cruza y tiene stock queda LISTA, con sus unidades y su antigüedad', () => {
    const p = tnp('t1', 'SWEATER', [tnv({ color: 'NEGRO', sku: 'S-N', desde: '2025-12-02T00:00:00Z' })])
    const filas = armarCola([p], [gn({ id: 'p1_1', pid: 'p1', sku: 'S-N', deposito: 4 })], [], [], AHORA)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ tnId: 't1', color: 'NEGRO', estado: 'lista', unidades: 4, pid: 'p1', vids: ['p1_1'], dias: 30 })
  })

  it('el color que ya tiene su foto NO entra a la cola', () => {
    const p = tnp('t1', 'SWEATER', [tnv({ color: 'NEGRO', sku: 'S-N' }), tnv({ color: 'AZUL', sku: 'S-A', foto: 'x.jpg' })])
    const filas = armarCola([p], [gn({ id: 'p1_1', pid: 'p1', sku: 'S-N', deposito: 1 }), gn({ id: 'p1_2', pid: 'p1', sku: 'S-A', deposito: 1 })], [], [], AHORA)
    expect(filas.map((f) => f.color)).toEqual(['NEGRO'])
  })

  it('🔴 un renglón de un producto PEDIDO puede no estar listo: el producto entró por otro color', () => {
    // `cruzarParaSesion` deja afuera las variantes sin stock, así que el producto entra por el
    // color que sí tiene. Pintar de verde el otro sería prometer un tilde que el borrador no pone.
    const p = tnp('t1', 'SWEATER', [tnv({ color: 'NEGRO', sku: 'S-N' }), tnv({ color: 'AZUL', sku: 'S-A' })])
    const gns = [gn({ id: 'p1_1', pid: 'p1', sku: 'S-N', deposito: 4 }), gn({ id: 'p1_2', pid: 'p1', sku: 'S-A', deposito: 0 })]
    const filas = armarCola([p], gns, [], [], AHORA)
    expect(filas.find((f) => f.color === 'NEGRO')?.estado).toBe('lista')
    expect(filas.find((f) => f.color === 'AZUL')?.estado).toBe('sin-stock')
  })

  it('los cuatro motivos de traba viajan al renglón', () => {
    const sinCruce = tnp('t1', 'A', [tnv({ sku: 'NO-EXISTE' })])
    const huerfana = tnp('t2', 'B', [tnv({ sku: 'H-1' })])
    const sinStock = tnp('t3', 'C', [tnv({ sku: 'C-1' })])
    const ambiguo = tnp('t4', 'D', [tnv({ sku: 'D-1' })])
    const gns = [
      gn({ id: 'c1_1', pid: 'c1', sku: 'C-1', deposito: 0 }),
      gn({ id: 'd1_1', pid: 'd1', sku: 'D-1', deposito: 2 }),
      gn({ id: 'd2_1', pid: 'd2', sku: 'D-1', deposito: 2 }),
    ]
    const filas = armarCola([sinCruce, huerfana, sinStock, ambiguo], gns, [gn({ id: 'h_1', pid: 'h', sku: 'H-1' })], [], AHORA)
    expect(filas.map((f) => f.estado)).toEqual(['sin-cruce', 'sin-producto-gn', 'sin-stock', 'ambiguo'])
  })

  it('🔴 EL INVARIANTE: los renglones `lista` son exactamente los vids que el botón manda tildados', () => {
    // Si esto se rompe, la pantalla muestra un renglón verde que el borrador no va a tildar (o al
    // revés) y no hay forma de que la persona sepa cuál de las dos tiene razón.
    const productos = [
      tnp('t1', 'A', [tnv({ color: 'NEGRO', sku: 'A-N' }), tnv({ color: 'AZUL', sku: 'A-A' })]),
      tnp('t2', 'B', [tnv({ color: 'ROJO', barcode: '779' })]),
      tnp('t3', 'C', [tnv({ color: 'VERDE', sku: 'NO-CRUZA' })]),
      tnp('t4', 'D', [tnv({ color: 'GRIS', sku: 'D-1' })]),
    ]
    const gns = [
      gn({ id: 'a_1', pid: 'a', sku: 'A-N', deposito: 3 }),
      gn({ id: 'a_2', pid: 'a', sku: 'A-A', local: 0 }),
      gn({ id: 'b_1', pid: 'b', barcode: '779', local: 5 }),
      gn({ id: 'd1_1', pid: 'd1', sku: 'D-1', deposito: 1 }),
      gn({ id: 'd2_1', pid: 'd2', sku: 'D-1', deposito: 1 }),
    ]
    const filas = armarCola(productos, gns, [], [], AHORA)
    const { pedir } = cruzarParaSesion(productos, gns, [])
    const deLaCola = filas.filter((f) => f.estado === 'lista').flatMap((f) => f.vids).sort()
    const delBoton = [...new Set(pedir.flatMap((p) => p.vids))].sort()
    expect(deLaCola).toEqual(delBoton)
    expect(delBoton).toEqual(['a_1', 'b_1'])
  })

  it('sin fecha de la variante, `dias` es null — ⛔ no se rellena con la del producto', () => {
    const p: ProductoFchk = { id: 't1', name: 'A', created_at: '2020-01-01T00:00:00Z', variantes: [tnv({ sku: 'A-1' })] } as ProductoFchk
    const filas = armarCola([p], [gn({ id: 'a_1', pid: 'a', sku: 'A-1', deposito: 1 })], [], [], AHORA)
    expect(filas[0].desde).toBeNull()
    expect(filas[0].dias).toBeNull()
  })

  it('una fecha futura no es una espera negativa: se recorta a 0', () => {
    const p = tnp('t1', 'A', [tnv({ sku: 'A-1', desde: '2027-01-01T00:00:00Z' })])
    const filas = armarCola([p], [gn({ id: 'a_1', pid: 'a', sku: 'A-1', deposito: 1 })], [], [], AHORA)
    expect(filas[0].dias).toBe(0)
  })

  it('el despublicado entra a la cola igual, pero marcado', () => {
    const p = tnp('t1', 'A', [tnv({ sku: 'A-1' })], false)
    const filas = armarCola([p], [gn({ id: 'a_1', pid: 'a', sku: 'A-1', deposito: 1 })], [], [], AHORA)
    expect(filas[0].publicado).toBe(false)
    expect(filas[0].estado).toBe('lista')
  })
})

describe('historialDe — lo que la tienda no puede saber', () => {
  it('cuenta SOLICITUDES, no renglones: la misma variante dos veces en una sesión salió UNA vez', () => {
    const h = historialDe([sol({ id: 's1', fecha: '2025-12-01', vids: ['p1_1', 'p1_1'] })])
    expect(h.get('p1_1')?.salidas).toBe(1)
  })

  it('dos sesiones distintas sí son dos salidas', () => {
    const h = historialDe([sol({ id: 's1', fecha: '2025-12-01', vids: ['p1_1'] }), sol({ id: 's2', fecha: '2025-12-20', vids: ['p1_1'] })])
    expect(h.get('p1_1')?.salidas).toBe(2)
    expect(h.get('p1_1')?.ultima).toBe('2025-12-20')
  })

  it('🔑 la última salida sale de la fecha, no del orden del array', () => {
    const h = historialDe([sol({ id: 's2', fecha: '2025-12-20', vids: ['p1_1'] }), sol({ id: 's1', fecha: '2025-12-01', vids: ['p1_1'] })])
    expect(h.get('p1_1')?.ultima).toBe('2025-12-20')
  })

  it('trae el motivo de la sesión más reciente que lo contestó', () => {
    const h = historialDe([
      sol({ id: 's1', fecha: '2025-12-01', vids: ['p1_1'], fotos: { p1_1: { ok: false, motivo: 'Fallado' } } }),
      sol({ id: 's2', fecha: '2025-12-20', vids: ['p1_1'], fotos: { p1_1: { ok: false, motivo: 'Faltó la modelo' } } }),
    ])
    expect(h.get('p1_1')?.intento?.motivo).toBe('Faltó la modelo')
  })

  it('salió y nadie contestó: el intento es null y ⛔ eso no es «contestaron que no»', () => {
    const h = historialDe([sol({ id: 's1', fecha: '2025-12-01', vids: ['p1_1'] })])
    expect(h.get('p1_1')?.salidas).toBe(1)
    expect(h.get('p1_1')?.intento).toBeNull()
  })
})

describe('armarCola + historial — el renglón que viene fallando', () => {
  it('marca las salidas y el motivo de la última', () => {
    const p = tnp('t1', 'A', [tnv({ sku: 'A-1' })])
    const filas = armarCola(
      [p],
      [gn({ id: 'a_1', pid: 'a', sku: 'A-1', deposito: 2 })],
      [],
      [sol({ id: 's1', fecha: '2025-11-10', vids: ['a_1'], fotos: { a_1: { ok: false, motivo: 'No entró en el look' } } })],
      AHORA,
    )
    expect(filas[0]).toMatchObject({ salidas: 1, ultimaSalida: '2025-11-10' })
    expect(filas[0].ultimoIntento?.motivo).toBe('No entró en el look')
  })

  it('🔴 el renglón TRABADO también dice que ya salió — el defecto que encontró caminar los datos', () => {
    // Zattia daba 23 reincidentes y eran 31: los que faltaban eran productos enteros sin stock,
    // cuyos `vids` se estaban tirando por estar excluidos del pedido. Que hoy no se pueda volver a
    // pedir no borra que salió y volvió sin la foto — al contrario, es de lo más útil de saber.
    const p = tnp('t1', 'A', [tnv({ sku: 'A-1' })])
    const filas = armarCola(
      [p],
      [gn({ id: 'a_1', pid: 'a', sku: 'A-1', deposito: 0 })],
      [],
      [sol({ id: 's1', fecha: '2025-11-10', vids: ['a_1'] })],
      AHORA,
    )
    expect(filas[0].estado).toBe('sin-stock')
    expect(filas[0]).toMatchObject({ salidas: 1, ultimaSalida: '2025-11-10' })
    expect(resumenCola(filas).reincidentes).toBe(1)
  })

  it('un renglón que NO cruza no puede tener historial: sin vids, no hay a qué atarlo', () => {
    const p = tnp('t1', 'A', [tnv({ sku: 'NO-CRUZA' })])
    const filas = armarCola([p], [gn({ id: 'a_1', pid: 'a', sku: 'A-1', deposito: 1 })], [], [sol({ id: 's1', fecha: '2025-11-10', vids: ['a_1'] })], AHORA)
    expect(filas[0].estado).toBe('sin-cruce')
    expect(filas[0].vids).toEqual([])
    expect(filas[0].salidas).toBe(0)
  })

  it('la que nunca salió arranca en 0 y sin intento', () => {
    const p = tnp('t1', 'A', [tnv({ sku: 'A-1' })])
    const filas = armarCola([p], [gn({ id: 'a_1', pid: 'a', sku: 'A-1', deposito: 2 })], [], [], AHORA)
    expect(filas[0]).toMatchObject({ salidas: 0, ultimaSalida: null, ultimoIntento: null })
  })
})

describe('unidadesEsperando — el total no es la suma de la columna', () => {
  it('🔴 dos renglones que llevan a la MISMA variante de GN no cuentan sus unidades dos veces', () => {
    const filas = [
      { vids: ['a_1'], unidades: 5 } as FilaCola,
      { vids: ['a_1'], unidades: 5 } as FilaCola,
    ]
    const stock = new Map([['a_1', 5]])
    expect(filas.reduce((n, f) => n + f.unidades, 0)).toBe(10)
    expect(unidadesEsperando(filas, stock)).toBe(5)
  })
})

describe('resumenCola — el encabezado', () => {
  const filas = [
    { estado: 'lista', dias: 100, salidas: 1 },
    { estado: 'lista', dias: 20, salidas: 0 },
    { estado: 'sin-stock', dias: 5, salidas: 0 },
    { estado: 'sin-cruce', dias: null, salidas: 2 },
  ] as FilaCola[]

  it('cuenta lo accionable aparte de lo trabado, y lo trabado con su motivo', () => {
    const r = resumenCola(filas)
    expect(r.lista).toBe(2)
    expect(r.trabados).toEqual([{ estado: 'sin-stock', n: 1 }, { estado: 'sin-cruce', n: 1 }])
  })

  it('la más vieja se mide sólo sobre lo que se puede fotografiar', () => {
    // Un «espera hace 300 días» de algo que no está en el depósito no es un pendiente: es ruido.
    expect(resumenCola([...filas, { estado: 'sin-stock', dias: 900, salidas: 0 } as FilaCola]).masVieja).toBe(100)
  })

  it('sin ninguna fecha, `masVieja` es null y ⛔ no 0', () => {
    expect(resumenCola([{ estado: 'lista', dias: null, salidas: 0 } as FilaCola]).masVieja).toBeNull()
  })

  it('los reincidentes se cuentan aunque estén trabados: que venga fallando no depende del stock', () => {
    expect(resumenCola(filas).reincidentes).toBe(2)
  })
})

describe('ordenarCola', () => {
  const f = (o: Partial<FilaCola>): FilaCola => ({ estado: 'lista', unidades: 0, dias: 0, producto: 'A', color: 'A', ...o }) as FilaCola

  it('lo trabado va SIEMPRE abajo, en los dos órdenes', () => {
    const filas = [f({ estado: 'sin-stock', unidades: 99, dias: 999 }), f({ estado: 'lista', unidades: 1, dias: 1 })]
    expect(ordenarCola(filas, 'plata')[0].estado).toBe('lista')
    expect(ordenarCola(filas, 'espera')[0].estado).toBe('lista')
  })

  it('`plata` ordena por unidades paradas', () => {
    const filas = [f({ unidades: 2, dias: 500 }), f({ unidades: 9, dias: 1 })]
    expect(ordenarCola(filas, 'plata')[0].unidades).toBe(9)
  })

  it('`espera` ordena por antigüedad', () => {
    const filas = [f({ unidades: 9, dias: 1 }), f({ unidades: 2, dias: 500 })]
    expect(ordenarCola(filas, 'espera')[0].dias).toBe(500)
  })

  it('🔑 sin fecha NO empata con «cargado hoy»: va al fondo de los que sí tienen', () => {
    const filas = [f({ dias: null, unidades: 1 }), f({ dias: 0, unidades: 1 })]
    expect(ordenarCola(filas, 'espera').map((x) => x.dias)).toEqual([0, null])
  })

  it('a igualdad de todo, alfabético — el orden no puede depender del orden de llegada', () => {
    const filas = [f({ producto: 'Z', unidades: 1, dias: 1 }), f({ producto: 'A', unidades: 1, dias: 1 })]
    expect(ordenarCola(filas, 'plata').map((x) => x.producto)).toEqual(['A', 'Z'])
  })
})

describe('filtrarCola', () => {
  const filas = [
    { estado: 'lista', salidas: 0, producto: 'SWEATER NEVADA', color: 'GRIS', sku: 'RSW-27', barcode: null },
    { estado: 'sin-stock', salidas: 2, producto: 'BODY HELIX', color: 'NEGRO', sku: null, barcode: '779' },
  ] as FilaCola[]

  it('`lista` deja sólo lo que se puede fotografiar', () => {
    expect(filtrarCola(filas, 'lista', '').map((f) => f.producto)).toEqual(['SWEATER NEVADA'])
  })

  it('`reincidentes` deja lo que ya salió, aunque esté trabado', () => {
    expect(filtrarCola(filas, 'reincidentes', '').map((f) => f.producto)).toEqual(['BODY HELIX'])
  })

  it('🔴 haber salido UNA vez ya es reincidir: el umbral es 0, no 1', () => {
    // La primera vez que algo vuelve sin su foto es justo cuando conviene verlo, y es el caso más
    // frecuente. Con el fixture de arriba —que sale 2 veces— un `> 1` pasaba igual.
    const unaVez = [{ estado: 'lista', salidas: 1, producto: 'TOP KOBE', color: 'CRUDO', sku: null, barcode: null }] as FilaCola[]
    expect(filtrarCola(unaVez, 'reincidentes', '')).toHaveLength(1)
  })

  it('🔑 el buscador se saltea el filtro: se busca cuando ya se sabe cuál se quiere', () => {
    expect(filtrarCola(filas, 'lista', 'HELIX').map((f) => f.producto)).toEqual(['BODY HELIX'])
  })

  it('busca por SKU y por código de barras, no sólo por nombre', () => {
    expect(filtrarCola(filas, 'todo', 'rsw-27')).toHaveLength(1)
    expect(filtrarCola(filas, 'todo', '779')).toHaveLength(1)
  })
})
