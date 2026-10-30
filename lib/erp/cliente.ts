/**
 * ERP, del lado del navegador (`/api/datos?recurso=erp`). Qué ventas se pueden facturar, el techo y
 * el monto de cada factura los decide el SERVIDOR (`api/_erp.js`): de acá sólo viajan los ids.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { FacturaEmitida } from '@/lib/arca/factura-pdf'
import { armarFilasClientes, deTupla } from '@/lib/erp/clientes-lista.core.js'
import { diaArgentino } from '@/lib/envios/portal.core.js'

export type MarcaErp = 'bdi' | 'zattia'

/** `numero`/`cliente`: los de la venta en GN, sólo para mostrar (null si ⛔ se encontró). */
/** `linea`: la de la venta (Zattia/Stunned por sus renglones; en BDI, bdi). */
export type VentaParaFacturar = { marca: MarcaErp; linea?: string; ventaId: string; fecha: string; monto: number; cuentas: string[]; numero?: string | null; cliente?: string | null }
/** Una factura de GN del mes (`ventas_factura_gn`: la fecha es el día de la VENTA, GN ⛔ da el de la factura). */
export type FacturaGN = {
  marca: MarcaErp; linea?: string; ventaId: string; numero: string; tipo: string | null; cae: string | null; estado: string | null; fecha: string | null; monto: number
  venta: { numero: string | null; cliente: string | null }
}

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
  facturasGN?: FacturaGN[]
  porPedido: number
  puntosDeVenta: Partial<Record<MarcaErp | 'stunned', number | null>>
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
  if (!r.ok) throw Object.assign(new Error((j && j.error) || fallo), { codigo: (j && j.codigo) as string | undefined, datos: j })
  return j as T
}

const post = (body: Record<string, unknown>) => ({
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recurso: 'erp', ...body }),
})

export const leerMes = (mes: string) =>
  pedir<MesFacturacion>(null, `&vista=facturacion&mes=${mes}&nc=${Date.now()}`, 'No se pudo leer la facturación del mes.')

export const leerFacturas = (mes: string) =>
  pedir<{ ambiente: string; facturas: FacturaEmitida[] }>(null, `&vista=facturas&mes=${mes}&nc=${Date.now()}`, 'No se pudieron leer las facturas del mes.')

/** Un lote es de UNA línea: el servidor rechaza las ventas de la otra y factura con el punto de venta de ésta. */
export const facturar = (mes: string, marca: MarcaErp, linea: string, ventaIds: string[]) =>
  pedir<ResultadoLote>(post({ accion: 'facturar', mes, marca, linea, ventaIds }), '', 'No se pudo facturar.')

export const notaDeCredito = (facturaId: string) =>
  pedir<{ ambiente: string; autorizada: { numero: number; cae: string; total: number } }>(post({ accion: 'nota-credito', facturaId }), '', 'No se pudo hacer la nota de crédito.')

export const notaDeDebito = (facturaId: string, monto: number) =>
  pedir<{ ambiente: string; autorizada: { numero: number; cae: string; total: number } }>(post({ accion: 'nota-debito', facturaId, monto }), '', 'No se pudo hacer la nota de débito.')

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
  /** El precio de su campaña de Liquidación si la prenda es de feria: lo que cobra el local (⛔ el de la lista). */
  feria: number | null
  costo: { costo: number | null; proveedor: string | null; proveedorId: string | null; fuente: string; desde: string; usuario: string; motivo: string | null } | null
  /** El proveedor del PRODUCTO: el de su última OC de Ingresos o, si ⛔ entró por ninguna, el texto de GN. */
  proveedor: { id: string; nombre: string; origen: 'ingresos' | 'gn'; oc: { label: string | null; /** AAAA-MM-DD */ fecha: string } | null } | null
  gn: { precio: number | null; mayorista: number | null; costo?: number | null } | null
  tn: { tienda: string; variantes: number; precio: number | null; promocional: number | null; cobra: number | null; costo?: number | null; distintos: boolean } | null
  avisos: string[]
  /** ¿Vino el costo? Sin `costos` (todos menos Admin y Administración) el servidor ⛔ lo manda: ni el del ERP, ni GN, ni TN, ni su historial. */
  costos: boolean
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

/** Editar el producto en el ERP (motor sql/037; `api/_erp-catalogo.js`, sólo Admin). Cada cambio deja antes → después en `catalogo_edicion`. */
export type CambioCatalogo = { campo: string; antes: string | null; despues: string | null }
export type ResultadoEdicion = { ok: true; cambios: CambioCatalogo[]; desde_gn: boolean; variante: unknown; avisos: { codigo: string; texto: string }[] }
export const editarProductoErp = (marca: MarcaErp, productId: string, cambios: { nombre?: string; categoria?: string | null; activo?: boolean }) =>
  pedir<ResultadoEdicion>(post({ accion: 'producto-editar', marca, productId, cambios }), '', 'No se pudo editar el producto.')
export const editarVarianteErp = (marca: MarcaErp, productId: string, sizeId: string, cambios: { talle?: string; sku?: string | null; barcode?: string | null }) =>
  pedir<ResultadoEdicion>(post({ accion: 'variante-editar', marca, productId, sizeId, cambios }), '', 'No se pudo editar la variante.')
export const agregarVarianteErp = (marca: MarcaErp, productId: string, v: { talle: string; sku?: string; barcode?: string }) =>
  pedir<ResultadoEdicion>(post({ accion: 'variante-agregar', marca, productId, ...v }), '', 'No se pudo agregar la variante.')
export type HechoEdicion = { entidad: string; size_id: string | null; campo: string; antes: string | null; despues: string | null; usuario: string; creada_en: string; desde_gn: boolean }
export const leerHistorialDeEdicion = (marca: MarcaErp, productId: string) =>
  pedir<{ historial: HechoEdicion[] }>(null, `&vista=producto-historial&marca=${marca}&productId=${productId}&nc=${Date.now()}`, 'No se pudo leer el historial de ediciones.')

/** Los proveedores del ERP (sql/013) para elegir en el costo. Sin la tabla, el API contesta 409 y se escribe el texto. */
export type ProveedorErp = { id: string; nombre: string; cuit: string | null; nombreGn: string | null; productos: number; activo: boolean }
/** De UNA línea (30-oct): en Zattia, sin `linea`, el servidor contesta 400. `elegir` («Cargar costo») suma los que todavía ⛔ tienen productos. */
export const leerProveedores = (marca: MarcaErp, linea: LineaErp, elegir = false) =>
  pedir<{ proveedores: ProveedorErp[] }>(null, `&vista=proveedores&marca=${marca}&linea=${linea}${elegir ? '&elegir=1' : ''}&nc=${Date.now()}`, 'No se pudieron leer los proveedores.')
export const guardarProveedor = (marca: MarcaErp, p: { nombre: string; cuit?: string }) =>
  pedir<{ ok: true; yaExistia: boolean; proveedor: { id: string; nombre: string; cuit: string | null } }>(post({ accion: 'guardar-proveedor', marca, ...p }), '', 'No se pudo guardar el proveedor.')

export const buscarPrendas = (marca: MarcaErp, q: string) =>
  pedir<{ variantes: PrendaEncontrada[]; cortado: boolean }>(null, `&vista=stock&marca=${marca}&q=${encodeURIComponent(q)}`, 'No se pudo buscar.')

export const leerStockDePrenda = (marca: MarcaErp, producto: string, talle: string) =>
  pedir<StockDePrenda>(null, `&vista=stock&marca=${marca}&producto=${producto}&talle=${talle}&nc=${Date.now()}`, 'No se pudo leer el stock del producto.')

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

export type TiendaErp = 'bdi' | 'zattia' | 'stunned'
export type FilaConciliacion = {
  tipo: string; clase: string; clave: string; dias: number
  producto: string | null; talle: string | null; nombre: string | null; talleNombre: string | null; sku: string | null
  tn: number | null; erp: number | null; gn: number | null; reservado: number
  numero: string | null; estado: string | null; medio: string | null; total: number | null; totalErp: number | null; motivo: string | null; link: string | null
}
export type ConciliacionDelDia = {
  sinTablas: boolean; fecha: string | null; dias: string[]; calculadoEn: string | null
  grupos: Array<{ tipo: string; clase: string; nombre: string; mirar: string; filas: FilaConciliacion[]; deAntes: number }>
  tarjetas: Array<{ tipo: string; nombre: string; unidad: string; calculado: boolean; total: number | null; cierran?: number | null; aparte?: number; noCierran?: number }>
  gn: { calculado: boolean; sinExplicar: number | null }
  enVuelo: number; desconocidas: number; noCierran: number
}

