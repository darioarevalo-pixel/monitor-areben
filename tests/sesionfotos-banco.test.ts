/**
 * El BANCO de productos de la sesión — Fase 3 del octavo.
 *
 * El pedido de Bruno: *«un banco de productos de la sesión, donde se realiza una clasificación
 * rápida y se generan outfits digitales […]. Si el producto de la OC que ingresó no alcanza para
 * armar outfits, se procede a pedir una solicitud a local»*.
 *
 * 🔴 Lo central de acá abajo es **la cadena entera** —banco → borrador → solicitud— con el
 * invariante que el plan pedía: **ninguna pieza pedida se pierde**. O entra a la solicitud, o
 * sale nombrada en la lista de ausentes; ⛔ nunca desaparece en silencio.
 */
import { describe, it, expect } from 'vitest'
import {
  agregarAlBanco,
  alertasDelBanco,
  aplicaOutfitsBanco,
  bloqueoSacarDelBanco,
  clasifDe,
  comoPrendas,
  conOutfit,
  conZonaBanco,
  marcarPedidos,
  outfitsDe,
  paraPedir,
  pedidoDesdeBanco,
  proximoOutfit,
  resumenBanco,
  sacarDelBanco,
  sinPedir,
  sinZonaBanco,
  zonasDelBanco,
  type ItemBanco,
} from '../lib/sesionfotos/banco'
import { conBanco, crearEvento } from '../lib/sesionfotos/evento'
import type { Variante, Producto } from '../lib/etl/tipos'

const cand = (vid: string, nombre: string, extra: Partial<ItemBanco> = {}): ItemBanco => ({
  vid,
  pid: `p${vid}`,
  sid: '1',
  nombre,
  variante: 'S',
  sku: `SKU-${vid}`,
  candidato: 'stock',
  ...extra,
})

describe('agregar y sacar candidatos', () => {
  it('⛔ no duplica: volver a traer la misma prenda del buscador no la suma dos veces', () => {
    const b = agregarAlBanco([cand('v1', 'TOP LEVEL')], [cand('v1', 'TOP LEVEL'), cand('v2', 'JEAN WIDE')])
    expect(b.map((i) => i.vid)).toEqual(['v1', 'v2'])
  })

  it('sin nada nuevo devuelve el MISMO array — así el autosave ⛔ no guarda de más', () => {
    const b = [cand('v1', 'TOP LEVEL')]
    expect(agregarAlBanco(b, [cand('v1', 'TOP LEVEL')])).toBe(b)
  })

  it('🔴 lo ya PEDIDO ⛔ no se puede sacar del banco', () => {
    const b = [cand('v1', 'TOP LEVEL', { pedidoEn: 's9' }), cand('v2', 'JEAN WIDE')]
    expect(bloqueoSacarDelBanco(b, 'v1')).toContain('ya se pidió')
    expect(bloqueoSacarDelBanco(b, 'v2')).toBeNull()
    expect(sacarDelBanco(b, 'v2').map((i) => i.vid)).toEqual(['v1'])
  })
})

describe('los outfits del banco — 🔑 las MISMAS reglas que la solicitud, por adaptador', () => {
  it('la zona sale del nombre, igual que en la solicitud', () => {
    const b = [cand('v1', 'TOP LEVEL'), cand('v2', 'JEAN WIDE'), cand('v3', 'VESTIDO BLAZE')]
    expect(zonasDelBanco(b)).toEqual({ v1: 'arriba', v2: 'abajo', v3: 'entero' })
  })

  it('la corrección a mano le gana, y soltarla BORRA la clave', () => {
    const b = conZonaBanco([cand('v1', 'TOP LEVEL')], 'v1', 'abajo')
    expect(b[0].zona).toBe('abajo')
    expect(zonasDelBanco(b).v1).toBe('abajo')
    const suelta = conZonaBanco(b, 'v1', null)
    expect('zona' in suelta[0]).toBe(false)
    expect(zonasDelBanco(suelta).v1).toBe('arriba')
  })

  it('el aviso «le falta el abajo» es el mismo, sobre el outfit del banco', () => {
    const b = conOutfit([cand('v1', 'TOP LEVEL')], 'v1', 3)
    expect(alertasDelBanco(b)).toEqual([{ n: 3, falta: 'abajo', texto: 'Al outfit 3 le falta el abajo' }])
    const completo = conOutfit(agregarAlBanco(b, [cand('v2', 'JEAN WIDE')]), 'v2', 3)
    expect(alertasDelBanco(completo)).toEqual([])
  })

  it('🔴 en BDI el banco se calla: fundas y cables ⛔ no son ropa', () => {
    const b = conOutfit([cand('v1', 'ZOEY CASE'), cand('v2', 'CABLE DE CARGA')], 'v1', 1)
    expect(aplicaOutfitsBanco(b)).toBe(false)
    expect(alertasDelBanco(b)).toEqual([])
    expect(sinZonaBanco(b)).toEqual([])
  })

  it('lo que hay que clasificar a mano sale con su ítem entero, ⛔ no con el adaptador', () => {
    const b = [cand('v1', 'TOP LEVEL'), cand('v2', 'FADE #002')]
    expect(sinZonaBanco(b).map((i) => i.sku)).toEqual(['SKU-v2'])
  })

  it('el adaptador mapea outfit → bolsa, que es todo lo que hace', () => {
    expect(comoPrendas([cand('v1', 'TOP LEVEL', { outfit: 2 })])).toEqual([{ vid: 'v1', nombre: 'TOP LEVEL', pid: 'pv1', bolsa: 2 }])
    expect(clasifDe([cand('v1', 'X', { zona: 'abajo' }), cand('v2', 'Y')])).toEqual({ v1: 'abajo' })
  })
})

