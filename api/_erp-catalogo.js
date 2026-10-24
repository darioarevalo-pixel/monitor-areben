/**
 * ERP › Productos › editar el producto: la puerta del monitor al motor (`motor/catalogo-edicion.mjs`, sql/037). Los verbos van por
 * pg y cada uno abre su transacción; lo puro (leer el pedido, decir el error) está en `lib/erp/catalogo-edicion.core.js`.
 *
 *   GET  ?recurso=erp&vista=producto-historial&marca=bdi|zattia|stunned&productId=…   quién cambió qué, más nuevo primero
 *   POST {recurso:'erp', accion:'producto-editar', marca, productId, cambios:{nombre?, categoria?, activo?}}
 *   POST {recurso:'erp', accion:'variante-editar', marca, productId, sizeId, cambios:{talle?, sku?, barcode?, activa?}}
 *   POST {recurso:'erp', accion:'variante-agregar', marca, productId, talle, sku?, barcode?}
 *
 * Permiso: `configurar` (sólo Admin) hasta que Bruno decida los roles (`reglas-vigentes.md`: «La llave `erp` queda cerrada»).
 * 🔴 Editar una fila que vino de GN la pasa a «cargada»: la copia de GN ⛔ la actualiza más (el motor lo dice en `desde_gn`).
 */
import { ACCIONES, baseDe, errorDe, leerAccion, MARCAS, textoDeAviso } from '../lib/erp/catalogo-edicion.core.js'

const SIN_TABLA = 'La edición del producto todavía no está en la base del motor (migración 037).'
const motor = () => import('../motor/catalogo-edicion.mjs')
const hayTabla = async (pg) => (await pg.query(`select to_regclass('public.catalogo_edicion') is not null as hay`)).rows[0].hay

export async function historialDeProducto({ marca, productId }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!/^\d+$/.test(String(productId ?? ''))) return { status: 400, error: 'Falta el producto' }
  const m = await motor()
  return deps.conMotor(baseDe(marca), 'El historial del producto', async (pg) => {
    if (!(await hayTabla(pg))) return { status: 409, error: SIN_TABLA }
    return { historial: await m.historialDeProducto(pg, { marca, product_id: productId, limite: 200 }) }
  })
}

export async function accionDeCatalogo({ body, usuario }, deps) {
  if (!ACCIONES.includes(body?.accion)) return { status: 400, error: 'Acción desconocida' }
  const e = leerAccion(body)
  if (e.error) return { status: 400, error: e.error }
  if (!usuario) return { status: 400, error: 'No sé quién lo cambia.' }
  const m = await motor()
  return deps.conMotor(baseDe(e.marca), 'La edición del producto', async (pg) => {
    if (!(await hayTabla(pg))) return { status: 409, error: SIN_TABLA }
    const op = { ...e.entrada, usuario }
    const r = body.accion === 'producto-editar' ? await m.editarProducto(pg, op)
      : body.accion === 'variante-editar' ? await m.editarVariante(pg, op)
      : await m.agregarVariante(pg, op)
    if (!r.ok) return errorDe(r)
    return { ok: true, cambios: r.cambios ?? [], desde_gn: r.desde_gn ?? false, variante: r.variante ?? null, avisos: (r.avisos || []).map((codigo) => ({ codigo, texto: textoDeAviso(codigo) })) }
  })
}
