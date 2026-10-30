import { describe, expect, it } from 'vitest'
import { cargaDeCampania, estadoDePedidos, motivoDeCampania, MOTIVO_CAMPANIA, vaPorErp } from '../lib/liquidacion/erp.core.js'
import { pedirAlErp } from '../api/_liquidacion-erp.js'

describe('cargaDeCampania: qué oferta se carga en el ERP y qué promocional tiene que mostrar TN', () => {
  it('poner: la oferta es el precio de sale, y TN la muestra como promocional', () => {
    expect(cargaDeCampania({ modo: 'poner', precioSale: 31990, listaErp: 45990 })).toEqual({ valor: 31990, quiere: 31990 })
  })
  it('🔴 sacar a lista: se CARGA la oferta = la lista (⛔ se suelta) y TN queda SIN promocional', () => {
    expect(cargaDeCampania({ modo: 'sacar', destino: 'lista', promoPrevia: 40000, listaErp: 45990 })).toEqual({ valor: 45990, quiere: null })
  })
  it('sacar a la previa: vuelve la oferta que tenía al entrar; sin previa, a lista', () => {
    expect(cargaDeCampania({ modo: 'sacar', destino: 'previa', promoPrevia: 40000, listaErp: 45990 })).toEqual({ valor: 40000, quiere: 40000 })
    expect(cargaDeCampania({ modo: 'sacar', destino: 'previa', promoPrevia: null, listaErp: 45990 })).toEqual({ valor: 45990, quiere: null })
  })
  it('sin lista en el ERP o sin precio de sale: ⛔ se carga nada, y se dice', () => {
    expect(cargaDeCampania({ modo: 'poner', precioSale: 31990, listaErp: null })).toEqual({ error: expect.stringMatching(/lista/) })
    expect(cargaDeCampania({ modo: 'poner', precioSale: null, listaErp: 45990 })).toEqual({ error: expect.stringMatching(/sale/) })
  })
  it('una oferta igual o mayor que la lista = sin promocional (como `promoDeseada` del motor)', () => {
    expect(cargaDeCampania({ modo: 'poner', precioSale: 45990, listaErp: 45990 })).toEqual({ valor: 45990, quiere: null })
  })
})

it('el motivo empieza con el prefijo que lee el motor y el id de la campaña', () => {
  expect(MOTIVO_CAMPANIA).toBe('campaña:')
  expect(motivoDeCampania('l1793370383592_hsuhtr', 'CYBER STUNNED · Drop 2')).toBe('campaña:l1793370383592_hsuhtr CYBER STUNNED · Drop 2')
  expect(vaPorErp('stunned')).toBe(true)
  expect(vaPorErp('zattia')).toBe(false)
})

describe('estadoDePedidos: la campaña lee la RELECTURA de TN que hizo la cola', () => {
  const pedido = { pid: '7', pedidoEn: '2026-11-01T10:00:00.000Z', quiere: 31990 }
  const ev = (o: Record<string, unknown>) => ({ id: 1, estado: 'hecho', tomado_en: '2026-11-01T10:00:30.000Z', error: null, resultado: { campanias: { 7: { campania: 'c', quiere: 31990, tn: [31990], ok: true } } }, ...o })

  it('quedó: un envío tomado DESPUÉS del pedido releyó TN y todas las variantes están así', () => {
    expect(estadoDePedidos([pedido], [ev({})])).toEqual([{ pid: '7', estado: 'quedo', tn: [31990] }])
  })
  it('🔴 un envío tomado ANTES del pedido ⛔ cuenta (leyó las cargas viejas), aunque diga ok', () => {
    expect(estadoDePedidos([pedido], [ev({ tomado_en: '2026-11-01T09:59:00.000Z' })])[0].estado).toBe('esperando')
  })
  it('🔴 una variante distinta en TN ⛔ es quedó', () => {
    expect(estadoDePedidos([pedido], [ev({ resultado: { campanias: { 7: { campania: 'c', quiere: 31990, tn: [31990, null], ok: false } } } })])[0].estado).toBe('esperando')
  })
  it('🔴 el ok de OTRO precio (la campaña se reprecificó) ⛔ confirma éste', () => {
    expect(estadoDePedidos([pedido], [ev({ resultado: { campanias: { 7: { campania: 'c', quiere: 29990, tn: [29990], ok: true } } } })])[0].estado).toBe('esperando')
  })
  it('sacar: quiere null y TN sin promocional en todas = quedó', () => {
    const p = { ...pedido, quiere: null }
    expect(estadoDePedidos([p], [ev({ resultado: { campanias: { 7: { campania: 'c', quiere: null, tn: [null], ok: true } } } })])[0].estado).toBe('quedo')
  })
  it('falló (el freno, TN caído) y nada más en la cola: se dice el error; con otro pendiente, se espera', () => {
    const f = ev({ estado: 'fallado', error: 'FRENO: …', resultado: null })
    expect(estadoDePedidos([pedido], [f])).toEqual([{ pid: '7', estado: 'fallo', error: 'FRENO: …' }])
    expect(estadoDePedidos([pedido], [f, ev({ id: 2, estado: 'pendiente', tomado_en: null, resultado: null })])[0].estado).toBe('esperando')
    expect(estadoDePedidos([pedido], [f, ev({ id: 2, estado: 'corriendo', resultado: null })])[0].estado).toBe('esperando')
  })
  it('manda el MÁS NUEVO: uno viejo ok y uno nuevo que lo ve distinto = esperando', () => {
    const nuevo = ev({ id: 5, tomado_en: '2026-11-01T10:05:00.000Z', resultado: { campanias: { 7: { campania: 'c', quiere: 31990, tn: [null], ok: false } } } })
    expect(estadoDePedidos([pedido], [ev({}), nuevo])[0].estado).toBe('esperando')
  })
})