describe('repartir en outfits', () => {
  it('conOutfit pone y suelta, y soltar borra la clave', () => {
    const b = conOutfit([cand('v1', 'TOP LEVEL')], 'v1', 2)
    expect(b[0].outfit).toBe(2)
    expect('outfit' in conOutfit(b, 'v1', null)[0]).toBe(false)
  })

  it('outfitsDe agrupa y deja los sin repartir al final', () => {
    const b = [
      cand('v1', 'TOP LEVEL', { outfit: 2 }),
      cand('v2', 'JEAN WIDE', { outfit: 1 }),
      cand('v3', 'BLUSA MARTINA'),
      cand('v4', 'MINI ANNE', { outfit: 1, pedidoEn: 's1' }),
    ]
    const g = outfitsDe(b)
    expect(g.map((x) => x.n)).toEqual([1, 2, null])
    expect(g[0].items.map((i) => i.vid)).toEqual(['v2', 'v4'])
    expect(g[0].pedidos).toBe(1)
  })

  it('el próximo outfit libre', () => {
    expect(proximoOutfit([])).toBe(1)
    expect(proximoOutfit([cand('v1', 'X', { outfit: 3 }), cand('v2', 'Y', { outfit: 1 })])).toBe(4)
  })
})

describe('resumenBanco — ⚠️ el conteo de completos ⛔ no se inventa', () => {
  it('cuenta lo que hay', () => {
    const b = [
      cand('v1', 'TOP LEVEL', { outfit: 1 }),
      cand('v2', 'JEAN WIDE', { outfit: 1 }),
      cand('v3', 'BLUSA MARTINA', { outfit: 2 }),
      cand('v4', 'MINI ANNE'),
    ]
    expect(resumenBanco(b)).toEqual({ total: 4, pedidos: 0, outfits: 2, outfitsCompletos: 1, sinOutfit: 1 })
  })

  it('un banco vacío da todo en cero — que es lo que dice un banco que nadie llenó', () => {
    expect(resumenBanco([])).toEqual({ total: 0, pedidos: 0, outfits: 0, outfitsCompletos: 0, sinOutfit: 0 })
  })

  it('🔴 un outfit de fundas ⛔ NO cuenta como completo: nada está clasificado', () => {
    const b = conOutfit([cand('v1', 'ZOEY CASE')], 'v1', 1)
    expect(resumenBanco(b).outfitsCompletos).toBe(0)
  })
})

describe('el banco colgado del evento', () => {
  it('conBanco lo pone, y un banco vacío BORRA la clave', () => {
    const e = crearEvento({ id: 'e1', fecha: '2026-09-12', creado: 1, creadoPor: 'S' })
    const con = conBanco(e, [cand('v1', 'TOP LEVEL')])
    expect(con.banco).toHaveLength(1)
    expect('banco' in conBanco(con, [])).toBe(false)
    // y el evento sigue siendo el mismo evento
    expect(con.estado).toBe('planificado')
  })
})

