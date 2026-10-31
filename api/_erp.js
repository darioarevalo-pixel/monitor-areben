/**
 * ERP (key `erp`): lo que el monitor va construyendo para reemplazar a Gestión Nube. Por ahora una
 * pestaña, Facturación. Entra por `api/datos.js?recurso=erp` (⛔ un archivo de ruta nuevo: el plan
 * Hobby admite 12 funciones).
 *
 * 🔴 PERMISOS POR ROL en el servidor (`puedeErp`; hasta abrir la llave, sólo admin — Bruno, 12-oct: «que lo vean Bruno y Darío» mientras se
 * construye). ⛔ alcanza con esconderlo del menú: acá se pide un CAE.
 *
 *   GET  ?recurso=erp&vista=facturacion&mes=YYYY-MM   el mes: techo, facturado, pendiente, ventas
 *   GET  ?recurso=erp&vista=facturas&mes=YYYY-MM      las facturas del monitor del mes (para el PDF)
 *   POST {recurso:'erp', accion:'facturar', mes, marca, ventaIds}   factura esas ventas (un lote)
 *   POST {recurso:'erp', accion:'nota-credito', facturaId}            anula ENTERA una factura del monitor con NC (ARCA)
 *   POST {recurso:'erp', accion:'nota-debito', facturaId, monto}      SUMA `monto` (IVA incl.) a una factura del monitor con ND (ARCA)
 *   POST {recurso:'erp', accion:'cerrar', mes}                      congela el techo del mes
 *   GET  ?recurso=erp&vista=pedidos-tn&marca=…                      los pedidos de TN abiertos y sin pagar (retienen stock)
 *   GET  ?recurso=erp&vista=diferencias&marca=…&fecha=YYYY-MM-DD    lo que el libro ⛔ explicó ese día + la sobreventa
 *   GET  ?recurso=erp&vista=conciliacion&tienda=bdi|zattia|stunned&fecha=…  lo que ⛔ cierra contra TN y GN ese día (motor sql/024)
 *   GET  ?recurso=erp&vista=stock-lista&marca=bdi|zattia              la lista de Stock: cada prenda por depósito (`api/_erp-stock.js`)
 *   GET  ?recurso=erp&vista=cargar-venta&marca=…  ·  POST { accion: 'cargar-venta' }   Ventas › Cargar venta (`api/_erp-cargar.js`, sólo admin)
 *   GET  ?recurso=erp&vista=gastos&marca=bdi|zattia&linea=…&desde&hasta&prueba=0|1   Gastos comerciales de UNA línea (sólo admin; `api/_erp-gastos.js`)
 *   POST { accion: 'registrar-gasto', marca, fecha, tipo, monto, detalle, cuenta?, prueba }                  cargar un gasto a mano (sólo admin)
 *   GET  ?recurso=erp&vista=empujes-stock&marca=bdi|zattia|stunned    los últimos envíos de stock a TN de esa tienda (sólo admin; `api/_erp-empuje-stock.js`)
 *   POST { accion: 'mandar-stock', marca }                                                                  mandar el stock del ERP a TN, la tienda entera (sólo admin; SECO hasta `STOCK_TN_MANDA`)
 *   GET  ?recurso=erp&vista=cobros&marca=bdi|zattia&desde&hasta&prueba=0|1   Ventas › Cobros: `cobrosDe` del motor (`api/_erp-cobros.js`)
 *   GET  ?recurso=erp&vista=ventas-producto&marca=bdi|zattia&desde&hasta  Ventas › Por producto: renglones del espejo de GN (`api/_erp-por-producto.js`)
 *   GET  ?recurso=erp&vista=productos-lista&marca=bdi|zattia          la lista de Productos: uno por fila (`api/_erp-productos.js`)
 *   GET  ?recurso=erp&vista=movimientos&marca=…&desde=…&hasta=…     Stock › Movimientos: cada fila del libro (`api/_erp-stock.js`)
 *   GET  ?recurso=erp&vista=transferencias&marca=…                    Stock › Transferencias: cada una con su paso (`api/_erp-stock.js`)
 *   GET  ?recurso=erp&vista=comparacion&marca=…                       Stock › Comparación: el ERP contra Tienda Nube (`api/_erp-stock.js`)
 *   GET  ?recurso=erp&vista=clientes-lista&marca=bdi|zattia           Clientes: uno por fila (`api/_erp-clientes.js`)
 *   GET  ?recurso=erp&vista=cliente-ficha&marca=…&clave=…             la ficha de un cliente: compras y cuenta corriente
 *   GET  ?recurso=erp&vista=cuentas-corrientes&marca=…&prueba=0|1     Cuenta corriente: una fila por cliente × línea
 *   GET  ?recurso=erp&vista=cuenta-cliente&marca=…&cliente=…&linea=…  su estado y el mayor (desde/hasta) con su CSV
 *   GET  ?recurso=erp&vista=cuenta-panel&gnId=…&tel=…&prueba=0|1      la cuenta del cliente del chat (panel de WhatsApp, BDI)
 *   POST { accion: 'anotar-whatsapp' | 'sacar-whatsapp', … }           las personas que compran por la empresa (panel)
 *   GET  ?vista=clientes-panel&q=… · POST { accion: 'cliente-nuevo-panel' }   «¿Es de un cliente que ya tenés?» / «Es nuevo»
 *   GET  ?vista=pedidos-panel&cliente=…&tel=… · pedido-panel&id=… · pedido-productos&id=…&q=… · preparados-sin-pagar   el pedido mayorista en el panel
 *   POST { accion: 'pedido-entrar' | 'pedido-cambiar' | 'pedido-a-preparar' | 'pedido-anular', pedidoId, … }  (VENTA_MAYORISTA_REAL)
 *   POST { accion: 'poner-credito', marca, clienteId, credito, tope?, dias? }   marcar o sacar el crédito (sólo admin)
 *   POST { accion: 'poner-contacto', marca, clienteId, whatsapp?, email? }       cargar o corregir el contacto (sólo admin)
 *   GET  ?recurso=erp&vista=inicio-resultado&marca=bdi|zattia         Inicio: vendido, costo y margen del mes (`api/_erp-inicio.js`)
 *   GET  ?recurso=erp&vista=stock&marca=bdi|zattia&q=texto            busca prendas (SKU, código, nombre)
 *   GET  ?recurso=erp&vista=precio&marca=…&producto=ID                precio por lista y costo del producto, con GN y TN al lado
 *   POST {recurso:'erp', accion:'cargar-precio'|'cargar-costo', marca, producto, monto, lista?, desde?, motivo?, proveedor?, proveedorId?}
 *   POST {recurso:'erp', accion:'soltar-precio', marca, producto, lista, motivo?}   el precio cargado de una lista vuelve a seguir (018)
 *   GET  ?recurso=erp&vista=proveedores&marca=…&q=…                  los proveedores del ERP (sql/013) para elegir en el costo
 *   POST {recurso:'erp', accion:'guardar-proveedor', marca, nombre, cuit?}   alta a mano de un proveedor
 *   GET  ?recurso=erp&vista=stock&marca=…&producto=ID&talle=ID       el libro y GN de esa prenda, con historial
 *   GET  ?recurso=erp&vista=ventas&marca=…&q=nº|cliente&desde&hasta    busca ventas propias (las del motor)
 *   GET  ?recurso=erp&vista=venta&marca=…&id=UUID                      la ficha: prendas, pagos, factura, estado
 *   POST {recurso:'erp', accion:'anular', marca, ventaId, motivo, devolucion:{forma}, cliente?}  anula una venta propia (por el motor, §17)
 *   POST {recurso:'erp', accion:'confirmar-vuelta', marca, ventaId}    la prenda de una anulada a desarmar/recibir volvió (§17)
 *   GET  ?recurso=erp&vista=saldo&marca=…&doc=DNI                      el saldo a favor de la clienta (el de prueba)
 *   GET  ?recurso=erp&vista=clientas&marca=…&q=CUIT|nombre[&linea=…]    las fichas de clientas (factura A en la Caja; con línea, el ⌘K)
 *   POST {recurso:'erp', accion:'cambiar', marca, id, ventaId, devueltas, items, pagos, total, desde?, pago?, comprobante?, cliente?}
 *        el cambio en el local: cobra la diferencia con el descuento de la forma de pago y, con transferencia,
 *        contesta `esperando` hasta que llega el pago (la pantalla repite el MISMO pedido)
 *   POST {recurso:'erp', accion:'facturar-venta', marca, ventaId, clase:'A'|'B', doc?, condicion?, razonSocial?, domicilio?, reimprimir?}
 *   POST {recurso:'erp', accion:'facturar-cambio', marca, ventaId, simular?}   NC por lo devuelto + factura por lo nuevo
 *        la factura A PEDIDO de una venta propia (la Caja): una, con su CAE, y atada a la venta en el motor
 *   POST {recurso:'erp', accion:'nota-credito-venta', marca, ventaId}  la NC de una venta propia ANULADA con factura
 *   GET  ?recurso=erp&vista=reglas&marca=…                             las reglas comerciales (motor sql/016) + Agenda + Caja
 *   POST {recurso:'erp', accion:'guardar-regla'|'sembrar-reglas'|'simular-reglas'|'prender-caja-reglas', marca, …}   `api/_erp-reglas.js`
 *   GET  ?recurso=erp&vista=rutas&marca=…                              las cuentas de cobro: qué cuenta recibe cada medio (motor sql/019-020)
 *   POST {recurso:'erp', accion:'poner-ruta', marca, linea?, canal, medio, cuenta_real_id, …}   `api/_erp-rutas.js`
 *   GET  ?recurso=erp&vista=redondeo&marca=…                           a cuánto se redondea el precio de cada canal (motor sql/029)
 *   POST {recurso:'erp', accion:'reintentar-entregas', marca}        vuelve a cobrar las entregas de Logística sin cobrar (`api/_erp-cobros.js`)
 *   POST {recurso:'erp', accion:'poner-redondeo', marca, linea?, canal, paso, modo, desde?}   `api/_erp-redondeo.js`
 *   GET  ?recurso=erp&vista=estructura&marca=…   Configuración › Cuentas y Marcas, depósitos y puntos de venta (`api/_erp-estructura.js`, sólo lee)
 *   GET  ?recurso=erp&vista=ajustes&linea=bdi|zattia|stunned           los ajustes de stock (motor sql/026) + la lista «A contar»
 *   POST {recurso:'erp', accion:'crear-ajuste'|'aprobar-ajuste'|'descartar-ajuste', linea, …}   `api/_erp-ajustes.js`
 *   GET  ?recurso=erp&vista=transferencias-doc&marca=…   las transferencias como DOCUMENTO del motor (sql/034) + lo en tránsito
 *   POST {recurso:'erp', accion:'transferencia-crear'|'-armar'|'-enviar'|'-recibir'|'-cancelar', linea, …}   `api/_erp-transferencia.js`
 *   GET  ?recurso=erp&vista=salidas&marca=…   las salidas con vuelta (fotos, producción) del motor (sql/048)
 *   POST {recurso:'erp', accion:'salida-crear'|'-devolver'|'-cerrar'|'-cancelar', linea, …}   `api/_erp-salida.js`
 *   GET  ?recurso=erp&vista=depositos&marca=stunned   los depósitos con activo y unidades (el Evento, motor sql/058)
 *   POST {recurso:'erp', accion:'deposito-activar'|'deposito-desactivar', linea, deposito}   `api/_erp-depositos.js`
 *   GET  ?recurso=erp&vista=producto-historial&marca=…&productId=…   quién cambió qué en un producto (sql/037)
 *   POST {recurso:'erp', accion:'producto-editar'|'variante-editar'|'variante-agregar', marca, productId, …}   `api/_erp-catalogo.js` (sólo admin)
 *   GET  ?recurso=erp&vista=roles                                       los roles de cada permiso (defecto + guardados) · POST poner-roles / restablecer-roles (`api/_erp-permisos-rol.js`)
 *   GET  ?recurso=erp&vista=permisos                                   lo que el perfil puede en el ERP, por marca (`permisosErp`)
 *
 * El monto de cada factura lo rearma el SERVIDOR con los cobros: del navegador sólo viajan los ids.
 * Contra qué ARCA se factura lo decide `ambienteDeEntorno` (homologación por defecto).
 */
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario, padronParaEncargadas } from './_auth.js'
import { esAdmin, permisoErpDe, permisosErp, puedeErp } from '../lib/permisos.core.js'
import { baseDeLinea, esStunned, skuParaLinea } from '../lib/lineas.core.js'
import { SQL_CTE_LINEA_GN, lineasDeVenta } from '../lib/erp/linea-gn.core.js'
import { cfgDeMarca } from './_recepciones-base.js'
import { leerTodo } from '../lib/supabase/paginar.core.js'
import { SIN_ARCA, arcaConectado, baseFacturacion, clienteArcaDelEntorno, repoFacturas } from './_facturacion.js'
import { CBTE, COND_IVA, DOC, ambienteDeEntorno, ptoVtaDe } from '../motor/arca/arca.core.js'
import { techoDelMes } from '../motor/arca/techo.core.js'
import { claveVenta, resumenDelMes, ventasParaFacturar } from '../motor/arca/mes.core.js'
import { POR_PEDIDO, facturarLote } from '../motor/arca/lote.core.js'
import { diaArgentino } from '../lib/envios/portal.core.js'
import { stockDeVariante } from '../lib/erp/stock.core.js'
import { armarDiferencias, leerFecha } from '../lib/erp/diferencias.core.js'
import { armarConciliacion, TIENDAS as TIENDAS_CONCILIACION } from '../lib/erp/conciliacion.core.js'
import { entradaInvalida } from '../lib/erp/entrada.core.js'
import { NO_SIN_PAGAR, STATUS_POR_COBRAR, armarPedidosSinPagar, cobradosEnGN } from '../lib/erp/pedidos-tn.core.js'
import { esEntregadoSinCobrarTN } from '../motor/venta/pago-tn.mjs'
import { armarPrecioDeProducto, leerCarga, leerSoltar, lineaDelProducto, sinCostos } from '../lib/erp/precio.core.js'
import { configPg } from '../lib/pg.core.js'
import { armarFicha, cambiadasDe, devolucionDeFicha, cobroDelCambio, diferenciaDeCambio, diferenciaDeCambioSuelto, filaDeVenta, leerAnular, leerBusqueda, leerCambiar, listaEnGN, rangoDeDias, textoDelMotor } from '../lib/erp/venta.core.js'
import { marcaDeCaja } from '../lib/caja/marcas.core.js'
import { anotarAnuladaDelErp } from '../lib/caja/anulada-erp.core.js'
import { NC_DESDE_LA_VENTA, armarFacturaDelCambio, claveDeFactura, esDeVentaPropia, clavesDeFactura, distintaDeLaPedida, leerFacturar, mesDeVenta, opcionDeCondicion, puedeFacturar, puedeFacturarCambio, puedeHacerNC, renglonesDeVenta } from '../lib/erp/factura.core.js'
import { cruzarTransferencia, pagosRecientes } from '../lib/pagos-recibidos/core.core.js'
import { feriaDeCampanias, reglasDeHoy, reglasGuardadas } from './_caja-reglas.js'
import { pagosDelDia, usosDe } from './_pagos-recibidos.js'
import { ANTES_MANUAL_MS, RECIENTES_CAJA, diasDelCruce } from '../lib/caja/cruce.core.js'
import { guardarReglaErp, prenderCajaErp, reglasDeMarca, sembrarReglasErp, simularReglasErp } from './_erp-reglas.js'
import { ponerRedondeoErp, redondeoDeMarca } from './_erp-redondeo.js'
import { ponerRutaErp, rutasDeMarca } from './_erp-rutas.js'
import { estructuraDeMarca } from './_erp-estructura.js'
import { configuracionDeMarcas, interruptoresDeMarcas, ponerInterruptorErp } from './_erp-interruptores.js'
import { autorizarConPin, encargadasErp, pinesErp, ponerPinErp, quitarPinErp, verificarPinErp } from './_erp-pin.js'
import { ponerRolesErp, restablecerRolesErp, rolesGuardadosDeMarcas, vistaRoles } from './_erp-permisos-rol.js'
import { ajustesDeLinea, crearAjusteErp, resolverAjusteErp } from './_erp-ajustes.js'
import { accionDeTransferencia, documentosDeLinea } from './_erp-transferencia.js'
import { ACCIONES as ACCIONES_TRANSFERENCIA } from '../lib/erp/transferencia-doc.core.js'
import { accionDeSalida, salidasDeLinea } from './_erp-salida.js'
import { ACCIONES_DEPOSITO, accionDeDeposito, depositosDeLinea } from './_erp-depositos.js'
import { ACCIONES as ACCIONES_SALIDA } from '../lib/erp/salida.core.js'
import { accionDeCatalogo, historialDeProducto } from './_erp-catalogo.js'
import { ACCIONES as ACCIONES_CATALOGO } from '../lib/erp/catalogo-edicion.core.js'
import { cobrarCuentaErp, cobrarVentaErp, corregirMedioErp, corregirPrecioErp, editarVentaErp, extraDeVenta, listaDeVentas, notaDeVentaErp } from './_erp-ventas.js'
import { comparacionConTiendas, listaDeMovimientos, listaDeStock, listaDeTransferencias } from './_erp-stock.js'
import { listaDeProductos } from './_erp-productos.js'
import { anotarWhatsappPanel, bcraDelPanel, clienteNuevoPanel, clientesDelPanel, cuentaDeCliente, cuentaDelPanel, cuentasDeLaMarca, sacarWhatsappPanel, fichaDeCliente, listaDeClientes, ponerContactoCliente, ponerCreditoCliente, sqlClienteDeGn, sqlClienteDeLinea } from './_erp-clientes.js'
import { ACCIONES_PEDIDO, accionDePedido, pedidoDelPanel, pedidosDelPanel, preparadosSinPagarDelPanel, productosParaElPanel } from './_erp-pedido.js'
import { resultadoDelMes } from './_erp-inicio.js'
import { ventasPorProducto } from './_erp-por-producto.js'
import { cobrosDelPeriodo, reintentarEntregasErp } from './_erp-cobros.js'
import { gastosDelPeriodo, registrarGastoErp } from './_erp-gastos.js'
import { empujesDeStock, mandarStock } from './_erp-empuje-stock.js'
import { cargarVentaManual, datosParaCargar } from './_erp-cargar.js'

const MARCAS = ['bdi', 'zattia']

/**
 * 🔑 La línea que pide una pantalla del ERP (Bruno, 30-oct: «cada marca ve sus propias ventas»). BDI no tiene líneas; en Zattia
 * es OBLIGATORIA (`zattia` | `stunned`): sin ella la vista contestaba las dos sumadas y nadie se enteraba ⇒ `null` = 400.
 */
