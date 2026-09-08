import { describe, expect, it } from 'vitest'

import {
  agrupar,
  carpetaDe,
  estadoDeArchivo,
  GRACIA_HORAS,
  rotuloDeCarpeta,
  sePuedeEliminarEnLote,
  totalDe,
  type ArchivoBlob,
  type ContextoInventario,
} from '@/lib/blob/inventario'

/**
 * 🔴 **El inventario del Blob decide qué se borra, y borrar no tiene deshacer.**
 *
 * El 7-sep-2026 el store topó el giga del plan Hobby y frenó TODA subida del monitor. La pantalla
 * que salió de ahí lista lo que hay arriba y ofrece borrar lo que nadie nombra — y el modo de falla
 * de una pantalla así no es mostrar de menos: es llamar huérfano a algo vivo.
 *
 * Los dos casos que este archivo existe para clavar:
 *
 *  1. **El archivo que se está subiendo AHORA todavía no tiene fila.** La creadora sube los bytes
 *     primero y la URL se registra después; barrer «lo que nadie nombra» sin ventana de gracia
 *     borra el video de alguien mientras sube.
 *  2. **Lo que no se pudo verificar ⛔ NO es «sin dueño».** La galería de Ingresos guarda sus URLs
 *     en el KV de bdi-catalogo, no en esta base: si el cruce no llegó, la carpeta se muestra como
 *     no verificada. Contestar «no lo usa nadie» ante la duda es la forma exacta de perderla.
 */

const AHORA = Date.parse('2026-09-07T22:00:00.000Z')
const hace = (horas: number) => new Date(AHORA - horas * 3600 * 1000).toISOString()

const archivo = (pathname: string, size: number, horas: number): ArchivoBlob => ({
  pathname,
  url: `https://aptywrooo77owuyb.public.blob.vercel-storage.com/${pathname}`,
  size,
  subidoEn: hace(horas),
})

const ctx = (extra: Partial<ContextoInventario> = {}): ContextoInventario => ({
  usadas: new Map(),
  sinVerificar: [],
  ahora: AHORA,
  ...extra,
})

describe('carpetaDe', () => {
  it('parte por la primera barra y devuelve vacío para lo suelto en la raíz', () => {
    expect(carpetaDe('canjes/62/foto.jpg')).toBe('canjes')
    expect(carpetaDe('/piezas/ASMR.mp4')).toBe('piezas')
    expect(carpetaDe('suelto.png')).toBe('')
  })

  it('una carpeta desconocida se muestra con su propio nombre, no se esconde', () => {
    expect(rotuloDeCarpeta('loquesea')).toBe('loquesea')
    expect(rotuloDeCarpeta('')).toBe('Suelto en la raíz')
  })
})

describe('estadoDeArchivo', () => {
  it('lo que la base nombra está usado, aunque sea viejo', () => {
    const a = archivo('canjes/71/reel.mov', 90_000_000, 500)
    const estado = estadoDeArchivo(a, ctx({ usadas: new Map([[a.pathname, 'canje_evidencias']]) }))
    expect(estado).toBe('usado')
  })

  it('🔴 el que subió recién y todavía no tiene fila NO se ofrece para borrar', () => {
    // El caso real: los bytes llegan al Blob y la URL se registra después. Sin la ventana de
    // gracia, este archivo sale «sin dueño» mientras la creadora todavía está subiendo.
    expect(estadoDeArchivo(archivo('canjes/62/subiendo.mov', 120_000_000, 1), ctx())).toBe('reciente')
    expect(estadoDeArchivo(archivo('canjes/62/subiendo.mov', 120_000_000, GRACIA_HORAS - 0.1), ctx())).toBe('reciente')
    expect(estadoDeArchivo(archivo('canjes/62/viejo.mov', 120_000_000, GRACIA_HORAS + 1), ctx())).toBe('sin-dueno')
  })

  it('🔴 sin fecha de subida tampoco se da por viejo', () => {
    const sinFecha: ArchivoBlob = { pathname: 'piezas/x.mp4', url: 'https://x.public.blob.vercel-storage.com/piezas/x.mp4', size: 10, subidoEn: null }
    expect(estadoDeArchivo(sinFecha, ctx())).toBe('reciente')
  })

  it('🔴 una carpeta que no se pudo cruzar sale «no-verificable», ⛔ no «sin dueño»', () => {
    const a = archivo('ingresos/video-proveedora.mp4', 40_000_000, 300)
    expect(estadoDeArchivo(a, ctx())).toBe('sin-dueno')
    expect(estadoDeArchivo(a, ctx({ sinVerificar: ['ingresos'] }))).toBe('no-verificable')
  })

  it('estar en uso gana sobre no haber podido verificar la carpeta', () => {
    const a = archivo('ingresos/viva.mp4', 1_000, 300)
    const estado = estadoDeArchivo(a, ctx({ usadas: new Map([[a.pathname, 'ingresos']]), sinVerificar: ['ingresos'] }))
    expect(estado).toBe('usado')
  })

  it('sólo se borra en lote lo que está sin dueño', () => {
    expect(sePuedeEliminarEnLote('sin-dueno')).toBe(true)
    expect(sePuedeEliminarEnLote('usado')).toBe(false)
    expect(sePuedeEliminarEnLote('reciente')).toBe(false)
    expect(sePuedeEliminarEnLote('no-verificable')).toBe(false)
  })
})

describe('agrupar', () => {
  const archivos = [
    archivo('piezas/UNBOXING.mov', 101_000_000, 300),
    archivo('piezas/ASMR.mp4', 23_000_000, 300),
    archivo('canjes/71/foto.jpg', 2_000_000, 300),
    archivo('canjes/62/subiendo.mov', 50_000_000, 2),
    archivo('ingresos/video.mp4', 40_000_000, 300),
    archivo('disenos/mini.png', 20_000, 300),
  ]

  it('ordena las carpetas por peso y los archivos por tamaño', () => {
    const g = agrupar(archivos, ctx({ sinVerificar: ['ingresos'] }))
    expect(g.map((x) => x.carpeta)).toEqual(['piezas', 'canjes', 'ingresos', 'disenos'])
    expect(g[0].archivos[0].pathname).toBe('piezas/UNBOXING.mov')
  })

  it('🔑 el peso borrable ⛔ no cuenta lo reciente ni lo no verificable', () => {
    const g = agrupar(archivos, ctx({ sinVerificar: ['ingresos'] }))
    const porCarpeta = Object.fromEntries(g.map((x) => [x.carpeta, x]))

    expect(porCarpeta.canjes.bytes).toBe(52_000_000)
    // Los 50 MB que están subiendo ahora no se ofrecen: quedan 2 MB.
    expect(porCarpeta.canjes.bytesEliminables).toBe(2_000_000)
    expect(porCarpeta.canjes.eliminables).toBe(1)

    // Ingresos no se pudo verificar ⇒ no se ofrece nada, y la carpeta lo dice.
    expect(porCarpeta.ingresos.sinVerificar).toBe(true)
    expect(porCarpeta.ingresos.bytesEliminables).toBe(0)
  })

  it('el total es el del store, con lo reciente adentro', () => {
    expect(totalDe(archivos)).toEqual({ archivos: 6, bytes: 216_020_000 })
  })
})