describe('🔴 LA CADENA ENTERA: banco → borrador → solicitud, sin perder una pieza', () => {
  const variantes = [
    { id: 'v1', pid: 'pv1', sid: '1', name: 'TOP LEVEL', size: 'S', sku: 'SKU-v1', local: 2, deposito: 3 },
    { id: 'v2', pid: 'pv2', sid: '1', name: 'JEAN WIDE', size: '38', sku: 'SKU-v2', local: 1, deposito: 0 },
    { id: 'v3', pid: 'pv3', sid: '1', name: 'BLUSA MARTINA', size: 'M', sku: 'SKU-v3', local: 0, deposito: 0 },
  ] as unknown as Variante[]
  const productos = [
    { id: 'pv1', name: 'TOP LEVEL' },
    { id: 'pv2', name: 'JEAN WIDE' },
    { id: 'pv3', name: 'BLUSA MARTINA' },
  ] as unknown as Producto[]

  /**
   * 🔑 Es **la misma función que aprieta la pantalla**, ⛔ no una copia de su secuencia: si el
   * botón cambiara y este test siguiera armando el pedido a mano, quedaría verde vigilando algo
   * que ya no se usa.
   */
  const pedir = (banco: ItemBanco[], vids: string[], destino: 'deposito' | 'local', eventoId: string, solId: string) =>
    pedidoDesdeBanco(banco, vids, destino, { variantes, productos }, { id: solId, fecha: '2026-09-12', creado: 2, creadoPor: 'S', eventoId, descripcion: 'Sesión' })

  it('el outfit del banco llega como `bolsa` de la solicitud — y por eso la etiqueta sigue andando', () => {
    let banco = agregarAlBanco([], [cand('v1', 'TOP LEVEL'), cand('v2', 'JEAN WIDE')])
    banco = conOutfit(conOutfit(banco, 'v1', 3), 'v2', 3)
    const { sol, ausentes } = pedir(banco, ['v1', 'v2'], 'deposito', 'e1', 's1')
    expect(ausentes).toEqual([])
    expect(sol?.eventoId).toBe('e1')
    expect(sol?.items.map((i) => [i.vid, i.bolsa])).toEqual([
      ['v1', 3],
      ['v2', 3],
    ])
  })

  it('🔴 una pieza SIN STOCK ⛔ no entra a la solicitud, y sale NOMBRADA — ⛔ nunca en silencio', () => {
    const banco = agregarAlBanco([], [cand('v1', 'TOP LEVEL'), cand('v3', 'BLUSA MARTINA')])
    const { sol, ausentes } = pedir(banco, ['v1', 'v3'], 'deposito', 'e1', 's1')
    expect(sol?.items.map((i) => i.vid)).toEqual(['v1'])
    expect(ausentes).toEqual(['v3'])
    // el invariante: cada pieza pedida está en la solicitud O en los ausentes, ⛔ nunca en ninguna
    const enSol = new Set(sol?.items.map((i) => i.vid))
    for (const vid of ['v1', 'v3']) expect(enSol.has(vid) || ausentes.includes(vid)).toBe(true)
  })

  it('🔑 un candidato SIN outfit deja el ítem sin bolsa: ⛔ no se le inventa un número', () => {
    const banco = conOutfit(agregarAlBanco([], [cand('v1', 'TOP LEVEL'), cand('v2', 'JEAN WIDE')]), 'v1', 1)
    const { sol } = pedir(banco, ['v1', 'v2'], 'deposito', 'e1', 's1')
    expect(sol?.items.find((i) => i.vid === 'v1')?.bolsa).toBe(1)
    expect(sol?.items.find((i) => i.vid === 'v2') && 'bolsa' in (sol?.items.find((i) => i.vid === 'v2') as object)).toBe(false)
  })

  it('«Pedir al local» y «Pedir al depósito» deciden el origen, con el fallback por stock de siempre', () => {
    const banco = agregarAlBanco([], [cand('v1', 'TOP LEVEL'), cand('v2', 'JEAN WIDE')])
    const dep = pedir(banco, ['v1', 'v2'], 'deposito', 'e1', 's1').sol
    // v2 ⛔ no tiene stock en depósito (0) ⇒ cae a local, que es la regla vieja de `procesarDraft`
    expect(dep?.items.map((i) => [i.vid, i.origen])).toEqual([
      ['v1', 'deposito'],
      ['v2', 'local'],
    ])
    const loc = pedir(banco, ['v1', 'v2'], 'local', 'e1', 's2').sol
    expect(loc?.items.every((i) => i.origen === 'local')).toBe(true)
  })

  it('🔴 lo YA pedido ⛔ no se vuelve a pedir: dos ventas en GN por una prenda sola', () => {
    let banco = agregarAlBanco([], [cand('v1', 'TOP LEVEL'), cand('v2', 'JEAN WIDE')])
    banco = marcarPedidos(banco, ['v1'], 's1')
    expect(paraPedir(banco, ['v1', 'v2'])).toEqual({ pids: ['pv2'], vids: ['v2'] })
    expect(sinPedir(banco).map((i) => i.vid)).toEqual(['v2'])
  })

  it('marcarPedidos ⛔ no pisa el id de una solicitud anterior', () => {
    const banco = marcarPedidos([cand('v1', 'X', { pedidoEn: 's1' })], ['v1'], 's2')
    expect(banco[0].pedidoEn).toBe('s1')
  })

  it('🔑 un outfit puede CRUZAR dos solicitudes — el caso que Bruno describió', () => {
    let banco = agregarAlBanco([], [cand('v1', 'TOP LEVEL'), cand('v2', 'JEAN WIDE')])
    banco = conOutfit(conOutfit(banco, 'v1', 5), 'v2', 5)
    const a = pedir(banco, ['v1'], 'deposito', 'e1', 's1')
    banco = marcarPedidos(banco, ['v1'], 's1')
    const b = pedir(banco, ['v2'], 'local', 'e1', 's2')
    expect(a.sol?.items[0].bolsa).toBe(5)
    expect(b.sol?.items[0].bolsa).toBe(5)
    expect(a.sol?.items[0].origen).toBe('deposito')
    expect(b.sol?.items[0].origen).toBe('local')
  })
})
