import { describe, it, expect } from 'vitest'
import {
  conRespuestaFoto,
  contestarElResto,
  fotografiables,
  hayQuePreguntar,
  MOTIVOS_SIN_FOTO,
  respuestaFoto,
  resumenFotos,
  sinContestar,
  sinFotografiar,
} from '@/lib/sesionfotos/fotografiado'
import { faltantes } from '@/lib/sesionfotos/core'
import type { ItemSolicitud, Solicitud } from '@/lib/sesionfotos/tipos'

const item = (vid: string, qty = 1, over: Partial<ItemSolicitud> = {}): ItemSolicitud => ({
  vid, pid: 'p1', sid: '1', nombre: 'Remera', variante: 'M', sku: `SKU-${vid}`, qty, origen: 'deposito', ...over,
})

/** Una solicitud que YA SALIÓ: tiene venta, así que `salio()` da true y `salioEfectivo` cuenta. */
const sol = (over: Partial<Solicitud> = {}): Solicitud => ({
  id: 's1', fecha: '2026-08-24', creado: 1, creadoPor: 'Ana', descripcion: '', estado: 'cargada',
  items: [item('v1'), item('v2')], ventas: { deposito: { id: 9 } }, ...over,
})

const meta = { por: 'Cande', ts: 1_000 }

describe('fotografiables — sólo se pregunta por lo que SALIÓ', () => {
  it('sin escaneo de retiro, salió todo lo pedido', () => {
    expect(fotografiables(sol()).map((i) => i.vid)).toEqual(['v1', 'v2'])
  })

  it('🔴 lo que no se encontró al preparar no se pregunta', () => {
    // De v2 se pidieron 2 y no se preparó ninguna: nunca salió, no se pudo fotografiar.
    const s = sol({ items: [item('v1', 2), item('v2', 2)], verif: { v1: 2, v2: 0 } })
    expect(fotografiables(s).map((i) => i.vid)).toEqual(['v1'])
  })

  it('una solicitud que todavía no salió no tiene nada que contestar', () => {
    const s = sol({ estado: 'pendiente', ventas: undefined })
    expect(fotografiables(s)).toEqual([])
    expect(hayQuePreguntar(s)).toBe(false)
  })

  it('en cuanto salió algo, hay que preguntar', () => {
    expect(hayQuePreguntar(sol())).toBe(true)
  })
})

/**
 * 🔴 EL TEST QUE JUSTIFICA EL DISEÑO.
 *
 * Con dos respuestas, la ausencia de dato afirma sola: un mapa de «fotografiados» diría que las 30
 * solicitudes viejas no fotografiaron nada, y uno de «no fotografiados» diría que fotografiaron
 * todo. Las dos son mentiras que nadie escribió.
 */
describe('las tres respuestas — la ausencia NO afirma', () => {
  it('una solicitud sin contestar no dice ni que sí ni que no', () => {
    expect(resumenFotos(sol())).toEqual({ si: 0, no: 0, sinContestar: 2, total: 2 })
    expect(sinFotografiar(sol())).toEqual([])
  })

  it('🔴 sin contestar NO se cuenta como "no"', () => {
    const s = conRespuestaFoto(sol(), 'v1', true, meta)
    expect(resumenFotos(s)).toEqual({ si: 1, no: 0, sinContestar: 1, total: 2 })
  })

  it('cada variante contesta lo suyo', () => {
    let l = conRespuestaFoto(sol(), 'v1', true, meta)
    l = conRespuestaFoto(l, 'v2', false, { ...meta, motivo: 'Producto fallado' })
    expect(resumenFotos(l)).toEqual({ si: 1, no: 1, sinContestar: 0, total: 2 })
    expect(respuestaFoto(l, 'v1')).toBe('si')
    expect(respuestaFoto(l, 'v2')).toBe('no')
  })

  it('los motivos sugeridos existen (van de placeholder, no de catálogo cerrado)', () => {
    expect(MOTIVOS_SIN_FOTO.length).toBeGreaterThan(2)
  })
})

