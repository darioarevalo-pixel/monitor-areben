import { describe, expect, it } from 'vitest'
import { armarAContar, filaDeAjuste, leerCrearAjuste as leerCrear, textoDeAviso } from '@/lib/erp/ajuste.core.js'

// La respuesta es `{ error }` o la entrada armada: la prueba mira los dos lados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const leerCrearAjuste = (b: object): any => leerCrear(b)

/**
 * **ERP › Ajustes, el núcleo** (19-oct). El oráculo: la lista «A contar» es la de la Conciliación (TN y ML) + las ventas con
 * PIN, ⛔ repite la prenda, y SACA la que ya está en un ajuste que la cierra (para aprobar, o aprobado DESPUÉS de calcular la
 * conciliación); uno aprobado ANTES ⛔ la cerró ⇒ vuelve. Lo que manda la pantalla llega al motor con el signo bien.
 */
const fila = (producto: string, talle: string, o = {}) => ({ producto, talle, nombre: `P${producto}`, talleNombre: 'M', sku: `S${producto}`, tn: 5, erp: 3, gn: 5, dias: 2, ...o })
const conciliacion = {
  fecha: '2026-10-19', calculadoEn: '2026-10-19T16:40:00Z',
  grupos: [
    { tipo: 'stock_tn', clase: 'libro_aparte', filas: [fila('1', '10'), fila('2', '20'), fila('3', '30'), fila('4', '40')] },
    { tipo: 'stock_tn', clase: 'tn_atrasado', filas: [fila('9', '90')] },
    { tipo: 'stock_ml', clase: 'libro_aparte', filas: [fila('1', '10'), fila('5', '50')] },
  ],
}
const ajuste = (numero: number, estado: string, pid: number, o = {}) => ({ numero, estado, deposito: 'local', creado_en: '2026-10-19T10:00:00Z', resuelto_en: null, renglones: [{ product_id: pid, size_id: pid * 10 }], ...o })

describe('armarAContar', () => {
  it('junta TN y ML sin repetir, deja afuera lo que ⛔ es de contar, y propone el depósito de la tienda', () => {
    const r = armarAContar({ linea: 'zattia', conciliacion, contar: [], ajustes: [] })
    expect(r.pendientes.map((f) => [f.clave, f.donde.join('+')])).toEqual([['1:10', 'Tienda Nube+Mercado Libre'], ['2:20', 'Tienda Nube'], ['3:30', 'Tienda Nube'], ['4:40', 'Tienda Nube'], ['5:50', 'Mercado Libre']])
    expect(r.pendientes[0].deposito).toBe('local')
    expect(armarAContar({ linea: 'bdi', conciliacion, contar: [], ajustes: [] }).pendientes[0].deposito).toBe('deposito_minorista')
  })

  it('saca la que está en un ajuste que la cierra; la de un ajuste aprobado ANTES de la conciliación (o descartado) vuelve', () => {
    const ajustes = [
      ajuste(1, 'para_aprobar', 1),
      ajuste(2, 'aplicado', 2, { resuelto_en: '2026-10-19T18:00:00Z' }),   // después de calcular: la cierra
      ajuste(3, 'aplicado', 3, { resuelto_en: '2026-10-18T18:00:00Z' }),   // antes: ⛔ la cerró
      ajuste(4, 'rechazado', 4),
    ]
    const r = armarAContar({ linea: 'zattia', conciliacion, contar: [], ajustes })
    expect(r.enAjuste.map((f) => [f.clave, f.ajuste?.numero])).toEqual([['1:10', 1], ['2:20', 2]])
    expect(r.pendientes.map((f) => f.clave)).toEqual(['3:30', '4:40', '5:50'])
  })

  it('suma las prendas de las ventas con PIN (con nombre), y el ajuste de ANTES de la venta ⛔ las cierra', () => {
    const contar = [{ id: 'v', numero: 296, deposito: 'local', ocurrida_en: '2026-10-19T12:00:00Z', contar: [{ product_id: 7, size_id: 70, nivel: 0, autoriza: 'karen' }, { product_id: 1, size_id: 10, nivel: 0 }] }]
    const nombres = new Map([['7/70', { nombre: 'Top Sahara', talle: 'S' }]])
    const r = armarAContar({ linea: 'zattia', conciliacion: null, contar, ajustes: [ajuste(5, 'aplicado', 7, { creado_en: '2026-10-19T11:00:00Z', resuelto_en: '2026-10-19T11:30:00Z' })], nombres })
    expect(r.pendientes.map((f) => [f.clave, f.nombre, f.venta?.numero, f.venta?.autoriza, f.erp])).toEqual([['7:70', 'Top Sahara', 296, 'karen', 0], ['1:10', null, 296, null, 0]])
    expect(r.fecha).toBeNull()
  })
})

