/**
 * ERP › Productos › editar el producto en el ERP (`motor/catalogo-edicion.mjs`, sql/037). Este núcleo es lo puro de la puerta
 * `api/_erp-catalogo.js`: lee el pedido del navegador (⛔ se confía en él: sólo pasan los campos editables, el usuario sale
 * de la sesión) y dice en palabras de la pantalla lo que el motor contesta. Sin red ni base.
 */
import { baseDe, LINEAS } from './transferencia-doc.core.js'

export { baseDe }
export const MARCAS = LINEAS
export const ACCIONES = ['producto-editar', 'variante-editar', 'variante-agregar']

const CAMPOS_PRODUCTO = ['nombre', 'categoria', 'activo']
const CAMPOS_VARIANTE = ['talle', 'sku', 'barcode', 'activa']
const entero = (x) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && /^\d+$/.test(String(x).trim())
const cadena = (x, n) => (typeof x === 'string' ? x.slice(0, n) : x === null ? null : undefined)

/** Sólo los campos editables y con el tipo que el motor espera; lo demás lo ve el motor y lo rechaza (`CAMPO_NO_EDITABLE`). */
function leerCambios(c, campos) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null
  const out = {}
  for (const [k, v] of Object.entries(c)) {
    if (!campos.includes(k)) return { raro: k }
    if (k === 'activo' || k === 'activa') out[k] = v
    else {
      const t = cadena(v, 300)
      if (t === undefined) return { raro: k }
      out[k] = t
    }
  }
  return out
}

/** @returns {{ error: string } | { marca: string, entrada: any }} */
export function leerAccion(body) {
  const marca = String(body?.marca || '')
  if (!MARCAS.includes(marca)) return { error: 'Marca inválida' }
  if (!entero(body.productId)) return { error: 'Falta el producto' }
  const product_id = Number(body.productId)
  if (body.accion === 'variante-agregar') {
    return { marca, entrada: { marca, product_id, talle: cadena(body.talle, 40) ?? '', sku: cadena(body.sku, 80) ?? undefined, barcode: cadena(body.barcode, 80) ?? undefined } }
  }
  const campos = body.accion === 'producto-editar' ? CAMPOS_PRODUCTO : body.accion === 'variante-editar' ? CAMPOS_VARIANTE : null
  if (!campos) return { error: 'Acción desconocida' }
  const cambios = leerCambios(body.cambios, campos)
  if (cambios === null) return { error: 'Faltan los cambios' }
  if (cambios.raro) return { error: `No se edita: ${cambios.raro}` }
  if (body.accion === 'producto-editar') return { marca, entrada: { marca, product_id, cambios } }
  if (!entero(body.sizeId)) return { error: 'Falta la variante' }
  return { marca, entrada: { marca, product_id, size_id: Number(body.sizeId), cambios } }
}

export const STATUS = { ENTRADA_INVALIDA: 400, CAMPO_NO_EDITABLE: 400, NO_ENCONTRADO: 404, BARCODE_REPETIDO: 409, TALLE_REPETIDO: 409 }
const MENSAJE = {
  NO_ENCONTRADO: 'No está ese producto o esa variante en esta marca.',
  TALLE_REPETIDO: 'Ese producto ya tiene ese talle.',
}

/** El error del motor, dicho como en la pantalla. */
export function errorDe(r) {
  const c = r.error.codigo
  const otra = r.error.otra
  const texto = c === 'BARCODE_REPETIDO'
    ? `Ese código de barras ya es de otra variante${otra ? ` (producto ${otra.product_id}, variante ${otra.size_id})` : ''}.`
    : MENSAJE[c] ?? String(r.error.mensaje || '').replace(/⛔\s*/g, 'no ')
  return { status: STATUS[c] ?? 409, error: texto }
}

export const textoDeAviso = (codigo) => (codigo === 'SKU_REPETIDO' ? 'Otra variante ya tiene ese SKU. Se guardó igual.' : codigo)
