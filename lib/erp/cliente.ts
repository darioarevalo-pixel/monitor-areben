/**
 * ERP, del lado del navegador (`/api/datos?recurso=erp`). Qué ventas se pueden facturar, el techo y
 * el monto de cada factura los decide el SERVIDOR (`api/_erp.js`): de acá sólo viajan los ids.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { FacturaEmitida } from '@/lib/arca/factura-pdf'

export type MarcaErp = 'bdi' | 'zattia'

export type VentaParaFacturar = { marca: MarcaErp; ventaId: string; fecha: string; monto: number; cuentas: string[] }

export type MesFacturacion = {
  mes: string
  /** null = la facturación está mal configurada (ver `errorAmbiente`). */
  ambiente: 'homologacion' | 'produccion' | null
  errorAmbiente: string | null
  estado: 'abierto' | 'cerrado'
  cerradoPor: string | null
  cerradoEn: string | null
  techo: number
  techoCalculado: number
  facturadoGN: number
  facturadoMonitor: number
  facturado: number
  pendiente: number
  sinClasificar: Array<{ cuenta: string; monto: number; n: number }>
  ventas: VentaParaFacturar[]
  porPedido: number
  puntosDeVenta: Partial<Record<MarcaErp, number | null>>
}

export type ResultadoLote = {
  ambiente: string
  ptoVta: number
  autorizadas: Array<{ ventaId: string; numero: number; cae: string; total: number }>
  rechazadas: Array<{ ventaId: string; motivos: string[] }>
  noSalen: Array<{ ventaId: string; motivos: string[] }>
}

async function pedir<T>(init: RequestInit | null, query: string, fallo: string): Promise<T> {
  const r = await apiFetch(`/api/datos?recurso=erp${query}`, init || undefined)
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error((j && j.error) || fallo)
  return j as T
}

const post = (body: Record<string, unknown>) => ({
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recurso: 'erp', ...body }),
})

export const leerMes = (mes: string) =>
  pedir<MesFacturacion>(null, `&vista=facturacion&mes=${mes}&nc=${Date.now()}`, 'No se pudo leer la facturación del mes.')

export const leerFacturas = (mes: string) =>
  pedir<{ ambiente: string; facturas: FacturaEmitida[] }>(null, `&vista=facturas&mes=${mes}&nc=${Date.now()}`, 'No se pudieron leer las facturas del mes.')

export const facturar = (mes: string, marca: MarcaErp, ventaIds: string[]) =>
  pedir<ResultadoLote>(post({ accion: 'facturar', mes, marca, ventaIds }), '', 'No se pudo facturar.')

export const notaDeCredito = (facturaId: string) =>
  pedir<{ ambiente: string; autorizada: { numero: number; cae: string; total: number } }>(post({ accion: 'nota-credito', facturaId }), '', 'No se pudo hacer la nota de crédito.')

export const cerrarMes = (mes: string) =>
  pedir<{ ok: true; techo: number }>(post({ accion: 'cerrar', mes }), '', 'No se pudo cerrar el mes.')

export type PrendaEncontrada = { producto: string; talle: string; nombre: string | null; talleNombre: string | null; sku: string | null; barcode: string | null; gn: number }

export type MovimientoLibro = {
  id: string; deposito: string; cantidad: number; saldo: number; tipo: string; origen: string
  origen_ref: string; ocurrido_en: string; linea: string; detalle: Record<string, unknown> | null
}

export type StockDePrenda = {
  prenda: Omit<PrendaEncontrada, 'gn'>
  depositos: Array<{ deposito: string; libro: number; gn: number | null; diferencia: number | null }>
  historial: MovimientoLibro[]
  sinDeposito: string[]
}

