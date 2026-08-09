/**
 * La Biblioteca de anuncios: la ventana, el agregado por aviso, el orden y los filtros.
 *
 * Las aserciones que valen por todo el archivo:
 *
 *  1. **`last_7d` NO incluye hoy.** Es la semántica de Meta, no una decisión de acá: si la ventana
 *     incluyera hoy, el gasto de la Biblioteca no cerraría con el de Rendimiento sobre el mismo
 *     rango y nadie sabría cuál de los dos está mal.
 *  2. **Un aviso sin compras nunca encabeza el orden por CPA.** `cpa: null` tratado como número deja
 *     a los que no vendieron nada adelante de todo en «los que venden más barato».
 *  3. **`alcance` y `frecuencia` no se suman entre días** — se hereda de `sumarDias`, y acá se
 *     amarra que la Biblioteca no los reconstruya por su cuenta.
 */

import { describe, expect, it } from 'vitest'
import { agruparAvisos, ventanaDe } from '@/lib/meta-ads/biblioteca.core.js'
import { filtrar, FILTROS_VACIOS, ordenar, totalesDe, type AvisoBiblioteca } from '@/lib/meta-ads/biblioteca'
import { formatoDe } from '@/lib/meta-ads/creativos.core.js'
import { entregando } from '@/lib/meta-ads/snapshot'

const HOY = new Date(2026, 7, 9) // 9-ago-2026, hora local

describe('ventanaDe', () => {
  it('los rangos relativos terminan AYER, como los date_preset de Meta', () => {
    expect(ventanaDe('last_7d', HOY)).toEqual({ desde: '2026-08-02', hasta: '2026-08-08' })
    expect(ventanaDe('last_30d', HOY)).toEqual({ desde: '2026-07-10', hasta: '2026-08-08' })
  })

  it('«hoy» y «ayer» sí incluyen el día que nombran', () => {
    expect(ventanaDe('today', HOY)).toEqual({ desde: '2026-08-09', hasta: '2026-08-09' })
    expect(ventanaDe('yesterday', HOY)).toEqual({ desde: '2026-08-08', hasta: '2026-08-08' })
    expect(ventanaDe('hoy_ayer', HOY)).toEqual({ desde: '2026-08-08', hasta: '2026-08-09' })
  })

  it('los meses arrancan el día 1 y el pasado termina el último día', () => {
    expect(ventanaDe('this_month', HOY)).toEqual({ desde: '2026-08-01', hasta: '2026-08-09' })
    expect(ventanaDe('last_month', HOY)).toEqual({ desde: '2026-07-01', hasta: '2026-07-31' })
  })

  it('«todo» no pone piso: lo que hay es lo que hay en la foto', () => {
    expect(ventanaDe('maximum', HOY).desde).toBeNull()
  })

  it('no se corre de día por la zona horaria', () => {
    // `toISOString()` es UTC: en Argentina, después de las 21 h devolvería el día siguiente y «hoy»
    // saldría corrido. Por eso `ventanaDe` usa `isoDia`, que toma el día LOCAL.
    const tarde = new Date(2026, 7, 9, 23, 30)
    expect(ventanaDe('today', tarde)).toEqual({ desde: '2026-08-09', hasta: '2026-08-09' })
  })
})

const fila = (o: Record<string, unknown>) => ({
  nivel: 'aviso', cuenta_id: '1', campaign_id: 'c1', adset_id: 's1', linea: 'bdi',
  spend: 0, impresiones: 0, clicks: 0, compras: 0, revenue: 0, alcance: 100, frecuencia: 2,
  ...o,
})

