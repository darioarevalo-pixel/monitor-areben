/**
 * ERP › Inicio › «Ver como» (🎨 26-oct, Resto; tablero 1 del v8): qué ve cada uno de los 6 roles. Núcleo puro.
 * 🔑 Todo sale de las vistas que YA cuentan las listas (Ventas, Stock, Productos): ⛔ un número que no tenga lista detrás.
 * 🔑 Sin tile de cheques (Bruno, 18-oct) y el resultado comercial —con su costo— es sólo de Admin; Consulta ⛔ ve costos.
 */

/** Los 6 roles, en el orden del selector. Las claves de los 5 últimos son las de `ERP_ROLES` (`lib/permisos.core.js`). */
export const ROLES = [
  ['admin', 'Admin', 'lo que espera a alguien y cómo va el mes'],
  ['local', 'Local', 'lo que hay que preparar y retirar en el Local'],
  ['mayorista', 'Mayorista', 'pedidos del catálogo y cuentas corrientes'],
  ['deposito', 'Depósito', 'lo que hay que preparar, desarmar y contar'],
  ['administracion', 'Administración', 'cobros y facturas'],
  ['consulta', 'Consulta', 'ves todo sin tocar nada (sin costos)'],
]

/** Cada renglón: [lista, vista, qué es, sección, pestaña]. */
const VENTAS_PREPARAR = ['ventas', 'preparar', 'Ventas a preparar', 'ventas', 'ventas']
const VENTAS_LISTAS = ['ventas', 'listas', 'Listas para retirar o enviar', 'ventas', 'ventas']
const VENTAS_DESARMAR = ['ventas', 'desarmar', 'Ventas a desarmar', 'ventas', 'ventas']
const VENTAS_SINPAGAR = ['ventas', 'sinpagar', 'Pedidos sin pagar', 'ventas', 'ventas']
const VENTAS_SALDO = ['ventas', 'saldo', 'Ventas con saldo', 'ventas', 'ventas']
const VENTAS_SINFACTURA = ['ventas', 'sinfactura', 'Ventas del ERP sin factura', 'ventas', 'facturacion']
const STOCK_NEG = ['stock', 'neg', 'Prendas en negativo', 'stock', 'stock']
const STOCK_LOCAL0 = ['stock', 'local0', 'Prendas sin stock en el Local', 'stock', 'stock']

const LOCAL = ['Local', [VENTAS_PREPARAR, VENTAS_LISTAS, STOCK_NEG]]
const ADMINISTRACION = ['Administración', [VENTAS_SINPAGAR, VENTAS_SALDO, VENTAS_SINFACTURA]]
const PRODUCTOS = ['Productos', [
  ['productos', 'sincosto', 'Productos sin costo', 'productos', 'productos'],
  ['productos', 'sinmay', 'Sin precio mayorista', 'productos', 'productos'],
  ['productos', 'sinprov', 'Sin proveedor', 'productos', 'productos'],
]]

/** @type {Record<string, Array<[string, Array<string[]>]>>} las tarjetas de «Para hacer» de cada rol */
const PARA_HACER = {
  admin: [LOCAL, ADMINISTRACION, PRODUCTOS],
  local: [LOCAL],
  mayorista: [['Mayorista', [VENTAS_SINPAGAR, VENTAS_SALDO]]],
  deposito: [['Depósito', [VENTAS_PREPARAR, VENTAS_DESARMAR, STOCK_NEG, STOCK_LOCAL0]]],
  administracion: [ADMINISTRACION],
  consulta: [['Para mirar', [
    ['ventas', 'todas', 'Ventas del mes', 'ventas', 'ventas'],
    ['stock', 'constock', 'Prendas con stock', 'stock', 'stock'],
  ]]],
}

/** Los nombres de las vistas que cuenta «Para hacer». @type {Record<string, string>} */
export const VISTA = {
  preparar: 'A preparar', listas: 'Listas', desarmar: 'A desarmar', neg: 'Negativos', local0: 'Sin stock en el Local', sinpagar: 'Sin pagar', saldo: 'Con saldo',
  sinfactura: 'Sin factura', sincosto: 'Sin costo', sinmay: 'Sin precio mayorista', sinprov: 'Sin proveedor', todas: 'Todas', constock: 'Con stock',
}

/** @param {string} rol */
export const rolValido = (rol) => ROLES.some(([k]) => k === rol)
export const paraHacerDe = (rol) => PARA_HACER[rol] ?? []
export const verResultado = (rol) => rol === 'admin'
export const subtituloDe = (rol) => ROLES.find(([k]) => k === rol)?.[2] ?? ''