describe('conRespuestaFoto', () => {
  it('guarda el motivo del "no", con quién y cuándo', () => {
    const s = conRespuestaFoto(sol(), 'v2', false, { ...meta, motivo: 'No alcanzó el tiempo' })
    expect(s.fotos?.v2).toEqual({ ok: false, motivo: 'No alcanzó el tiempo', por: 'Cande', ts: 1_000 })
    expect(sinFotografiar(s).map((i) => [i.vid, i.motivo])).toEqual([['v2', 'No alcanzó el tiempo']])
  })

  it('🔑 con "sí" NO guarda motivo: quedaría pegado de una respuesta anterior', () => {
    let l = conRespuestaFoto(sol(), 'v1', false, { ...meta, motivo: 'Producto fallado' })
    l = conRespuestaFoto(l, 'v1', true, { ...meta, motivo: 'Producto fallado' })
    expect(l.fotos?.v1).toEqual({ ok: true, por: 'Cande', ts: 1_000 })
  })

  it('🔑 null vuelve a "sin contestar": contestar por error no puede ser irreversible', () => {
    let l = conRespuestaFoto(sol(), 'v1', true, meta)
    l = conRespuestaFoto(l, 'v1', null, meta)
    expect(respuestaFoto(l, 'v1')).toBe('sin-contestar')
    expect(resumenFotos(l).sinContestar).toBe(2)
  })

  it('no muta la solicitud de entrada (el detalle guarda el estado anterior)', () => {
    const antes = sol()
    const despues = conRespuestaFoto(antes, 'v1', true, meta)
    expect(antes.fotos).toBeUndefined()
    expect(despues.fotos?.v1?.ok).toBe(true)
  })
})

describe('contestarElResto — el atajo que no pisa', () => {
  it('contesta las que faltaban', () => {
    const s = contestarElResto(sol(), true, meta)
    expect(resumenFotos(s)).toEqual({ si: 2, no: 0, sinContestar: 0, total: 2 })
  })

  it('🔴 NO pisa lo ya contestado: "se fotografió todo" no borra un "no se pudo"', () => {
    let l = conRespuestaFoto(sol(), 'v2', false, { ...meta, motivo: 'Producto fallado' })
    l = contestarElResto(l, true, meta)
    expect(resumenFotos(l)).toEqual({ si: 1, no: 1, sinContestar: 0, total: 2 })
    expect(l.fotos?.v2).toEqual({ ok: false, motivo: 'Producto fallado', por: 'Cande', ts: 1_000 })
  })

  it('no contesta por lo que nunca salió', () => {
    const s0 = sol({ items: [item('v1', 2), item('v2', 2)], verif: { v1: 2, v2: 0 } })
    const s = contestarElResto(s0, true, meta)
    expect(Object.keys(s.fotos || {})).toEqual(['v1'])
  })
})

/**
 * ⛔ El error que este archivo tiene que hacer imposible: leer «no fotografiado» donde dice «no
 * devuelto». Son dos ejes y se cruzan de las cuatro maneras.
 */
describe('fotografiado ≠ devuelto', () => {
  it('se fotografió y NO volvió', () => {
    const s0 = sol({ items: [item('v1', 1)], verif: { v1: 1 }, devuelto: { v1: 0 } })
    const s = conRespuestaFoto(s0, 'v1', true, meta)
    expect(faltantes(s).map((f) => f.vid)).toEqual(['v1'])
    expect(resumenFotos(s).si).toBe(1)
    expect(sinFotografiar(s)).toEqual([])
  })

  it('volvió y NO se fotografió', () => {
    const s0 = sol({ items: [item('v1', 1)], verif: { v1: 1 }, devuelto: { v1: 1 } })
    const s = conRespuestaFoto(s0, 'v1', false, meta)
    expect(faltantes(s)).toEqual([])
    expect(sinFotografiar(s).map((i) => i.vid)).toEqual(['v1'])
  })

  it('volvió entero y nadie contestó: ni éxito ni fracaso', () => {
    const s = sol({ items: [item('v1', 1)], verif: { v1: 1 }, devuelto: { v1: 1 } })
    expect(faltantes(s)).toEqual([])
    expect(resumenFotos(s)).toEqual({ si: 0, no: 0, sinContestar: 1, total: 1 })
    expect(sinContestar(s).map((i) => i.vid)).toEqual(['v1'])
  })
})