export const lineaDelPedido = (marca, linea) => (marca === 'bdi' ? 'bdi' : marca === 'zattia' && (linea === 'zattia' || linea === 'stunned') ? linea : null)
const SIN_LINEA = { status: 400, error: 'Falta la línea (Zattia o Stunned).' }
/** Desde este monto la factura B pide DNI (ARCA). ⚠️ Confirmar con el contador antes de producción. */
const UMBRAL_IDENTIFICAR = 10_000_000

const finDeMes = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

function ambienteSeguro() {
  try { return { ambiente: ambienteDeEntorno(process.env) } } catch (e) { return { ambiente: null, error: e.message } }
}

/**
 * La LÍNEA de cada venta de GN de Zattia, para facturar (Bruno, 30-oct: «cada marca ve sus propias ventas»): una venta es UNA
 * factura ⇒ de Stunned sólo si TODOS sus renglones son STU (criterio `factura` de `lib/erp/linea-gn.core.js`); la mixta y la que
 * ⛔ tiene renglones, de Zattia. `venta_detalles` ⛔ trae SKU: sale de `productos` con `skuParaLinea` (respaldo del proveedor).
 * @returns {Promise<Map<string, 'zattia' | 'stunned'>>} id de la venta → línea
 */
export async function lineasDeVentasGN(b, ids) {
  const nums = [...new Set(ids.map(String))].filter((id) => /^\d+$/.test(id))
  const skus = new Map(nums.map((id) => [id, []]))
  const productos = new Set()
  const renglones = []
  for (let i = 0; i < nums.length; i += 300) {
    const d = await leerTodo(b, 'venta_detalles', (q) => q.select('id, sale_id, product_id').in('sale_id', nums.slice(i, i + 300)).order('id'))
    for (const r of d) { renglones.push(r); if (r.product_id != null) productos.add(Number(r.product_id)) }
  }
  const pids = [...productos]
  const skuDe = new Map()
  for (let i = 0; i < pids.length; i += 200) {
    const ps = await leerTodo(b, 'productos', (q) => q.select('id, sku, proveedor').in('id', pids.slice(i, i + 200)).order('id'))
    for (const p of ps) skuDe.set(String(p.id), skuParaLinea(p))
  }
  for (const r of renglones) skus.get(String(r.sale_id))?.push(skuDe.get(String(r.product_id)) ?? null)
  return new Map([...skus].map(([id, s]) => [id, lineasDeVenta(s, 'factura')[0]]))
}

/** Todo lo que hace falta para mostrar (o facturar) un mes. */
export async function leerMes(mes) {
  const sb = baseFacturacion()
  const { ambiente, error: errorAmbiente } = ambienteSeguro()
  const desde = `${mes}-01`, hasta = finDeMes(mes)

  const [cuentas, periodo] = await Promise.all([
    leerTodo(sb, 'cuentas_cobro', (q) => q.select('nombre, tipo')),
    sb.from('facturacion_mes').select('*').eq('mes', mes).maybeSingle(),
  ])
  if (periodo.error) throw new Error(`facturacion_mes: ${periodo.error.message}`)
  const tipos = new Map(cuentas.map((c) => [c.nombre, c.tipo]))

  // Cobros del mes y facturas de GN, de la base de cada marca.
  /** @type {Map<string, string>} `marca:venta` → línea */
  const lineaGN = new Map()
  const porMarca = await Promise.all(MARCAS.map(async (marca) => {
    const { url, key } = cfgDeMarca(marca)
    const b = createClient(url, key)
    const cobros = await leerTodo(b, 'ventas_cobros', (q) => q.select('venta_id, fecha, cuenta, monto').gte('fecha', desde).lte('fecha', hasta).order('venta_id').order('n'))
    const facturasGNDelMes = await leerTodo(b, 'ventas_factura_gn', (q) => q.select('venta_id, monto').gte('fecha', desde).lte('fecha', hasta).order('venta_id'))
    // Una venta cobrada este mes pudo facturarse en GN en OTRO mes: se busca por id, ⛔ por fecha.
    const ids = [...new Set(cobros.map((c) => c.venta_id))]
    const conFacturaGN = new Set()
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await b.from('ventas_factura_gn').select('venta_id').in('venta_id', ids.slice(i, i + 300))
      if (error) throw new Error(`ventas_factura_gn (${marca}): ${error.message}`)
      for (const f of data) conFacturaGN.add(claveVenta(marca, f.venta_id))
    }
    // Cada venta con su línea (Zattia o Stunned); en BDI, la marca.
    const lineas = marca === 'zattia' ? await lineasDeVentasGN(b, [...ids, ...facturasGNDelMes.map((f) => f.venta_id)]) : new Map()
    for (const [id, l] of lineas) lineaGN.set(claveVenta(marca, id), l)
    return {
      cobros: cobros.map((c) => ({ ...c, marca })),
      facturasGN: facturasGNDelMes.map((f) => ({ ...f, marca })),
      conFacturaGN,
    }
  }))

  const facturasMonitor = ambiente
    ? await leerTodo(sb, 'facturas', (q) => q.select('marca, venta_id, tipo, total, estado, mes').eq('ambiente', ambiente).neq('estado', 'rechazada').order('creado_en'))
    : []
  const yaFacturadas = new Set(porMarca.flatMap((p) => [...p.conFacturaGN]))
  for (const f of facturasMonitor) if (f.tipo === CBTE.FACTURA_A || f.tipo === CBTE.FACTURA_B) yaFacturadas.add(claveVenta(f.marca, f.venta_id))

  const cobros = porMarca.flatMap((p) => p.cobros)
  const calculado = techoDelMes(cobros, tipos, mes)
  const cerrado = periodo.data?.estado === 'cerrado'
  const techo = cerrado ? Number(periodo.data.techo) : calculado.total
  const resumen = resumenDelMes({
    techo,
    facturasGN: porMarca.flatMap((p) => p.facturasGN),
    facturasMonitor: facturasMonitor.filter((f) => f.mes === mes),
  })
  const lineaDe = (marca, id) => (marca === 'bdi' ? 'bdi' : lineaGN.get(claveVenta(marca, id)) ?? 'zattia')
  return {
    sb, ambiente, errorAmbiente, tipos, cobros, yaFacturadas, calculado,
    periodo: periodo.data || null, resumen, lineaDe,
    ventas: ventasParaFacturar(cobros, tipos, mes, yaFacturadas).map((v) => ({ ...v, linea: lineaDe(v.marca, v.ventaId) })),
  }
}

/**
 * Lo que la PANTALLA de Facturación muestra además del mes (🎨 Diseño 7): el Nº y la clienta de GN de cada venta sin
 * factura, y las facturas de GN del mes (`ventas_factura_gn`, por el día de la VENTA). Sólo lectura: ⛔ entra en
 * `facturarVentas` ni en el tope.
 */
async function vistaDeFacturacion(mes, ventas, lineaDe) {
  const desde = `${mes}-01`, hasta = finDeMes(mes)
  const porMarca = await Promise.all(MARCAS.map(async (marca) => {
    const { url, key } = cfgDeMarca(marca)
    const b = createClient(url, key)
    const gn = await leerTodo(b, 'ventas_factura_gn', (q) => q.select('venta_id, numero, tipo, cae, estado, fecha, monto').gte('fecha', desde).lte('fecha', hasta).order('venta_id'))
    const ids = [...new Set([...ventas.filter((v) => v.marca === marca).map((v) => v.ventaId), ...gn.map((f) => String(f.venta_id))])].filter((id) => /^\d+$/.test(id))
    const datos = new Map()
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await b.from('ventas').select('id, number, client_name').in('id', ids.slice(i, i + 300))
      if (error) throw new Error(`ventas (${marca}): ${error.message}`)
      for (const v of data) datos.set(String(v.id), { numero: v.number != null ? String(v.number) : null, cliente: v.client_name || null })
    }
    return { marca, gn, datos }
  }))
  const de = (marca, id) => porMarca.find((p) => p.marca === marca)?.datos.get(String(id)) ?? { numero: null, cliente: null }
  return {
    ventas: ventas.map((v) => ({ ...v, ...de(v.marca, v.ventaId) })),
    facturasGN: porMarca.flatMap((p) => p.gn.map((f) => ({
      marca: p.marca, linea: lineaDe(p.marca, f.venta_id), ventaId: String(f.venta_id), numero: f.numero, tipo: f.tipo, cae: f.cae, estado: f.estado, fecha: f.fecha,
      monto: Number(f.monto), venta: de(p.marca, f.venta_id),
    }))),
  }
}

/**
 * Factura esas ventas de una marca (un lote). Devuelve `{ status, error }` si no se puede, o el
 * resultado del lote. Exportada para la prueba de punta a punta contra homologación.
 */
export async function facturarVentas({ mes, marca, linea, ventaIds, usuario }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  // 🔴 El lote es de UNA línea (30-oct): una venta de Stunned en el lote de Zattia salía con el PV de Zattia.
  const l = lineaDelPedido(marca, linea)
  if (!l) return SIN_LINEA
  const pedidos = [...new Set((Array.isArray(ventaIds) ? ventaIds : []).map(String))]
  if (!pedidos.length) return { status: 400, error: 'No hay ventas elegidas' }
  if (pedidos.length > POR_PEDIDO) return { status: 400, error: `Hasta ${POR_PEDIDO} ventas por vez` }
  if (!arcaConectado()) return { status: 409, error: SIN_ARCA }

  const m = await leerMes(mes)
  if (!m.ambiente) return { status: 409, error: m.errorAmbiente }
  const ptoVta = ptoVtaDe(m.ambiente, marcaDePuntoDeVenta(marca, l), process.env)
  // El monto lo rearma el servidor: una venta que ya no está entre las facturables (o es de la otra línea) se informa.
  const disponibles = new Map(m.ventas.filter((v) => v.marca === marca && v.linea === l).map((v) => [v.ventaId, v]))
  const elegidas = pedidos.map((id) => disponibles.get(id)).filter(Boolean)
  const noDisponibles = pedidos.filter((id) => !disponibles.has(id))
  const suma = elegidas.reduce((a, v) => a + Math.round(v.monto * 100), 0) / 100
  if (suma > m.resumen.pendiente + 0.005) {
    return { status: 409, error: `El grupo suma $${suma} y lo pendiente del mes es $${m.resumen.pendiente}` }
  }

  const hoy = diaArgentino(Date.now())
  const { arca } = clienteArcaDelEntorno(m.sb)
  const r = await facturarLote({
    arca, repo: repoFacturas(m.sb), ambiente: m.ambiente, marca, ptoVta, tipo: CBTE.FACTURA_B,
    comprobantes: elegidas.map((v) => ({
      ventaId: v.ventaId, mes, tipo: CBTE.FACTURA_B, fecha: hoy, total: v.monto,
      receptor: { docTipo: DOC.SIN_IDENTIFICAR, docNro: 0, condicionIva: COND_IVA.CONSUMIDOR_FINAL },
    })),
    reglas: { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy },
    lote: globalThis.crypto.randomUUID(), usuario,
  })
  return {
    ambiente: m.ambiente, ptoVta,
    autorizadas: r.autorizadas.map((f) => ({ ventaId: f.venta_id, numero: f.numero, cae: f.cae, total: f.total })),
    rechazadas: r.rechazadas.map((f) => ({ ventaId: f.venta_id, motivos: f.motivos })),
    noSalen: [...r.noSalen.map((c) => ({ ventaId: c.ventaId, motivos: c.motivos })), ...noDisponibles.map((id) => ({ ventaId: id, motivos: ['Ya no está entre las ventas para facturar'] }))],
  }
}

/**
 * La NOTA DE CRÉDITO de una factura del monitor: la anula ENTERA (una por venta, como GN hoy), con la
 * factura asociada para ARCA y el mismo receptor. Sale por el MISMO camino que las facturas (`facturarLote`:
 * candado, número reservado antes del CAE, una sola por venta). 🔴 Con CAE ⛔ se borra.
 * El mes del techo es el de HOY (la NC resta en el período en que se emite) — ❓ a confirmar con el contador.
 * 🔴 La factura de una VENTA PROPIA (`venta_id` = uuid del motor) ⛔ sale de acá: su NC va por la venta
 * (`notaDeCreditoDeVenta`, `desdeVenta`), que exige la venta ANULADA y ata la NC a la ficha. Caminado 16-oct: desde
 * Facturación la venta #236 quedó en pie con la factura anulada y la ficha ⛔ mostraba la NC.
 */
export async function notaDeCredito({ facturaId, usuario, desdeVenta = false }, deps = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(String(facturaId || ''))) return { status: 400, error: 'Factura inválida' }
  const { ambiente, error } = ambienteSeguro()
  if (!ambiente) return { status: 409, error }
  const sb = deps.sb || (deps.repo ? null : baseFacturacion())
  const f = deps.leerFactura ? await deps.leerFactura(facturaId) : await (async () => {
    const { data, error: e } = await sb.from('facturas')
      .select('id, ambiente, marca, venta_id, tipo, pto_vta, numero, fecha, total, doc_tipo, doc_nro, cond_iva, estado').eq('id', facturaId).maybeSingle()
    if (e) throw new Error(`facturas: ${e.message}`)
    return data
  })()
  if (!f || f.ambiente !== ambiente) return { status: 404, error: 'La factura no existe en este ambiente.' }
  if (f.estado !== 'autorizada') return { status: 409, error: 'Sólo una factura autorizada (con CAE) lleva nota de crédito.' }
  if (!desdeVenta && esDeVentaPropia(f.venta_id)) return { status: 409, error: NC_DESDE_LA_VENTA }
  // Una NOTA DE DÉBITO también se acredita (un error en la ND se corrige así): la NC la asocia a ELLA y sale por su importe.
  const tipo = { [CBTE.FACTURA_A]: CBTE.NC_A, [CBTE.FACTURA_B]: CBTE.NC_B, [CBTE.ND_A]: CBTE.NC_A, [CBTE.ND_B]: CBTE.NC_B }[f.tipo]
  if (!tipo) return { status: 409, error: 'Eso ya es una nota de crédito.' }
  // 🔴 Una NC PARCIAL (la de un cambio) ya acreditó parte: ésta sale por lo que le QUEDA a la factura (la entera
  // acreditaría dos veces lo devuelto). Acreditada del todo ⇒ ⛔ sale.
  const previas = deps.ncsDeFactura ? await deps.ncsDeFactura(f.id) : await ncsDeFactura(sb, f.id)
  if (previas.some((x) => String(x.venta_id) === String(f.venta_id))) return { status: 409, error: 'La venta ya tiene nota de crédito' }
  const queda = Math.round(Number(f.total) * 100 - previas.reduce((a, x) => a + Math.round(Number(x.total) * 100), 0)) / 100
  if (!(queda > 0)) return { status: 409, error: 'La factura ya está acreditada entera (por las notas de crédito de sus cambios).' }
  const arca = arcaDe(deps, sb)
  if (!arca) return { status: 409, error: SIN_ARCA }
  const hoy = diaArgentino(Date.now())
  const r = await facturarLote({
    arca, repo: deps.repo || repoFacturas(sb), ambiente, marca: f.marca, ptoVta: Number(f.pto_vta), tipo,
    comprobantes: [{
      ventaId: f.venta_id, mes: hoy.slice(0, 7), tipo, fecha: hoy, total: queda, asociadoId: f.id,
      receptor: { docTipo: Number(f.doc_tipo), docNro: Number(f.doc_nro), condicionIva: Number(f.cond_iva) },
      asociado: { tipo: Number(f.tipo), ptoVta: Number(f.pto_vta), numero: Number(f.numero), fecha: f.fecha },
    }],
    reglas: { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy },
    lote: globalThis.crypto.randomUUID(), usuario,
  })
  const [hecha] = r.autorizadas
  if (hecha) return { ambiente, autorizada: { id: hecha.id, numero: hecha.numero, cae: hecha.cae, total: hecha.total } }
  const motivos = [...r.rechazadas, ...r.noSalen].flatMap((x) => x.motivos || [])
  return { status: 409, error: motivos.join(' · ') || 'ARCA no autorizó la nota de crédito.' }
}

/**
 * La NOTA DE DÉBITO de una factura del monitor: SUMA un importe a una factura ya autorizada (un recargo, una diferencia de precio
 * que se cobra de más). Asocia la factura, de su MISMA clase (ND A a una A, ND B a una B), con el mismo receptor, y sale por el
 * MISMO camino que las facturas (`facturarLote`: candado, número reservado antes del CAE). A diferencia de la NC, una factura puede
 * llevar VARIAS (el lote ⛔ pregunta «¿ya tiene?») y sale por el `monto` que se pide (IVA incluido), ⛔ por la factura entera.
 * Suma en el techo del mes de HOY. Con CAE ⛔ se borra: un error se corrige con una nota de crédito.
 * 🔴 La factura de una VENTA PROPIA (uuid del motor) todavía ⛔ sale de acá: la ND tendría que atarse a la venta (`venta_factura`
 * tipo `nd`) y esa mano ⛔ está hecha.
 * @param {{ facturaId: string, monto: number|string, usuario: string|null }} p
 */
export async function notaDeDebito({ facturaId, monto, usuario }, deps = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(String(facturaId || ''))) return { status: 400, error: 'Factura inválida' }
  const importe = Math.round(Number(monto) * 100) / 100
  if (!(importe > 0) || importe > 100_000_000) return { status: 400, error: 'Poné el importe de la nota de débito (IVA incluido, mayor a 0).' }
  const { ambiente, error } = ambienteSeguro()
  if (!ambiente) return { status: 409, error }
  const sb = deps.sb || (deps.repo ? null : baseFacturacion())
  const f = deps.leerFactura ? await deps.leerFactura(facturaId) : await (async () => {
    const { data, error: e } = await sb.from('facturas')
      .select('id, ambiente, marca, venta_id, tipo, pto_vta, numero, fecha, total, doc_tipo, doc_nro, cond_iva, estado').eq('id', facturaId).maybeSingle()
    if (e) throw new Error(`facturas: ${e.message}`)
    return data
  })()
  if (!f || f.ambiente !== ambiente) return { status: 404, error: 'La factura no existe en este ambiente.' }
  if (f.estado !== 'autorizada') return { status: 409, error: 'Sólo una factura autorizada (con CAE) lleva nota de débito.' }
  if (esDeVentaPropia(f.venta_id)) return { status: 409, error: 'La nota de débito de una venta del ERP todavía no se hace desde acá.' }
  const tipo = { [CBTE.FACTURA_A]: CBTE.ND_A, [CBTE.FACTURA_B]: CBTE.ND_B }[f.tipo]
  if (!tipo) return { status: 409, error: 'La nota de débito se suma a una factura, no a una nota de crédito ni a otra de débito.' }
  const arca = arcaDe(deps, sb)
  if (!arca) return { status: 409, error: SIN_ARCA }
  const hoy = diaArgentino(Date.now())
  const r = await facturarLote({
    arca, repo: deps.repo || repoFacturas(sb), ambiente, marca: f.marca, ptoVta: Number(f.pto_vta), tipo,
    comprobantes: [{
      ventaId: f.venta_id, mes: hoy.slice(0, 7), tipo, fecha: hoy, total: importe, asociadoId: f.id,
      receptor: { docTipo: Number(f.doc_tipo), docNro: Number(f.doc_nro), condicionIva: Number(f.cond_iva) },
      asociado: { tipo: Number(f.tipo), ptoVta: Number(f.pto_vta), numero: Number(f.numero), fecha: f.fecha },
    }],
    reglas: { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy },
    lote: globalThis.crypto.randomUUID(), usuario,
  })
  const [hecha] = r.autorizadas
  if (hecha) return { ambiente, autorizada: { id: hecha.id, numero: hecha.numero, cae: hecha.cae, total: hecha.total } }
  const motivos = [...r.rechazadas, ...r.noSalen].flatMap((x) => x.motivos || [])
  return { status: 409, error: motivos.join(' · ') || 'ARCA no autorizó la nota de débito.' }
}