describe('leerCrearAjuste', () => {
  const base = { linea: 'zattia', deposito: 'local', detalle: ' ', fuente: 'conciliacion' }
  it('conteo ⇒ contado; «salen» ⇒ negativo aunque se escriba positivo; «otro» con su signo', () => {
    expect(leerCrearAjuste({ ...base, motivo: 'conteo', renglones: [{ producto: '1', talle: '10', sku: 'S1', contado: '0' }] }))
      .toEqual({ linea: 'zattia', deposito: 'local', motivo: 'conteo', detalle: null, fuente: 'conciliacion', renglones: [{ product_id: 1, size_id: 10, sku: 'S1', barcode: null, contado: 0 }] })
    expect(leerCrearAjuste({ ...base, motivo: 'fallado', renglones: [{ producto: '1', talle: '10', cantidad: 2 }] }).renglones[0].cantidad).toBe(-2)
    expect(leerCrearAjuste({ ...base, motivo: 'regalo', renglones: [{ producto: '1', talle: '10', cantidad: -1 }] }).renglones[0].cantidad).toBe(-1)
    expect(leerCrearAjuste({ ...base, motivo: 'otro', detalle: 'apareció', renglones: [{ producto: '1', talle: '10', cantidad: 3 }] }).renglones[0].cantidad).toBe(3)
  })
  it('lo que ⛔ tiene forma se corta acá', () => {
    expect(leerCrearAjuste({ ...base, linea: 'otra', motivo: 'conteo', renglones: [{ producto: '1', talle: '10', contado: 1 }] }).error).toBe('Línea inválida')
    expect(leerCrearAjuste({ ...base, motivo: 'merma', renglones: [{ producto: '1', talle: '10', contado: 1 }] }).error).toBe('Elegí el motivo')
    expect(leerCrearAjuste({ ...base, motivo: 'conteo', renglones: [] }).error).toBe('Agregá al menos una prenda')
    expect(leerCrearAjuste({ ...base, motivo: 'conteo', renglones: [{ producto: '1', talle: '10', contado: '' }] }).error).toMatch(/lo contado/)
    expect(leerCrearAjuste({ ...base, motivo: 'conteo', fuente: 'excel', renglones: [{ producto: '1', talle: '10', contado: 1 }] }).fuente).toBe('mano')
  })
})

describe('filaDeAjuste y avisos', () => {
  it('el neto, el después, y cuántas se movieron desde el conteo', () => {
    const a = filaDeAjuste({ id: 'x', numero: 3, linea: 'zattia', deposito: 'local', motivo: 'conteo', estado: 'para_aprobar', creado_por: 'camila', creado_en: 'x',
      renglones: [{ n: 1, product_id: 1, size_id: 10, antes: 40, contado: 0, diferencia: -40, ahora: 39 }, { n: 2, product_id: 2, size_id: 20, antes: 0, contado: 2, diferencia: 2, ahora: 0 }] })
    expect([a.neto, a.seMovio, a.motivoNombre, a.renglones.map((r: { despues: number }) => r.despues)]).toEqual([-38, 1, 'Conteo', [0, 2]])
  })
  it('cada aviso del motor se lee en palabras del equipo', () => {
    expect(textoDeAviso({ codigo: 'CONTEO_DE_DEPOSITO_RECIENTE', conteo: 31 })).toMatch(/C-31.*dos veces/)
    expect(textoDeAviso({ codigo: 'LIBRO_SE_MOVIO', sku: 'S1', antes: 40, ahora: 39 })).toMatch(/S1.*40 → 39/)
  })
})