export const leerConciliacion = (tienda: TiendaErp, fecha: string | null) =>
  pedir<ConciliacionDelDia>(null, `&vista=conciliacion&tienda=${tienda}${fecha ? `&fecha=${fecha}` : ''}&nc=${Date.now()}`, 'No se pudo leer la conciliación del día.')

export type LineaErp = TiendaErp
export type AvisoAjuste = { codigo: string; texto: string }
export type FilaAContar = {
  clave: string; producto: string; talle: string; nombre: string | null; talleNombre: string | null; sku: string | null
  fuente: 'conciliacion' | 'contar'; donde: string[]; tienda: number | null; erp: number | null; gn: number | null; dias: number | null
  venta: { numero: number; autoriza: string | null; ocurridaEn: string } | null; deposito: string
  ajuste: { numero: number; estado: string; deposito: string } | null
}
export type RenglonAjuste = {
  n: number; producto: string; talle: string; sku: string | null; nombre: string | null; talleNombre: string | null
  antes: number; contado: number | null; diferencia: number; despues: number; ahora: number | null
}
export type AjusteStock = {
  id: string; numero: number; linea: string; deposito: string; motivo: string; motivoNombre: string; detalle: string | null
  fuente: string; estado: 'para_aprobar' | 'aplicado' | 'rechazado'; creadoPor: string; creadoEn: string
  resueltoPor: string | null; resueltoEn: string | null; rechazo: string | null; neto: number; renglones: RenglonAjuste[]; seMovio: number
}
export type AjustesDeLinea = { fecha: string | null; sinConciliacion: boolean; pendientes: FilaAContar[]; enAjuste: FilaAContar[]; ajustes: AjusteStock[] }
export type RenglonNuevo = { producto: string; talle: string; sku?: string | null; barcode?: string | null; contado?: number; cantidad?: number }

export const leerAjustes = (linea: LineaErp) =>
  pedir<AjustesDeLinea>(null, `&vista=ajustes&linea=${linea}&nc=${Date.now()}`, 'No se pudieron leer los ajustes.')
export const crearAjuste = (a: { linea: LineaErp; deposito: string; motivo: string; detalle: string; fuente: string; renglones: RenglonNuevo[] }) =>
  pedir<{ ok: true; numero: number; id: string; renglones: number; avisos: AvisoAjuste[] }>(post({ accion: 'crear-ajuste', ...a }), '', 'No se pudo preparar el ajuste.')
export const aprobarAjuste = (linea: LineaErp, ajusteId: string) =>
  pedir<{ ok: true; numero: number; movimientos: number; avisos: AvisoAjuste[] }>(post({ accion: 'aprobar-ajuste', linea, ajusteId }), '', 'No se pudo aprobar el ajuste.')
export const descartarAjuste = (linea: LineaErp, ajusteId: string, motivo: string) =>
  pedir<{ ok: true; numero: number }>(post({ accion: 'descartar-ajuste', linea, ajusteId, motivo }), '', 'No se pudo descartar el ajuste.')


export type VentaPropia = {
  id: string; numero: number; marca: 'bdi' | 'zattia' | 'stunned'; tipo: 'venta' | 'cambio'; estado: 'confirmada' | 'anulada'
  origen: string; canal: string; deposito: string; total: number; prueba: boolean; ocurridaEn: string; cliente: string | null
}