/**
 * Las facturas que el monitor emitió en el mes (autorizadas, del ambiente de hoy), con lo que el PDF
 * necesita: la fila tal como se le mandó a ARCA y el número de la venta en GN para el renglón.
 */
/** El descuento (o el redondeo hacia arriba, que GN guarda como descuento negativo) y el envío de una venta. */
export function ajustesDeVenta(v) {
  const r = []
  const d = Number(v.discount) || 0, s = Number(v.shipping_cost) || 0
  if (d > 0) r.push({ descripcion: 'Descuento', cantidad: 1, unitario: -d, importe: -d })
  if (d < 0) r.push({ descripcion: 'Redondeo', cantidad: 1, unitario: -d, importe: -d })
  if (s > 0) r.push({ descripcion: 'Envío', cantidad: 1, unitario: s, importe: s })
  return r
}

/**
 * El cliente de ARCA de este servidor, o null si ⛔ tiene el certificado (prod hoy): la puerta que pide un CAE contesta
 * 409 `SIN_ARCA` ANTES de reservar nada, ⛔ un 500 de adentro del cliente. Un oráculo o un test lo inyecta en `deps.arca`.
 */
function arcaDe(deps, sb) {
  if (deps.arca) return deps.arca
  return arcaConectado() ? clienteArcaDelEntorno(sb).arca : null
}

/** La empresa de cada marca (tabla `marca` del motor): ⛔ cambia ⇒ una lectura por marca y por instancia. */
const empresas = new Map()
async function empresaDeMarca(sb, marca) {
  if (!empresas.has(marca)) {
    const m = await sb.from('marca').select('empresa_id').eq('id', marca).maybeSingle()
    if (m.error) throw new Error(`marca: ${m.error.message}`)
    if (!m.data) return null
    empresas.set(marca, m.data.empresa_id)
  }
  return empresas.get(marca)
}

/**
 * Nombre y talle de cada variante (`producto/talle`) del espejo, para los renglones de una venta, su ficha, su
 * factura y las Diferencias. 🔴 Paginado: el espejo tiene una fila por talle Y depósito ⇒ 300 productos pasan
 * las 1000 filas que devuelve Supabase de una, y cortaba CALLADO (87 de 92 sin nombre en BDI, medido 14-oct).
 * @param {any} b supabase de la marca @param {Iterable<any>} productos ids de producto (se repiten: se sacan)
 */
async function nombresDeVariantes(b, productos) {
  const ids = [...new Set(productos)]
  /** @type {Map<string, { nombre: string, talle: string }>} */
  const nombres = new Map()
  const tandas = []
  for (let i = 0; i < ids.length; i += 200) tandas.push(ids.slice(i, i + 200))
  const leidas = await Promise.all(tandas.map((t) => leerTodo(b, 'inventario', (x) => x.select('product_id, size_id, product_name, size_name, barcode').in('product_id', t).order('product_id').order('size_id'))))
  for (const r of leidas.flat()) nombres.set(`${r.product_id}/${r.size_id}`, { nombre: r.product_name, talle: r.size_name, codigo: r.barcode ?? null })
  return nombres
}

/** Número y renglones de las ventas PROPIAS facturadas (por su uuid), de `venta_ficha`. */
async function renglonesPropios(b, marca, ids, { numeros, detalles, lineas }) {
  const fichas = await leerTodo(b, 'venta_ficha', (q) => q.select('id, marca, numero, tipo, total, lineas, detalle').in('id', ids))
  const nombres = await nombresDeVariantes(b, fichas.flatMap((f) => (f.lineas || []).map((l) => l.product_id)))
  for (const f of fichas) {
    numeros.set(claveVenta(marca, f.id), String(f.detalle?.gn_number ?? f.numero))
    if (lineas && f.marca) lineas.set(claveVenta(marca, f.id), f.marca)
    // Un CAMBIO tiene DOS comprobantes con su clave (la NC de lo devuelto y la factura de lo nuevo): sus líneas ⛔ suman
    // ninguno de los dos ⇒ sin detalle, el PDF lleva un renglón por el total de cada uno.
    if (f.tipo === 'cambio') continue
    detalles.set(claveVenta(marca, f.id), renglonesDeVenta(f, nombres))
  }
}

export async function facturasDelMes(mes) {
  const { ambiente, error } = ambienteSeguro()
  if (!ambiente) return { status: 409, error }
  const sb = baseFacturacion()
  const facturas = await leerTodo(sb, 'facturas', (q) => q
    .select('id, ambiente, marca, venta_id, tipo, pto_vta, numero, fecha, total, neto, iva, doc_tipo, doc_nro, cond_iva, estado, cae, cae_vence')
    .eq('ambiente', ambiente).eq('mes', mes).eq('estado', 'autorizada').order('creado_en'))
  const numeros = new Map(), detalles = new Map(), receptores = new Map(), lineas = new Map()
  for (const marca of MARCAS) {
    const todas = [...new Set(facturas.filter((f) => f.marca === marca).map((f) => f.venta_id))]
    if (!todas.length) continue
    const { url, key } = cfgDeMarca(marca)
    const b = createClient(url, key)
    // El receptor de las A (y sus NC): la razón social y el domicilio de la ficha de la clienta, por su CUIT.
    const cuits = [...new Set(facturas.filter((f) => f.marca === marca && Number(f.doc_tipo) === DOC.CUIT).map((f) => String(f.doc_nro)))]
    for (let i = 0; i < cuits.length; i += 200) {
      // La ficha es una por EMPRESA y documento (§11): sin la empresa, el PDF podría salir con la de otra.
      const empresa = await empresaDeMarca(b, marca)
      if (!empresa) break
      const { data, error: e } = await b.from('cliente').select('doc, nombre, razon_social, domicilio').eq('empresa_id', empresa).in('doc', cuits.slice(i, i + 200))
      if (e) throw new Error(`cliente (${marca}): ${e.message}`)
      for (const c of data) receptores.set(`${marca}/${c.doc}`, { nombre: c.razon_social || c.nombre, domicilio: c.domicilio })
    }
    // Las de una venta propia sin venta de GN (la factura a pedido de la Caja) van por el uuid del motor.
    const ids = todas.filter((id) => /^\d+$/.test(id))
    const propias = todas.filter((id) => !/^\d+$/.test(id))
    if (propias.length) await renglonesPropios(b, marca, propias, { numeros, detalles, lineas })
    // La línea de cada factura (30-oct): la de su venta. Las de GN por sus renglones; las propias, `venta_ficha.marca`.
    if (marca === 'zattia') for (const [id, l] of await lineasDeVentasGN(b, ids)) lineas.set(claveVenta(marca, id), l)
    for (let i = 0; i < ids.length; i += 300) {
      const tanda = ids.slice(i, i + 300)
      const { data, error: e } = await b.from('ventas').select('id, number, discount, shipping_cost').in('id', tanda)
      if (e) throw new Error(`ventas (${marca}): ${e.message}`)
      for (const v of data) numeros.set(claveVenta(marca, v.id), v.number != null ? String(v.number) : null)
      const d = await leerTodo(b, 'venta_detalles', (q) => q.select('sale_id, product_name, size, quantity, unit_price, total').in('sale_id', tanda).order('id'))
      for (const r of d) {
        const k = claveVenta(marca, r.sale_id)
        if (!detalles.has(k)) detalles.set(k, [])
        detalles.get(k).push({ descripcion: [r.product_name, r.size].filter(Boolean).join(' - '), cantidad: Number(r.quantity), unitario: Number(r.unit_price), importe: Number(r.total) })
      }
      // GN guarda las prendas SIN el descuento ni el envío de la venta: total = prendas − descuento + envío
      // (medido sep-2026: explica el 98% de las ventas). Van como renglones, igual que en la factura de GN.
      for (const v of data) {
        const k = claveVenta(marca, v.id)
        if (!detalles.has(k)) continue
        for (const extra of ajustesDeVenta(v)) detalles.get(k).push(extra)
      }
    }
  }
  return {
    ambiente,
    facturas: facturas.map((f) => ({
      ...f, linea: lineas.get(claveVenta(f.marca, f.venta_id)) ?? (f.marca === 'bdi' ? 'bdi' : 'zattia'), total: Number(f.total), neto: Number(f.neto), iva: Number(f.iva), numero: Number(f.numero), doc_nro: Number(f.doc_nro),
      venta_numero: numeros.get(claveVenta(f.marca, f.venta_id)) ?? null,
      renglones: detalles.get(claveVenta(f.marca, f.venta_id)) || [],
      receptor_nombre: receptores.get(`${f.marca}/${f.doc_nro}`)?.nombre ?? null,
      receptor_domicilio: receptores.get(`${f.marca}/${f.doc_nro}`)?.domicilio ?? null,
    })),
  }
}

/**
 * Stock e historial de una prenda (sólo lectura). Sin `producto`: busca en el espejo de GN
 * (`inventario`) por SKU, código de barras o nombre. Con `producto` y `talle`: lo que dice el libro
 * (`stock_movimiento`, cada fila) y lo que dice GN ahora, por depósito.
 */
export async function stockDePrenda({ marca, q, producto, talle }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const { url, key } = cfgDeMarca(marca)
  const b = createClient(url, key)
  if (!producto) {
    const t = String(q || '').trim()
    if (t.length < 3) return { status: 400, error: 'Escribí al menos 3 letras o números.' }
    const like = `%${t.replace(/[%_,()]/g, ' ')}%`
    const { data, error } = await b.from('inventario')
      .select('product_id, product_name, size_id, size_name, sku, barcode, store_name, available_quantity')
      .or(`sku.ilike.${like},barcode.eq.${t.replace(/[,()]/g, '')},product_name.ilike.${like}`)
      .order('product_name').order('size_name').limit(400)
    if (error) throw new Error(`inventario: ${error.message}`)
    const porVariante = new Map()
    for (const r of data) {
      const k = `${r.product_id}/${r.size_id}`
      const v = porVariante.get(k) || { producto: String(r.product_id), talle: String(r.size_id), nombre: r.product_name, talleNombre: r.size_name, sku: r.sku, barcode: r.barcode, gn: 0 }
      v.gn += Number(r.available_quantity || 0)
      porVariante.set(k, v)
    }
    return { variantes: [...porVariante.values()].slice(0, 60), cortado: porVariante.size > 60 }
  }
  if (!/^\d+$/.test(String(producto)) || !/^\d+$/.test(String(talle))) return { status: 400, error: 'Prenda inválida' }
  const [movs, gn] = await Promise.all([
    leerTodo(b, 'stock_movimiento', (x) => x.select('id, deposito, cantidad, tipo, origen, origen_ref, ocurrido_en, linea, detalle')
      .eq('product_id', producto).eq('size_id', talle).order('id')),
    b.from('inventario').select('product_name, size_name, sku, barcode, store_name, available_quantity').eq('product_id', producto).eq('size_id', talle),
  ])
  if (gn.error) throw new Error(`inventario: ${gn.error.message}`)
  const f = gn.data[0] || {}
  return {
    prenda: { producto: String(producto), talle: String(talle), nombre: f.product_name ?? null, talleNombre: f.size_name ?? null, sku: f.sku ?? null, barcode: f.barcode ?? null },
    ...stockDeVariante({ marca, movimientos: movs, gn: gn.data }),
  }
}

/**
 * La conexión pg de la base de la marca (la del rol `motor`): para que ESCRIBA el motor (⛔ supabase-js: no tiene
 * transacciones) y para sumar el libro. Sin la variable ⛔ está conectado todavía: se dice, ⛔ se adivina.
 */
const PG_DE_MARCA = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' }

/**
 * La SOBREVENTA: las variantes × depósito con el libro en NEGATIVO hoy. Se suma en la base (por pg, con la
 * conexión del motor: supabase-js ⛔ agrupa). Sin la conexión ⇒ null (la pantalla dice que falta).
 */
async function negativosDelLibro(marca) {
  const conexion = process.env[PG_DE_MARCA[marca]]
  if (!conexion) return null
  const { default: pg } = await import('pg')
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: 5000, statement_timeout: 15000 })
  await db.connect()
  try {
    return (await db.query(`select linea, product_id, size_id, deposito, sum(cantidad)::int as nivel from stock_movimiento
      group by 1, 2, 3, 4 having sum(cantidad) < 0 order by 5 limit 300`)).rows
  } finally {
    await db.end().catch(() => {})
  }
}

/**
 * Ventas propias (las que escribe el motor, `motor/venta/`): busca por número, cliente o fecha. Lee
 * directo de la base (contrato de la venta, §2); ⛔ escribe. Stunned vive en la base de Zattia.
 */
export async function buscarVentas({ marca, q, desde, hasta }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const b = leerBusqueda({ q, desde, hasta })
  if (b.error) return { status: 400, error: b.error }
  const { url, key } = cfgDeMarca(marca)
  const sb = createClient(url, key)
  let consulta = sb.from('venta').select('id, numero, marca, tipo, estado, origen, canal, deposito, total, prueba, ocurrida_en, cliente:cliente_id (nombre, doc)')
  if (b.numero != null) consulta = consulta.eq('numero', b.numero)
  if (b.cliente) {
    const like = `%${b.cliente}%`
    const { data, error } = await sb.from('cliente').select('id').or(`nombre.ilike.${like},doc.ilike.${like},email.ilike.${like},whatsapp.ilike.${like}`).limit(200)
    if (error) throw new Error(`cliente: ${error.message}`)
    if (!data.length) return { ventas: [], cortado: false }
    consulta = consulta.in('cliente_id', data.map((c) => c.id))
  }
  const r = rangoDeDias(b.desde, b.hasta)
  if (r.desde) consulta = consulta.gte('ocurrida_en', r.desde)
  if (r.hasta) consulta = consulta.lt('ocurrida_en', r.hasta)
  const { data, error } = await consulta.order('ocurrida_en', { ascending: false }).limit(101)
  if (error) throw new Error(`venta: ${error.message}`)
  return { ventas: data.slice(0, 100).map(filaDeVenta), cortado: data.length > 100 }
}

/** La ficha de una venta propia (`venta_ficha`), con el nombre de cada prenda y sus cambios. */
export async function fichaDeVenta({ marca, id }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return { status: 400, error: 'Venta inválida' }
  const { url, key } = cfgDeMarca(marca)
  const sb = createClient(url, key)
  const { data: f, error } = await sb.from('venta_ficha').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`venta_ficha: ${error.message}`)
  if (!f) return { status: 404, error: 'La venta no existe.' }
  const columnas = 'id, numero, marca, tipo, estado, origen, canal, deposito, total, prueba, ocurrida_en'
  const [cambios, original, nombres, devolucion] = await Promise.all([
    sb.from('venta').select(columnas).eq('venta_original_id', id).order('ocurrida_en'),
    f.venta_original_id ? sb.from('venta').select(columnas).eq('id', f.venta_original_id).maybeSingle() : Promise.resolve({ data: null }),
    nombresDeVariantes(sb, (f.lineas || []).map((l) => l.product_id)),
    devolucionDeVenta(sb, f),
  ])
  for (const [t, r] of [['venta', cambios], ['venta', original]]) if (r.error) throw new Error(`${t}: ${r.error.message}`)
  // Lo que ya volvió en cambios confirmados: cuánto se puede devolver todavía de cada línea.
  const vivos = (cambios.data || []).filter((c) => c.estado === 'confirmada').map((c) => c.id)
  const devueltas = vivos.length ? await sb.from('venta_linea').select('linea_origen_id, cantidad').in('venta_id', vivos).lt('cantidad', 0) : { data: [] }
  if (devueltas.error) throw new Error(`venta_linea: ${devueltas.error.message}`)
  // Los TOTALES de sus comprobantes (base de facturación): si las NC ya acreditan la factura entera, ⛔ se ofrece otra.
  const ids = (f.facturas || []).map((x) => x.factura_id).filter(Boolean)
  const montos = new Map()
  if (ids.length) {
    const { data, error: e } = await baseFacturacion().from('facturas').select('id, total').in('id', ids).neq('estado', 'rechazada')
    if (e) throw new Error(`facturas: ${e.message}`)
    for (const x of data) montos.set(x.id, Number(x.total))
  }
  // «GN la vendió sin crédito» (A, 20-oct): la mayorista en sombra que el ERP habría frenado. Aviso, ⛔ error.
  const sinCreditoGN = f.detalle?.cuenta_autoriza?.motivo === 'gn'
  return { ...armarFicha(f, { nombres, cambios: cambios.data || [], original: original.data, cambiadas: cambiadasDe(devueltas.data), montos, devolucion }), sinCreditoGN }
}

/**
 * Lo que hace falta para REIMPRIMIR el ticket de una venta desde ERP › Ventas, idéntico al del POS (Bruno, 29-oct). Una venta
 * de la Caja devuelve su fila de `caja_venta` (`origen_ref` = su id): la pantalla la pasa por la MISMA `ticketDeVenta` del POS.
 * Cualquier otra (Tienda Nube, cargada a mano) se arma con la ficha. Un cambio devuelve de qué venta salió (`detalle.cambio_de`),
 * que es lo que el comprobante dice arriba.
 */
export async function ticketDeVentaErp({ marca, id }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return { status: 400, error: 'Venta inválida' }
  const { url, key } = cfgDeMarca(marca)
  const sb = createClient(url, key)
  const { data: v, error } = await sb.from('venta').select('id, tipo, origen, origen_ref, detalle').eq('id', id).maybeSingle()
  if (error) throw new Error(`venta: ${error.message}`)
  if (!v) return { status: 404, error: 'La venta no existe.' }
  let cajaVenta = null
  if (v.origen === 'caja' && v.tipo === 'venta' && /^[0-9a-f-]{36}$/i.test(String(v.origen_ref || ''))) {
    const r = await sb.from('caja_venta').select('id, estado, renglones, pagos, subtotal, total, paga_con, email, gn_number, erp_numero, destino, creada_en').eq('id', v.origen_ref).maybeSingle()
    if (r.error) throw new Error(`caja_venta: ${r.error.message}`)
    cajaVenta = r.data
  }
  return { cajaVenta, cambioDe: v.tipo === 'cambio' ? (v.detalle && v.detalle.cambio_de) || null : null }
}

