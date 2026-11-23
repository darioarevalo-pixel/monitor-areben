/**
 * Las copias de CATÁLOGO y de STOCK del ERP al espejo, con las bases ya abiertas. Las usan los scripts de la noche
 * (`scripts/erp-productos-espejo.mjs`, `scripts/erp-inventario-espejo.mjs`) y la vuelta de 10 minutos
 * (`api/_espejo-vivo.js`). La de VENTAS vive en `erp-ventas-copia.mjs`.
 * Las reglas viven en los núcleos (`lib/erp/*-espejo.core.js`); `soloCambios` (`lib/erp/espejo-vivo.core.js`) escribe sólo
 * lo que difiere del espejo. La noche va SIN `soloCambios`: entera.
 * 🔴 Cualquier cosa rara TIRA o vuelve con `freno`: un espejo viejo sin avisar es peor que una corrida caída.
 */
import { planProductosErp, SQL_PRODUCTOS_LINEAS } from '../../lib/erp/productos-espejo.core.js'
import { planInventarioErp, SQL_INVENTARIO_LINEAS } from '../../lib/erp/inventario-espejo.core.js'
import { CAMPOS_INVENTARIO, CAMPOS_PRODUCTOS, claveInventario, claveProducto, filasQueCambian } from '../../lib/erp/espejo-vivo.core.js'
import { escribirInventario } from './erp-inventario-escribir.mjs'
import { registrarCambiosDeStock } from './stock-cambios.mjs'

/** ¿El espejo `productos` de esta base tiene la columna `proveedor`? (Zattia sí, BDI no.) */
export const CON_PROVEEDOR = { bdi: false, zattia: true }

/** Una tabla del espejo entera, paginada (PostgREST corta en 1000 callado). */
async function leerTabla(sb, tabla, columnas, orden) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    let q = sb.from(tabla).select(columnas)
    for (const c of orden) q = q.order(c)
    const { data, error } = await q.range(desde, desde + 999)
    if (error) throw new Error(`leyendo ${tabla}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

/**
 * Catálogo, precio y costo del motor ⇒ `productos`.
 * @param {{ query: Function }} db pg abierto en la base del motor @param {any} sb supabase-js con service key
 * @param {'bdi'|'zattia'} base @param {string[]} lineas las cortadas (`lineasCortadasDe`)
 * @param {{ seco?: boolean, soloCambios?: boolean }} [o]
 */
export async function copiarProductosErp(db, sb, base, lineas, { seco = false, soloCambios = false } = {}) {
  const conProveedor = CON_PROVEEDOR[base]
  if (typeof conProveedor !== 'boolean') throw new Error(`base desconocida: ${base}`)
  const motor = (await db.query(SQL_PRODUCTOS_LINEAS, [lineas])).rows
  const campos = soloCambios ? CAMPOS_PRODUCTOS.filter((c) => c !== 'proveedor' || conProveedor) : []
  const espejo = await leerTabla(sb, 'productos', ['id', ...campos].join(','), ['id'])
  const plan = planProductosErp(lineas, motor, espejo, { conProveedor })
  if (plan.freno) return { motor: motor.length, existentes: 0, nuevos: 0, sinPrecio: 0, freno: plan.freno }
  const existentes = soloCambios ? filasQueCambian(plan.existentes, espejo, claveProducto, campos) : plan.existentes
  const sinPrecio = [...plan.existentes, ...plan.nuevos].filter((r) => r.active && !(r.retailer_price > 0)).length
  if (!seco) {
    // Dos tandas: un upsert de PostgREST pisa las columnas que manda, y los existentes ⛔ mandan `created_at` ni `sku`.
    for (const filas of [existentes, plan.nuevos]) {
      for (let i = 0; i < filas.length; i += 500) {
        const { error } = await sb.from('productos').upsert(filas.slice(i, i + 500), { onConflict: 'id' })
        if (error) throw new Error(`escribiendo productos: ${error.message}`)
      }
    }
  }
  return { motor: motor.length, existentes: existentes.length, nuevos: plan.nuevos.length, sinPrecio, freno: null }
}

/**
 * Stock del LIBRO ⇒ `inventario`, con la historia de stock (`stock_cambios`) ANTES de escribir.
 * `frenoLimpieza` ⇒ se escribió el stock pero ⛔ se sacó nada (quien llama lo pone en rojo).
 * @param {{ query: Function }} db @param {any} sb @param {'bdi'|'zattia'} base @param {string[]} lineas
 * @param {{ seco?: boolean, soloCambios?: boolean, origen?: string }} [o]
 */
export async function copiarInventarioErp(db, sb, base, lineas, { seco = false, soloCambios = false, origen = 'erp' } = {}) {
  const libro = (await db.query(SQL_INVENTARIO_LINEAS, [lineas])).rows
  const espejo = await leerTabla(sb, 'inventario', ['product_id', 'size_id', 'store_name', ...CAMPOS_INVENTARIO].join(','), ['product_id', 'size_id', 'store_name'])
  const plan = planInventarioErp(base, lineas, libro, espejo)
  const upserts = soloCambios ? filasQueCambian(plan.upserts, espejo, claveInventario, CAMPOS_INVENTARIO) : plan.upserts
  let historia = { cambios: 0 }
  if (!seco) {
    if (upserts.length) historia = await registrarCambiosDeStock(sb, upserts, origen)
    await escribirInventario(sb, upserts)
    for (const r of plan.borrar) {
      const { error } = await sb.from('inventario').delete().eq('product_id', r.product_id).eq('size_id', r.size_id).eq('store_name', r.store_name)
      if (error) throw new Error(`sacando fila colgada: ${error.message}`)
    }
  }
  return {
    libro: libro.length, sinSku: plan.sinSku, espejoDeLineas: plan.espejoDeLineas,
    escritas: upserts.length, sacadas: plan.borrar.length,
    historia: historia.cambios, errorHistoria: historia.error || null, frenoLimpieza: plan.frenoLimpieza,
  }
}
