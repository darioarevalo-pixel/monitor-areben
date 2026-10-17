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
export type FilaPrecio = { lista: string; nombre: string; precio: number | null; fuente: string | null; desde: string | null; usuario: string | null; motivo: string | null; deLista: string | null; sigue: string | null; puedeSoltar: boolean }
export type PrecioDeProducto = {
  producto: string; nombre: string | null; skus: number; tnLeidaEn: string | null
  listas: FilaPrecio[]
  costo: { costo: number | null; proveedor: string | null; proveedorId: string | null; fuente: string; desde: string; usuario: string; motivo: string | null } | null
  gn: { precio: number | null; mayorista: number | null; costo: number | null } | null
  tn: { tienda: string; variantes: number; precio: number | null; promocional: number | null; cobra: number | null; costo: number | null; distintos: boolean } | null
  avisos: string[]
  historial: Array<{ que: 'precio' | 'costo'; lista: string | null; valor: number | null; fuente: string; desde: string; usuario: string; motivo: string | null; proveedor?: string | null }>
}
export const leerPrecioDeProducto = (marca: MarcaErp, producto: string) =>
  pedir<PrecioDeProducto>(null, `&vista=precio&marca=${marca}&producto=${producto}&nc=${Date.now()}`, 'No se pudo leer el precio.')

/** Cargar un precio (de una lista) o el costo en el ERP: una fila nueva, ⛔ toca GN ni TN. */
export type CargaPrecio = { que: 'precio' | 'costo'; producto: string; monto: number; lista?: string; desde?: string; motivo?: string; proveedor?: string; proveedorId?: string }
export const cargarPrecioCosto = (marca: MarcaErp, c: CargaPrecio) =>
  pedir<{ ok: true; futuro: boolean; aviso: string | null }>(post({ accion: c.que === 'precio' ? 'cargar-precio' : 'cargar-costo', marca, ...c }), '', 'No se pudo cargar.')

/** El precio cargado de una lista vuelve a seguir a la suya (motor sql/018): una fila nueva, la carga queda en el historial. */
export const soltarPrecio = (marca: MarcaErp, s: { producto: string; lista: string; motivo?: string }) =>
  pedir<{ ok: true; precio: number | null; deLista: string | null }>(post({ accion: 'soltar-precio', marca, ...s }), '', 'No se pudo volver a seguir.')

/** Los proveedores del ERP (sql/013) para elegir en el costo. Sin la tabla, el API contesta 409 y se escribe el texto. */
export type ProveedorErp = { id: string; nombre: string; cuit: string | null; nombreGn: string | null; productos: number; activo: boolean }
export const leerProveedores = (marca: MarcaErp) =>
  pedir<{ proveedores: ProveedorErp[] }>(null, `&vista=proveedores&marca=${marca}&nc=${Date.now()}`, 'No se pudieron leer los proveedores.')
export const guardarProveedor = (marca: MarcaErp, p: { nombre: string; cuit?: string }) =>
  pedir<{ ok: true; yaExistia: boolean; proveedor: { id: string; nombre: string; cuit: string | null } }>(post({ accion: 'guardar-proveedor', marca, ...p }), '', 'No se pudo guardar el proveedor.')

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
  /** La factura ya se anuló con nota de crédito. */
  conNotaDeCredito: boolean
  /** Las NC atadas ya acreditan la factura entera (⇒ ⛔ se ofrece otra). */
  acreditadaEntera: boolean
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

/** Una ficha de clienta (contrato §11) para la factura A: lo que la Caja completa sola. */
export type Clienta = { doc: string; nombre: string; razonSocial: string | null; domicilio: string | null; condicion: 'ri' | 'monotributo' | null }
export const buscarClientas = (marca: MarcaErp, q: string) =>
  pedir<{ clientas: Clienta[] }>(null, `&vista=clientas&marca=${marca}&q=${encodeURIComponent(q)}`, 'No se pudo buscar la clienta.')

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

/** La factura a pedido de una venta propia (`erp › Caja`). B sin documento = consumidor final sin identificar. */
export type PedidoFactura = {
  ventaId: string; clase: 'A' | 'B'; doc?: string; condicion?: 'ri' | 'monotributo'; razonSocial?: string; domicilio?: string; reimprimir?: boolean
}
export const facturarVenta = (marca: MarcaErp, p: PedidoFactura) =>
  pedir<{ ok: true; yaEstaba: boolean; sinAtar: string | null; sinFicha?: string | null; factura: FacturaEmitida }>(post({ accion: 'facturar-venta', marca, ...p }), '', 'No se pudo facturar.')

/** Facturar un CAMBIO: NC por lo devuelto + factura por lo nuevo, con el receptor de la factura original. */
export type CambioFacturado =
  | { ok: true; simulado: true; clase: 'A' | 'B'; nc: number; factura: number; ncYa: boolean; facturaYa: boolean; sinFacturaOriginal?: boolean }
  | { ok: true; simulado?: false; yaEstaban: boolean; nc: FacturaEmitida | null; factura: FacturaEmitida | null; avisos: string[] }