/** Precio por lista y costo de un producto (`erp › Precios`). */
export type FilaPrecio = { lista: string; nombre: string; precio: number | null; fuente: string | null; desde: string | null; usuario: string | null; motivo: string | null }
export type PrecioDeProducto = {
  producto: string; nombre: string | null; skus: number; tnLeidaEn: string | null
  listas: FilaPrecio[]
  costo: { costo: number | null; proveedor: string | null; fuente: string; desde: string; usuario: string; motivo: string | null } | null
  gn: { precio: number | null; mayorista: number | null; costo: number | null } | null
  tn: { tienda: string; variantes: number; precio: number | null; promocional: number | null; costo: number | null; distintos: boolean } | null
  avisos: string[]
  historial: Array<{ que: 'precio' | 'costo'; lista: string | null; valor: number | null; fuente: string; desde: string; usuario: string; motivo: string | null; proveedor?: string | null }>
}
export const leerPrecioDeProducto = (marca: MarcaErp, producto: string) =>
  pedir<PrecioDeProducto>(null, `&vista=precio&marca=${marca}&producto=${producto}&nc=${Date.now()}`, 'No se pudo leer el precio.')

/** Cargar un precio (de una lista) o el costo en el ERP: una fila nueva, ⛔ toca GN ni TN. */
export type CargaPrecio = { que: 'precio' | 'costo'; producto: string; monto: string; lista?: string; desde?: string; motivo?: string; proveedor?: string }
export const cargarPrecioCosto = (marca: MarcaErp, c: CargaPrecio) =>
  pedir<{ ok: true; vigente: unknown }>(post({ accion: c.que === 'precio' ? 'cargar-precio' : 'cargar-costo', marca, ...c }), '', 'No se pudo cargar.')

export const buscarPrendas = (marca: MarcaErp, q: string) =>
  pedir<{ variantes: PrendaEncontrada[]; cortado: boolean }>(null, `&vista=stock&marca=${marca}&q=${encodeURIComponent(q)}`, 'No se pudo buscar.')

export const leerStockDePrenda = (marca: MarcaErp, producto: string, talle: string) =>
  pedir<StockDePrenda>(null, `&vista=stock&marca=${marca}&producto=${producto}&talle=${talle}&nc=${Date.now()}`, 'No se pudo leer el stock de la prenda.')

export type FilaDiferencia = {
  producto: string; talle: string; nombre: string | null; talleNombre: string | null; linea: string; deposito: string
  clase: string; explicacion: string | null; deltaGN: number; deltaLibro: number; nivelGN: number; nivelLibro: number; diferencia: number
}
export type DiferenciasDelDia = {
  fecha: string | null; dias: string[]; fotoDesde: string | null; fotoHasta: string | null
  grupos: Array<{ clase: string; nombre: string; mirar: string; filas: FilaDiferencia[]; unidades: number }>
  explicadas: Array<{ clase: string; nombre: string; variantes: number }>
  desconocidas: number; inexplicadas: number
  sobreventa: Array<{ producto: string; talle: string; nombre: string | null; talleNombre: string | null; linea: string; deposito: string; nivelLibro: number }>
  sobreventaSinConexion: boolean; sobreventaError: string | null
}

export const leerDiferencias = (marca: MarcaErp, fecha: string | null) =>
  pedir<DiferenciasDelDia>(null, `&vista=diferencias&marca=${marca}${fecha ? `&fecha=${fecha}` : ''}&nc=${Date.now()}`, 'No se pudieron leer las diferencias del día.')

export type PedidoSinPagar = {
  tienda: string; tnId: string; numero: number; creadaEn: string; dias: number; pago: string; medio: string | null; gateway: string | null
  total: number; unidades: number; prendas: Array<{ nombre: string | null; sku: string | null; cantidad: number }>; link: string | null
}
export const leerPedidosSinPagar = (marca: MarcaErp) =>
  pedir<{ pedidos: PedidoSinPagar[]; porTienda: Record<string, { pedidos: number; unidades: number; total: number }>; leidaEn: string | null }>(
    null, `&vista=pedidos-tn&marca=${marca}&nc=${Date.now()}`, 'No se pudieron leer los pedidos sin pagar.')