/**
 * §17 Lo que la ficha lee para anular y desarmar: los pagos con el medio de su cuenta (qué fue plata), el estado del
 * pedido de TN (adónde iría la prenda), lo devuelto (`venta_devolucion`) y si la prenda ya volvió (`venta_vuelta`).
 * La regla (`vueltaDe`, `pagosDePlata`, `pinEn`) es la del motor. Sin la 028 en la base: `conDevolucion: false`.
 */
async function devolucionDeVenta(sb, f) {
  const { vueltaDe, pagosDePlata, pinEn } = await import('../motor/venta/devolucion.core.mjs')
  const [tienda, tnId] = f.origen === 'tn' ? String(f.origen_ref || '').split(':') : []
  const [pagos, orden, devs, volvio] = await Promise.all([
    sb.from('venta_pago').select('monto, cuenta:cuenta_cobro_id (medio)').eq('venta_id', f.id),
    tienda && /^\d+$/.test(tnId || '') ? sb.from('tn_orden').select('estado').eq('tienda', tienda).eq('tn_id', tnId).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('venta_devolucion').select('forma, medio, monto, usuario, ocurrida_en, cuenta:cuenta_cobro_id (nombre)').eq('venta_id', f.id).order('ocurrida_en'),
    sb.from('venta_vuelta').select('usuario, vuelta_en').eq('venta_id', f.id).maybeSingle(),
  ])
  if (pagos.error) throw new Error(`venta_pago: ${pagos.error.message}`)
  if (orden.error) throw new Error(`tn_orden: ${orden.error.message}`)
  const plata = pagosDePlata((pagos.data || []).map((p) => ({ monto: Number(p.monto), cuenta_medio: p.cuenta?.medio ?? null }))).reduce((a, p) => a + p.monto, 0)
  return devolucionDeFicha({
    plata, subtotal: Number(f.subtotal), total: Number(f.total), vueltaSiAnula: vueltaDe(orden.data?.estado ?? null), pin: pinEn(f.marca),
    devoluciones: devs.error ? [] : devs.data, volvio: volvio.error ? null : volvio.data, conDevolucion: !devs.error,
  })
}

/**
 * Las liquidaciones EN CURSO del monitor con sus productos aplicados (ERP › Precios), por el cliente del MONITOR: el rol del
 * motor ⛔ tiene permiso sobre `liquidaciones` (medido en prod, 20-oct).
 */
async function leerLiquidaciones(marca) {
  const { url, key } = cfgDeMarca(marca)
  const b = createClient(url, key)
  const liqs = await b.from('liquidaciones').select('id, store, nombre, datos').eq('estado', 'en_curso')
  if (liqs.error) throw new Error(`liquidaciones: ${liqs.error.message}`)
  if (!liqs.data?.length) return []
  const items = await b.from('liquidacion_items').select('liq_id, pid, datos').eq('estado', 'aplicado').in('liq_id', liqs.data.map((l) => l.id)).limit(5000)
  if (items.error) throw new Error(`liquidacion_items: ${items.error.message}`)
  const porId = new Map(liqs.data.map((l) => [l.id, l]))
  return items.data.map((i) => {
    const l = porId.get(i.liq_id)
    return { product_id: String(i.pid), store: l.store, nombre: l.nombre, hasta: l.datos?.hasta ?? null, precio: i.datos?.decision?.precioSale ?? null }
  })
}

/** Abre la conexión del motor de la marca, corre `fn(db, motor)` y la cierra. Sin la variable: 409, dicho. */
async function conMotor(marca, que, fn) {
  const conexion = process.env[PG_DE_MARCA[marca]]
  if (!conexion) return { status: 409, error: `${que} todavía no está conectado: falta la conexión del motor en Vercel.` }
  const [{ default: pg }, motor] = await Promise.all([import('pg'), import('../motor/venta/registrar.mjs')])
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: 5000, statement_timeout: 15000 })
  try {
    await db.connect()
    return await fn(db, motor)
  } finally {
    await db.end().catch(() => {})
  }
}

const errorDelMotor = (r) => ({ status: r.error.codigo === 'NO_ENCONTRADA' ? 404 : 409, error: textoDelMotor(r.error) })

/** Anula una venta propia con motivo (sólo admin: lo chequea el handler). La plata vuelve a los mismos pagos. */
export async function anularVentaPropia({ marca, body, usuario }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const a = leerAnular(body)
  if (a.error) return { status: 400, error: a.error }
  return conMotor(marca, 'Anular', async (db, { anularVenta }) => {
    // §17: la devolución SIEMPRE va (plata o saldo); el PIN (`DEVOLUCION_CON_PIN`) está apagado ⇒ ⛔ se manda `autoriza`.
    const r = await anularVenta(db, { venta_id: a.ventaId, motivo: a.motivo, usuario, devolucion: a.devolucion, ...(a.cliente ? { cliente: a.cliente } : {}) })
    if (!r.ok) return errorDelMotor(r)
    // Una venta de la CAJA (Stunned: `caja_venta.destino = 'erp'`) queda anulada también en su fila, para el cierre del turno.
    // ⛔ Frena: la anulación ya está hecha en el motor; si no se pudo anotar, se avisa.
    let cajaSinAnotar = null
    try {
      const o = (await db.query('select origen, origen_ref from venta where id = $1', [a.ventaId])).rows[0]
      if (o && o.origen === 'caja' && o.origen_ref) {
        const { url, key } = cfgDeMarca(marca)
        const n = await anotarAnuladaDelErp(createClient(url, key), String(o.origen_ref), { por: usuario, motivo: a.motivo })
        if (n.error) cajaSinAnotar = n.error
      }
    } catch (e) { cajaSinAnotar = String((e && e.message) || e).slice(0, 200) }
    if (cajaSinAnotar) console.error(`[erp] anulada ${a.ventaId} sin anotar en caja_venta: ${cajaSinAnotar}`)
    return { ok: true, movimientos: r.movimientos, ncPendiente: r.nc_pendiente, vuelta: r.vuelta, devolucion: r.devolucion, saldo: r.saldo ?? null, ...(cajaSinAnotar ? { cajaSinAnotar } : {}) }
  })
}

/** §17 La prenda de una anulada «a desarmar» / «a recibir» VOLVIÓ (se escaneó el desarme): recién ahí el libro la suma. */
export async function confirmarVueltaPropia({ marca, body, usuario }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const ventaId = String(body?.ventaId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(ventaId)) return { status: 400, error: 'Venta inválida' }
  return conMotor(marca, 'Confirmar el desarme', async (db, { confirmarVuelta }) => {
    const r = await confirmarVuelta(db, { venta_id: ventaId, usuario: usuario || 'monitor' })
    if (!r.ok) return errorDelMotor(r)
    return { ok: true, movimientos: r.movimientos, vuelta: r.vuelta }
  })
}

/**
 * El cambio en el local (`erp › Caja`): entra lo devuelto, sale lo nuevo, y la diferencia se cobra o
 * queda a favor. 🔑 Hasta el corte de GN es de PRUEBA (⛔ mueve el libro): el local sigue cambiando en GN.
 * Que ⛔ se devuelva más de lo vendido lo hace cumplir el motor (`DEVUELVE_DE_MAS`), y la diferencia la
 * vuelve a sumar él: si ⛔ coincide con el pago, 409.
 */
/**
 * El saldo a favor de una clienta, por documento (el del MISMO libro que la venta que se cambia: `prueba`, por defecto el de prueba): para
 * ofrecerlo como forma de pago en el cambio. Lee la vista `saldo_favor` del motor (contrato §6).
 * @param {{ marca: string, doc: any, prueba?: boolean, linea?: string | null }} x
 */
export async function saldoDeClienta({ marca: base, doc, prueba = true, linea = null }) {
  if (!MARCAS.includes(base)) return { status: 400, error: 'Marca inválida' }
  // Stunned vive en la base de Zattia pero su saldo es de marca `stunned` (lo guarda el cambio con la marca de la venta).
  if (linea != null && !(linea === 'stunned' && base === 'zattia')) return { status: 400, error: 'Línea inválida' }
  const marca = linea || base
  const d = String(doc ?? '').replace(/\D/g, '')
  if (!/^\d{7,11}$/.test(d)) return { status: 400, error: 'Documento inválido' }
  const { url, key } = cfgDeMarca(base)
  const sb = createClient(url, key)
  // La ficha es UNA por empresa y documento (§11): sin la empresa, dos empresas en la misma base harían
  // que `maybeSingle` falle con dos filas, o que el saldo saliera de la ficha de la otra.
  const empresa = await empresaDeMarca(sb, marca)
  if (!empresa) return { status: 409, error: `La marca ${marca} no está en el motor de esta base.` }
  const cl = await sb.from('cliente').select('id, nombre').eq('empresa_id', empresa).eq('doc', d).maybeSingle()
  if (cl.error) throw new Error(`cliente: ${cl.error.message}`)
  if (!cl.data) return { cliente: null, saldo: 0 }
  const s = await sb.from('saldo_favor').select('saldo').eq('cliente_id', cl.data.id).eq('marca', marca).eq('prueba', prueba).maybeSingle()
  if (s.error) throw new Error(`saldo_favor: ${s.error.message}`)
  return { cliente: { nombre: cl.data.nombre }, saldo: Number(s.data?.saldo || 0) }
}

export async function cambiarVentaPropia({ marca, body, usuario }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const c = leerCambiar(body)
  if (c.error) return { status: 400, error: c.error }
  const cajaDe = marcaDeCaja(marca)
  if (!cajaDe) return { status: 400, error: 'El cambio en la Caja es de Zattia y BDI.' }
  // 🔑 El cambio SUELTO es de Stunned (Bruno, 27-oct: sin vuelta a GN): Zattia y BDI siguen cambiando en GN.
  if (c.modo !== 'erp' && marca !== 'zattia') return { status: 400, error: 'El cambio sin venta del ERP es sólo de Stunned.' }
  // Sin ticket, el PIN de la encargada se verifica ACÁ (⛔ un `autoriza` armado en el navegador), antes de abrir el cambio.
  let autoriza = null
  if (c.modo === 'sin_ticket') {
    const a = await autorizarConPin({ marca, persona: c.pin.persona, pin: c.pin.pin }, { conMotor })
    if (!a.autoriza) return { status: a.status || 403, error: a.error || 'PIN incorrecto' }
    autoriza = a.autoriza
  }
  const { url, key } = cfgDeMarca(marca)
  const sb = createClient(url, key)
  return conMotor(marca, 'El cambio', async (db, { registrarCambio }) => {
    // La venta que se cambia manda la MARCA y el `prueba` del cambio (el motor ⛔ cambia una de prueba con uno real ni
    // al revés, ni entre marcas). Stunned vive en la base de Zattia con marca `stunned`: mandar la de la Caja daba OTRA_MARCA.
    // El suelto es de Stunned y su `prueba` es el de la venta de la Caja (`CAJA_STUNNED_PRUEBA`).
    let marcaVenta, prueba, devueltas, diferencia, original_gn = null
    const pruebaStunned = process.env.CAJA_STUNNED_PRUEBA !== '0'
    if (c.modo === 'erp') {
      const [orig] = (await db.query('select prueba, marca from venta where id = $1', [c.ventaId])).rows
      marcaVenta = orig ? orig.marca : marca
      prueba = orig ? orig.prueba === true : true
      devueltas = c.devueltas
      // La diferencia con la MISMA cuenta que el motor (lo devuelto al precio que se pagó).
      const lineas = (await db.query('select id, cantidad, importe from venta_linea where venta_id = $1', [c.ventaId])).rows
        .map((l) => ({ id: l.id, cantidad: Number(l.cantidad), importe: Number(l.importe) }))
      diferencia = diferenciaDeCambio({ lineas, devueltas: c.devueltas.map((d) => ({ lineaId: d.linea_id, cantidad: d.cantidad })), nuevas: c.nuevas })
    } else {
      marcaVenta = 'stunned'
      prueba = pruebaStunned
      if (c.modo === 'gn') {
        const g = await ventaGnDeCambio({ sb, db, gnVentaId: c.gnVentaId, prueba })
        if (g.status) return g
        const porPrenda = new Map(g.lineas.map((l) => [`${l.product_id}:${l.size_id}`, l]))
        devueltas = []
        for (const d of c.devueltas) {
          const l = porPrenda.get(`${d.product_id}:${d.size_id}`)
          if (!l) return { status: 400, error: `Ese producto no es de Stunned en la venta ${g.venta.numero} de Gestión Nube.` }
          devueltas.push({ product_id: d.product_id, size_id: d.size_id, sku: l.sku, cantidad: d.cantidad, precio: l.precio })
        }
        original_gn = { sale_id: g.venta.id, numero: g.venta.numero, fecha: g.venta.fecha, lineas: g.lineas.map((l) => ({ product_id: l.product_id, size_id: l.size_id, cantidad: l.cantidad })) }
      } else {
        const skus = await skusDeVariantes(sb, c.devueltas)
        devueltas = c.devueltas.map((d) => ({ ...d, sku: skus.get(`${d.product_id}:${d.size_id}`) ?? d.sku ?? null }))
        if (devueltas.some((d) => !esStunned(d.sku))) return { status: 400, error: 'El cambio sin ticket es de productos de Stunned.' }
      }
      // Un ticket es de UNA marca (Bruno, 26-oct): lo que se lleva también es de Stunned.
      if (c.nuevas.some((n) => !esStunned(n.sku))) return { status: 400, error: 'Lo que se lleva tiene que ser de Stunned: un cambio es de una sola marca.' }
      diferencia = diferenciaDeCambioSuelto({ devueltas, nuevas: c.nuevas })
    }
    // El cobro con las reglas de HOY de la Caja: el descuento de la forma de pago lo pone el servidor.
    /** @type {{ pagos: any[], total: number, espera: number }} */
    let cobrado
    try {
      const reglas = await reglasDeHoy(sb, marca, await reglasGuardadas(sb, marca, cajaDe))
      cobrado = cobroDelCambio({ diferencia, pagos: c.pagos, reglas, nuevas: c.nuevas, saldo: c.saldo })
    } catch (e) {
      return { status: 400, error: e.message }
    }
    if (c.total != null && Math.round(c.total * 100) !== Math.round(cobrado.total * 100)) {
      return { status: 409, error: `La pantalla dice $${c.total} y el servidor $${cobrado.total}: recargá la venta y volvé a cobrar.`, total: cobrado.total }
    }
    // 🔑 Con transferencia se ESPERA el pago, como en la Caja (Bruno, 14-oct): recién con el pago encontrado
    // en Mercado Pago (o confirmado a mano con el comprobante, sin cuenta conectada) se registra el cambio.
    let mp = null
    if (cobrado.espera > 0) {
      const t = await esperarTransferencia({ sb, db, marca, c, espera: cobrado.espera, usuario })
      if (!t.llego) return { ok: true, esperando: true, espera: cobrado.espera, total: cobrado.total, ...t.para }
      mp = t.mp
    }
    // El saldo a favor paga con la cuenta «Saldo a favor» del motor (va por uuid: ⛔ tiene cuenta en GN).
    if (cobrado.pagos.some((p) => p.cuenta === 'saldo')) {
      const [cs] = (await db.query(`select id from cuenta_cobro where marca = $1 and medio = 'saldo'`, [marcaVenta])).rows
      if (!cs) return { status: 409, error: 'Falta la cuenta «Saldo a favor» en el ERP (sql/007 del motor).' }
      cobrado = { ...cobrado, pagos: cobrado.pagos.map((p) => (p.cuenta === 'saldo' ? { ...p, cuenta: cs.id } : p)) }
    }
    const r = await registrarCambio(db, {
      origen: 'caja', origen_ref: c.id, marca: marcaVenta, usuario: usuario || 'erp', prueba, deposito: 'local',
      ...(c.modo === 'erp' ? { venta_original_id: c.ventaId } : {}),
      ...(original_gn ? { original_gn } : {}),
      ...(autoriza ? { autoriza } : {}),
      devueltas, nuevas: c.nuevas, pagos: cobrado.pagos,
      ...(c.cliente ? { cliente: c.cliente } : {}),
      ...(mp ? { detalle: { mp } } : {}),
    })
    if (!r.ok) return errorDelMotor(r)
    return { ok: true, venta: r.venta, total: cobrado.total, aFavor: r.a_favor, saldo: r.saldo ?? null, ncPendiente: r.nc_pendiente, yaExistia: !!r.ya_existia }
  })
}

/** Los SKU de unas variantes, del espejo `inventario` de la marca. Clave `producto:talle`. */
async function skusDeVariantes(sb, prendas) {
  const ids = [...new Set(prendas.map((p) => Number(p.product_id)))]
  if (!ids.length) return new Map()
  const { data, error } = await sb.from('inventario').select('product_id, size_id, sku').in('product_id', ids)
  if (error) throw new Error(`inventario: ${error.message}`)
  return new Map((data || []).filter((f) => f.sku).map((f) => [`${Number(f.product_id)}:${Number(f.size_id)}`, String(f.sku)]))
}

/**
 * La venta de GESTIÓN NUBE para cambiar en el ERP (Bruno, 27-oct: Stunned ⛔ vuelve a GN; lo vendido allá antes del corte
 * se cambia acá). Del espejo de Zattia (`ventas` + `venta_detalles`), por id o por número; sólo las prendas de STUNNED, con
 * su precio de LISTA por unidad (`listaEnGN`, Bruno 28-oct: el cambio es a lista) y lo ya cambiado en el ERP. 🔑 El precio lo pone ESTO, ⛔ la pantalla.
 */