export const facturarCambio = (marca: MarcaErp, ventaId: string, simular = false) =>
  pedir<CambioFacturado>(post({ accion: 'facturar-cambio', marca, ventaId, simular }), '', 'No se pudo facturar el cambio.')

/** La nota de crédito de una venta propia ANULADA que tenía factura (desde su ficha). */
export const notaDeCreditoDeVenta = (marca: MarcaErp, ventaId: string) =>
  pedir<{ ok: true; ambiente: string; sinAtar: string | null; autorizada: { id: string; numero: number; cae: string; total: number } }>(post({ accion: 'nota-credito-venta', marca, ventaId }), '', 'No se pudo hacer la nota de crédito.')

/** Las REGLAS COMERCIALES por forma de pago (motor sql/016, `api/_erp-reglas.js`). La cuenta la hace el núcleo del motor. */
export type MedioRegla = 'efectivo' | 'transferencia' | 'debito' | 'credito'
export type ReglaComercial = {
  id?: string; nombre: string; fin: string | null; marca?: string; canal: 'local' | 'online'; campania: string | null
  alcance: 'todo' | 'categorias' | 'productos' | 'variantes'; alcance_ids: string[]; medios: MedioRegla[]
  banco: string | null; cuotas: number | null; monto_minimo: number | null
  efecto: 'descuento' | 'recargo' | 'final' | 'no'; pct: number | null
  desde: string | null; hasta: string | null; dias: number[] | null; activa: boolean; origen?: 'carga' | 'caja' | 'agenda'
  usuario?: string; actualizada_por?: string | null; actualizada_en?: string | null
}
export type ReglasDeMarca = {
  reglas: ReglaComercial[]; agenda: ReglaComercial[]
  caja: { reglas: ReglaComercial[]; avisos: string[]; feriaCampanias: string[]; diferencias: { sinTraer: boolean; faltan: string[]; sobran: string[] } }
  campanias: Array<{ id: string; nombre: string; estado: string; feria: boolean }>
  /** Parte 3: si la Caja cobra con las reglas (con qué copia, si está al día, y lo que la Caja no puede cobrar). */
  cobraConReglas: { prendida: boolean; copiadasEn: string | null; por: string | null; alDia: boolean; noCobra: Array<{ id: string; nombre: string; porque: string }> }
}
/** Lo que pasó con la copia de la Caja al guardar una regla (null: la Caja no cobra con las reglas). */
export type CopiaEnCaja = { copiadas: number } | { error: string } | null
export type PagoSimulado = {
  medio: MedioRegla; renglones: number[]; base: number; rebaja: number; pct: number; descuento: number; redondeo: number; monto: number
  regla: { id: string | null; nombre: string } | null; juego: string; perdieron: Array<{ id: string | null; nombre: string; efecto: string }>
}
export type FormaSimulada = { medio: MedioRegla; ok: true; subtotal: number; aVenta: number; total: number; pagos: PagoSimulado[] } | { medio: MedioRegla; ok: false; error: string }
export type Simulacion = {
  renglones: Array<{ product_id: number; nombre: string; cantidad: number; precio: number; precioCargado: number; precioDeCampania: number | null; campanias: string[]; categorias: string[] }>
  formas: FormaSimulada[]; fecha: string; canal: string; redondeo: number
}
export type PrendaASimular = { producto: string | null; nombre: string; precio: string; cantidad: number; campanias?: string[]; categorias?: string[]; linea?: 'stunned' }
export type PedidoSimulacion = { renglones: PrendaASimular[]; fecha?: string; canal: 'local' | 'online'; banco?: string; cuotas?: number; rebaja?: { tipo: 'pct' | 'pesos'; valor: string } | null; borrador?: ReglaComercial | null }

export const leerReglas = (marca: MarcaErp) =>
  pedir<ReglasDeMarca>(null, `&vista=reglas&marca=${marca}&nc=${Date.now()}`, 'No se pudieron leer las reglas.')
export const guardarRegla = (marca: MarcaErp, regla: ReglaComercial) =>
  pedir<{ ok: true; regla: ReglaComercial; nueva: boolean; caja: CopiaEnCaja }>(post({ accion: 'guardar-regla', marca, regla }), '', 'No se pudo guardar la regla.')
export const traerReglasDeCaja = (marca: MarcaErp, escribir: boolean) =>
  pedir<{ ok: true; sembradas: number; yaEstaban: number; seco: boolean; reglas: ReglaComercial[]; avisos: string[]; caja: CopiaEnCaja }>(post({ accion: 'sembrar-reglas', marca, escribir }), '', 'No se pudieron traer las reglas de la Caja.')
export const prenderCajaReglas = (marca: MarcaErp, prender: boolean) =>
  pedir<{ ok: true; prendida: boolean; copiadas?: number }>(post({ accion: 'prender-caja-reglas', marca, prender }), '', 'No se pudo cambiar con qué cobra la Caja.')
export const simularReglas = (marca: MarcaErp, p: PedidoSimulacion) =>
  pedir<Simulacion>(post({ accion: 'simular-reglas', marca, ...p }), '', 'No se pudo simular.')
