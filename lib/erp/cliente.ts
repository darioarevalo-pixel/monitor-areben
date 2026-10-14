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
export type FilaPrecio = { lista: string; nombre: string; precio: number | null; fuente: string | null; desde: string | null; usuario: string | null; motivo: string | null; deLista: string | null }
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
export type CargaPrecio = { que: 'precio' | 'costo'; producto: string; monto: number; lista?: string; desde?: string; motivo?: string; proveedor?: string }
export const cargarPrecioCosto = (marca: MarcaErp, c: CargaPrecio) =>
  pedir<{ ok: true; futuro: boolean; aviso: string | null }>(post({ accion: c.que === 'precio' ? 'cargar-precio' : 'cargar-costo', marca, ...c }), '', 'No se pudo cargar.')

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

export type VentaPropia = {
  id: string; numero: number; marca: 'bdi' | 'zattia' | 'stunned'; tipo: 'venta' | 'cambio'; estado: 'confirmada' | 'anulada'
  origen: string; canal: string; deposito: string; total: number; prueba: boolean; ocurridaEn: string; cliente: string | null
}

export type FichaDeVenta = {
  venta: VentaPropia & { subtotal: number; usuario: string; registradaEn: string; origenRef: string; gnSaleId: string | null; ventaOriginalId: string | null }
  cliente: { nombre: string | null; doc: string | null; email: string | null; whatsapp: string | null } | null
  lineas: Array<{
    id: string; n: number; producto: string; talle: string; nombre: string | null; talleNombre: string | null; sku: string | null
    cantidad: number; precio: number; descuento: number; rebaja: number; importe: number; devuelta: boolean; lineaOrigenId: string | null
    /** Unidades de esta línea que ya volvieron en cambios confirmados. */
    cambiado: number
  }>
  pagos: Array<{ cuenta: string | null; medio: string | null; monto: number; base: number | null; porcentaje: number | null }>
  anulacion: { motivo: string; usuario: string; anuladaEn: string; devolucion: unknown } | null
  facturas: Array<{ facturaId: string; tipo: 'factura' | 'nc' | 'nd' }>
  facturada: boolean
  cambios: VentaPropia[]
  original: VentaPropia | null
  /** null = se puede anular; si no, por qué no. */
  puedeAnular: string | null
}

export const buscarVentas = (marca: MarcaErp, f: { q: string; desde: string; hasta: string }) =>
  pedir<{ ventas: VentaPropia[]; cortado: boolean }>(null, `&vista=ventas&marca=${marca}&q=${encodeURIComponent(f.q)}&desde=${f.desde}&hasta=${f.hasta}&nc=${Date.now()}`, 'No se pudo buscar.')

export const leerFichaDeVenta = (marca: MarcaErp, id: string) =>
  pedir<FichaDeVenta>(null, `&vista=venta&marca=${marca}&id=${id}&nc=${Date.now()}`, 'No se pudo leer la venta.')

export const anularVenta = (marca: MarcaErp, ventaId: string, motivo: string) =>
  pedir<{ ok: true; movimientos: number; ncPendiente: boolean }>(post({ accion: 'anular', marca, ventaId, motivo }), '', 'No se pudo anular.')

/** Lo que se lleva en un cambio: la forma de `ItemCaja` de la Caja (el servidor lo arma con `renglones`). */
export type PrendaNueva = { product_id: number; size_id: number; cantidad: number; precio: number; sku?: string | null }

/** El saldo a favor de una clienta (el de prueba, mientras el cambio es de prueba). */
export const leerSaldo = (marca: MarcaErp, doc: string) =>
  pedir<{ cliente: { nombre: string } | null; saldo: number }>(null, `&vista=saldo&marca=${marca}&doc=${encodeURIComponent(doc)}&nc=${Date.now()}`, 'No se pudo leer el saldo.')

export type ClienteCambio = { doc: string; nombre: string; whatsapp?: string | null; email?: string | null }
export type CruceCambio = { estado: string; motivo?: string }
export type PagoMp = { id: string; monto: number; cuando: string; origen?: string; coincide: boolean; diferencia: number }
export type RespuestaCambio =
  | { ok: true; esperando?: false; venta: { id: string; numero: number; diferencia?: number }; total: number; aFavor: number; saldo: number | null; ncPendiente: boolean; yaExistia: boolean }
  | { ok: true; esperando: true; espera: number; total: number; desde: string; cruce: CruceCambio; recientes?: PagoMp[] }

/**
 * El cambio. Con transferencia contesta `esperando` hasta que llega el pago: la pantalla repite el MISMO
 * pedido (mismo `id` y `desde`), y con `pago` (el que eligió) o `comprobante` (sin cuenta de MP).
 */
export const cambiarVenta = (marca: MarcaErp, c: {
  id: string; ventaId: string; devueltas: Array<{ lineaId: string; cantidad: number }>; items: PrendaNueva[]
  pagos: Array<{ cuenta: number; base?: number }>; total: number; desde?: string | null; pago?: string | null; comprobante?: string | null; cliente?: ClienteCambio | null; saldo?: number
}) =>
  pedir<RespuestaCambio>(post({ accion: 'cambiar', marca, ...c }), '', 'No se pudo registrar el cambio.')