export async function ventaGnDeCambio({ sb, db, gnVentaId, prueba }) {
  const n = String(gnVentaId).trim()
  if (!/^\d{1,12}$/.test(n)) return { status: 400, error: 'Número de venta inválido' }
  const cols = 'id, number, date_sale, total_price, client_name, sale_state'
  let { data: vs, error } = await sb.from('ventas').select(cols).eq('id', n).limit(1)
  if (!error && !(vs || []).length) ({ data: vs, error } = await sb.from('ventas').select(cols).eq('number', n).limit(1))
  if (error) throw new Error(`ventas: ${error.message}`)
  const v = (vs || [])[0]
  if (!v) return { status: 404, error: `No está la venta ${n} de Gestión Nube (puede tardar unos minutos en llegar).` }
  if (/anul|cancel/i.test(String(v.sale_state || ''))) return { status: 409, error: `La venta ${v.number ?? v.id} de Gestión Nube está anulada.` }
  const { data: det, error: e2 } = await sb.from('venta_detalles').select('product_id, size_id, size, product_name, quantity, unit_price, total').eq('sale_id', v.id)
  if (e2) throw new Error(`venta_detalles: ${e2.message}`)
  const skus = await skusDeVariantes(sb, det || [])
  const nombre = new Map((det || []).map((d) => [`${Number(d.product_id)}:${Number(d.size_id)}`, { nombre: d.product_name || null, talle: d.size || null }]))
  const ya = new Map((await db.query(`select l.product_id, l.size_id, -sum(l.cantidad)::int as n from venta x join venta_linea l on l.venta_id = x.id
    where x.marca = 'stunned' and x.tipo = 'cambio' and x.estado = 'confirmada' and x.prueba = $2 and x.detalle->'cambio_de'->>'gn_venta' = $1
      and l.cantidad < 0 group by 1, 2`, [String(v.id), prueba === true])).rows.map((f) => [`${Number(f.product_id)}:${Number(f.size_id)}`, Number(f.n)]))
  const lineas = listaEnGN(det || [])
    .map((l) => { const k = `${l.product_id}:${l.size_id}`; return { ...l, sku: skus.get(k) ?? null, ...nombre.get(k), cambiado: ya.get(k) || 0 } })
    .filter((l) => esStunned(l.sku))
  if (!lineas.length) return { status: 409, error: `La venta ${v.number ?? v.id} de Gestión Nube no tiene productos de Stunned.` }
  return { venta: { id: String(v.id), numero: v.number ?? String(v.id), fecha: v.date_sale ?? null, cliente: v.client_name ?? null, prueba: prueba === true }, lineas }
}

/**
 * La factura A PEDIDO de una venta propia (`erp › Caja`): una sola, con su CAE, por el MISMO `facturarLote` que
 * la masiva (candado, reserva del número, corte resuelto consultando a ARCA). La clave en `facturas` es la venta
 * de GN si la refleja una (`claveDeFactura`): así ninguna de las dos puertas factura dos veces la misma venta.
 * Con CAE, el motor la ata a la venta (`venta_factura`). Si esa fila ⛔ se pudo escribir, la próxima vez que se
 * pide la MISMA factura se ata y se devuelve (⛔ sale otra: el lote la ve facturada).
 * 🔴 Una venta de prueba ⛔ se factura en producción (`puedeFacturar`).
 */

/**
 * 🔑 El punto de venta sale de la marca de la VENTA, ⛔ de la base: Stunned (línea de Zattia) factura con su PV PROPIO
 * (`ARCA_PTOVTA_STUNNED`, el 9 «STUNNED - FACTURA ERP», Bruno 26-oct). Antes caía en el de Zattia.
 */
export const marcaDePuntoDeVenta = (marcaBase, marcaVenta) => (marcaVenta === 'stunned' ? 'stunned' : marcaBase)

