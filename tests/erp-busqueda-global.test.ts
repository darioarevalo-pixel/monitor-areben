import { describe, expect, it } from 'vitest'
import {
  ATAJOS, accionDeTecla, desdeBusquedaDeVentas, esEscaneo, gruposDe, periodoDeVenta, queBuscar, saltosA,
} from '@/lib/erp/busqueda-global.core.js'
import { SECCIONES_BUSCABLES, hrefErp, resolverRutaErp } from '@/components/erp/Erp'

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
    expect(esEscaneo('RRE0052BL')).toBe(true) // el código de barras de la casa (SKU sin guiones)
    expect(esEscaneo('RRE-0052-BL')).toBe(true)
    expect(esEscaneo('remera')).toBe(false) // sin cifras: es un nombre
    expect(esEscaneo('remera 1174')).toBe(false) // dos palabras
    expect(esEscaneo('296000')).toBe(false) // sólo cifras y cortas: es una venta
    expect(esEscaneo('abc 12345678')).toBe(false) // con espacio: se escribió a mano
  })
  it('los saltos aceptan tildes y caen en una pantalla que existe', () => {
    const r = saltosA('cuenta cor', SECCIONES_BUSCABLES)
    expect(r[0]).toMatchObject({ seccion: 'clientes', pestania: 'cuenta-corriente' })
    for (const sec of SECCIONES_BUSCABLES) {
      for (const p of sec.pestanias) {
        const { seccion, pestania, vista } = resolverRutaErp(hrefErp(sec.key, p.key).split('/').slice(2))
        // Lo que ⌘K abre, ya resuelto, es una dirección válida (⛔ un redirect que rebota).
        expect(resolverRutaErp(hrefErp(seccion.key, pestania, vista).split('/').slice(2)).valida).toBe(true)
      }
    }
    expect(saltosA('x', SECCIONES_BUSCABLES)).toEqual([])
  })
  it('las direcciones de antes caen en su pestaña nueva (🎨 27-oct, fusiones de §9)', () => {
    const a = (r: string[]) => { const x = resolverRutaErp(r); return [x.seccion.key, x.pestania, x.vista, x.valida] }
    expect(a(['configuracion', 'cuentas-reales'])).toEqual(['configuracion', 'cuentas', 'cuentas', false])
    expect(a(['configuracion', 'cuentas'])).toEqual(['configuracion', 'cuentas', 'cuentas', true])
    expect(a(['configuracion', 'redondeo'])).toEqual(['configuracion', 'reglas', 'redondeo', false])
    // 🎨 30-oct (mapa del menú): la sección Caja ⛔ existe; Cajas y Cambio son de Ventas, y Redondeo vuelve a Configuración.
    expect(a(['productos', 'redondeo'])).toEqual(['configuracion', 'reglas', 'redondeo', false])
    expect(a(['ventas', 'cajas'])).toEqual(['ventas', 'cajas', null, true])
    expect(a(['caja', 'cajas'])).toEqual(['ventas', 'cajas', null, false])
    expect(a(['caja', 'cambio'])).toEqual(['ventas', 'cambio', null, false])
    expect(a(['caja'])).toEqual(['ventas', 'cajas', null, false])
    expect(a(['ventas', 'por-producto'])).toEqual(['ventas', 'ventas', 'por-producto', false])
    expect(a(['caja', 'factura'])).toEqual(['ventas', 'facturacion', 'factura', false])
    expect(a(['clientes', 'cuenta-corriente'])).toEqual(['clientes', 'clientes', 'cuenta-corriente', false])
    expect(hrefErp('caja', 'factura')).toBe('/erp/ventas/facturacion/factura')
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
  it('un cliente sin documento viaja con el nombre (GN no trae doc: ⛔ se abría la primera fila sin documento)', () => {
    const g = gruposDe({ ventas: [], prendas: [], clientas: [{ doc: '', nombre: 'Ludmila Acosta', razonSocial: null, buscadaEn: 'zattia' }] })
    expect(g[0].items[0].destino).toEqual({ tipo: 'cliente', marca: 'zattia', doc: null, nombre: 'Ludmila Acosta' })
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