describe('agruparAvisos', () => {
  it('junta los días de un aviso y recalcula los ratios desde los agregados', () => {
    const [a] = agruparAvisos([
      fila({ fecha: '2026-08-01', objeto_id: '9', nombre: 'Viejo', spend: 100, impresiones: 10, clicks: 1, compras: 1, revenue: 500 }),
      fila({ fecha: '2026-08-02', objeto_id: '9', nombre: 'Nuevo', spend: 300, impresiones: 90, clicks: 9, compras: 3, revenue: 1500 }),
    ])
    expect(a.spend).toBe(400)
    expect(a.compras).toBe(4)
    // El CTR de la semana NO es el promedio de los CTR diarios: es clicks/impresiones del total.
    expect(a.ctr).toBeCloseTo(10)
    expect(a.roas).toBeCloseTo(5)
    expect(a.cpa).toBe(100)
  })

  it('el nombre sale de la fila MÁS NUEVA que lo traiga, no de la primera', () => {
    // La foto guarda el nombre del día a propósito (una campaña renombrada ayer no reescribe su
    // historia), pero para BUSCAR un aviso hoy sirve el nombre de hoy.
    const [a] = agruparAvisos([
      fila({ fecha: '2026-08-02', objeto_id: '9', nombre: 'Nuevo' }),
      fila({ fecha: '2026-08-01', objeto_id: '9', nombre: 'Viejo' }),
    ])
    expect(a.nombre).toBe('Nuevo')
  })

  it('un campo que se vació no pisa el último valor conocido', () => {
    const [a] = agruparAvisos([
      fila({ fecha: '2026-08-01', objeto_id: '9', nombre: 'El bueno' }),
      fila({ fecha: '2026-08-02', objeto_id: '9', nombre: null }),
    ])
    expect(a.nombre).toBe('El bueno')
  })

  it('distingue los días CON GASTO de los días con foto', () => {
    const [a] = agruparAvisos([
      fila({ fecha: '2026-08-01', objeto_id: '9', spend: 0 }),
      fila({ fecha: '2026-08-02', objeto_id: '9', spend: 50 }),
      fila({ fecha: '2026-08-03', objeto_id: '9', spend: 0 }),
    ])
    // Es la diferencia entre «lleva 3 días» y «entregó 1»: sin el segundo número, el ROAS de al lado
    // se lee como si estuviera medido sobre los tres.
    expect(a.dias).toBe(3)
    expect(a.diasConGasto).toBe(1)
    expect(a.ultimaConGasto).toBe('2026-08-02')
    expect(a.primera).toBe('2026-08-01')
    expect(a.ultima).toBe('2026-08-03')
  })

  it('sin compras, el CPA es null y NO cero', () => {
    // Un CPA de 0 se lee como «sale gratis». Lo que pasó es que no hubo ninguna compra.
    const [a] = agruparAvisos([fila({ fecha: '2026-08-01', objeto_id: '9', spend: 900, compras: 0 })])
    expect(a.cpa).toBeNull()
  })

  it('un aviso que existió y gastó $0 se agrupa igual', () => {
    const filas = agruparAvisos([fila({ fecha: '2026-08-01', objeto_id: '9', spend: 0 })])
    expect(filas).toHaveLength(1)
    expect(filas[0].spend).toBe(0)
  })

  it('🔴 no reconstruye alcance ni frecuencia', () => {
    // Son deduplicados dentro del período que se le pidió a Meta: sumarlos entre días cuenta siete
    // veces a quien vio el aviso los siete días, y el número sale inflado y creíble.
    const [a] = agruparAvisos([
      fila({ fecha: '2026-08-01', objeto_id: '9', alcance: 100 }),
      fila({ fecha: '2026-08-02', objeto_id: '9', alcance: 100 }),
    ])
    expect(a).not.toHaveProperty('alcance')
    expect(a).not.toHaveProperty('frecuencia')
  })

  it('sale ordenado por gasto', () => {
    const r = agruparAvisos([
      fila({ fecha: '2026-08-01', objeto_id: 'chico', spend: 10 }),
      fila({ fecha: '2026-08-01', objeto_id: 'grande', spend: 900 }),
    ])
    expect(r.map((x) => x.id)).toEqual(['grande', 'chico'])
  })
})

// ── Orden y filtros (la mitad que dibuja la pantalla) ──────────────────────────────────────────

const av = (o: Partial<AvisoBiblioteca>): AvisoBiblioteca => ({
  id: 'x', nombre: null, linea: 'bdi', cuentaId: '1', campaignId: 'c1', adsetId: 's1',
  spend: 0, impresiones: 0, clicks: 0, compras: 0, revenue: 0, ctr: 0, cpc: 0, cpm: 0, roas: 0,
  cpa: null, dias: 1, diasConGasto: 0, primera: '2026-08-01', ultima: '2026-08-01',
  ultimaConGasto: null, estado: 'ACTIVE', configurado: 'ACTIVE', pieza: null, favorito: null,
  ...o,
})