describe('pedirAlErp: carga TODO o nada en el ERP y recién ahí avisa el envío a TN', () => {
  const dbFalsa = (log: string[], { falla = false } = {}) => ({
    query: async (sql: string, params?: unknown[]) => {
      log.push(sql.trim().split(/\s+/).slice(0, 2).join(' '))
      if (/from precio_lista/.test(sql)) return { rows: [{ product_id: 7, precio: 45990 }, { product_id: 8, precio: 30000 }] }
      if (/select now\(\)/.test(sql)) return { rows: [{ t: '2026-11-01T10:00:00Z' }] }
      if (/insert into producto_precio/.test(sql)) { if (falla && (params as unknown[])[2] === 8) throw new Error('base caída'); return { rows: [{ precio: (params as unknown[])[4] }] } }
      if (/from lista_precio/.test(sql)) return { rows: [{ id: 'oferta' }] }
      if (/from marca/.test(sql)) return { rows: [{ empresa_id: 'areben', id: 'stunned' }] }
      if (/precio_vigente/.test(sql)) return { rows: [] }
      if (/insert into motor_evento/.test(sql)) return { rows: [{ id: 1, nuevo: true }] }
      return { rows: [] }
    },
  })
  it('poner: una carga por producto con motivo de campaña, commit, y UN aviso a la cola de BDI', async () => {
    const zat: string[] = []; const bdi: string[] = []
    const bases: Record<string, ReturnType<typeof dbFalsa>> = { zattia: dbFalsa(zat), bdi: dbFalsa(bdi) }
    const r = await pedirAlErp(
      { liqId: 'c1', liqNombre: 'CYBER', modo: 'poner', destino: 'lista', usuario: 'Bruno', items: [{ pid: '7', precioSale: 31990, promoPrevia: null }, { pid: '9', precioSale: 1000, promoPrevia: null }] },
      { conMotor: async (base: string, fn: (db: unknown) => unknown) => fn(bases[base]) },
    )
    expect(r.pedidoEn).toBe('2026-11-01T10:00:00.000Z')
    expect(r.resultados).toEqual([{ pid: '7', ok: true, valor: 31990, quiere: 31990 }, { pid: '9', ok: false, error: expect.stringMatching(/lista/) }])
    expect(zat.filter((x) => x === 'insert into')).toHaveLength(1)
    expect(zat).toContain('commit')
    expect(bdi.filter((x) => x === 'insert into')).toHaveLength(1)
  })
  it('🔴 si una carga falla: rollback y ⛔ se avisa a la cola', async () => {
    const zat: string[] = []; const bdi: string[] = []
    const bases: Record<string, ReturnType<typeof dbFalsa>> = { zattia: dbFalsa(zat, { falla: true }), bdi: dbFalsa(bdi) }
    await expect(pedirAlErp(
      { liqId: 'c1', liqNombre: '', modo: 'poner', destino: 'lista', usuario: 'Bruno', items: [{ pid: '7', precioSale: 31990, promoPrevia: null }, { pid: '8', precioSale: 20000, promoPrevia: null }] },
      { conMotor: async (base: string, fn: (db: unknown) => unknown) => fn(bases[base]) },
    )).rejects.toThrow(/base caída/)
    expect(zat).toContain('rollback')
    expect(bdi).toEqual([])
  })
})