export type FichaDeVenta = {
  /** La compra a cuenta la cargó GN a un cliente sin crédito (`detalle.cuenta_autoriza.motivo = 'gn'`). */
  sinCreditoGN?: boolean
  venta: VentaPropia & { subtotal: number; usuario: string; registradaEn: string; origenRef: string; gnSaleId: string | null; ventaOriginalId: string | null }
  cliente: { nombre: string | null; doc: string | null; email: string | null; whatsapp: string | null } | null
  lineas: Array<{
    id: string; n: number; producto: string; talle: string; nombre: string | null; talleNombre: string | null; sku: string | null
    cantidad: number; precio: number; descuento: number; rebaja: number; importe: number; devuelta: boolean; lineaOrigenId: string | null
    /** Unidades de esta línea que ya volvieron en cambios confirmados. */
    cambiado: number
    /** El código de barras de la prenda (espejo `inventario`): lo que se escanea en el desarme. */
    codigo: string | null
  }>
  pagos: Array<{ cuenta: string | null; medio: string | null; monto: number; base: number | null; porcentaje: number | null }>
  anulacion: { motivo: string; usuario: string; anuladaEn: string; devolucion: unknown; vuelta: Vuelta } | null
  /** §17: lo que se devuelve al anular y si la prenda ya volvió (null = el servidor viejo ⛔ lo manda). */
  devolucion: DevolucionDeVenta | null
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
/** Para REIMPRIMIR desde ERP › Ventas (29-oct): la fila de la Caja si la venta es de ahí, y de qué venta salió un cambio. */
export type TicketDeVentaErp = { cajaVenta: import('@/lib/caja/cliente').Venta | null; cambioDe: { sin_ticket?: boolean; numero?: string | number; gn_venta?: string | number; venta_id?: string } | null }
export const leerTicketDeVenta = (marca: MarcaErp, id: string) =>
  pedir<TicketDeVentaErp>(null, `&vista=ticket&marca=${marca}&id=${id}&nc=${Date.now()}`, 'No se pudo leer el ticket de la venta.')

/** Adónde va la prenda de una anulación (37a): al instante, «a desarmar» (empaquetado) o «a recibir» (ya salió). */
export type Vuelta = 'ya' | 'a_desarmar' | 'a_recibir'

export type DevolucionDeVenta = {
  /** La base tiene la 028 (devoluciones propias). */
  conDevolucion: boolean
  /** La llave `DEVOLUCION_CON_PIN` de la marca (apagada). */
  pin: boolean
  vueltaSiAnula: Vuelta
  /** Lo pagado en plata (⛔ saldo ni cuenta corriente): lo que vuelve con «la plata». */
  pagadoEnPlata: number
  /** Lo mismo a precio de lista: lo que queda con «saldo a favor». */
  aLista: number
  devoluciones: Array<{ forma: 'plata' | 'saldo'; cuenta: string | null; medio: string | null; monto: number; usuario: string; en: string }>
  volvio: { usuario: string; en: string } | null
}

export const anularVenta = (marca: MarcaErp, ventaId: string, motivo: string, devolucion: { forma: 'plata' | 'saldo' }, cliente?: { doc: string; nombre: string }) =>
  pedir<{ ok: true; movimientos: number; ncPendiente: boolean; vuelta: Vuelta; devolucion: { forma: string; monto: number; pagos: Array<{ medio: string | null; monto: number }> } | null; saldo: number | null }>(
    post({ accion: 'anular', marca, ventaId, motivo, devolucion, ...(cliente ? { cliente } : {}) }), '', 'No se pudo anular.')

/** §17 Las prendas de la anulada volvieron (se escaneó el desarme): el libro las suma. */
export const confirmarVuelta = (marca: MarcaErp, ventaId: string) =>
  pedir<{ ok: true; movimientos: number; vuelta: Vuelta }>(post({ accion: 'confirmar-vuelta', marca, ventaId }), '', 'No se pudo confirmar el desarme.')

/** Lo que se lleva en un cambio: la forma de `ItemCaja` de la Caja (el servidor lo arma con `renglones`). */
export type PrendaNueva = { product_id: number; size_id: number; cantidad: number; precio: number; sku?: string | null }

/** Una ficha de clienta (contrato §11) para la factura A: lo que la Caja completa sola. */
export type Clienta = { doc: string | null; nombre: string; razonSocial: string | null; domicilio: string | null; condicion: 'ri' | 'monotributo' | null }
/** Sin `linea`, las fichas de la empresa (factura A, Cargar venta: ELIGEN una); con ella, sólo las de esa línea (el ⌘K). */
export const buscarClientas = (marca: MarcaErp, q: string, linea?: 'zattia' | 'stunned') =>
  pedir<{ clientas: Clienta[] }>(null, `&vista=clientas&marca=${marca}&q=${encodeURIComponent(q)}${linea ? `&linea=${linea}` : ''}`, 'No se pudo buscar la clienta.')

/** El saldo a favor de una clienta en el libro de la venta que se cambia (`prueba` de esa venta). */
export const leerSaldo = (marca: MarcaErp, doc: string, prueba = true, linea?: 'stunned') =>
  pedir<{ cliente: { nombre: string } | null; saldo: number }>(null, `&vista=saldo&marca=${marca}&doc=${encodeURIComponent(doc)}&prueba=${prueba ? 1 : 0}${linea ? `&linea=${linea}` : ''}&nc=${Date.now()}`, 'No se pudo leer el saldo.')

/**
 * Una venta de Gestión Nube para el cambio SUELTO de Stunned (`vista=venta-gn-cambio`): sólo sus productos, con lo que se pagó por
 * unidad (el servidor lo pone desde el espejo) y cuántos ya se cambiaron. `id` = el id o el número de la venta.
 */
export type VentaGnCambio = {
  venta: { id: string; numero: string | number; fecha: string | null; cliente: string | null; prueba: boolean }
  lineas: Array<{ product_id: number; size_id: number; sku: string | null; nombre: string | null; talle: string | null; cantidad: number; precio: number; cambiado: number }>
}
export const leerVentaGnCambio = (id: string) =>
  pedir<VentaGnCambio>(null, `&vista=venta-gn-cambio&marca=zattia&id=${encodeURIComponent(id)}&nc=${Date.now()}`, 'No se pudo leer la venta de Gestión Nube.')

/** El PIN de la encargada, probado antes de seguir (el cambio sin ticket); el servidor lo vuelve a verificar al confirmar. */
export const verificarPin = (persona: string, pin: string) =>
  pedir<{ ok: true; persona: string }>(post({ accion: 'verificar-pin', marca: 'zattia', persona, pin }), '', 'No se pudo probar el PIN.')

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
export type DevueltaSuelta = { productId: number; sizeId: number; cantidad: number; sku?: string | null; precio?: number }
export const cambiarVenta = (marca: MarcaErp, c: {
  id: string
  /** Una venta del ERP (con `lineaId` en cada devuelta), o ⛔ ninguna: el cambio SUELTO de Stunned. */
  ventaId?: string
  /** El cambio SUELTO: una venta de Gestión Nube (el servidor pone el precio pagado) o, con `sinTicket`, ninguna (precio de la cajera + PIN). */
  gnVentaId?: string; sinTicket?: boolean; pin?: string; pinPersona?: string
  devueltas: Array<{ lineaId: string; cantidad: number } | DevueltaSuelta>; items: PrendaNueva[]
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

/** ERP › Cuentas de cobro (motor sql/019-020): qué cuenta REAL recibe cada medio, por línea × canal, desde un momento. */
export type MedioRuta = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'mp' | 'pagonube'
export type CanalRuta = 'local' | 'online' | 'mayorista' | 'ml'
export type CuentaReal = { id: string; titular: 'areben' | 'bruno' | 'dario' | 'tercero'; nombre: string; banco: string | null; tipo: string }
export type RutaCobro = {
  id: string; marca: string; canal: CanalRuta; medio: MedioRuta; cuenta_real_id: string | null; tasa: number | null; dias_acreditacion: number | null
  desde: string; puesta_por: string; puesta_en: string; cuenta_titular?: CuentaReal['titular'] | null; cuenta_nombre?: string | null; cuenta_banco?: string | null
}
export type FilaDeRuta = {
  canal: CanalRuta; medio: MedioRuta; vigente: RutaCobro | null; proxima: RutaCobro | null
  cuenta: { id: string; titular: CuentaReal['titular']; nombre: string; banco: string | null } | null
  /** null: sin ruta, o «se elige en cada cobro». */
  factura: boolean | null
  aviso: string | null
}
export type RutasDeMarca = {
  lineas: Array<{ linea: string; filas: FilaDeRuta[] }>
  cuentas: CuentaReal[]; reglas: ReglaComercial[]; historial: RutaCobro[]; cuentasCopiadasEn: string | null
}
export type RutaAPoner = { linea: string; canal: CanalRuta; medio: MedioRuta; cuenta_real_id: string | null; tasa: string; dias_acreditacion: string; desde?: string }

// ── ERP › Configuración › Cuentas y Marcas, depósitos y puntos de venta (sólo lectura; `api/_erp-estructura.js`) ──
export type EstructuraDeMarca = {
  empresas: Array<{ id: string; razon_social: string | null; cuit: string | null; condicion_iva: string | null; ingresos_brutos: string | null }>
  marcas: Array<{ id: string; empresa_id: string; nombre: string | null; tienda: string | null; nombre_fiscal: string | null; punto_venta: number | null; domicilio_fiscal: string | null; inicio_actividades: string | null }>
  depositos: Array<{ marca: string; id: string; nombre: string; vende: boolean; gn_store_id: string | null }>
  cuentas: Array<{ id: string; titular: string | null; nombre: string; banco: string | null; tipo: string | null; activa: boolean; copiada_en: string | null }>
  rutas: Array<{ marca: string; canal: string; medio: string; cuenta_real_id: string | null }>
  cuentasCopiadasEn: string | null
}
export const leerEstructura = (marca: MarcaErp) =>
  pedir<EstructuraDeMarca>(null, `&vista=estructura&marca=${marca}&nc=${Date.now()}`, 'No se pudo leer la configuración.')

export const leerRutas = (marca: MarcaErp) =>
  pedir<RutasDeMarca>(null, `&vista=rutas&marca=${marca}&nc=${Date.now()}`, 'No se pudieron leer las cuentas de cobro.')
export const ponerRuta = (marca: MarcaErp, ruta: RutaAPoner) =>
  pedir<{ ok: true; ruta: { id: string; desde: string }; aviso: string | null }>(post({ accion: 'poner-ruta', marca, ...ruta }), '', 'No se pudo cambiar la cuenta.')

/** Lo que el perfil puede en el ERP, por marca (`permisosErp`): ocultar el botón que el servidor va a rechazar. */
export type PermisosErp = Record<MarcaErp, Record<string, boolean>>
export const leerPermisos = () =>
  pedir<{ permisos: PermisosErp }>(null, `&vista=permisos&nc=${Date.now()}`, 'No se pudieron leer los permisos.')

/** ERP › Configuración › Redondeo (motor sql/029): a cuánto se redondea el precio de cada canal, por línea, desde un momento. */
export type ModoRedondeo = 'cercano' | 'abajo' | 'arriba'
export type RedondeoPuesto = { paso: number; modo: ModoRedondeo; desde: string }
export type FilaDeRedondeo = { canal: CanalRuta; vigente: RedondeoPuesto | null; proximo: RedondeoPuesto | null }
export type CambioDeRedondeo = { id: string; marca: string; canal: CanalRuta; paso: number; modo: ModoRedondeo; desde: string; puesto_por: string; puesto_en: string }
export type RedondeoDeMarca = { lineas: Array<{ linea: string; filas: FilaDeRedondeo[] }>; historial: CambioDeRedondeo[] }
export type RedondeoAPoner = { linea: string; canal: CanalRuta; paso: number; modo: ModoRedondeo; desde?: string }
export const leerRedondeo = (marca: MarcaErp) =>
  pedir<RedondeoDeMarca>(null, `&vista=redondeo&marca=${marca}&nc=${Date.now()}`, 'No se pudo leer el redondeo.')
export const ponerRedondeo = (marca: MarcaErp, redondeo: RedondeoAPoner) =>
  pedir<{ ok: true; id: string }>(post({ accion: 'poner-redondeo', marca, ...redondeo }), '', 'No se pudo cambiar el redondeo.')

// ── ERP › Ventas, el PILOTO del diseño (lista + ficha; `api/_erp-ventas.js`, núcleo `lib/erp/ventas-lista.core.js`) ──

export type FilaVentaLista = {
  kind: 'venta' | 'pedido'; id: string; numero: number | null; ref: string; linea: string; origen: string; canal?: string | null; tipo: 'venta' | 'cambio'
  ocurridaEn: string
  /** La fecha que se MUESTRA: la del pedido (en TN, cuando entró; si no, la de la venta). Bruno, 19-oct. */
  pedidoEn: string
  cliente: string; clienteDe: 'erp' | 'gn' | 'tn' | 'falta' | null; clienteId: string | null; total: number; saldo: number
  estadoKey: string; cobroKey: string; origenTexto: string; vendio: string
  factura: { numero: string; de: 'erp' | 'gn' } | null; facturada: boolean
  nota: { id: string; texto: string; de: string } | null; entrega: { tipo: string; direccion?: string } | null
  prueba: boolean; anulada: boolean; tieneCambio?: boolean; link: string | null; unidades: number | null; busca: string
  /** Sólo los pedidos sin pagar: hace cuántos días entró, el medio que eligió y las prendas que retiene. */
  dias?: number | null; medio?: string | null; prendas?: Array<{ nombre: string | null; sku: string | null; cantidad: number }>
  /** Cerrado en TN sin pago: ⛔ retiene stock, se muestra «entregado sin cobrar». */
  entregadoSinCobrar?: boolean
}
export type QueSabeElMotor = { editar: boolean; notas: boolean; cobrar: boolean; corregir?: boolean; corregirMedio?: boolean }
export const leerListaDeVentas = (marca: MarcaErp, desde: string, hasta: string, linea: '' | 'zattia' | 'stunned' = '') =>
  pedir<{ filas: FilaVentaLista[]; desde: string; hasta: string; puede: QueSabeElMotor; tnLeidaEn?: string | null }>(null, `&vista=ventas-lista&marca=${marca}&desde=${desde}&hasta=${hasta}${linea ? `&linea=${linea}` : ''}&nc=${Date.now()}`, 'No se pudieron leer las ventas.')

export type ExtraDeVenta = {
  clienteGn: string | null; gnNumero: string | null; gnEstado: string | null; clienteId: string | null
  vendedor: string | null; entrega: { tipo: 'retira' | 'envio' | 'cadete'; direccion?: string } | null; facturar: { doc: string; condicion_iva: number } | null
  tn: { numero: number; estado: string | null; envioTipo: string | null; creadaEn: string; actualizadaEn: string | null; link: string | null } | null
  /** Logística cobró al entregar (sql/039): quién, cuándo, con qué medio; la transferencia queda por verificar. */
  cobroEnEntrega?: { entrego: string | null; fecha: string | null; formaPago: 'efectivo' | 'transferencia' | 'ya_pagado' | null; porVerificar: boolean } | null
  facturas: Array<{ numero: string; tipo: 'factura' | 'nc'; de: 'erp' | 'gn'; cuando: string | null }>
  cuentas: Array<{ id: string; nombre: string; medio: string }>
  /** ERP › Cuentas para el canal de la venta: adónde va cada medio (la vigente es la de `desde` más nuevo ≤ hoy) y las cuentas reales. */
  rutas?: Array<{ marca: string; canal: string; medio: string; cuenta_real_id: string | null; desde: string }>
  cuentasReales?: Array<{ id: string; titular: string | null; nombre: string; banco: string | null }>
  ediciones: Array<{ campo: string; antes: string; despues: string; usuario: string; cuando: string }>
  notas: Array<{ cuando: string; texto: string; de: string; reemplaza: string | null }>
  nota: { id: string; texto: string; de: string } | null
  /** Correcciones de precio (motor sql/036): la diferencia contra lo cobrado queda a la vista, ⛔ se mueve plata sola. */
  correcciones?: {
    correcciones: Array<{ id: string; motivo: string; usuario: string; creada_en: string; total_antes: number; total_despues: number; cobrado: number; diferencia: number
      lineas: Array<{ n: number; precio_antes: number; precio_despues: number }> }>
    total: number | null; cobrado: number | null; diferencia: number
  }
  /** null = el motor contestó; si no, por qué el historial ⛔ trae ediciones ni notas. */
  motor: string | null
}
export const leerExtraDeVenta = (marca: MarcaErp, id: string) =>
  pedir<ExtraDeVenta>(null, `&vista=venta-extra&marca=${marca}&id=${id}&nc=${Date.now()}`, 'No se pudo leer el historial.')

export type CambiosDeVenta = {
  cliente_id?: string | null; vendedor?: string | null
  entrega?: { tipo: 'retira' | 'envio' | 'cadete'; direccion?: string } | null
  facturar?: { doc: string; condicion_iva: 1 | 4 | 5 | 6 } | null
}
export const editarVentaErp = (marca: MarcaErp, ventaId: string, cambios: CambiosDeVenta, clienteDoc?: string | null) =>
  pedir<{ ok: true; ediciones: unknown[] }>(post({ accion: 'editar-venta', marca, ventaId, cambios, clienteDoc: clienteDoc ?? null }), '', 'No se pudo guardar.')
export type CorreccionHecha = { total_antes: number; total_despues: number; cobrado: number; diferencia: number }
export const corregirPrecioDeVenta = (marca: MarcaErp, ventaId: string, motivo: string, lineas: Array<{ n: number; precio: number }>) =>
  pedir<{ ok: true; correccion: CorreccionHecha }>(post({ accion: 'corregir-precio', marca, ventaId, motivo, lineas }), '', 'No se pudo corregir el precio.')
export type MedioCorregido = { medio_antes: string; medio_despues: string; cuenta_antes: string; cuenta_despues: string; monto: number; comision_despues: number | null }
export const corregirMedioDeVenta = (marca: MarcaErp, ventaId: string, c: { medio: string; motivo: string; pagoId?: string; cuenta?: string | number; cuentaReal?: string }) =>
  pedir<{ ok: true; correccion: MedioCorregido; avisos: string[] }>(post({ accion: 'corregir-medio', marca, ventaId, ...c }), '', 'No se pudo corregir la forma de pago.')
export const guardarNotaDeVenta = (marca: MarcaErp, ventaId: string, texto: string, reemplazaId: string | null) =>
  pedir<{ ok: true }>(post({ accion: 'nota-venta', marca, ventaId, texto, reemplazaId }), '', 'No se pudo guardar la nota.')
export const cobrarVentaErp = (marca: MarcaErp, c: { ventaId: string; clienteId: string; linea: string; monto: number; saldo: number; cuenta: string; canal: string | null; fecha: string; ref: string; prueba: boolean }) =>
  pedir<{ ok: true; cuenta: unknown }>(post({ accion: 'cobrar-venta', marca, ...c }), '', 'No se pudo registrar el cobro.')

// ── ERP › Stock › Stock, con el molde (lista + ficha; `api/_erp-stock.js`, núcleo `lib/erp/stock-lista.core.js`) ──
export type FilaStock = {
  id: string; producto: string; talle: string; nombre: string; talleNombre: string; sku: string | null; barcode: string | null
  linea: string
  /** Lo que dice el libro en cada depósito de la base. */
  deps: Record<string, number>
  estanteria: number; enPedidos: number; disponible: number; gn: number | null; negativo: boolean
  ultimo: { tipo: string; origen: string; ref: string | null; cuando: string } | null
}
export type ListaDeStock = { filas: FilaStock[]; libroHasta: string | null; pedidosLeidosEn: string | null; pedidos: number; sinVariante: number; sinVariantePorTienda?: Record<string, number> }
export const leerListaDeStock = (marca: MarcaErp) =>
  pedir<ListaDeStock>(null, `&vista=stock-lista&marca=${marca}&nc=${Date.now()}`, 'No se pudo leer el stock.')

// ── ERP › Stock › Comparación con TN y ML (`api/_erp-stock.js`, núcleo `lib/erp/comparacion.core.js`) ──
export type FilaComparacion = {
  id: string; tienda: 'bdi' | 'zattia' | 'stunned'; producto: string | null; talle: string | null
  nombre: string; talleNombre: string; sku: string | null; barcode: string | null
  /** Lo que la tienda tendría que mostrar según el ERP (libro de sus depósitos − pedidos sin pagar); null = sin producto en el ERP. */
  paraTienda: number | null; enPedidos: number; tn: number | null; gn: number | null; diferencia: number | null
  clase: string; oculta: boolean; repetidas: number
}
export type ComparacionTiendas = {
  filas: FilaComparacion[]; sinLimite: number; tnLeidas: Record<string, string>; ml: { fecha: string; noCierran: number } | null
  libroHasta: string | null; pedidosLeidosEn: string | null
}
export const leerComparacion = (marca: MarcaErp) =>
  pedir<ComparacionTiendas>(null, `&vista=comparacion&marca=${marca}&nc=${Date.now()}`, 'No se pudo leer la comparación con Tienda Nube.')

// ── ERP › Productos y precios › Productos (lista de TRABAJO; `api/_erp-productos.js`, núcleo `lib/erp/productos-lista.core.js`) ──
export type VarianteProducto = {
  talle: string; talleNombre: string; sku: string | null; barcode: string | null
  deps: Record<string, number>; estanteria: number; enPedidos: number; disponible: number
}
export type FilaProducto = {
  id: string; producto: string; nombre: string; linea: string; categoria: string | null; proveedor: string | null
  variantes: VarianteProducto[]; disponible: number; enPedidos: number; negativas: number
  /** El precio vigente de cada lista en el ERP (`precio_lista`): local · online · mayorista · oferta. */
  precios: Record<string, number | null>
  /** ⛔ viene si el perfil ⛔ ve costos (sólo Admin y Administración): lo corta el servidor. */
  costo?: number | null
  tn: 'publicado' | 'oculto' | 'no'
  sinBarra: boolean
  /** El último renglón del historial de precios (`copia` = lo trajo la copia de GN o TN, ⛔ una persona). */
  ultimoCambio: { lista: string; precio: number | null; cuando: string; quien: string | null; copia: boolean } | null
  /** Cambios de precio de verdad este mes (la copia inicial ⛔ cuenta). */
  cambiosMes: number
  /** La liquidación EN CURSO del monitor que lo tiene, con su precio. */
  liquidacion: { nombre: string; hasta: string | null; precio: number | null } | null
}
export type ListaDeProductos = {
  filas: FilaProducto[]; libroHasta: string | null; pedidosLeidosEn: string | null; tnLeidaEn: string | null
  /** El rol del motor ⛔ pudo leer las liquidaciones del monitor: la pantalla lo dice. */
  liquidacionesError?: string | null
  /** ¿Vino el costo? (`puedeErp(…, 'costos')`): sin él, la pantalla ⛔ muestra columna ni vista «Sin costo». */
  costos: boolean
}
export const leerListaDeProductos = (marca: MarcaErp) =>
  pedir<ListaDeProductos>(null, `&vista=productos-lista&marca=${marca}&nc=${Date.now()}`, 'No se pudieron leer los productos.')

// ── ERP › Stock › Movimientos (lista de REGISTRO del libro; `api/_erp-stock.js`, núcleo `lib/erp/movimientos.core.js`) ──
export type FilaMovimiento = {
  id: string; producto: string; talle: string; linea: string; nombre: string; talleNombre: string; sku: string | null; barcode: string | null
  cuando: string; horaExacta: boolean; tipo: string; tipoTexto: string; origen: string; deposito: string; depositoTexto: string
  /** Lo que movió (+ entra, − sale) y lo que quedó de la prenda en ese depósito después. */
  cantidad: number; queda: number; documento: string
  /** Quién, si el libro lo sabe por la venta o el ajuste; si ⛔ (`sistema`), de dónde vino. */
  quien: string; quienDe: 'persona' | 'sistema'; busca: string
}
export type ListaDeMovimientos = { filas: FilaMovimiento[]; desde: string; hasta: string; cortado: boolean; libroHasta: string | null }
export const leerMovimientos = (marca: MarcaErp, desde: string, hasta: string) =>
  pedir<ListaDeMovimientos>(null, `&vista=movimientos&marca=${marca}&desde=${desde}&hasta=${hasta}&nc=${Date.now()}`, 'No se pudieron leer los movimientos.')

// ── ERP › Ventas › Cobros (`api/_erp-cobros.js`, núcleo `lib/erp/cobros.core.js`; `cobrosDe` del motor, contrato §18) ──
export type CobroDelMotor = {
  id: string; origen: 'venta' | 'pago_a_cuenta' | 'devolucion'; fecha: string; en: string; clase: 'plata' | 'a_cuenta' | 'saldo'
  monto: number; medio: string | null; cuenta: { id: string; nombre: string }; cuenta_real: { id: string; nombre: string } | null
  venta: { id: string; numero: number; canal: string | null; origen: string } | null; cliente: { id: string; nombre: string } | null
  usuario: string | null; comision: number | null; acredita_el: string | null; anulado: boolean; ref: string | null; linea: string
}
export type TotalesCobros = { plata: number; entro: number; salio: number; por_medio: Record<string, number> }
export type ContraentregaAbierta = { venta_id: string; numero: number | null; canal: string | null; origen: string | null; en: string; monto: number; cliente: { id: string; nombre: string | null } | null; linea: string }
export type EntregaSinCobro = { id: string; linea: string; numero: string; forma_pago: 'efectivo' | 'transferencia'; monto: number | null; entrego: string; entregada_en: string; avisos: string[]; motivo: string | null; intento_en: string; intentos: number | string }
export type CobrosDelPeriodo = { desde: string; hasta: string; prueba: boolean; cobros: CobroDelMotor[]; totales: Record<string, TotalesCobros>; contraentregas?: ContraentregaAbierta[]; entregasPendientes?: EntregaSinCobro[]; otroLibro: number }
export type ReintentoDeEntregas = { ok: true; revisadas: number; registradas: number; siguen: { id: string; linea: string; motivo: string | null }[] }
/** De UNA línea (la tienda del menú), como la lista que lo muestra. */
export const reintentarEntregas = (marca: MarcaErp, linea: string) =>
  pedir<ReintentoDeEntregas>(post({ accion: 'reintentar-entregas', marca, linea }), '', 'No se pudo reintentar el cobro de las entregas.')
/** De UNA línea (`linea` = la tienda del menú): en Zattia el servidor ⛔ suma las dos (Bruno, 30-oct). */
export const leerCobros = (marca: MarcaErp, linea: string, desde: string, hasta: string, prueba: boolean) =>
  pedir<CobrosDelPeriodo>(null, `&vista=cobros&marca=${marca}&linea=${linea}&desde=${desde}&hasta=${hasta}&prueba=${prueba ? 1 : 0}&nc=${Date.now()}`, 'No se pudieron leer los cobros.')

// ── ERP › Stock › Transferencias (sólo lectura; `api/_erp-stock.js`, núcleo `lib/erp/transferencias.core.js`) ──
export type RenglonTransferencia = { vid: string; nombre: string | null; talle: string | null; sku: string | null; pedida: number; armada: number; enviada: number }
export type FilaTransferencia = {
  id: string; linea: string | null; numero: string | null; creada: string; cerrada: string | null; desde: string | null; hacia: string | null
  desdeTexto: string; haciaTexto: string; origen: 'reposicion' | 'devolucion' | 'gn'; origenTexto: string; persona: string | null
  estado: string; estadoTexto: string; tono: string; paso: number; fin: 'curso' | 'rayado' | 'rojo' | 'gris'
  pedidas: number; armadas: number; enviadas: number; faltan: number; enLibro: number | null
  renglones: RenglonTransferencia[]; tandas: Array<{ hora: string; numero: string | null; unidades: number }>; error: string | null; busca: string
}
export type ListaDeTransferencias = { filas: FilaTransferencia[]; cortado: boolean; libroDesde: string | null }
export const leerTransferencias = (marca: MarcaErp) =>
  pedir<ListaDeTransferencias>(null, `&vista=transferencias&marca=${marca}&nc=${Date.now()}`, 'No se pudieron leer las transferencias.')

// ── ERP › Clientes y proveedores › Clientes (lista de TRABAJO; `api/_erp-clientes.js`, núcleo `lib/erp/clientes-lista.core.js`) ──
export type FilaCliente = {
  id: string; nombre: string; doc: string | null; compras: number; total: number; primera: string | null; ultima: string | null
  mayorista: boolean; canales: string[]; esteMes: boolean; dormido: boolean
  /** El cliente del motor (si lo tiene) y su cuenta: saldo = lo que debe − lo que tiene a favor. ⛔ cuenta ⇒ `saldo` null. */
  clienteId: string | null; saldo: number | null; aFavor: number; vencido: boolean; soloErp: boolean
}
export type ListaDeClientes = { filas: FilaCliente[]; gnHasta: string | null; clientesErp: number; cuentaLista: boolean; porNombre: boolean }
/** Los de GN llegan como tuplas (BDI son 13.000) y se arman acá, con el día argentino de hoy. */
/** De UNA línea (`linea` = la tienda del menú): mirando Stunned, sólo quienes le compraron a Stunned (Bruno, 30-oct). */
export const leerListaDeClientes = async (marca: MarcaErp, linea: string): Promise<ListaDeClientes> => {
  const r = await pedir<{ gn: unknown[][]; erp: never[]; cuentas: never[]; gnHasta: string | null; clientesErp: number; cuentaLista: boolean; porNombre: boolean }>(null, `&vista=clientes-lista&marca=${marca}&linea=${linea}&nc=${Date.now()}`, 'No se pudieron leer los clientes.')
  const filas = armarFilasClientes({ gn: r.gn.map(deTupla), erp: r.erp, cuentas: r.cuentas, hoy: diaArgentino(Date.now()) }) as FilaCliente[]
  return { filas, gnHasta: r.gnHasta, clientesErp: r.clientesErp, cuentaLista: r.cuentaLista, porNombre: r.porNombre }
}

export type CompraCliente = { id: string; number: number | null; fecha: string; channel: string | null; total: number; sale_state: string | null; payment_method: string | null; tn_order: string | null }
export type PendienteCuenta = { ref: string; fecha: string; monto: number; pendiente: number; dias: number }
export type FichaDeCliente = {
  compras: CompraCliente[]; cortado: boolean
  contacto: { name: string | null; email: string | null; phone: string | null; city: string | null; province: string | null; address: string | null } | null
  cuenta: { cliente: { id: string; nombre: string; doc: string | null }; credito: unknown; estado: { saldo: number; a_favor: number; debe: number; pendientes?: PendienteCuenta[] }; ventas?: Record<string, string> } | null
}
export const leerFichaDeCliente = (marca: MarcaErp, linea: string, clave: string) =>
  pedir<FichaDeCliente>(null, `&vista=cliente-ficha&marca=${marca}&linea=${linea}&clave=${encodeURIComponent(clave)}&nc=${Date.now()}`, 'No se pudo leer el cliente.')

// ── ERP › Clientes › Cuenta corriente (`api/_erp-clientes.js`, núcleo `lib/erp/cuenta-corriente.core.js`; contrato §15) ──
export type CreditoCliente = { credito: boolean; tope: number | null; dias: number | null; puesto_por: string | null; puesto_en: string | null } | null
export type CuentaDelMotor = {
  cliente_id: string; linea: string; nombre: string; doc: string | null; whatsapp?: string | null; credito: CreditoCliente
  saldo: number; debe: number; a_favor: number; vencido: number; dias_mayor: number; atrasado: boolean; sin_credito: boolean; tramos: Record<string, number>
  ventas_con_saldo?: number; ultimo_cobro?: { fecha: string; monto: number } | null
}
export type CuentasDeLaMarca = { hoy: string | null; prueba: boolean; cuentas: CuentaDelMotor[]; clientesErp: number; otroLibro: number }
export const leerCuentasCorrientes = (marca: MarcaErp, linea: string, prueba: boolean) =>
  pedir<CuentasDeLaMarca>(null, `&vista=cuentas-corrientes&marca=${marca}&linea=${linea}&prueba=${prueba ? 1 : 0}&nc=${Date.now()}`, 'No se pudo leer la cuenta corriente.')

export type RenglonMayor = { fecha: string; tipo: 'compra' | 'pago'; ref: string; detalle: string; debe: number; haber: number; saldo: number }
export type CuentaDeCliente = {
  hoy: string; cliente: { id: string; nombre: string; doc: string | null }; credito: CreditoCliente
  estado: { saldo: number; debe: number; a_favor: number; vencido: number; dias_mayor: number; atrasado: boolean; sin_credito: boolean; tramos: Record<string, number>; pendientes: PendienteCuenta[] }
  mayor: { anterior: number; renglones: RenglonMayor[]; final: number }
  csv: string
  /** Las cuentas con las que se puede cobrar (`cuenta_cobro`). */
  cuentas?: Array<{ id: string | number; nombre: string; medio: string }>
}
export const leerCuentaDeCliente = (marca: MarcaErp, p: { clienteId: string; linea: string; prueba: boolean; desde?: string; hasta?: string }) =>
  pedir<CuentaDeCliente>(null, `&vista=cuenta-cliente&marca=${marca}&cliente=${p.clienteId}&linea=${p.linea}&prueba=${p.prueba ? 1 : 0}&desde=${p.desde ?? ''}&hasta=${p.hasta ?? ''}&nc=${Date.now()}`, 'No se pudo leer la cuenta del cliente.')
/** El botón «Cobrar» de la cuenta: sin elegir venta, el motor paga la más vieja primero (FIFO). `ref` = una clave por ventana (⛔ duplica). */
export const cobrarCuentaErp = (marca: MarcaErp, c: { clienteId: string; linea: string; monto: number; cuenta: string; fecha: string; ref: string; prueba: boolean }) =>
  pedir<{ ok: true; cuenta: unknown; yaExistia?: boolean }>(post({ accion: 'cobrar-cuenta', marca, ...c }), '', 'No se pudo registrar el cobro.')
/** Cargar o corregir el WhatsApp / mail de un cliente (sólo admin). El motor valida el número; ⛔ borra un dato que no mandás. */
export const ponerContactoCliente = (marca: MarcaErp, p: { clienteId: string; whatsapp?: string; email?: string }) =>
  pedir<{ ok: true; contacto: { whatsapp: string | null; email: string | null } }>(post({ accion: 'poner-contacto', marca, ...p }), '', 'No se pudo guardar el contacto.')
export const ponerCreditoCliente = (marca: MarcaErp, p: { clienteId: string; credito: boolean; tope: number | null; dias: number | null }) =>
  pedir<{ ok: true; credito: CreditoCliente }>(post({ accion: 'poner-credito', marca, ...p }), '', 'No se pudo marcar el crédito.')

// ── ERP › Inicio (`api/_erp-inicio.js`): el resultado comercial del mes, del espejo de GN ──
export type TramoResultado = { desde: string; hasta: string; ventas: number; vendido: number; costo: number; sinCosto: number; margen: number }
/** Para los gráficos del Inicio (tanda 2): la MISMA cuenta que `mes`, agrupada por día, por mes (12) y por canal. */
export type GrupoResultado = { ventas: number; vendido: number; costo: number }
export type ResultadoDelMes = {
  mes: TramoResultado; anterior: TramoResultado; gnHasta: string | null
  dias?: Array<GrupoResultado & { dia: string }>; meses?: Array<GrupoResultado & { mes: string }>; canales?: Array<GrupoResultado & { canal: string }>
}
/** De UNA línea (la tienda del menú): en Zattia, cada venta pesa en cada línea según sus renglones (Bruno, 30-oct). */
export const leerResultadoDelMes = (marca: MarcaErp, linea: string) =>
  pedir<ResultadoDelMes>(null, `&vista=inicio-resultado&marca=${marca}&linea=${linea}&nc=${Date.now()}`, 'No se pudo leer el resultado del mes.')

// ── ERP › Ventas › Por producto (`api/_erp-por-producto.js`, núcleo `lib/erp/ventas-producto.core.js`) ──

export type RenglonProducto = {
  id: string; ventaId: string; numero: string | null; cuando: string; canal: string; cliente: string | null
  producto: string; nombre: string; talle: string; sku: string | null; cantidad: number; precio: number; total: number; linea: string
  /** Costo vigente × cantidad; null = sin costo, o el perfil ⛔ ve costos. */
  costo: number | null
}

export const leerVentasPorProducto = (marca: MarcaErp, desde: string, hasta: string) =>
  pedir<{ renglones: RenglonProducto[]; desde: string; hasta: string; costos: boolean; gnHasta: string | null }>(null, `&vista=ventas-producto&marca=${marca}&desde=${desde}&hasta=${hasta}&nc=${Date.now()}`, 'No se pudieron leer las ventas por producto.')

// ── ERP › Ventas › Cargar venta (`api/_erp-cargar.js`, `origen: 'manual'` del motor, contrato §19) ──
export type CuentaParaCargar = { id: string; nombre: string; medio: string; marca: string }
/** Una forma de pago como la del POS: su cuenta de cobro, sus variantes (crédito: 6 cuotas, promo del banco) y la ruta de cada canal. */
export type FormaDePagoCargar = {
  clave: string; nombre: string; cuenta: string | null
  opciones?: Array<{ clave: string; nombre: string; cuenta: string }>
  rutas: Record<string, { cuenta: string | null; tasa: number | null; dias: number | null } | null>
}
export type DatosParaCargar = {
  lineas: string[]; cuentas: CuentaParaCargar[]; canales: string[]; depositos: string[]; manualHabilitado: boolean
  /** Por línea: las formas de pago del POS (+ «Queda debiendo» y «Contraentrega»), y las cuentas que ⛔ son de ninguna (`Otra cuenta`). */
  formas?: Record<string, FormaDePagoCargar[]>; sueltas?: Record<string, CuentaParaCargar[]>
  /** Las líneas cuya Caja ⛔ tiene reglas: ahí sólo se ve «Otra cuenta». */
  sinReglas?: string[]
}
export const leerParaCargar = (marca: MarcaErp) =>
  pedir<DatosParaCargar>(null, `&vista=cargar-venta&marca=${marca}&nc=${Date.now()}`, 'No se pudo abrir «Cargar venta».')
export type VentaACargar = {
  linea: string; origen_ref: string; ocurrida_en?: string; canal: string; deposito: string; cliente?: { doc: string; nombre: string }
  lineas: Array<{ producto: string; talle: string; cantidad: number; precio: number; sku?: string | null; barcode?: string | null }>
  pagos: Array<{ cuenta: string; monto: number }>; nota?: string
  /** El PIN de un admin: sólo cuando la venta a cuenta quedó frenada (`SIN_CREDITO`, `ATRASADO`, `SUPERA_TOPE`). */
  pin?: string
}
export const cargarVenta = (marca: MarcaErp, venta: VentaACargar) =>
  pedir<{ ok: true; venta: { id: string; numero: number; total: number; prueba: boolean }; yaExistia: boolean; avisos: Array<{ codigo: string }> }>(
    post({ accion: 'cargar-venta', marca, ...venta }), '', 'No se pudo cargar la venta.')

// ── ERP › Ventas › Cajas (lectura + el arqueo del sobre; los turnos de la Caja por `?recurso=caja`, núcleo `lib/erp/cajas.core.js`) ──
const deCaja = async <T>(marca: MarcaErp, query: string, fallo: string): Promise<T> => {
  const r = await apiFetch(`/api/datos?recurso=caja&store=${marca}&${query}&nc=${Date.now()}`)
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error((j && j.error) || fallo)
  return j as T
}
/** Los turnos ABIERTOS en esos días argentinos (`caja_turno` tal cual) + si el arqueo de caja está disponible en la base. */
export const leerTurnosCaja = (marca: MarcaErp, desde: string, hasta: string) =>
  deCaja<{ turnos: Array<Record<string, unknown>>; arqueo?: { disponible: boolean; error?: string } }>(marca, `action=turnos&desde=${desde}&hasta=${hasta}`, 'No se pudieron leer las cajas.')
/** La caja de un sobre por su código (`Z-0142`), aunque sea de otro período. */
export const leerCajaDelSobre = (marca: MarcaErp, codigo: string) =>
  deCaja<{ turno: Record<string, unknown>; sobre: number | null }>(marca, `action=arqueo&codigo=${encodeURIComponent(codigo)}`, 'No se encontró la caja de ese sobre.')
/** El ARQUEO del sobre (sólo admin): los billetes verificados (o el monto, sin conteo); con diferencia, la nota. El servidor rearma lo esperado. */
export async function arquearSobre(marca: MarcaErp, p: { id: string; contado?: number; verificados?: Record<string, number>; nota?: string | null; corregir?: boolean }) {
  const r = await apiFetch('/api/datos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'caja', store: marca, action: 'arqueo', ...p }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error((j && j.error) || 'No se pudo guardar el arqueo.')
  return j as { turno: Record<string, unknown> }
}
/** El turno abierto con su resumen EN VIVO (el esperado lo calcula la Caja: lee GN, 1 a 10 s). */
export const leerCajaAbierta = (marca: MarcaErp) =>
  deCaja<{ turno: (Record<string, unknown> & { resumen?: { ventas?: number; efectivo?: { esperado?: number } } }) | null }>(marca, 'action=turno', 'No se pudo leer la caja abierta.')

// ── ERP › Ventas › Cargar un gasto (30-oct): la CAJA CHICA = una salida de la caja abierta con categoría (`lib/caja/gasto.core.js`) ──
export type GastoCaja = { id: string; monto: number; motivo: string; categoria: string; usuario: string | null; creado_en: string; anulado_en?: string | null; anulado_por?: string | null; anulado_motivo?: string | null }
/** Lo que cargó ESTA cuenta (admin: todo) en los últimos `dias` días. El corte lo hace el servidor. */
export const leerMisGastos = (marca: MarcaErp) => deCaja<{ gastos: GastoCaja[]; dias: number }>(marca, 'action=mis-gastos', 'No se pudieron leer tus gastos.')
/** La caja abierta, sin el resumen (no lee GN): para saber si hay caja y quién la abrió. */
export const leerCajaAbiertaLiviana = (marca: MarcaErp) =>
  deCaja<{ turno: { id: string; abierto_por: string | null; abierto_por_usuario?: string | null } | null }>(marca, 'action=turno&liviano=1', 'No se pudo leer la caja abierta.')
/** Cargar un gasto de caja chica: sale del efectivo de la caja abierta (resta del cierre). */
export async function cargarGastoCaja(marca: MarcaErp, p: { monto: number; categoria: string; detalle: string }) {
  const r = await apiFetch('/api/datos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'caja', store: marca, action: 'salida', tipo: 'salida', monto: p.monto, categoria: p.categoria, motivo: p.detalle }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error((j && j.error) || 'No se pudo cargar el gasto.')
  return j as { turno: Record<string, unknown> }
}

export type ClaveInterruptor = 'anular' | 'conteo' | 'precio'
export type Interruptores = Record<ClaveInterruptor, boolean>

/** Los interruptores de Aprobaciones de cada marca (sólo Admin). Prendido = esa acción la hace sólo Admin. */
export const leerInterruptores = () =>
  pedir<{ interruptores: Record<MarcaErp, Interruptores> }>(null, `&vista=interruptores&nc=${Date.now()}`, 'No se pudieron leer las aprobaciones.')

export const ponerInterruptor = (marca: MarcaErp, clave: ClaveInterruptor, valor: boolean) =>
  pedir<{ ok: true; marca: MarcaErp; interruptores: Interruptores }>(post({ accion: 'poner-interruptor', marca, clave, valor }), '', 'No se pudo guardar el cambio.')

export type RolErp = 'local' | 'mayorista' | 'deposito' | 'administracion' | 'consulta'
export type RolesPorMarca = Record<MarcaErp, Record<string, RolErp[]> & { __error?: boolean }>
export type VistaRoles = { roles: RolErp[]; editables: string[]; defecto: Record<MarcaErp, Record<string, RolErp[]>>; guardados: RolesPorMarca }

/** Los roles de cada permiso del ERP, por marca (sólo Admin): el valor del código y lo que se guardó para pisarlo. */
export const leerRoles = () => pedir<VistaRoles>(null, `&vista=roles&nc=${Date.now()}`, 'No se pudieron leer los roles de cada permiso.')

export const ponerRoles = (marca: MarcaErp, permiso: string, roles: RolErp[]) =>
  pedir<{ ok: true; marca: MarcaErp; guardados: Record<string, RolErp[]> }>(post({ accion: 'poner-roles', marca, permiso, roles }), '', 'No se pudo guardar el cambio.')

export const restablecerRoles = (marca: MarcaErp, permiso: string) =>
  pedir<{ ok: true; marca: MarcaErp; guardados: Record<string, RolErp[]> }>(post({ accion: 'restablecer-roles', marca, permiso }), '', 'No se pudo restablecer.')

export type PinPersona = { usuario: string; pin: string | null; cambiado_por: string; cambiado_en: string; bloqueado: boolean; bloqueado_hasta: string | null }

/** Los PINs de encargada de una marca (sólo Admin; el PIN va en claro, decisión de Bruno 26-oct). */
export const leerPines = (marca: MarcaErp) =>
  pedir<{ marca: MarcaErp; pines: PinPersona[] }>(null, `&vista=pines&marca=${marca}&nc=${Date.now()}`, 'No se pudieron leer los PINs.')

/** «Autoriza la encargada» del POS: quien cobra en la caja de esa marca y tiene PIN (sólo nombres). `null` = no se pudo leer el padrón. */
export const leerEncargadas = (marca: MarcaErp) =>
  pedir<{ marca: MarcaErp; encargadas: { usuario: string; nombre: string }[] | null }>(null, `&vista=encargadas&marca=${marca}&nc=${Date.now()}`, 'No se pudo leer quién autoriza.')

/** Fija el PIN de una persona en las DOS marcas (es uno solo por persona). */
export const ponerPin = async (persona: string, pin: string) => {
  for (const marca of ['bdi', 'zattia'] as const) await pedir(post({ accion: 'poner-pin', marca, persona, pin }), '', 'No se pudo guardar el PIN.')
}

export const sacarPin = async (persona: string) => {
  for (const marca of ['bdi', 'zattia'] as const) await pedir(post({ accion: 'quitar-pin', marca, persona }), '', 'No se pudo quitar el PIN.')
}

/** Cuatro dígitos al azar, sin sesgo (rechaza lo que cae fuera del múltiplo de 10 000). */
export function pinAlAzar(): string {
  const a = new Uint32Array(1)
  const tope = Math.floor(0x100000000 / 10000) * 10000
  do crypto.getRandomValues(a); while (a[0] >= tope)
  return String(a[0] % 10000).padStart(4, '0')
}

/** ERP › Stock › Mover y recibir: la transferencia como DOCUMENTO del motor (`api/_erp-transferencia.js`, contrato en `areben-motor/TRANSFERENCIA.md`). */
export type RenglonDoc = { n: number; product_id: number | string; size_id: number | string; sku: string | null; barcode: string | null; pedida: number; armada: number; enviada: number; recibida: number | null }
export type TransferenciaDoc = {
  id: string; numero: number; linea: string; desde: string; hacia: string; origen: string; estado: 'borrador' | 'armada' | 'en_transito' | 'recibida' | 'cancelada'
  nota: string | null; creada_por: string; creada_en: string; enviada_por: string | null; enviada_en: string | null; recibida_por: string | null; recibida_en: string | null
  renglones: RenglonDoc[]; diferencias: Array<{ sku: string | null; enviada: number; recibida: number; diferencia: number }>
  /** Sólo en la lista: de una de Reposición, lo pedido que ⛔ salió (lo pega `api/_erp-transferencia.js`). */
  origen_ref?: string | null; faltoArmar?: number
}
export type AvisoDoc = { codigo: string; texto: string }
export type RenglonAlMotor = { product_id: string; size_id: string; sku: string | null; barcode: string | null; cantidad: number }
export type ResultadoDoc = { ok: true; transferencia: TransferenciaDoc; ya: boolean; movimientos: number; unidades: number; diferencias: TransferenciaDoc['diferencias']; avisos: AvisoDoc[] }

export const leerTransferenciasDoc = (linea: TiendaErp) =>
  pedir<{ transferencias: TransferenciaDoc[]; enTransito: Array<{ product_id: number; size_id: number; desde: string; hacia: string; unidades: number }> }>(null, `&vista=transferencias-doc&marca=${linea}&nc=${Date.now()}`, 'No se pudieron leer las transferencias.')
export const crearTransferenciaDoc = (linea: TiendaErp, desde: string, hacia: string, renglones: RenglonAlMotor[], nota?: string) =>
  pedir<ResultadoDoc>(post({ accion: 'transferencia-crear', linea, desde, hacia, origen: 'libre', nota, renglones }), '', 'No se pudo crear la transferencia.')
export const armarTransferenciaDoc = (linea: TiendaErp, transferenciaId: string, renglones: RenglonAlMotor[]) =>
  pedir<ResultadoDoc>(post({ accion: 'transferencia-armar', linea, transferenciaId, renglones }), '', 'No se pudo preparar la transferencia.')
export const enviarTransferenciaDoc = (linea: TiendaErp, transferenciaId: string) =>
  pedir<ResultadoDoc>(post({ accion: 'transferencia-enviar', linea, transferenciaId }), '', 'No se pudo enviar la transferencia.')
export const recibirTransferenciaDoc = (linea: TiendaErp, transferenciaId: string, renglones: RenglonAlMotor[]) =>
  pedir<ResultadoDoc>(post({ accion: 'transferencia-recibir', linea, transferenciaId, renglones }), '', 'No se pudo recibir la transferencia.')
export const cancelarTransferenciaDoc = (linea: TiendaErp, transferenciaId: string, motivo: string) =>
  pedir<ResultadoDoc>(post({ accion: 'transferencia-cancelar', linea, transferenciaId, motivo }), '', 'No se pudo cancelar la transferencia.')

// ── ERP › Depósito Evento (`api/_erp-depositos.js`; motor sql/058): se activa para un evento y se apaga sólo en 0 ──
export type DepositoErp = { id: string; nombre: string; activo: boolean; deGN: boolean; unidades: number }
export type QuedaEnDeposito = { product_id: number; size_id: number; sku: string | null; cantidad: number }
export const leerDepositos = (linea: TiendaErp) =>
  pedir<{ depositos: DepositoErp[] }>(null, `&vista=depositos&marca=${linea}&nc=${Date.now()}`, 'No se pudieron leer los depósitos.')
export const activarDeposito = (linea: TiendaErp, deposito: string, activar: boolean) =>
  pedir<{ ok: true; ya?: boolean; depositos: DepositoErp[] }>(post({ accion: activar ? 'deposito-activar' : 'deposito-desactivar', linea, deposito }), '', activar ? 'No se pudo activar el depósito.' : 'No se pudo desactivar el depósito.')

// ── ERP › Gastos comerciales (`api/_erp-gastos.js`; `gastosComerciales` / `registrarGasto` del motor, sql/055) — sólo admin ──
export type TipoGasto = 'comision' | 'impuesto' | 'otro'
export type GastoCargado = { id: string; linea: string; fecha: string; tipo: TipoGasto; monto: number; detalle: string; cuenta: string | null; origen: 'manual' | 'automatico'; venta_id: string | null; usuario: string; creado_en: string }
export type GastosDelPeriodo = {
  desde: string; hasta: string; prueba: boolean; total: number; por_tipo: Record<TipoGasto, number>
  meses: Array<{ mes: string; total: number; por_tipo: Record<TipoGasto, number> }>
  /** La parte de «comisión» que salió sola de los cobros (el resto de los gastos se cargó a mano). */
  comisionAutomatica: number
  /** Cobros con tarjeta/MP cuya ruta ⛔ tiene tasa: la comisión de esos NO está en el total. */
  cobrosSinComision: number
  gastos: GastoCargado[]
}
/** De UNA línea (`linea` = la tienda del menú: bdi · zattia · stunned): en Zattia el servidor ⛔ suma las dos (Bruno, 30-oct). */
export const leerGastos = (marca: MarcaErp, linea: string, desde: string, hasta: string, prueba: boolean) =>
  pedir<GastosDelPeriodo>(null, `&vista=gastos&marca=${marca}&linea=${linea}&desde=${desde}&hasta=${hasta}&prueba=${prueba ? 1 : 0}&nc=${Date.now()}`, 'No se pudieron leer los gastos.')
/** Un gasto a mano. Corregir uno cargado de más es cargar otro con el monto en NEGATIVO (el gasto es inmutable). */
export const registrarGastoErp = (marca: MarcaErp, g: { linea?: string; fecha: string; tipo: TipoGasto; monto: number; detalle: string; cuenta?: string; prueba: boolean }) =>
  pedir<{ ok: true; gasto: GastoCargado }>(post({ accion: 'registrar-gasto', marca, ...g }), '', 'No se pudo cargar el gasto.')

// ── ERP › Stock › Diferencias: mandar el stock del ERP a Tienda Nube (`api/_erp-empuje-stock.js`; motor `lib/tn/pedido-stock.mjs`) — sólo admin ──
/** Un envío de stock de la tienda ENTERA. `seco: true` = calculó lo que mandaría y ⛔ escribió (hasta el corte de esa tienda); `null` = todavía no corrió. */
export type EmpujeStock = {
  id: number; estado: 'pendiente' | 'corriendo' | 'hecho' | 'fallado' | 'abandonado'; pedidoPor: string | null; avisos: number
  pedidoEn: string | null; terminadoEn: string | null; error: string | null
  seco: boolean | null; cambios: number | null; unidades: number | null; escritos: number | null; quedan: number | null
}
export const leerEmpujesStock = (tienda: TiendaErp) =>
  pedir<{ tienda: TiendaErp; empujes: EmpujeStock[] }>(null, `&vista=empujes-stock&marca=${tienda}&nc=${Date.now()}`, 'No se pudieron leer los envíos de stock.')
/** Pide el envío (lo corre la cola del motor en el minuto). `yaEsperaba` = había uno esperando y se sumó a ése. */
export const mandarStockATN = (tienda: TiendaErp) =>
  pedir<{ ok: true; id: number; yaEsperaba: boolean }>(post({ accion: 'mandar-stock', marca: tienda }), '', 'No se pudo pedir el envío de stock.')