describe('ordenar', () => {
  it('🔴 por CPA, los que NO vendieron van al final — nunca encabezando', () => {
    const r = ordenar([
      av({ id: 'sin-ventas', cpa: null, spend: 5000 }),
      av({ id: 'caro', cpa: 9000, compras: 1 }),
      av({ id: 'barato', cpa: 300, compras: 9 }),
    ], 'cpa')
    expect(r.map((x) => x.id)).toEqual(['barato', 'caro', 'sin-ventas'])
  })

  it('desempata por gasto, así el orden no se mueve solo entre cargas', () => {
    // Con el ROAS en cero —que es lo que tienen los que no entregaron— sin desempate el orden
    // quedaría al azar y cambiaría de una carga a la otra sin que nada haya cambiado.
    const r = ordenar([
      av({ id: 'a', roas: 0, spend: 10 }),
      av({ id: 'b', roas: 0, spend: 900 }),
    ], 'roas')
    expect(r.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('no muta la lista que recibe', () => {
    const lista = [av({ id: 'a', spend: 1 }), av({ id: 'b', spend: 9 })]
    ordenar(lista, 'gasto')
    expect(lista.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('filtrar', () => {
  it('«ya no está en Meta» y «pausado» son grupos distintos', () => {
    // 🔴 `estado: null` no es pausado: es que Meta no devolvió el aviso (lo borraron). Contarlo como
    // pausado mandaría a alguien a reactivar algo que ya no existe.
    const lista = [
      av({ id: 'vivo', estado: 'ACTIVE' }),
      av({ id: 'pausado', estado: 'PAUSED' }),
      av({ id: 'borrado', estado: null }),
    ]
    const ids = (e: 'entregando' | 'pausado' | 'ausente') =>
      filtrar(lista, { ...FILTROS_VACIOS, estado: e }).map((x) => x.id)
    expect(ids('entregando')).toEqual(['vivo'])
    expect(ids('pausado')).toEqual(['pausado'])
    expect(ids('ausente')).toEqual(['borrado'])
    // Los tres grupos reparten el 100% sin repetir a ninguno.
    expect(ids('entregando').length + ids('pausado').length + ids('ausente').length).toBe(lista.length)
  })

  it('un aviso en revisión cuenta como entregando, no como pausado', () => {
    expect(entregando('PENDING_REVIEW')).toBe(true)
    const r = filtrar([av({ id: 'r', estado: 'PENDING_REVIEW' })], { ...FILTROS_VACIOS, estado: 'entregando' })
    expect(r).toHaveLength(1)
  })

  it('la búsqueda entra en el COPY, no sólo en el nombre', () => {
    const pieza = {
      id: 'x', nombre: null, estado: null, configurado: null, creativeId: null, imagen: null,
      thumb: null, titulo: null, texto: 'Aprovechá el envío gratis', cta: null, destino: null,
      piezas: [], esVideo: false, formato: 'imagen' as const, permalink: null,
    }
    const lista = [av({ id: 'con', nombre: 'ABC-01', pieza }), av({ id: 'sin', nombre: 'ABC-02' })]
    expect(filtrar(lista, { ...FILTROS_VACIOS, texto: 'envío gratis' }).map((x) => x.id)).toEqual(['con'])
  })
})

describe('totalesDe', () => {
  it('recalcula los ratios desde los agregados en vez de promediarlos', () => {
    const t = totalesDe([
      av({ spend: 100, revenue: 500, compras: 1, clicks: 1, impresiones: 10 }),
      av({ spend: 300, revenue: 1500, compras: 3, clicks: 9, impresiones: 90 }),
    ])
    expect(t.roas).toBeCloseTo(5)
    expect(t.cpa).toBe(100)
    expect(t.ctr).toBeCloseTo(10)
  })

  it('sin compras, el CPA total también es null', () => {
    expect(totalesDe([av({ spend: 900 })]).cpa).toBeNull()
  })
})

describe('formatoDe', () => {
  it('un carrusel se reconoce por tener más de una tarjeta', () => {
    expect(formatoDe({ object_story_spec: { link_data: { child_attachments: [{}, {}] } } })).toBe('carrusel')
  })

  it('🔑 el aviso hecho desde una PUBLICACIÓN se distingue del que no tiene foto', () => {
    // Es el único formato del que Meta no entrega ni el copy ni el destino: sin el rótulo, su
    // tarjeta se lee como un aviso al que le falta el texto.
    expect(formatoDe({ effective_object_story_id: '123_456' })).toBe('publicacion')
    expect(formatoDe({})).toBe('otro')
  })

  it('el video gana sobre la imagen del póster', () => {
    expect(formatoDe({ image_url: 'poster.jpg', object_story_spec: { video_data: { video_id: '1' } } })).toBe('video')
  })
})