export async function facturarVentaPropia({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const p = leerFacturar(body)
  if (p.error) return { status: 400, error: p.error }
  const { ambiente, error: errorAmbiente } = ambienteSeguro()
  if (!ambiente) return { status: 409, error: errorAmbiente }
  const b = deps.b || (() => { const { url, key } = cfgDeMarca(marca); return createClient(url, key) })()
  const sb = deps.sb || (deps.repo ? null : baseFacturacion())
  const repo = deps.repo || repoFacturas(sb)
  const buscar = deps.buscarFactura || ((clave) => facturaDeClave(sb, { ambiente, marca, clave }))
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conMotor(marca, 'La factura desde la Caja', fn)

  return correr(async (db) => {
    const [f] = (await db.query('select * from venta_ficha where id = $1', [p.ventaId])).rows
    const clave = f ? claveDeFactura(f) : null
    let ya = null
    for (const k of f ? clavesDeFactura(f) : []) if ((ya = await buscar(k))) break
    if (body?.reimprimir && !ya) return { status: 404, error: 'No se encontró la factura de esta venta en este ambiente.' }
    if (ya && !body?.reimprimir) {
      const otra = distintaDeLaPedida(ya, p)
      if (otra) return { status: 409, error: otra }
    }
    // Con la factura ya hecha (`ya`), «ya tiene factura» ⛔ frena: se devuelve la misma (y se ata si faltaba).
    const frena = puedeFacturar(f, { ambiente, facturada: !ya && (f?.facturas || []).some((x) => x.tipo === 'factura') })
    if (frena) return { status: f ? 409 : 404, error: frena }
    if (!ya && clave !== String(f.id)) {
      // La factura que GN ya le hizo (la cajera la facturó en el POS de GN) también cuenta.
      const gn = await b.from('ventas_factura_gn').select('venta_id').eq('venta_id', clave).limit(1)
      if (gn.error) throw new Error(`ventas_factura_gn: ${gn.error.message}`)
      if (gn.data.length) return { status: 409, error: 'Esa venta ya está facturada en GN.' }
    }

    let factura = ya
    if (!factura) {
      const arca = arcaDe(deps, sb)
      if (!arca) return { status: 409, error: SIN_ARCA }
      const ptoVta = ptoVtaDe(ambiente, marcaDePuntoDeVenta(marca, f.marca), process.env)
      const hoy = diaArgentino(Date.now())
      const r = await facturarLote({
        arca, repo, ambiente, marca, ptoVta, tipo: p.tipo,
        comprobantes: [{ ventaId: clave, mes: mesDeVenta(f.ocurrida_en), tipo: p.tipo, fecha: hoy, total: Number(f.total), receptor: p.receptor }],
        reglas: { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy },
        lote: globalThis.crypto.randomUUID(), usuario,
      })
      if (r.rechazadas.length) return { status: 409, error: `ARCA la rechazó: ${r.rechazadas[0].motivos.join(' · ')}` }
      if (r.noSalen.length) {
        // Facturada entre la lectura y el candado (la masiva u otra caja): se ata la que ya está.
        factura = await buscar(clave)
        if (!factura) return { status: 409, error: r.noSalen[0].motivos.join(' · ') }
      } else factura = r.autorizadas[0]
    }
    if (factura.estado !== 'autorizada') return { status: 409, error: 'Esa venta tiene una factura a medio pedir: probá de nuevo en un minuto.' }
    const sinAtar = await atarFactura(db, { venta: f, facturaId: factura.id, tipo: 'factura' })
    const { receptor, sinFicha } = p.cliente
      ? await guardarFichaA(db, { venta: f, doc: p.receptor.docNro, condicionIva: p.receptor.condicionIva, ...p.cliente })
      : { receptor: await receptorDeFicha(db, { empresaId: f.empresa_id, factura }), sinFicha: null }
    const nombres = await nombresDeVariantes(b, (f.lineas || []).map((l) => l.product_id))
    return { ok: true, yaEstaba: !!ya, sinAtar, sinFicha, factura: filaParaPdf(factura, { numero: f.detalle?.gn_number ?? f.numero, renglones: renglonesDeVenta(f, nombres), receptor }) }
  })
}

/**
 * La NOTA DE CRÉDITO de una venta propia ANULADA que tenía factura (el «falta la nota de crédito» del anular):
 * la de la factura entera, por `notaDeCredito`, y atada a la venta en el motor (`venta_factura` tipo `nc`).
 * Sólo anulada: a una venta que sigue en pie, una NC le deja la factura anulada y el lote ⛔ la deja refacturar.
 * Repetirla ⇒ el lote contesta «ya tiene nota de crédito» (⛔ sale otra).
 */
export async function notaDeCreditoDeVenta({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const ventaId = String(body?.ventaId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(ventaId)) return { status: 400, error: 'Venta inválida' }
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conMotor(marca, 'La nota de crédito', fn)
  return correr(async (db) => {
    const [f] = (await db.query('select id, estado, facturas from venta_ficha where id = $1', [ventaId])).rows
    if (!f) return { status: 404, error: 'La venta no existe.' }
    const frena = puedeHacerNC(f)
    if (frena) return { status: 409, error: frena }
    const factura = (f.facturas || []).find((x) => x.tipo === 'factura')
    const r = await notaDeCredito({ facturaId: factura.factura_id, usuario, desdeVenta: true }, deps)
    if (r.status) return r
    const sinAtar = await atarFactura(db, { venta: f, facturaId: r.autorizada.id, tipo: 'nc' })
    return { ok: true, ambiente: r.ambiente, autorizada: r.autorizada, sinAtar }
  })
}

/**
 * La FICHA de la clienta de una factura A (contrato §11): CUIT, razón social, condición y domicilio quedan guardados
 * (`guardarCliente`, una por empresa y documento) ⇒ la próxima vez la Caja la encuentra por CUIT o nombre y ⛔ se tipea.
 * La factura ya tiene CAE: si la ficha ⛔ se guarda, se avisa y ⛔ se frena. Devuelve el receptor para el PDF.
 */
async function guardarFichaA(db, { venta, doc, condicionIva, razonSocial, domicilio }) {
  const receptor = { nombre: razonSocial, domicilio: domicilio || null }
  const { guardarCliente } = await import('../motor/venta/registrar.mjs')
  const r = await guardarCliente(db, { empresa_id: venta.empresa_id, doc: String(doc), nombre: razonSocial, razon_social: razonSocial, condicion_iva: condicionIva, domicilio })
  if (r.ok) return { receptor: { nombre: r.cliente.razon_social || r.cliente.nombre, domicilio: r.cliente.domicilio }, sinFicha: null }
  // ⛔ el documento ni el mensaje (puede traerlo) en el log: la venta alcanza para encontrarla (auditoría 20-oct).
  console.error(`[erp] ficha de la clienta de la venta ${venta.id} sin guardar: ${r.error.codigo}`)
  return { receptor, sinFicha: `La factura salió, pero la ficha de la clienta no se guardó: ${r.error.mensaje}` }
}

/** El receptor de una factura A ya hecha (reimprimir), de la ficha por su CUIT. null si ⛔ es A o ⛔ hay ficha. */
async function receptorDeFicha(db, { empresaId, factura }) {
  if (Number(factura.doc_tipo) !== DOC.CUIT || !empresaId) return null
  const [c] = (await db.query('select nombre, razon_social, domicilio from cliente where empresa_id = $1 and doc = $2', [empresaId, String(factura.doc_nro)])).rows
  return c ? { nombre: c.razon_social || c.nombre, domicilio: c.domicilio } : null
}

/**
 * Las fichas de clientas para la factura A (`erp › Caja`): por CUIT/DNI (prefijo) o por nombre.
 * Con `linea` (el ⌘K, Bruno 30-oct: «los clientes van en cada marca, sí o sí»), sólo las de esa línea (`sqlClienteDeLinea`).
 * Sin ella, las de la empresa: la factura A y Cargar venta ELIGEN una ficha, y sin verla se cargaría repetida.
 */
export async function clientasDeLaCaja({ marca, q, linea = '' }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const l = linea ? lineaDelPedido(marca, linea) : null
  if (linea && !l) return SIN_LINEA
  const correr = deps.db ? (fn) => fn(deps.db, deps.motor) : (fn) => conMotor(marca, 'Buscar clientas', fn)
  return correr(async (db, { buscarClientes }) => {
    const [m] = (await db.query('select empresa_id from marca where id = $1', [marca])).rows
    if (!m) return { status: 409, error: 'La marca no está en la base del motor.' }
    const porLinea = !!l && marca !== 'bdi'
    const r = await buscarClientes(db, { empresa_id: m.empresa_id, texto: String(q ?? ''), limite: porLinea ? 50 : 8 })
    if (!r.ok) return errorDelMotor(r)
    let clientes = r.clientes
    if (porLinea && clientes.length) {
      const ids = new Set((await db.query(`with ${SQL_CTE_LINEA_GN} select id::text from cliente where id = any($1::uuid[])
        and (${sqlClienteDeLinea('cliente.id', 2)} or ${sqlClienteDeGn('cliente.nombre', l)})`,
        [clientes.map((c) => String(c.id)), l])).rows.map((x) => x.id))
      clientes = clientes.filter((c) => ids.has(String(c.id))).slice(0, 8)
    }
    return {
      clientas: clientes.map((c) => ({
        doc: c.doc, nombre: c.nombre, razonSocial: c.razon_social, domicilio: c.domicilio, condicion: opcionDeCondicion(c.condicion_iva),
      })),
    }
  })
}

/**
 * Ata la factura (o la NC) a la venta en el motor: `vincularFactura` (`venta_factura` es INMUTABLE desde 009 ⇒ ⛔ insert
 * directo). Repetirla devuelve la misma fila. Si el motor ⛔ la ata (la venta se anuló entre medio, otro tipo…), el
 * comprobante YA tiene CAE: ⛔ se tira; se dice a pantalla y al log, y queda para atar a mano.
 * @returns {Promise<string|null>} null si quedó atada; si no, el aviso
 */
async function atarFactura(db, { venta, facturaId, tipo }) {
  const { vincularFactura } = await import('../motor/venta/registrar.mjs')
  const r = await vincularFactura(db, { venta_id: venta.id, factura_id: String(facturaId), tipo })
  if (r.ok) return null
  console.error(`[erp] ${tipo} ${facturaId} sin atar a la venta ${venta.id}: ${r.error.codigo} ${r.error.mensaje}`)
  return `Salió con CAE, pero no quedó atada a la venta en el ERP: ${textoDelMotor(r.error)}`
}

/** Las NC (⛔ rechazadas) asociadas a una factura: lo que ya se le acreditó. */
async function ncsDeFactura(sb, facturaId) {
  const { data, error } = await sb.from('facturas').select('id, venta_id, total').eq('asociado_id', facturaId).in('tipo', [CBTE.NC_A, CBTE.NC_B]).neq('estado', 'rechazada')
  if (error) throw new Error(`facturas: ${error.message}`)
  return data
}

/** El comprobante (⛔ rechazado) de esa clave y esos tipos, o null. */
async function comprobanteDeClave(sb, { ambiente, marca, clave, tipos }) {
  const { data, error } = await sb.from('facturas').select('*').eq('ambiente', ambiente).eq('marca', marca).eq('venta_id', clave)
    .in('tipo', tipos).neq('estado', 'rechazada').order('creado_en').limit(1)
  if (error) throw new Error(`facturas: ${error.message}`)
  return data[0] || null
}

/**
 * Facturar un CAMBIO desde la Caja (Bruno, 14-oct): **NC por lo devuelto + factura por lo nuevo**, con la clase y el
 * receptor de la factura de la venta ORIGINAL (`armarFacturaDelCambio` dice cuánto). Las dos van por el MISMO lote
 * (candado, número reservado, una por clave) con la clave del CAMBIO ⇒ repetir devuelve las mismas y una que faltó
 * (se cortó a la mitad) sale sola. La NC queda asociada a la factura original y atada a la venta ORIGINAL (`nc`); la
 * factura nueva, al cambio. `simular` dice cuánto saldría, ⛔ pide nada.
 */
export async function facturarCambio({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const ventaId = String(body?.ventaId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(ventaId)) return { status: 400, error: 'Cambio inválido' }
  const { ambiente, error: errorAmbiente } = ambienteSeguro()
  if (!ambiente) return { status: 409, error: errorAmbiente }
  const b = deps.b || (() => { const { url, key } = cfgDeMarca(marca); return createClient(url, key) })()
  const sb = deps.sb || (deps.repo ? null : baseFacturacion())
  const repo = deps.repo || repoFacturas(sb)
  const buscar = deps.buscarComprobante || ((clave, tipos) => comprobanteDeClave(sb, { ambiente, marca, clave, tipos }))
  const leerFactura = deps.leerFactura || (async (id) => { const r = await sb.from('facturas').select('*').eq('id', id).maybeSingle(); if (r.error) throw new Error(`facturas: ${r.error.message}`); return r.data })
  const ncsDe = deps.ncsDeFactura || ((id) => ncsDeFactura(sb, id))
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conMotor(marca, 'Facturar el cambio', fn)

  return correr(async (db) => {
    const [cambio] = (await db.query('select * from venta_ficha where id = $1', [ventaId])).rows
    const [original] = cambio?.venta_original_id ? (await db.query('select * from venta_ficha where id = $1', [cambio.venta_original_id])).rows : []
    const atada = (original?.facturas || []).find((x) => x.tipo === 'factura')
    const facturaOriginal = atada ? await leerFactura(atada.factura_id) : null
    const frena = puedeFacturarCambio(cambio, original, { ambiente, facturaOriginal })
    if (frena) return { status: cambio ? 409 : 404, error: frena }

    // 🔴 Dos cambios de la MISMA venta facturándose a la vez verían lo mismo acreditado y juntos podrían pasarse de la
    // factura: un candado por venta original (el del lote es por clave, o sea por cambio). La simulación ⛔ lo toma.
    const candado = `cambio-factura:${original.id}`
    if (!body?.simular && !(await db.query('select pg_try_advisory_lock(hashtext($1)) as ok', [candado])).rows[0].ok) {
      return { status: 409, error: 'Otro cambio de esta venta se está facturando: probá de nuevo en un minuto.' }
    }
    try {
      // Sin factura en la original: factura B a consumidor final por lo cobrado hoy (Bruno, 15-oct), ⛔ NC.
      const tipos = Number(facturaOriginal?.tipo) === CBTE.FACTURA_A ? { nc: CBTE.NC_A, factura: CBTE.FACTURA_A } : { nc: CBTE.NC_B, factura: CBTE.FACTURA_B }
      const [ncYa, facturaYa] = await Promise.all([buscar(cambio.id, [tipos.nc]), buscar(cambio.id, [tipos.factura])])
      const otras = facturaOriginal ? (await ncsDe(facturaOriginal.id)).filter((x) => String(x.venta_id) !== String(cambio.id)) : []
      const nombres = await nombresDeVariantes(b, (cambio.lineas || []).map((l) => l.product_id))
      const plan = armarFacturaDelCambio({ cambio, original, facturaOriginal, acreditado: otras.reduce((a, x) => a + Number(x.total), 0), nombres })
      if ('error' in plan) return { status: 409, error: plan.error }
      const numero = cambio.detalle?.gn_number ?? cambio.numero
      if (body?.simular) {
        return { ok: true, simulado: true, clase: tipos.factura === CBTE.FACTURA_A ? 'A' : 'B', nc: plan.nc?.total ?? 0, factura: plan.factura?.total ?? 0, ncYa: !!ncYa, facturaYa: !!facturaYa, sinFacturaOriginal: !facturaOriginal }
      }

      // El cliente de ARCA sólo si falta pedir algo: reimprimir lo que ya salió anda sin certificado.
      const falta = (plan.nc && !ncYa) || (plan.factura && !facturaYa)
      const arca = falta ? arcaDe(deps, sb) : null
      if (falta && !arca) return { status: 409, error: SIN_ARCA }
      const hoy = diaArgentino(Date.now())
      const receptor = facturaOriginal
        ? { docTipo: Number(facturaOriginal.doc_tipo), docNro: Number(facturaOriginal.doc_nro), condicionIva: Number(facturaOriginal.cond_iva) }
        : { docTipo: DOC.SIN_IDENTIFICAR, docNro: 0, condicionIva: COND_IVA.CONSUMIDOR_FINAL }
      const ptoVta = ptoVtaDe(ambiente, marcaDePuntoDeVenta(marca, cambio.marca), process.env)
      const reglas = { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy }
      /** Uno de los dos comprobantes: el que ya está, o sale por el lote (con la clave del cambio). */
      const emitir = async (ya, tipo, comprobante) => {
        if (ya) return { fila: ya }
        const r = await facturarLote({ arca, repo, ambiente, marca, ptoVta, tipo, comprobantes: [{ ventaId: cambio.id, tipo, fecha: hoy, receptor, ...comprobante }], reglas, lote: globalThis.crypto.randomUUID(), usuario })
        if (r.autorizadas[0]) return { fila: r.autorizadas[0], nueva: true }
        if (r.noSalen.length) { const otra = await buscar(cambio.id, [tipo]); if (otra) return { fila: otra } }
        return { error: [...r.rechazadas, ...r.noSalen].flatMap((x) => x.motivos || []).join(' · ') || 'ARCA no la autorizó.' }
      }
      const avisos = []
      let nc = null, factura = null
      if (plan.nc) {
        const e = await emitir(ncYa, tipos.nc, {
          mes: hoy.slice(0, 7), total: plan.nc.total, asociadoId: facturaOriginal.id,
          asociado: { tipo: Number(facturaOriginal.tipo), ptoVta: Number(facturaOriginal.pto_vta), numero: Number(facturaOriginal.numero), fecha: facturaOriginal.fecha },
        })
        if (e.error) return { status: 409, error: `La nota de crédito no salió: ${e.error}` }
        if (e.fila.estado !== 'autorizada') return { status: 409, error: 'La nota de crédito del cambio está a medio pedir: probá de nuevo en un minuto.' }
        nc = filaParaPdf(e.fila, { numero, renglones: plan.nc.renglones })
        const sin = await atarFactura(db, { venta: original, facturaId: e.fila.id, tipo: 'nc' })
        if (sin) avisos.push(sin)
      }
      if (plan.factura) {
        const e = await emitir(facturaYa, tipos.factura, { mes: mesDeVenta(cambio.ocurrida_en), total: plan.factura.total })
        if (e.error) return { status: 409, error: `${nc ? 'Salió la nota de crédito, pero la factura de lo nuevo no: ' : 'La factura de lo nuevo no salió: '}${e.error}` }
        if (e.fila.estado !== 'autorizada') return { status: 409, error: 'La factura del cambio está a medio pedir: probá de nuevo en un minuto.' }
        factura = filaParaPdf(e.fila, { numero, renglones: plan.factura.renglones })
        const sin = await atarFactura(db, { venta: cambio, facturaId: e.fila.id, tipo: 'factura' })
        if (sin) avisos.push(sin)
      }
      const receptorPdf = facturaOriginal ? await receptorDeFicha(db, { empresaId: cambio.empresa_id, factura: facturaOriginal }) : null
      for (const x of [nc, factura]) if (x && receptorPdf) Object.assign(x, { receptor_nombre: receptorPdf.nombre, receptor_domicilio: receptorPdf.domicilio })
      return { ok: true, yaEstaban: !!(ncYa || !plan.nc) && !!(facturaYa || !plan.factura), nc, factura, avisos }
    } finally {
      if (!body?.simular) await db.query('select pg_advisory_unlock(hashtext($1))', [candado]).catch(() => {})
    }
  })
}

/** La factura (⛔ rechazada) que ya tiene esa clave en `facturas`, o null. */
async function facturaDeClave(sb, { ambiente, marca, clave }) {
  const { data, error } = await sb.from('facturas').select('*').eq('ambiente', ambiente).eq('marca', marca).eq('venta_id', clave)
    .in('tipo', [CBTE.FACTURA_A, CBTE.FACTURA_B]).neq('estado', 'rechazada').order('creado_en').limit(1)
  if (error) throw new Error(`facturas: ${error.message}`)
  return data[0] || null
}

/** Una fila de `facturas` con la forma de `FacturaEmitida` (el PDF). */
function filaParaPdf(f, { numero, renglones, receptor = null }) {
  return {
    id: f.id, ambiente: f.ambiente, marca: f.marca, venta_id: f.venta_id, tipo: Number(f.tipo), pto_vta: Number(f.pto_vta),
    numero: Number(f.numero), fecha: f.fecha, total: Number(f.total), neto: Number(f.neto), iva: Number(f.iva),
    doc_tipo: Number(f.doc_tipo), doc_nro: Number(f.doc_nro), cond_iva: Number(f.cond_iva), estado: f.estado, cae: f.cae, cae_vence: f.cae_vence,
    venta_numero: numero != null ? String(numero) : null, renglones,
    receptor_nombre: receptor?.nombre ?? null, receptor_domicilio: receptor?.domicilio ?? null,
  }
}

/** Cuánto atrás puede empezar la espera de un cambio (la pantalla manda cuándo empezó). */
const ESPERA_MAXIMA_MS = 6 * 3600_000

/**
 * ¿Llegó la transferencia del cambio? Con la MISMA lectura de Mercado Pago y el MISMO cruce que la Caja
 * (`cruzarTransferencia`). Los pagos ya tomados: los de la Caja (`caja_venta`, `caja_venta_mp`) y los de los
 * cambios del motor (`venta.detalle.mp`). Sin cuenta de MP conectada: lo confirma el admin con el comprobante.
 * 🔴 La Caja ⛔ ve los pagos que toma un cambio (es de prueba y la Caja vende a GN): al corte, un candado común.
 */
async function esperarTransferencia({ sb, db, marca, c, espera, usuario }) {
  const ahora = Date.now()
  const desde = new Date(c.desde && c.desde <= ahora && c.desde > ahora - ESPERA_MAXIMA_MS ? c.desde : ahora).toISOString()
  // BDI ⛔ tiene la tabla de las cuentas de MP (14-oct): es lo mismo que «sin cuenta conectada».
  const usos = await usosDe(sb, marca).catch((e) => {
    if (e && (e.code === 'PGRST205' || e.code === '42P01')) return []
    throw e
  })
  if (!usos.length) {
    if (c.comprobante && c.comprobante.length >= 4) return { llego: true, mp: { cruce: 'admin', comprobante: c.comprobante, por: usuario || null, en: new Date(ahora).toISOString() } }
    return { llego: false, para: { desde, cruce: { estado: 'sin_cuenta', motivo: 'Esta tienda todavía no tiene la cuenta de Mercado Pago conectada: mirá el comprobante en el teléfono de la clienta y confirmá con el número de operación.' } } }
  }
  const hace2d = new Date(Date.parse(desde) - 2 * 86400000).toISOString()
  const [porDia, unoSolo, sumados, deCambios] = await Promise.all([
    Promise.all(diasDelCruce(Date.parse(desde), ahora).map((dia) => pagosDelDia(sb, usos, dia))),
    sb.from('caja_venta').select('mp_pago_id').eq('store', marca).not('mp_pago_id', 'is', null).gte('creada_en', hace2d),
    sb.from('caja_venta_mp').select('mp_pago_id').eq('store', marca).gte('creado_en', hace2d),
    db.query(`select detalle->'mp'->>'pago_id' as id from venta where marca = $1 and estado = 'confirmada' and detalle->'mp'->>'pago_id' is not null and registrada_en >= $2`, [marca, hace2d]),
  ])
  if (unoSolo.error) throw new Error(unoSolo.error.message)
  if (sumados.error && sumados.error.code !== '42P01') throw new Error(sumados.error.message)
  const vistos = new Set()
  const pagos = porDia.flatMap((x) => x.pagos).filter((p) => !vistos.has(p.id) && vistos.add(p.id))
  const reclamados = [...(unoSolo.data || []), ...(sumados.data || [])].map((r) => r.mp_pago_id).concat(deCambios.rows.map((r) => r.id))
  const d = cruzarTransferencia({ monto: espera, desde, pagos, reclamados, competidoras: 0, elegido: c.pago, antesManual: ANTES_MANUAL_MS })
  if (d.estado === 'llego') return { llego: true, mp: { pago_id: String(d.pago.id), cruce: d.por, pago_en: d.pago.cuando, diferencia: d.pago.diferencia || 0, por: usuario || null } }
  const recientes = pagosRecientes({ monto: espera, desde, pagos, reclamados, cuantos: RECIENTES_CAJA })
  return { llego: false, para: { desde, cruce: d, recientes } }
}

/**
 * Las diferencias de un día del libro (pestaña `erp › Diferencias`, sólo lectura): `stock_diff` del día
 * (el último calculado si ⛔ se pide), su resumen, los días que hay para elegir y la sobreventa de hoy.
 */
export async function diferenciasDelDia({ marca, fecha: pedida }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const f = leerFecha(pedida)
  if (f.error) return { status: 400, error: f.error }
  const { url, key } = cfgDeMarca(marca)
  const b = createClient(url, key)
  const dias = await b.from('stock_libro_dia').select('fecha, resumen, foto_desde, foto_hasta').order('fecha', { ascending: false }).limit(30)
  if (dias.error) throw new Error(`stock_libro_dia: ${dias.error.message}`)
  const fecha = f.fecha ?? dias.data[0]?.fecha ?? null
  const dia = dias.data.find((d) => d.fecha === fecha) ?? null
  const [filas, negativos] = await Promise.all([
    fecha ? leerTodo(b, 'stock_diff', (x) => x.select('product_id, size_id, deposito, linea, delta_gn, delta_libro, nivel_gn, nivel_libro, clase, explicacion').eq('fecha', fecha).order('product_id')) : [],
    negativosDelLibro(marca).catch((e) => ({ error: e.message })),
  ])
  const negs = Array.isArray(negativos) ? negativos : []
  const ids = [...new Set([...filas, ...negs].map((r) => Number(r.product_id)))]
  const nombres = await nombresDeVariantes(b, ids)
  return {
    fecha, dias: dias.data.map((d) => d.fecha), fotoDesde: dia?.foto_desde ?? null, fotoHasta: dia?.foto_hasta ?? null,
    ...armarDiferencias({ filas, nombres, resumen: dia?.resumen, negativos: negs }),
    sobreventaSinConexion: negativos === null, sobreventaError: negativos && !Array.isArray(negativos) ? negativos.error : null,
  }
}

/**
 * La conciliación de un día (pestaña `erp › Conciliación`, sólo lectura): `conciliacion_fila` y `conciliacion_dia` de la
 * tienda (motor sql/024; el último día calculado si ⛔ se pide), los días para elegir, y la cuenta del diff de GN de ese
 * día (`stock_libro_dia`). Sin la 024 contesta `sinTablas` (⛔ es un error: la pantalla lo dice).
 */
export async function conciliacionDelDia({ tienda, fecha: pedida }) {
  if (!TIENDAS_CONCILIACION.includes(tienda)) return { status: 400, error: 'Tienda inválida' }
  const f = leerFecha(pedida)
  if (f.error) return { status: 400, error: f.error }
  const { url, key } = cfgDeMarca(tienda)
  const b = createClient(url, key)
  const dias = await b.from('conciliacion_dia').select('fecha, resumen, calculado_en').eq('tienda', tienda).order('fecha', { ascending: false }).limit(30)
  if (dias.error) {
    if (VISTA_FALTA(dias.error, 'conciliacion_dia')) return { sinTablas: true, fecha: null, dias: [], calculadoEn: null, ...armarConciliacion({ tienda, filas: [], resumen: null, nombres: new Map() }) }
    throw new Error(`conciliacion_dia: ${dias.error.message}`)
  }
  const fecha = f.fecha ?? dias.data[0]?.fecha ?? null
  const dia = dias.data.find((d) => d.fecha === fecha) ?? null
  const [filas, gn] = await Promise.all([
    fecha ? leerTodo(b, 'conciliacion_fila', (x) => x.select('tipo, clave, clase, product_id, size_id, sku, numero, tn, libro, reservado, gn, dias, detalle').eq('fecha', fecha).eq('tienda', tienda).order('tipo').order('clave')) : [],
    fecha ? b.from('stock_libro_dia').select('resumen').eq('fecha', fecha).maybeSingle() : { data: null },
  ])
  if (gn.error) throw new Error(`stock_libro_dia: ${gn.error.message}`)
  const nombres = await nombresDeVariantes(b, filas.filter((r) => r.product_id != null).map((r) => Number(r.product_id)))
  return {
    sinTablas: false, fecha, dias: dias.data.map((d) => d.fecha), calculadoEn: dia?.calculado_en ?? null,
    ...armarConciliacion({ tienda, filas, resumen: dia?.resumen ?? null, nombres, diaGN: gn.data }),
  }
}

/**
 * Precio y costo de un PRODUCTO (pestaña `erp › Precios`, sólo lectura): lo vigente por lista y el costo como los tiene
 * el motor (sql/009), su historial, y al lado GN (el espejo `productos`) y Tienda Nube (`tn_variante` por los SKU del
 * producto, con cuándo se leyó: puede estar vieja). Se busca con la misma búsqueda de Stock.
 */
/** ¿El error de PostgREST es «esa vista/tabla ⛔ existe» (antes de su migración)? Otro error con el nombre ⛔ cuenta. */
const VISTA_FALTA = (e, nombre) => new RegExp(nombre).test(e.message || '') && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache|Could not find/i.test(e.message || ''))

/** @param {{ marca: string, producto: unknown, costos: boolean }} p `costos` OBLIGATORIO (`puedeErp(…, 'costos')`): sin él ⛔ viaja el costo. */
export async function precioDeProducto({ marca, producto, costos }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (typeof costos !== 'boolean') throw new Error('precioDeProducto: falta decir si el perfil ve costos')
  if (!/^\d+$/.test(String(producto ?? ''))) return { status: 400, error: 'Producto inválido' }
  const { url, key } = cfgDeMarca(marca)
  const b = createClient(url, key)
  const inv = await b.from('inventario').select('product_name, sku, barcode').eq('product_id', producto)
  if (inv.error) throw new Error(`inventario: ${inv.error.message}`)
  const skus = [...new Set((inv.data || []).map((x) => x.sku).filter(Boolean))]
  const linea = lineaDelProducto(marca, skus)
  // Todo por (LÍNEA, producto): las vistas del motor son por marca, y en la base de Zattia conviven zattia y stunned.
  const [listas, vigentes, efectivos, costo, hPrecio, hCosto, gn, lecturas, cpv] = await Promise.all([
    b.from('lista_precio').select('id, nombre, sigue'),
    b.from('precio_vigente').select('lista, precio, fuente, vigente_desde, usuario, motivo').eq('marca', linea).eq('product_id', producto),
    b.from('precio_lista').select('lista, precio, fuente, de_lista').eq('marca', linea).eq('product_id', producto),
    // 🔴 Sin `costos` el costo ⛔ se lee (Bruno 30-oct): ni el vigente ni su historial.
    costos ? b.from('costo_vigente').select('costo, proveedor, fuente, vigente_desde, usuario, motivo').eq('marca', linea).eq('product_id', producto).limit(1) : { data: [] },
    b.from('producto_precio').select('lista, precio, fuente, vigente_desde, usuario, motivo').eq('marca', linea).eq('product_id', producto).order('vigente_desde', { ascending: false }).limit(40),
    costos ? b.from('producto_costo').select('costo, proveedor, fuente, vigente_desde, usuario, motivo').eq('marca', linea).eq('product_id', producto).order('vigente_desde', { ascending: false }).limit(40) : { data: [] },
    b.from('productos').select('retailer_price, wholesaler_price, unit_cost').eq('id', producto).maybeSingle(),
    b.from('tn_catalogo_lectura').select('tienda, leida_en'),
    // El proveedor del costo como FICHA (sql/013): el de la carga, o el que tiene ese texto de GN.
    b.from('costo_proveedor_vigente').select('proveedor_id').eq('marca', linea).eq('product_id', producto).limit(1),
  ])
  for (const [t, r] of [['lista_precio', listas], ['precio_vigente', vigentes], ['costo_vigente', costo], ['producto_precio', hPrecio], ['producto_costo', hCosto], ['productos', gn], ['tn_catalogo_lectura', lecturas]]) {
    if (r.error) throw new Error(`${t}: ${r.error.message}`)
  }
  // `precio_lista` llega con sql/011: sin ella, lo vigente de cada lista tal cual (⛔ es un error).
  if (efectivos.error && !/precio_lista/.test(efectivos.error.message)) throw new Error(`precio_lista: ${efectivos.error.message}`)
  // Sin 013 la vista ⛔ existe ⇒ sólo el texto. 🔴 Cualquier OTRO error (permiso, tiempo) se dice: ⛔ se cae callado al texto.
  if (cpv.error && !VISTA_FALTA(cpv.error, 'costo_proveedor_vigente')) throw new Error(`costo_proveedor_vigente: ${cpv.error.message}`)
  const proveedorId = cpv.error ? null : cpv.data[0]?.proveedor_id ?? null
  let proveedorFicha = null
  if (proveedorId != null) {
    const pf = await b.from('proveedor').select('id, nombre').eq('id', proveedorId).maybeSingle()
    if (pf.error) throw new Error(`proveedor: ${pf.error.message}`)
    proveedorFicha = pf.data ? { id: String(pf.data.id), nombre: pf.data.nombre } : null
  }
  // El proveedor DEL PRODUCTO (motor sql/013 + 021; Bruno, 18-oct: nace en Ingresos) y la OC que lo dio. Sin 013/021 la tabla
  // ⛔ existe ⇒ sin proveedor / sin OC; 🔴 cualquier OTRO error se dice.
  let proveedorProducto = null
  if (!cpv.error) {
    const px = await b.from('producto').select('proveedor_id').eq('id', producto).maybeSingle()
    if (px.error && !VISTA_FALTA(px.error, 'producto')) throw new Error(`producto: ${px.error.message}`)
    const pid = px.error ? null : px.data?.proveedor_id ?? null
    if (pid != null) {
      const [pf, oc] = await Promise.all([
        b.from('proveedor').select('id, nombre').eq('id', pid).maybeSingle(),
        b.from('producto_proveedor_oc').select('oc_label, oc_fecha').eq('product_id', producto).eq('proveedor_id', pid).maybeSingle(),
      ])
      if (pf.error) throw new Error(`proveedor: ${pf.error.message}`)
      if (oc.error && !VISTA_FALTA(oc.error, 'producto_proveedor_oc')) throw new Error(`producto_proveedor_oc: ${oc.error.message}`)
      const deOc = oc.error ? null : oc.data
      if (pf.data) proveedorProducto = { id: String(pf.data.id), nombre: pf.data.nombre, oc: deOc ? { label: deOc.oc_label ?? null, fecha: deOc.oc_fecha } : null }
    }
  }
  // TN por SKU (como lo guardó TN y en mayúsculas, sin espacios) y por código de barras: como cruza la copia del motor.
  const claves = [...new Set(skus.flatMap((s) => [s, s.trim().toUpperCase()]))]
  const barras = [...new Set((inv.data || []).map((x) => x.barcode).filter(Boolean))]
  const [porSku, porBarra] = await Promise.all([
    claves.length ? b.from('tn_variante').select('tienda, variant_id, sku, precio, precio_promocional, costo').in('sku', claves) : { data: [] },
    barras.length ? b.from('tn_variante').select('tienda, variant_id, sku, precio, precio_promocional, costo').in('barcode', barras) : { data: [] },
  ])
  for (const r of [porSku, porBarra]) if (r.error) throw new Error(`tn_variante: ${r.error.message}`)
  const tn = [...new Map([...porSku.data, ...porBarra.data].map((v) => [`${v.tienda}/${v.variant_id}`, v])).values()]
  const tienda = tn[0]?.tienda
  // La feria de Liquidación: la MISMA lectura que la Caja (`feriaDeCampanias`). Stunned ⛔ tiene feria (`lib/caja/precio.ts`).
  // 🔴 Si falla se dice en la ficha: ⛔ se muestra el precio de TN como si fuera el que cobra el local.
  let feria = null
  let sinFeria = null
  if (linea !== 'stunned') {
    try {
      const reglas = await reglasGuardadas(b, marca, marcaDeCaja(marca))
      feria = (await feriaDeCampanias(b, marca, reglas?.feriaCampanias)).feriaPrecios[Number(producto)] ?? null
    } catch (e) {
      sinFeria = `No se pudieron leer los productos en oferta de Liquidación (${e instanceof Error ? e.message : e}): si éste está en oferta, el local lo cobra al precio de su campaña.`
    }
  }
  const armado = armarPrecioDeProducto({
    listas: listas.data, vigentes: vigentes.data, efectivos: efectivos.error ? null : efectivos.data, costo: costo.data[0] ?? null,
    historialPrecio: hPrecio.data, historialCosto: hCosto.data, gn: gn.data, tn, proveedorFicha, proveedorProducto, feria,
  })
  if (sinFeria) armado.avisos.push(sinFeria)
  return {
    producto: String(producto), nombre: inv.data[0]?.product_name ?? null, skus: skus.length, linea,
    tnLeidaEn: (lecturas.data || []).find((x) => x.tienda === tienda)?.leida_en ?? null,
    ...(costos ? armado : sinCostos(armado)),
  }
}

/**
 * CARGAR un precio (de una lista) o el costo de un producto en el ERP (`cargarPrecio` / `cargarCosto` del motor, contrato
 * §13): una fila nueva `fuente = 'carga'` que manda sobre las copias de GN y TN. 🔴 Mientras GN vive, ⛔ cambia lo que
 * cobra la Caja ni lo que muestra TN: queda en el ERP. La marca del motor es la LÍNEA del producto (Stunned adentro de la
 * base de Zattia, por el SKU).
 */
export async function cargarPrecioCosto({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const c = leerCarga(body, { hoy: diaArgentino(Date.now()) })
  if (c.error) return { status: 400, error: c.error }
  const b = deps.b || (() => { const { url, key } = cfgDeMarca(marca); return createClient(url, key) })()
  const inv = await b.from('inventario').select('sku').eq('product_id', c.producto)
  if (inv.error) throw new Error(`inventario: ${inv.error.message}`)
  if (!inv.data.length) return { status: 404, error: 'El producto no está en el espejo de GN.' }
  const linea = lineaDelProducto(marca, inv.data.map((x) => x.sku))
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conMotor(marca, 'Cargar precios', fn)
  return correr(async (db) => {
    const { cargarPrecio, cargarCosto } = await import('../motor/venta/precio.mjs')
    const comun = { marca: linea, product_id: Number(c.producto), vigente_desde: c.desde, usuario: usuario || 'admin', motivo: c.motivo }
    const r = c.que === 'precio'
      ? await cargarPrecio(db, { ...comun, lista: c.lista, precio: c.monto })
      : await cargarCosto(db, { ...comun, costo: c.monto, proveedor: c.proveedor, proveedor_id: c.proveedorId })
    if (!r.ok) return { status: 409, error: r.error.mensaje }
    // Sin «desde» tiene que valer YA: si lo vigente ⛔ es lo recién cargado, se dice (⛔ «cargado» callado).
    const fila = r.precio ?? r.costo, v = r.vigente
    const esLaMisma = v && v.fuente === 'carga' && Number(v[c.que]) === Number(fila[c.que]) && Date.parse(v.vigente_desde) === Date.parse(fila.vigente_desde)
    const aviso = !c.desde && !esLaMisma ? 'Quedó guardado, pero lo vigente sigue siendo otra fila: revisá el historial.' : null
    return { ok: true, futuro: !!c.desde, aviso }
  })
}

/**
 * SOLTAR el precio cargado de una lista (`soltarPrecio` del motor, sql/018): la lista vuelve a SEGUIR a la suya (el local →
 * lo que cobra Tienda Nube con la oferta). Una fila nueva `suelta`; la carga queda en el historial. Sin 018 en la base ⇒ 409.
 */
export async function soltarPrecioDeLista({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const c = leerSoltar(body)
  if (c.error) return { status: 400, error: c.error }
  const b = deps.b || (() => { const { url, key } = cfgDeMarca(marca); return createClient(url, key) })()
  const inv = await b.from('inventario').select('sku').eq('product_id', c.producto)
  if (inv.error) throw new Error(`inventario: ${inv.error.message}`)
  if (!inv.data.length) return { status: 404, error: 'El producto no está en el espejo de GN.' }
  const linea = lineaDelProducto(marca, inv.data.map((x) => x.sku))
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conMotor(marca, 'Cargar precios', fn)
  return correr(async (db) => {
    const { soltarPrecio } = await import('../motor/venta/precio.mjs')
    const r = await soltarPrecio(db, { marca: linea, product_id: Number(c.producto), lista: c.lista, usuario: usuario || 'admin', motivo: c.motivo })
    if (!r.ok) return { status: 409, error: r.error.mensaje }
    return { ok: true, precio: r.vigente?.precio == null ? null : Number(r.vigente.precio), deLista: r.vigente?.de_lista ?? null }
  })
}

const SIN_PROVEEDORES = 'La lista de proveedores todavía no está en esta base: el proveedor se escribe a mano.'
// La regla es del motor (tabla Y permiso del rol): sin el GRANT, 409 y texto (⛔ 500).
const tieneProveedores = async (db) => (await import('../motor/venta/proveedor.mjs')).hayProveedores(db)

/**
 * Los PROVEEDORES del ERP (`sql/013`, Bruno 15-oct: tabla propia cruzada con PRM) de la empresa de la marca, para elegir
 * en «Cargar costo». Sin 013 ⇒ 409 con aviso: la pantalla deja escribir el proveedor como texto, como antes.
 * 🔑 De UNA línea (Bruno, 30-oct: «los proveedores van en cada marca, sí o sí»): el proveedor es de la empresa, ⛔ tiene
 * línea; es de la línea si le hizo algún producto de ella (`producto.marca`), y `productos` cuenta sólo ésos.
 * El que todavía ⛔ tiene ninguno ⛔ es de ninguna (medido 30-oct: 6 de PRM, todos de fundas) ⇒ ⛔ va a la lista; sólo con
 * `elegir` («Cargar costo»): si no, a un proveedor nuevo ⛔ se le podría cargar su primer costo.
 * @param {{ marca: string, linea?: string, q?: string, elegir?: boolean }} x @param {{ db?: any }} [deps]
 */
export async function proveedoresDeMarca({ marca, linea = '', q, elegir = false }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const l = lineaDelPedido(marca, linea)
  if (!l) return SIN_LINEA
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conMotor(marca, 'Los proveedores', fn)
  return correr(async (db) => {
    if (!(await tieneProveedores(db))) return { status: 409, error: SIN_PROVEEDORES }
    const { buscarProveedores } = await import('../motor/venta/proveedor.mjs')
    const r = await buscarProveedores(db, { marca, q: typeof q === 'string' ? q.slice(0, 80) : null, limite: 200 })
    if (!r.ok) return { status: 409, error: textoDelMotor(r.error) }
    let proveedores = r.proveedores
    if (marca !== 'bdi') {
      const deLinea = new Map((await db.query(`select proveedor_id::text as id, count(*) filter (where marca = $1)::int as n
        from producto where proveedor_id is not null group by 1`, [l])).rows.map((x) => [x.id, x.n]))
      proveedores = proveedores.filter((p) => (elegir && !p.productos) || deLinea.get(String(p.id)) > 0)
        .map((p) => ({ ...p, productos: deLinea.get(String(p.id)) ?? 0 }))
    }
    return { proveedores: proveedores.map((p) => ({ id: String(p.id), nombre: p.nombre, cuit: p.cuit ?? null, nombreGn: p.nombre_gn ?? null, productos: p.productos, activo: p.activo })) }
  })
}

/**
 * Alta a mano de un proveedor. Uno que ya existe (mismo nombre) ⛔ se repite: se devuelve ése, para elegirlo.
 * @param {{ marca: string, body: any, usuario?: string | null }} x @param {{ db?: any }} [deps]
 */
export async function altaDeProveedor({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conMotor(marca, 'Los proveedores', fn)
  return correr(async (db) => {
    if (!(await tieneProveedores(db))) return { status: 409, error: SIN_PROVEEDORES }
    const { guardarProveedor } = await import('../motor/venta/proveedor.mjs')
    const r = await guardarProveedor(db, { marca, nombre: body?.nombre, cuit: body?.cuit, usuario: usuario || 'admin' })
    const p = r.proveedor
    if (!r.ok && r.error.codigo !== 'YA_EXISTE') return { status: r.error.codigo === 'ENTRADA_INVALIDA' ? 400 : 409, error: textoDelMotor(r.error) }
    return { ok: true, yaExistia: !r.ok, proveedor: { id: String(p.id), nombre: p.nombre, cuit: p.cuit ?? null } }
  })
}

/** Los pedidos de TN sin pagar de la base de la marca —abiertos, y cerrados = entregados sin cobrar— (Zattia trae también los de Stunned). */
export async function pedidosSinPagar({ marca }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const { url, key } = cfgDeMarca(marca)
  const b = createClient(url, key)
  const leerOrdenes = (cols) => leerTodo(b, 'tn_orden', (x) => x.select(cols)
    .in('status', STATUS_POR_COBRAR).not('payment_status', 'in', `(${NO_SIN_PAGAR.join(',')})`).order('creada_en'))
  // Con la sql/059 del motor la orden apunta la ficha del comprador (`cliente_id`); sin ella (otra base, antes de aplicarla), como antes.
  const COLS = 'tienda, tn_id, numero, creada_en, status, payment_status, medio, gateway, total, estado'
  const ordenes = await leerOrdenes(`${COLS}, cliente_id`).catch(() => leerOrdenes(COLS))
  const t0 = Date.now(), tiempos = {}
  const marcar = (k) => { tiempos[k] = Date.now() - t0 }
  marcar('ped_ordenes')
  const ids = ordenes.map((o) => o.tn_id)
  // Las prendas, la hora de la lectura y lo cobrado en GN ⛔ dependen entre sí: van a la par (29-oct: eran 5 pasos en fila).
  const traerLineas = async () => {
    const out = []
    for (let i = 0; i < ids.length; i += 200) {
      out.push(...await leerTodo(b, 'tn_orden_linea', (x) => x.select('tienda, tn_id, nombre, sku, cantidad').in('tn_id', ids.slice(i, i + 200)).order('tn_id').order('linea_id')))
    }
    return out
  }
  // Bruno, 19-oct: el entregado sin cobrar que GN ya tiene cobrado sale de la lista (el espejo `ventas` / `ventas_cobros`).
  const entregados = ordenes.filter(esEntregadoSinCobrarTN)
  const traerCobradosGN = async () => {
    if (!entregados.length) return new Set()
    const ventasGN = await leerTodo(b, 'ventas', (x) => x.select('id, tn_order, date_sale').in('tn_order', entregados.map((o) => String(o.numero))))
    const cobros = ventasGN.length ? await leerTodo(b, 'ventas_cobros', (x) => x.select('venta_id, monto').in('venta_id', ventasGN.map((v) => v.id))) : []
    return cobradosEnGN({ entregados, ventasGN, cobros })
  }
  // El nombre del comprador, de su ficha (sql/059): TN en vivo sólo para lo que ⛔ tiene (Bruno 29-oct: el nombre ⛔ se sacrifica).
  const traerNombres = async () => {
    const ids = [...new Set(ordenes.map((o) => o.cliente_id).filter(Boolean))]
    const out = new Map()
    for (let i = 0; i < ids.length; i += 200) {
      for (const c of await leerTodo(b, 'cliente', (x) => x.select('id, nombre').in('id', ids.slice(i, i + 200)).order('id'))) out.set(c.id, c.nombre)
    }
    return out
  }
  const [lineas, lecturas, cobradosGN, fichas] = await Promise.all([
    traerLineas(),
    b.from('tn_lectura').select('tienda, leida_en').order('leida_en', { ascending: false }).limit(1),
    traerCobradosGN(),
    traerNombres(),
  ])
  const [lectura] = lecturas.data || []
  marcar('ped_base')
  const armado = armarPedidosSinPagar({ ordenes, lineas, ahora: Date.now(), cobradosGN })
  const deFicha = new Map(ordenes.filter((o) => o.cliente_id && fichas.get(o.cliente_id)).map((o) => [`${o.tienda}/${o.tn_id}`, fichas.get(o.cliente_id)]))
  const sinFicha = armado.pedidos.filter((p) => !deFicha.has(`${p.tienda}/${p.tnId}`))
  const nombres = await compradoresTn(sinFicha)
  marcar('ped_nombres_tn')
  for (const p of armado.pedidos) p.comprador = deFicha.get(`${p.tienda}/${p.tnId}`) ?? nombres.get(`${p.tienda}/${p.tnId}`) ?? null
  return { ...armado, leidaEn: lectura?.leida_en ?? null, tiempos: { ...tiempos, ped_cuantos: ordenes.length, ped_en_vivo: sinFicha.length } }
}

/**
 * El nombre del comprador de cada pedido, leído de TN EN VIVO por la puerta del ERP (`erp.arebensrl.com/api/tn-compradores`,
 * Bruno 19-oct). Desde la sql/059 del motor (29-oct) el comprador se guarda como ficha y esto queda sólo para lo que todavía
 * ⛔ la tiene. Sin `ERP_LLAVE_MONITOR`, o si la puerta ⛔ contesta en 6 s, la lista sale igual, sin esos nombres.
 * @returns {Promise<Map<string, string>>} `tienda/tnId` → nombre
 */
export async function compradoresTn(pedidos, { env = process.env, pedir = fetch } = {}) {
  const out = new Map()
  if (!env.ERP_LLAVE_MONITOR || !pedidos.length) return out
  const porTienda = {}
  for (const p of pedidos) (porTienda[p.tienda] ||= []).push(p.tnId)
  await Promise.all(Object.entries(porTienda).map(async ([tienda, ids]) => {
    for (let i = 0; i < ids.length; i += 60) {
      try {
        const r = await pedir(`https://erp.arebensrl.com/api/tn-compradores?tienda=${tienda}&ids=${ids.slice(i, i + 60).join(',')}`,
          { headers: { 'x-erp-llave': env.ERP_LLAVE_MONITOR }, signal: AbortSignal.timeout(6000) })
        if (!r.ok) { console.warn(`[erp] compradores ${tienda}: HTTP ${r.status}`); continue }
        for (const [id, nombre] of Object.entries((await r.json()).compradores || {})) if (nombre) out.set(`${tienda}/${id}`, nombre)
      } catch (e) { console.warn(`[erp] compradores ${tienda}: ${e.name}`) }
    }
  }))
  return out
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'método no permitido' })

  const body = req.body || {}
  // Permisos por rol (`puedeErp`, lib/permisos.core.js): cada vista y acción pide su permiso en SU marca;
  // sin marca (la facturación del mes, que trae las dos) lo pide en las dos. Mientras ninguna función
  // herede el área `erp` (la llave), sólo pasa el admin, como hasta el 19-oct.
  const permiso = permisoErpDe({ method: req.method, vista: req.query.vista, accion: body.accion })
  const base = baseDeLinea(body.marca || body.linea || req.query.marca || req.query.linea || req.query.tienda)
  // Los interruptores de Aprobaciones (anular / conteo / precio: prendido = sólo Admin) viven en la base de cada marca.
  // Al Admin ⛔ le cambian nada ⇒ no se lee la base; y los de un pedido que sólo es 'ver' tampoco los usan.
  const marcasDelPedido = base ? [base] : ['bdi', 'zattia']
  const aprobaciones = (esAdmin(perfil) || (permiso === 'ver' && req.query.vista !== 'permisos'))
    ? undefined
    : await interruptoresDeMarcas(marcasDelPedido, { conMotor })
  // Los roles guardados (Usuarios y roles, motor sql/049) pisan la tabla del código; mismo criterio: al Admin ⛔ le cambian nada.
  // La vista `permisos` arma el mapa de las dos marcas ⇒ lee las dos.
  const guardados = (esAdmin(perfil) || (permiso === 'ver' && req.query.vista !== 'permisos'))
    ? undefined
    : await rolesGuardadosDeMarcas(req.query.vista === 'permisos' ? ['bdi', 'zattia'] : marcasDelPedido, { conMotor })
  // 🔴 El MAPA de permisos (`vista=permisos` sin marca, como lo pide `usePuedeErp`) alcanza con UNA marca: trae la otra en `false`.
  // Con `every`, quien tiene el ERP en una sola (el local de Stunned) recibía 403, el menú se quedaba sin mapa y lo mostraba TODO (30-oct).
  const alcanza = req.query.vista === 'permisos' && !base ? 'some' : 'every'
  if (!marcasDelPedido[alcanza]((m) => puedeErp(perfil, m, permiso, aprobaciones, guardados))) {
    return res.status(403).json({ error: permiso === 'ver' ? 'No tenés acceso al ERP.' : 'Tu rol no puede hacer esto en el ERP.', permiso })
  }
  const invalida = entradaInvalida({ method: req.method, query: req.query, body })
  if (invalida) return res.status(invalida.status).json({ error: invalida.error, campo: invalida.campo })
  if (req.method === 'GET' && req.query.vista === 'permisos') return res.status(200).json({ permisos: permisosErp(perfil, aprobaciones, guardados) })
  const mes = String(req.query.mes || body.mes || diaArgentino(Date.now()).slice(0, 7))
  if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'Mes inválido' })

  try {
    if (req.method === 'GET' && req.query.vista === 'pedidos-tn') {
      const r = await pedidosSinPagar({ marca: String(req.query.marca || '') })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'diferencias') {
      const r = await diferenciasDelDia({ marca: String(req.query.marca || ''), fecha: req.query.fecha })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'conciliacion') {
      const r = await conciliacionDelDia({ tienda: String(req.query.tienda || ''), fecha: req.query.fecha })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'reglas') {
      const r = await reglasDeMarca({ marca: String(req.query.marca || '') }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'guardar-regla' || body.accion === 'sembrar-reglas' || body.accion === 'simular-reglas' || body.accion === 'prender-caja-reglas') {
      const f = { 'guardar-regla': guardarReglaErp, 'sembrar-reglas': sembrarReglasErp, 'simular-reglas': simularReglasErp, 'prender-caja-reglas': prenderCajaErp }[body.accion]
      const r = await f({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error, campo: r.campo ?? null } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'interruptores') {
      return res.status(200).json({ interruptores: await interruptoresDeMarcas(['bdi', 'zattia'], { conMotor }) })
    }

    if (req.method === 'GET' && req.query.vista === 'configuracion') {
      return res.status(200).json({ configuracion: await configuracionDeMarcas(['bdi', 'zattia'], { conMotor }) })
    }

    if (req.method === 'GET' && req.query.vista === 'roles') {
      return res.status(200).json(await vistaRoles({ conMotor }))
    }
    if (req.method === 'POST' && (body.accion === 'poner-roles' || body.accion === 'restablecer-roles')) {
      const r = body.accion === 'poner-roles'
        ? await ponerRolesErp({ body, usuario: perfil.name || perfil.user || null }, { conMotor })
        : await restablecerRolesErp({ body }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'encargadas') {
      const r = await encargadasErp({ marca: String(req.query.marca || '') }, { conMotor, padron: () => padronParaEncargadas(req) })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (req.method === 'GET' && req.query.vista === 'pines') {
      const r = await pinesErp({ marca: String(req.query.marca || '') }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (req.method === 'POST' && (body.accion === 'poner-pin' || body.accion === 'quitar-pin' || body.accion === 'verificar-pin')) {
      const f = { 'poner-pin': ponerPinErp, 'quitar-pin': quitarPinErp, 'verificar-pin': verificarPinErp }[body.accion]
      const r = await f({ body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error, codigo: r.codigo, hasta: r.hasta, quedan: r.quedan } : r)
    }

    if (req.method === 'POST' && body.accion === 'poner-interruptor') {
      const r = await ponerInterruptorErp({ body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'ajustes') {
      const nombres = (base, ids) => { const { url, key } = cfgDeMarca(base); return nombresDeVariantes(createClient(url, key), ids) }
      const r = await ajustesDeLinea({ linea: String(req.query.linea || '') }, { conMotor, conciliacionDelDia, nombresDeVariantes: nombres })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'POST' && body.accion === 'crear-ajuste') {
      const r = await crearAjusteErp({ body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'POST' && (body.accion === 'aprobar-ajuste' || body.accion === 'descartar-ajuste')) {
      const r = await resolverAjusteErp({ body, usuario: perfil.name || perfil.user || null, aprobar: body.accion === 'aprobar-ajuste' }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'transferencias-doc') {
      const r = await documentosDeLinea({ linea: String(req.query.marca || ''), estado: req.query.estado ? String(req.query.estado) : null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'POST' && ACCIONES_TRANSFERENCIA.includes(body.accion)) {
      const r = await accionDeTransferencia({ body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'depositos') {
      const r = await depositosDeLinea({ linea: String(req.query.marca || '') }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'POST' && ACCIONES_DEPOSITO.includes(body.accion)) {
      const r = await accionDeDeposito({ body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error, codigo: r.codigo, ...(r.quedan ? { quedan: r.quedan } : {}), ...(r.abiertas ? { abiertas: r.abiertas } : {}) } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'salidas') {
      const r = await salidasDeLinea({ linea: String(req.query.marca || ''), estado: req.query.estado ? String(req.query.estado) : null, ref: req.query.ref ? String(req.query.ref) : null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'POST' && ACCIONES_SALIDA.includes(body.accion)) {
      const r = await accionDeSalida({ body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error, ...(r.faltan ? { faltan: r.faltan } : {}) } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'producto-historial') {
      const r = await historialDeProducto({ marca: String(req.query.marca || ''), productId: req.query.productId }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'POST' && ACCIONES_CATALOGO.includes(body.accion)) {
      const r = await accionDeCatalogo({ body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'rutas') {
      const r = await rutasDeMarca({ marca: String(req.query.marca || '') }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'POST' && body.accion === 'reintentar-entregas') {
      const r = await reintentarEntregasErp({ marca: String(body.marca || ''), linea: String(body.linea || '') }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'redondeo') {
      const r = await redondeoDeMarca({ marca: String(req.query.marca || '') }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'POST' && body.accion === 'poner-redondeo') {
      const r = await ponerRedondeoErp({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error, campo: r.campo ?? null } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'estructura') {
      const r = await estructuraDeMarca({ marca: String(req.query.marca || '') }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'POST' && body.accion === 'poner-ruta') {
      const r = await ponerRutaErp({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error, campo: r.campo ?? null } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'proveedores') {
      const r = await proveedoresDeMarca({ marca: String(req.query.marca || ''), linea: String(req.query.linea || ''), q: req.query.q, elegir: req.query.elegir === '1' })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (req.method === 'GET' && req.query.vista === 'precio') {
      const marca = String(req.query.marca || '')
      const r = await precioDeProducto({ marca, producto: req.query.producto, costos: puedeErp(perfil, marca, 'costos') })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'stock') {
      const r = await stockDePrenda({ marca: String(req.query.marca || ''), q: req.query.q, producto: req.query.producto, talle: req.query.talle })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'movimientos') {
      const r = await listaDeMovimientos({ marca: String(req.query.marca || ''), desde: String(req.query.desde || ''), hasta: String(req.query.hasta || '') }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'transferencias') {
      const r = await listaDeTransferencias({ marca: String(req.query.marca || '') }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'comparacion') {
      const r = await comparacionConTiendas({ marca: String(req.query.marca || '') }, { conMotor, pedidosSinPagar })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'cargar-venta') {
      // Las reglas con que cobra el POS HOY (`reglasDeHoy`, ⛔ la copia cruda de `caja_config`: la cuenta de la transferencia la pone ésa).
      const reglasDeCaja = async (linea) => {
        const { url, key } = cfgDeMarca(baseDeLinea(linea))
        const sb = createClient(url, key)
        return reglasDeHoy(sb, linea, await reglasGuardadas(sb, linea, marcaDeCaja(linea)))
      }
      const r = await datosParaCargar({ marca: String(req.query.marca || '') }, { conMotor, reglasDeCaja })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'cobros') {
      const r = await cobrosDelPeriodo({ marca: String(req.query.marca || ''), linea: String(req.query.linea || ''), desde: String(req.query.desde || ''), hasta: String(req.query.hasta || ''), prueba: req.query.prueba === '1' }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'gastos') {
      const marca = String(req.query.marca || '')
      const linea = lineaDelPedido(marca, String(req.query.linea || ''))
      if (!linea && MARCAS.includes(marca)) return res.status(SIN_LINEA.status).json({ error: SIN_LINEA.error })
      const r = await gastosDelPeriodo({ marca, linea: linea ?? undefined, desde: String(req.query.desde || ''), hasta: String(req.query.hasta || ''), prueba: req.query.prueba === '1' }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'POST' && body.accion === 'registrar-gasto') {
      const r = await registrarGastoErp({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (req.method === 'GET' && req.query.vista === 'empujes-stock') {
      const r = await empujesDeStock({ marca: String(req.query.marca || '') }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'POST' && body.accion === 'mandar-stock') {
      const r = await mandarStock({ marca: String(body.marca || ''), usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (req.method === 'GET' && req.query.vista === 'ventas-producto') {
      const marca = String(req.query.marca || '')
      const r = await ventasPorProducto({ marca, desde: String(req.query.desde || ''), hasta: String(req.query.hasta || ''), costos: puedeErp(perfil, marca, 'costos') }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'productos-lista') {
      const marca = String(req.query.marca || '')
      const r = await listaDeProductos({ marca, costos: puedeErp(perfil, marca, 'costos') }, { conMotor, pedidosSinPagar, leerLiquidaciones })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (req.method === 'GET' && req.query.vista === 'inicio-resultado') {
      const r = await resultadoDelMes({ marca: String(req.query.marca || ''), linea: String(req.query.linea || '') }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'clientes-lista') {
      const r = await listaDeClientes({ marca: String(req.query.marca || ''), linea: String(req.query.linea || '') }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'cliente-ficha') {
      const r = await fichaDeCliente({ marca: String(req.query.marca || ''), linea: String(req.query.linea || ''), clave: String(req.query.clave || '') }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'cuentas-corrientes') {
      const r = await cuentasDeLaMarca({ marca: String(req.query.marca || ''), linea: String(req.query.linea || ''), prueba: req.query.prueba === '1' }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'cuenta-panel') {
      const r = await cuentaDelPanel({ gnId: String(req.query.gnId || ''), tel: String(req.query.tel || ''), prueba: req.query.prueba === '1', usuario: [perfil.user, perfil.email] }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'cuenta-cliente') {
      const r = await cuentaDeCliente({
        marca: String(req.query.marca || ''), clienteId: String(req.query.cliente || ''), linea: String(req.query.linea || ''),
        prueba: req.query.prueba === '1', desde: String(req.query.desde || ''), hasta: String(req.query.hasta || ''),
      }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    // El pedido mayorista en el panel (plan «BDI directo al ERP» paso 3, `api/_erp-pedido.js`): leer detrás del panel,
    // escribir además detrás de VENTA_MAYORISTA_REAL (409 hasta el corte de BDI).
    if (req.method === 'GET' && req.query.vista === 'pedidos-panel') {
      const r = await pedidosDelPanel({ clienteId: String(req.query.cliente || ''), tel: String(req.query.tel || ''), usuario: [perfil.user, perfil.email] }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'pedido-panel') {
      const r = await pedidoDelPanel({ pedidoId: String(req.query.id || ''), usuario: [perfil.user, perfil.email] }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'pedido-productos') {
      const r = await productosParaElPanel({ pedidoId: String(req.query.id || ''), q: String(req.query.q || ''), usuario: [perfil.user, perfil.email] }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'preparados-sin-pagar') {
      const r = await preparadosSinPagarDelPanel({ usuario: [perfil.user, perfil.email] }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'POST' && ACCIONES_PEDIDO.includes(body.accion)) {
      const r = await accionDePedido({ accion: body.accion, body, usuario: perfil.user || perfil.email || perfil.name || null, quien: [perfil.user, perfil.email] }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (req.method === 'GET' && req.query.vista === 'bcra-panel') {
      const r = await bcraDelPanel({ clienteId: String(req.query.cliente || ''), usuario: [perfil.user, perfil.email] }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'clientes-panel') {
      const r = await clientesDelPanel({ q: String(req.query.q || ''), usuario: [perfil.user, perfil.email] }, { conMotor })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'POST' && body.accion === 'cliente-nuevo-panel') {
      const r = await clienteNuevoPanel({ body, usuario: perfil.user || perfil.email || perfil.name || null, quien: [perfil.user, perfil.email] }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error, existe: r.existe } : r)
    }
    if (req.method === 'POST' && (body.accion === 'anotar-whatsapp' || body.accion === 'sacar-whatsapp')) {
      const f = body.accion === 'anotar-whatsapp' ? anotarWhatsappPanel : sacarWhatsappPanel
      const r = await f({ body, usuario: perfil.user || perfil.email || perfil.name || null, quien: [perfil.user, perfil.email] }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (req.method === 'POST' && body.accion === 'poner-credito') {
      const r = await ponerCreditoCliente({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (req.method === 'POST' && body.accion === 'poner-contacto') {
      const r = await ponerContactoCliente({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (req.method === 'GET' && req.query.vista === 'stock-lista') {
      const r = await listaDeStock({ marca: String(req.query.marca || '') }, { conMotor, pedidosSinPagar })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'ventas-lista') {
      const marca = String(req.query.marca || '')
      // Los pedidos sin pagar (~1,5 s) se leen A LA PAR de las ventas, ⛔ antes (29-oct: eran la mitad de la espera).
      const t0 = Date.now()
      let tPedidos = 0
      const p = (MARCAS.includes(marca) ? pedidosSinPagar({ marca }) : Promise.resolve({ pedidos: [] })).finally(() => { tPedidos = Date.now() - t0 })
      p.catch(() => {}) // si la lista corta antes (400), el rechazo ⛔ queda suelto; el await de adentro lo sigue tirando
      const r = await listaDeVentas({ marca, desde: String(req.query.desde || ''), hasta: String(req.query.hasta || ''), pedidos: p.then((x) => x.pedidos || []), tnLeidaEn: p.then((x) => x.leidaEn ?? null), linea: String(req.query.linea || '') }, { compradores: compradoresTn })
      // Dónde se va el tiempo (DevTools › Network › Timing): para cazar los picos de 8 s.
      const tp = await p.then((x) => x.tiempos || {}, () => ({}))
      res.setHeader('Server-Timing', [`pedidos;dur=${tPedidos}`, ...Object.entries(tp).map(([k, v]) => `${k};dur=${v}`), ...Object.entries(r.tiempos || {}).map(([k, v]) => `${k};dur=${v}`), `total;dur=${Date.now() - t0}`].join(', '))
      delete r.tiempos
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'venta-extra') {
      const r = await extraDeVenta({ marca: String(req.query.marca || ''), id: String(req.query.id || '') })
      return r.status ? res.status(r.status).json({ error: r.error }) : res.status(200).json(r)
    }
    if (req.method === 'GET' && req.query.vista === 'ventas') {
      const r = await buscarVentas({ marca: String(req.query.marca || ''), q: req.query.q, desde: req.query.desde, hasta: req.query.hasta })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'venta-gn-cambio') {
      const marca = String(req.query.marca || '')
      if (marca !== 'zattia') return res.status(400).json({ error: 'El cambio de una venta de Gestión Nube es de Stunned.' })
      const { url, key } = cfgDeMarca(marca)
      const r = await conMotor(marca, 'El cambio', (db) => ventaGnDeCambio({ sb: createClient(url, key), db, gnVentaId: String(req.query.id || ''), prueba: process.env.CAJA_STUNNED_PRUEBA !== '0' }))
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'ticket') {
      const r = await ticketDeVentaErp({ marca: String(req.query.marca || ''), id: req.query.id })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'venta') {
      const r = await fichaDeVenta({ marca: String(req.query.marca || ''), id: req.query.id })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'clientas') {
      const r = await clientasDeLaCaja({ marca: String(req.query.marca || ''), q: req.query.q, linea: req.query.linea ? String(req.query.linea) : '' })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'saldo') {
      const r = await saldoDeClienta({ marca: String(req.query.marca || ''), doc: req.query.doc, prueba: req.query.prueba !== '0', linea: req.query.linea ? String(req.query.linea) : null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'facturas') {
      const r = await facturasDelMes(mes)
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET') {
      const m = await leerMes(mes)
      const vista = await vistaDeFacturacion(mes, m.ventas, m.lineaDe)
      return res.status(200).json({
        mes, ambiente: m.ambiente, errorAmbiente: m.errorAmbiente || null,
        estado: m.periodo?.estado || 'abierto', cerradoPor: m.periodo?.cerrado_por || null, cerradoEn: m.periodo?.cerrado_en || null,
        techoCalculado: m.calculado.total, sinClasificar: m.calculado.sinClasificar, porCuenta: m.calculado.porCuenta,
        ...m.resumen,
        ventas: vista.ventas,
        facturasGN: vista.facturasGN,
        porPedido: POR_PEDIDO,
        puntosDeVenta: m.ambiente ? Object.fromEntries([...MARCAS, 'stunned'].map((x) => { try { return [x, ptoVtaDe(m.ambiente, x, process.env)] } catch { return [x, null] } })) : {},
      })
    }

    if (body.accion === 'cerrar') {
      const m = await leerMes(mes)
      if (m.periodo?.estado === 'cerrado') return res.status(409).json({ error: 'El mes ya está cerrado' })
      const { error } = await m.sb.from('facturacion_mes').upsert({
        mes, estado: 'cerrado', techo: m.calculado.total,
        desglose: { porCuenta: m.calculado.porCuenta, sinClasificar: m.calculado.sinClasificar },
        calculado_en: new Date().toISOString(), cerrado_por: perfil.name || perfil.user || null, cerrado_en: new Date().toISOString(),
      })
      if (error) throw new Error(`facturacion_mes: ${error.message}`)
      return res.status(200).json({ ok: true, techo: m.calculado.total })
    }

    if (body.accion === 'soltar-precio') {
      const r = await soltarPrecioDeLista({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (body.accion === 'cargar-precio' || body.accion === 'cargar-costo') {
      const r = await cargarPrecioCosto({ marca: String(body.marca || ''), body: { ...body, que: body.accion === 'cargar-precio' ? 'precio' : 'costo' }, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'guardar-proveedor') {
      const r = await altaDeProveedor({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'nota-credito') {
      const r = await notaDeCredito({ facturaId: body.facturaId, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'nota-debito') {
      const r = await notaDeDebito({ facturaId: body.facturaId, monto: body.monto, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'editar-venta' || body.accion === 'nota-venta' || body.accion === 'cobrar-venta' || body.accion === 'cobrar-cuenta') {
      const fn = { 'editar-venta': editarVentaErp, 'nota-venta': notaDeVentaErp, 'cobrar-venta': cobrarVentaErp, 'cobrar-cuenta': cobrarCuentaErp }[body.accion]
      const r = await fn({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || 'admin' })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (body.accion === 'cargar-venta') {
      const r = await cargarVentaManual({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null, persona: perfil.user || perfil.name || null }, { conMotor })
      return res.status(r.status || 200).json(r.status ? { error: r.error, ...(r.codigo ? { codigo: r.codigo } : {}) } : r)
    }
    if (body.accion === 'anular') {
      const r = await anularVentaPropia({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (body.accion === 'corregir-medio') {
      const r = await corregirMedioErp({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (body.accion === 'corregir-precio') {
      const r = await corregirPrecioErp({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }
    if (body.accion === 'confirmar-vuelta') {
      const r = await confirmarVueltaPropia({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'cambiar') {
      const r = await cambiarVentaPropia({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'nota-credito-venta') {
      const r = await notaDeCreditoDeVenta({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'facturar-cambio') {
      const r = await facturarCambio({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'facturar-venta') {
      const r = await facturarVentaPropia({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'facturar') {
      const r = await facturarVentas({ mes, marca: String(body.marca || ''), linea: String(body.linea || ''), ventaIds: body.ventaIds, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    return res.status(400).json({ error: 'Acción inválida' })
  } catch (e) {
    // El texto crudo (de Postgres o de Supabase) puede traer valores de la fila: sólo lo ve el admin.
    console.error('[erp] 500', req.query.vista || body.accion || 'facturacion', e)
    return res.status(500).json({ error: esAdmin(perfil) ? e.message : 'Algo falló en el servidor. Probá de nuevo y, si sigue, avisá.' })
  }
}
