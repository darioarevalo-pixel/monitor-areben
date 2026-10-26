import { describe, expect, it } from 'vitest'
import { contarVistasDoc, csvDeDocs, faltantesDe, filtrarDocs, nombreDeRenglon, nombresDePrendas, ordenarDocs, pasoDeDoc, remitoHtml, vistaDeEntradaDoc } from '@/lib/erp/transferencias-doc.core.js'
import { listaDeRecepcion } from '@/lib/erp/transferencia-escaneo.core.js'

const r = (o = {}) => ({ n: 1, product_id: 10, size_id: 1, sku: 'STU-REM-M', barcode: '779', pedida: 0, armada: 3, enviada: 3, recibida: null, ...o })
const d = (o = {}) => ({ id: 'x', numero: 1, linea: 'stunned', desde: 'deposito', hacia: 'local', origen: 'libre', estado: 'en_transito', nota: null, creada_por: 'Bruno', creada_en: '2026-10-26T20:00:00Z', enviada_por: 'Bruno', enviada_en: null, recibida_por: null, recibida_en: null, diferencias: [], renglones: [r()], ...o })
const nombres = nombresDePrendas([{ producto: '10', talle: '1', nombre: 'REMERA', talleNombre: 'M' }])

describe('transferencias-doc', () => {
  it('el nombre sale de product_id + size_id; sin nombre, el SKU; nunca «null»', () => {
    expect(nombreDeRenglon(r(), nombres)).toBe('REMERA · M')
    expect(nombreDeRenglon(r(), {})).toBe('STU-REM-M')
    expect(nombreDeRenglon(r({ sku: null }), {})).toBe('Prenda 10/1')
  })
  it('el paso de cada estado: recibida completa verde, con faltantes roja', () => {
    expect(pasoDeDoc(d({ estado: 'borrador' })).paso).toBe(1)
    expect(pasoDeDoc(d({ estado: 'armada' })).paso).toBe(2)
    expect(pasoDeDoc(d())).toMatchObject({ paso: 3, fin: 'curso' })
    expect(pasoDeDoc(d({ estado: 'recibida' }))).toMatchObject({ paso: 4, fin: 'ok' })
    expect(pasoDeDoc(d({ estado: 'recibida', diferencias: [{ sku: 'a', enviada: 3, recibida: 1, diferencia: -2 }] }))).toMatchObject({ paso: 4, fin: 'rojo', texto: 'Recibida con 2 u de menos' })
    expect(pasoDeDoc(d({ estado: 'cancelada' })).fin).toBe('gris')
  })
  it('los sobrantes ⛔ cuentan como faltantes', () => {
    expect(faltantesDe(d({ diferencias: [{ diferencia: -2 }, { diferencia: 1 }] }))).toBe(2)
  })
  it('vistas con su número; se entra a «En camino» si hay, si no a «Todas»', () => {
    const docs = [d(), d({ numero: 2, estado: 'borrador' }), d({ numero: 3, estado: 'recibida' })]
    const c = contarVistasDoc(docs)
    expect(c).toEqual({ en_camino: 1, sin_enviar: 1, recibidas: 1, todas: 3 })
    expect(vistaDeEntradaDoc(c)).toBe('en_camino')
    expect(vistaDeEntradaDoc({ en_camino: 0 })).toBe('todas')
  })
  it('el buscador entiende «T-7», el nombre sin tildes y el SKU', () => {
    const docs = [d({ numero: 7 }), d({ numero: 8, renglones: [r({ product_id: 11, sku: 'STU-BUZO-L' })] })]
    expect(filtrarDocs(docs, { q: 'T-7', nombres }).map((x: { numero: number }) => x.numero)).toEqual([7])
    expect(filtrarDocs(docs, { q: 'remera', nombres }).map((x: { numero: number }) => x.numero)).toEqual([7])
    expect(filtrarDocs(docs, { q: 'buzo', nombres }).map((x: { numero: number }) => x.numero)).toEqual([8])
  })
  it('ordena la más nueva primero y respeta el orden pedido', () => {
    const docs = [d({ numero: 1 }), d({ numero: 3 }), d({ numero: 2 })]
    expect(ordenarDocs(docs, null).map((x: { numero: number }) => x.numero)).toEqual([3, 2, 1])
    expect(ordenarDocs(docs, { col: 'n', dir: 'asc' }).map((x: { numero: number }) => x.numero)).toEqual([1, 2, 3])
  })
  it('Recibir arranca con los nombres puestos', () => {
    expect(listaDeRecepcion([r()], nombres)[0]).toMatchObject({ nombre: 'REMERA', talleNombre: 'M', cantidad: 0, enviada: 3 })
  })
  it('el CSV y el remito escapan lo que viene de afuera', () => {
    expect(csvDeDocs([d({ nota: 'dice "hola"' })])).toContain('"dice ""hola"""')
    const html = remitoHtml(d({ nota: '<b>x</b>' }), nombres)
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('REMERA · M')
    expect(html).not.toContain('null')
  })
})
