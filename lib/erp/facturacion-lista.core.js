/**
 * ERP › Ventas › Facturación con el molde (🎨 Diseño 7): las filas de las tres vistas —Sin factura · Facturas · Notas de
 * crédito— de UNA marca, a partir de lo que ya trae el mes. Sólo arma lo que se MUESTRA: qué se puede facturar y por cuánto
 * lo decide el servidor (`facturarVentas`), ⛔ esto.
 *
 * Las facturas son las de GN del mes (`ventas_factura_gn`, por el día de la VENTA) + las del ERP (`facturas`, con CAE);
 * las notas de crédito, sólo las del ERP (GN ⛔ las expone en el espejo).
 * 🔑 Y de UNA línea (Bruno, 30-oct): con `linea`, cada fila tiene que traer la suya (la pone el servidor); la que ⛔ la trae
 * ⛔ se muestra —mejor una lista corta que plata de la otra marca—.
 */

import { normal } from './stock-lista.core.js'

const NC_A = 3
const NC_B = 8
const NOMBRE_CBTE = { 1: 'Factura A', 6: 'Factura B', [NC_A]: 'NC A', [NC_B]: 'NC B' }
export const esNotaDeCredito = (tipo) => tipo === NC_A || tipo === NC_B

const nro = (pto, n) => `${String(pto).padStart(5, '0')}-${String(n).padStart(8, '0')}`

/**
 * @param {{ marca: string, linea?: string, ventas: any[], facturasGN?: any[] | null, facturas?: any[] | null }} d
 * @returns {{ sin: any[], facturas: any[], notas: any[] }}
 */
export function filasDeFacturacion({ marca, linea, ventas, facturasGN, facturas }) {
  const deLinea = (x) => x.marca === marca && (!linea || x.linea === linea)
  const sin = ventas.filter(deLinea).map((v) => ({
    id: v.ventaId, vista: 'sin', ventaId: v.ventaId, numero: v.numero ?? null, cliente: v.cliente ?? null,
    fecha: v.fecha, cuentas: v.cuentas, total: v.monto,
    busca: normal([v.numero, v.ventaId, v.cliente, ...v.cuentas].filter(Boolean).join(' ')),
  }))
  const deGN = (facturasGN || []).filter(deLinea).map((f) => ({
    id: `gn/${f.ventaId}`, vista: 'facturas', de: 'gn', ventaId: f.ventaId, comprobante: `Factura ${f.numero}`,
    fecha: f.fecha, numero: f.venta?.numero ?? null, cliente: f.venta?.cliente ?? null, cae: f.cae, estado: f.estado, total: f.monto,
    busca: normal([f.numero, f.cae, f.venta?.numero, f.ventaId, f.venta?.cliente].filter(Boolean).join(' ')),
  }))
  const delERP = (facturas || []).filter(deLinea).map((f) => {
    const comprobante = `${NOMBRE_CBTE[f.tipo] ?? 'Comprobante'} ${nro(f.pto_vta, f.numero)}`
    return {
      id: `erp/${f.id}`, vista: esNotaDeCredito(f.tipo) ? 'notas' : 'facturas', de: 'erp', ventaId: f.venta_id, comprobante,
      fecha: f.fecha, numero: f.venta_numero ?? null, cliente: f.receptor_nombre ?? null, cae: f.cae, estado: f.estado,
      total: esNotaDeCredito(f.tipo) ? -f.total : f.total, emitida: f,
      busca: normal([comprobante, f.cae, f.venta_numero, f.venta_id, f.receptor_nombre].filter(Boolean).join(' ')),
    }
  })
  const porFecha = (a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? ''))
  return {
    sin,
    facturas: [...delERP.filter((f) => f.vista === 'facturas'), ...deGN].sort(porFecha),
    notas: delERP.filter((f) => f.vista === 'notas').sort(porFecha),
  }
}

/** Las que ya tienen nota de crédito: su factura ⛔ ofrece otra (una por venta, como GN). */
export const ventasConNC = (facturas) => new Set((facturas || []).filter((f) => esNotaDeCredito(f.tipo)).map((f) => `${f.marca}:${f.venta_id}`))

/** Ordena una vista por la columna elegida (fecha, cliente o total); sin orden, como vino. */
export function ordenarFilas(filas, orden) {
  if (!orden) return filas
  const val = (f) => (orden.col === 'total' ? f.total : orden.col === 'cliente' ? normal(f.cliente ?? '') : String(f.fecha ?? ''))
  const s = orden.dir === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => (val(a) < val(b) ? -s : val(a) > val(b) ? s : 0))
}
