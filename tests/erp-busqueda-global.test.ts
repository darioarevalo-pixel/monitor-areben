import { describe, expect, it } from 'vitest'
import {
  ATAJOS, accionDeTecla, desdeBusquedaDeVentas, esEscaneo, gruposDe, periodoDeVenta, queBuscar, saltosA,
} from '@/lib/erp/busqueda-global.core.js'
import { SECCIONES_ERP } from '@/components/erp/Erp'

describe('erp › búsqueda global', () => {
  it('reparte lo escrito entre las lecturas que ya existen', () => {
    expect(queBuscar('296')).toMatchObject({ ventas: true, prendas: false, clientas: false })
    expect(queBuscar('#1234567')).toMatchObject({ ventas: true, prendas: false })
    expect(queBuscar('20123456789')).toMatchObject({ ventas: true, prendas: true, clientas: true })
    expect(queBuscar('7791234567890')).toMatchObject({ ventas: false, prendas: true, clientas: false })
    expect(queBuscar('remera')).toMatchObject({ ventas: true, prendas: true, clientas: true })
    expect(queBuscar('re')).toMatchObject({ ventas: false, prendas: false, clientas: false })
    expect(queBuscar('  ')).toMatchObject({ ventas: false })
  })
  it('un escaneo son sólo cifras, 8 o más', () => {
    expect(esEscaneo('7791234567890')).toBe(true)
    expect(esEscaneo('296')).toBe(false)
    expect(esEscaneo('abc12345678')).toBe(false)
  })
  it('los saltos aceptan tildes y apuntan a una pestaña que existe', () => {
    const r = saltosA('cuenta cor', SECCIONES_ERP)
    expect(r[0]).toMatchObject({ seccion: 'clientes', pestania: 'cuenta-corriente' })
    for (const s of saltosA('stock', SECCIONES_ERP, 20)) {
      const sec = SECCIONES_ERP.find((x) => x.key === s.seccion)!
      expect(sec.pestanias.some((p) => p.key === s.pestania) || s.pestania == null).toBe(true)
    }
    expect(saltosA('x', SECCIONES_ERP)).toEqual([])
  })
  it('arma los grupos en orden y con la marca sólo si se busca en todas', () => {
    const datos = {
      ventas: [{ id: 'v1', numero: 296, marca: 'zattia', cliente: 'Ana', estado: 'confirmada', prueba: false, ocurridaEn: '2026-10-20T15:00:00Z', buscadaEn: 'zattia' }],
      prendas: [{ producto: '1', talle: '2', nombre: 'Remera', talleNombre: 'M', sku: 'REM-M', barcode: null, buscadaEn: 'zattia' }],
      clientas: [{ doc: '20123456789', nombre: 'Luz', razonSocial: null, buscadaEn: 'zattia' }],
    }
    const g = gruposDe(datos)
    expect(g.map((x: { key: string }) => x.key)).toEqual(['ventas', 'prendas', 'clientas'])
    expect(g[0].items[0].detalle).toBe('Ana')
    expect(g[0].items[0].destino).toMatchObject({ tipo: 'venta', id: 'v1', marca: 'zattia' })
    expect(gruposDe(datos, { conMarca: true })[1].items[0].detalle).toContain('Zattia')
  })
  it('el período de Ventas que contiene la venta (día argentino)', () => {
    expect(periodoDeVenta('2026-10-05T12:00:00Z', '2026-10-26')).toBe('mes')
    expect(periodoDeVenta('2026-10-01T01:00:00Z', '2026-10-26')).toBe('anterior') // 22:00 del 30-sep en Argentina
    expect(periodoDeVenta('2026-09-10T12:00:00Z', '2026-10-26')).toBe('anterior')
    expect(periodoDeVenta('2026-08-10T12:00:00Z', '2026-10-26')).toBeNull()
    expect(desdeBusquedaDeVentas('2026-10-26')).toBe('2026-09-01')
    expect(desdeBusquedaDeVentas('2026-01-15')).toBe('2025-12-01')
  })
  it('⌘K abre siempre; «/» y «?» sólo fuera de un campo', () => {
    expect(accionDeTecla({ key: 'k', metaKey: true }, true)).toBe('buscar')
    expect(accionDeTecla({ key: 'K', ctrlKey: true }, false)).toBe('buscar')
    expect(accionDeTecla({ key: '/' }, false)).toBe('buscar')
    expect(accionDeTecla({ key: '/' }, true)).toBeNull()
    expect(accionDeTecla({ key: '?' }, false)).toBe('atajos')
    expect(accionDeTecla({ key: '?', metaKey: true }, false)).toBeNull()
    expect(ATAJOS.length).toBeGreaterThan(3)
  })
})
