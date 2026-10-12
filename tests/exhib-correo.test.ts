/**
 * **El correo del chequeo** (`lib/exhib/correo.core.js` + `lib/exhib/correo.ts`, Darío 12-oct-2026):
 * apenas se cierra el recorrido, a los dueños les llega cuánto se escaneó contra lo que había, lo
 * pendiente, las duplicadas y la feria. Si un tipo de prenda entero ⛔ se escaneó, el asunto lo dice.
 */
import { describe, expect, it } from 'vitest'
import { armarCorreoChequeo, limpiarReporte } from '../lib/exhib/correo.core.js'
import { paraElCorreo } from '../lib/exhib/correo'
import { aEscaneo, sumarUna } from '../lib/exhib/libre'
import type { ExhibItem } from '../lib/exhib/tipos'

const REC = { persona: 'Camila', creado_en: '2026-10-13T12:00:00Z', cerrado_en: '2026-10-13T12:42:00Z' }
const reporte = (over: Record<string, unknown> = {}) =>
  limpiarReporte({
    vistas: 580,
    total: 616,
    escaneos: 600,
    noLeyo: 2,
    porLugar: [{ lugar: 'Tops', escaneos: 330 }, { lugar: 'Partes de abajo', escaneos: 270 }],
    nuevosDesde: { desde: '2026-10-05', hayAnterior: true },
    pendientes: [
      { sku: 'RTO-0412-NG', nombre: 'TOP NUEVO', variante: 'Negro - M', enLocal: 3, nuevo: '2026-10-08' },
      { sku: 'RBL-0388-NG', nombre: 'BLUSA MILANO', variante: 'Negro - S', enLocal: 1, nuevo: null },
    ],
    duplicadas: [{ sku: 'RCA-0010-BL', nombre: 'CAMISA ALTHEA', variante: 'Blanco - M', veces: 2, lugares: ['Tops', 'Vidriera'], otrasEnMedio: 0 }],
    feria: [{ sku: 'RTO-0099', nombre: 'BABY TEE', variante: 'Variante Única', veces: 1, lugares: ['Tops'] }],
    ...over,
  })

describe('armarCorreoChequeo', () => {
  it('sin tipos salteados: el asunto da el porcentaje exhibido; el texto trae todo', () => {
    const c = armarCorreoChequeo({ recorrido: REC, reporte: reporte() })
    expect(c.asunto).toBe('Chequeo de exhibición 13-oct: exhibido 94 % · 2 pendientes · 1 duplicadas')
    expect(c.texto).toContain('Camila · 09:00 a 09:42 · 42 min')
    expect(c.texto).toContain('Exhibido el 94 % (580 de 616 variantes) · faltan colgar 2')
    expect(c.texto).toContain('2 no leídas')
    expect(c.texto).toContain('1 nuevos desde el chequeo del 5-oct · 1 con 1 sola unidad')
    expect(c.texto).toContain('RTO-0412-NG TOP NUEVO Negro - M · en el local 3 · Nuevo 8-oct')
    expect(c.texto).toContain('RBL-0388-NG BLUSA MILANO Negro - S · en el local 1 · 1 sola')
    expect(c.texto).toContain('en Tops y Vidriera · puede ser la misma pasada dos veces')
    // «Variante Única» ⛔ se escribe.
    expect(c.texto).toContain('RTO-0099 BABY TEE · Tops')
    expect(c.html).toContain('Exhibido el 94 % · faltan colgar 2')
    expect(c.texto).not.toMatch(/regular|incompleto/i)
  })

  it('🔴 un porcentaje bajo ⛔ es «incompleto»: lo que avisa es un TIPO entero sin escanear', () => {
    expect(armarCorreoChequeo({ recorrido: REC, reporte: reporte({ vistas: 300 }) }).asunto).toBe('Chequeo de exhibición 13-oct: exhibido 49 % · 2 pendientes · 1 duplicadas')
    const c = armarCorreoChequeo({ recorrido: REC, reporte: reporte({ tiposSinEscanear: [{ tipo: 'BODY', variantes: 7 }] }) })
    expect(c.asunto).toBe('⚠️ Chequeo de exhibición 13-oct: sin escanear BODY · 2 pendientes')
    expect(c.texto).toContain('⚠️ No se escaneó ningún BODY (7 variantes): ¿se saltearon o no están colgados?')
  })

  it('el HTML escapa lo que viene del teléfono', () => {
    const c = armarCorreoChequeo({ recorrido: REC, reporte: reporte({ pendientes: [{ sku: '<b>', nombre: 'A & B', variante: '', enLocal: 2 }] }) })
    expect(c.html).toContain('&lt;b&gt;')
    expect(c.html).toContain('A &amp; B')
    expect(c.html).not.toContain('<b><b>')
  })
})

describe('limpiarReporte', () => {
  it('acota lo que manda el teléfono: tipos, fechas y basura', () => {
    const r = limpiarReporte({ vistas: 'x', pendientes: [{ sku: 5, nombre: null, enLocal: '2', nuevo: 'ayer' }], nuevosDesde: { desde: 'nope' } })
    expect(r.vistas).toBe(0)
    expect(r.pendientes[0]).toEqual({ sku: '5', nombre: '', variante: '', enLocal: 2, unaCualquiera: false, nuevo: null })
    expect(r.nuevosDesde).toBeNull()
    expect(limpiarReporte(null).pendientes).toEqual([])
  })
})

describe('paraElCorreo', () => {
  const it0 = (over: Partial<ExhibItem>): ExhibItem => ({
    barcode: '', sku: '', productId: 'p', name: 'TOP X', size: 'NEGRO', qty: 2, img: null, cat: 'TOPS', cleanCats: ['TOPS'], tnId: 1, precio: 30000, promo: null, ...over,
  })
  const negro = it0({ barcode: '1', sku: 'RTO-0010-NG', productId: 'top' })
  const blanco = it0({ barcode: '2', sku: 'RTO-0010-BL', productId: 'top', size: 'BLANCO' })
  const T0 = Date.parse('2026-10-13T12:05:00Z')

  it('suma las lecturas por lugar (con los repetidos) y cuenta las que ⛔ leyó', () => {
    const esc = [sumarUna(aEscaneo(negro, '1', 'Tops', T0), T0 + 60_000), aEscaneo(null, 'XX', 'Tops', T0 + 120_000)]
    const r = paraElCorreo(esc, [negro, blanco], null, new Map([['top', '2026-10-08']]), { desde: '2026-10-05', hayAnterior: true })
    expect(r.escaneos).toBe(2)
    expect(r.noLeyo).toBe(1)
    expect(r.porLugar).toEqual([{ lugar: 'Tops', escaneos: 2 }])
    expect(r.pendientes.map((p) => [p.sku, p.nuevo])).toEqual([['RTO-0010-BL', '2026-10-08']])
    expect(r.duplicadas).toHaveLength(1)
  })
})
