/**
 * Lo que lee y escribe la sombra de TN en las bases. Las reglas viven en orden.mjs y cruce.mjs; acá sólo SQL.
 */
import { existe, tieneColumna } from '../db.mjs'
import { claveNumero } from './cruce.mjs'
import { guardarComprador } from './comprador.mjs'
import { origenRef } from './venta.mjs'

const COLS = ['tienda', 'tn_id', 'numero', 'creada_en', 'actualizada_en', 'pagada_en', 'cancelada_en', 'status',
  'payment_status', 'shipping_status', 'gateway', 'medio', 'moneda', 'subtotal', 'descuento', 'envio', 'total', 'cancel_reason']
// sql/015: el estado del pedido. Sin la migración se guarda como antes (las columnas ⛔ existen).
const COLS_ESTADO = ['envio_estado', 'envio_tipo', 'ubicacion', 'estado']
const COLS_LINEA = ['tienda', 'tn_id', 'linea_id', 'product_id', 'variant_id', 'sku', 'barcode', 'nombre', 'cantidad', 'precio']

export const hayTablas = (db) => existe(db, 'tn_orden')

/**
 * 🔴 `pagada_en` ⛔ se borra: la LISTA de TN a veces trae el pagado sin `paid_at` (`completarPaidAt` sólo completa 60 por
 * corrida) y al re-leer pisaba con null la fecha ya guardada ⇒ el pedido dejaba de ser venta. Medido 19-oct tras
 * `estados-30`: pagados sin fecha BDI 1 → 437 · Zattia 0 → 259. Un pago ⛔ se des-paga (la devolución va por `payment_status`).
 */
const pisar = (c) => (c === 'pagada_en' ? 'pagada_en = coalesce(excluded.pagada_en, tn_orden.pagada_en)' : `${c} = excluded.${c}`)

export async function leidoHastaDe(db, tienda) {
  const [r] = await db.q('select leido_hasta from tn_lectura where tienda = $1', [tienda])
  return r ? new Date(r.leido_hasta).toISOString() : null
}

/**
 * Guarda un lote: la orden se pisa sólo si lo leído es igual o más nuevo que lo guardado (dos corridas
 * superpuestas ⛔ vuelven atrás una cancelación), y sus líneas se reemplazan con las de esa versión.
 * `compradores` (tn_id → `compradorDeOrden`, sql/059): la ficha del comprador, que la orden apunta y la venta `tn` de esa
 * orden hereda si todavía ⛔ tiene clienta. Sin la 059, o sin `compradores`, la orden se guarda como antes.
 */
export async function guardarLote(db, tienda, filas, lineas, leidoHasta, compradores = null) {
  let pisadas = 0
  const cols = (await tieneColumna(db, 'tn_orden', 'estado')) ? [...COLS, ...COLS_ESTADO] : COLS
  const conComprador = !!compradores && (await tieneColumna(db, 'tn_orden', 'cliente_id'))
  for (const f of filas) {
    const vals = cols.map((c) => f[c])
    const n = await db.run(
      `insert into tn_orden (${cols.join(', ')}, leida_en) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}, now())
       on conflict (tienda, tn_id) do update set ${cols.slice(2).map(pisar).join(', ')}, leida_en = now()
       where tn_orden.actualizada_en <= excluded.actualizada_en`,
      vals,
    )
    if (!n) continue
    pisadas++
    await db.run('delete from tn_orden_linea where tienda = $1 and tn_id = $2', [tienda, f.tn_id])
    for (const l of lineas.filter((x) => x.tn_id === f.tn_id)) {
      await db.run(
        `insert into tn_orden_linea (${COLS_LINEA.join(', ')}) values (${COLS_LINEA.map((_, i) => `$${i + 1}`).join(', ')})`,
        COLS_LINEA.map((c) => l[c]),
      )
    }
    if (conComprador && compradores.get(f.tn_id)) await ligarComprador(db, tienda, f.tn_id, compradores.get(f.tn_id))
  }
  if (leidoHasta) {
    await db.run(
      `insert into tn_lectura (tienda, leido_hasta, leida_en, ordenes) values ($1, $2, now(), $3)
       on conflict (tienda) do update set leido_hasta = greatest(tn_lectura.leido_hasta, excluded.leido_hasta), leida_en = now(), ordenes = excluded.ordenes`,
      [tienda, leidoHasta, filas.length],
    )
  }
  return pisadas
}

/** La ficha del comprador de UNA orden ya guardada ⇒ `tn_orden.cliente_id`, y la venta `tn` sin clienta la hereda. */
export async function ligarComprador(db, tienda, tnId, comprador) {
  const [o] = await db.q('select cliente_id::text from tn_orden where tienda = $1 and tn_id = $2', [tienda, tnId])
  if (!o) return null
  const id = await guardarComprador(db, { tienda, comprador, actual: o.cliente_id })
  if (id && id !== o.cliente_id) await db.run('update tn_orden set cliente_id = $3 where tienda = $1 and tn_id = $2', [tienda, tnId, id])
  if (id) await db.run(`update venta set cliente_id = $2 where origen = 'tn' and origen_ref = $1 and cliente_id is null`, [origenRef(tienda, tnId), id])
  return id
}

/** Las órdenes creadas desde `desde` (ISO), con sus líneas, y todos los números conocidos de la tienda. */
export async function cargarOrdenes(db, tienda, desde) {
  const ordenes = await db.q(`select * from tn_orden where tienda = $1 and creada_en >= $2 order by numero`, [tienda, desde])
  const lineas = await db.q(
    `select l.* from tn_orden_linea l join tn_orden o using (tienda, tn_id) where o.tienda = $1 and o.creada_en >= $2`,
    [tienda, desde],
  )
  const porOrden = new Map()
  for (const l of lineas) {
    const k = Number(l.tn_id)
    if (!porOrden.has(k)) porOrden.set(k, [])
    porOrden.get(k).push(l)
  }
  for (const o of ordenes) o.lineas = porOrden.get(Number(o.tn_id)) ?? []
  const numeros = new Set((await db.q('select numero::text as numero from tn_orden where tienda = $1', [tienda])).map((r) => claveNumero(r.numero)))
  return { ordenes, numeros }
}

/** Los pedidos ABIERTOS de la tienda (de cualquier fecha: los colgados tienen semanas), con sus líneas: las reservas. */
export async function cargarAbiertas(db, tienda) {
  const ordenes = await db.q(`select * from tn_orden where tienda = $1 and status = 'open' order by numero`, [tienda])
  if (!ordenes.length) return []
  const lineas = await db.q(`select * from tn_orden_linea where tienda = $1 and tn_id = any($2::bigint[]) order by linea_id`, [tienda, ordenes.map((o) => o.tn_id)])
  const porOrden = new Map()
  for (const l of lineas) porOrden.set(Number(l.tn_id), [...(porOrden.get(Number(l.tn_id)) || []), l])
  for (const o of ordenes) o.lineas = porOrden.get(Number(o.tn_id)) ?? []
  return ordenes
}

/** Los pedidos que se movieron desde `desde` (pago, cancelación, devolución), con sus líneas: para la venta propia. */
export async function cargarOrdenesMovidas(db, tienda, desde) {
  return conLineas(db, tienda, await db.q(`select * from tn_orden where tienda = $1 and actualizada_en >= $2 order by numero`, [tienda, desde]))
}

/** Las órdenes guardadas con esos `tn_id`, con sus líneas (la puerta: el pedido del aviso). */
export async function cargarOrdenesPorId(db, tienda, ids) {
  return conLineas(db, tienda, await db.q(`select * from tn_orden where tienda = $1 and tn_id = any($2::bigint[]) order by numero`, [tienda, ids]))
}

async function conLineas(db, tienda, ordenes) {
  if (!ordenes.length) return []
  const lineas = await db.q(`select * from tn_orden_linea where tienda = $1 and tn_id = any($2::bigint[]) order by linea_id`, [tienda, ordenes.map((o) => o.tn_id)])
  const porOrden = new Map()
  for (const l of lineas) {
    const k = Number(l.tn_id)
    if (!porOrden.has(k)) porOrden.set(k, [])
    porOrden.get(k).push(l)
  }
  for (const o of ordenes) o.lineas = porOrden.get(Number(o.tn_id)) ?? []
  return ordenes
}

/** Las ventas del espejo desde un día, con sus renglones (por venta). */
export async function cargarVentas(db, desdeFecha) {
  const ventas = await db.q(
    `select id, date_sale, tn_order, integration_id, integration_source from ventas
     where date_sale >= $1 and (tn_order is not null or integration_source = 'monitor-sync-tn')`,
    [desdeFecha],
  )
  const detalles = new Map()
  if (ventas.length) {
    const filas = await db.q('select sale_id, product_id, size_id, quantity from venta_detalles where sale_id = any($1)', [ventas.map((v) => v.id)])
    for (const d of filas) {
      const k = Number(d.sale_id)
      if (!detalles.has(k)) detalles.set(k, [])
      detalles.get(k).push(d)
    }
  }
  return { ventas, detalles }
}

// ── Catálogo (F1, 13-oct): tn_producto / tn_variante ───────────────────────────────────────────
const COLS_PROD = ['tienda', 'tn_id', 'nombre', 'handle', 'publicado', 'propiedades', 'categorias', 'creado_en', 'actualizado_en']
const COLS_VAR = ['tienda', 'variant_id', 'tn_product_id', 'sku', 'barcode', 'valores', 'precio', 'precio_promocional', 'costo', 'stock', 'actualizada_en']

export const hayTablasCatalogo = (db) => existe(db, 'tn_producto')

export async function catalogoLeidoHasta(db, tienda) {
  const [r] = await db.q('select leido_hasta from tn_catalogo_lectura where tienda = $1', [tienda])
  return r ? new Date(r.leido_hasta).toISOString() : null
}

/** Pisa cada producto si lo leído es igual o más nuevo, y reemplaza sus variantes con las de esa versión. */
export async function guardarProductos(db, tienda, filas, variantes, leidoHasta) {
  let pisados = 0
  for (const f of filas) {
    const n = await db.run(
      `insert into tn_producto (${COLS_PROD.join(', ')}, leido_en) values (${COLS_PROD.map((_, i) => `$${i + 1}`).join(', ')}, now())
       on conflict (tienda, tn_id) do update set ${COLS_PROD.slice(2).map((c) => `${c} = excluded.${c}`).join(', ')}, leido_en = now()
       where tn_producto.actualizado_en <= excluded.actualizado_en`,
      COLS_PROD.map((c) => f[c]),
    )
    if (!n) continue
    pisados++
    await db.run('delete from tn_variante where tienda = $1 and tn_product_id = $2', [tienda, f.tn_id])
    for (const v of variantes.filter((x) => x.tn_product_id === f.tn_id)) {
      await db.run(
        `insert into tn_variante (${COLS_VAR.join(', ')}) values (${COLS_VAR.map((_, i) => `$${i + 1}`).join(', ')})
         on conflict (tienda, variant_id) do update set ${COLS_VAR.slice(2).map((c) => `${c} = excluded.${c}`).join(', ')}`,
        COLS_VAR.map((c) => v[c]),
      )
    }
  }
  if (leidoHasta) {
    await db.run(
      `insert into tn_catalogo_lectura (tienda, leido_hasta, leida_en, productos) values ($1, $2, now(), $3)
       on conflict (tienda) do update set leido_hasta = greatest(tn_catalogo_lectura.leido_hasta, excluded.leido_hasta), leida_en = now(), productos = excluded.productos`,
      [tienda, leidoHasta, filas.length],
    )
  }
  return pisados
}

/** Las variantes guardadas de una tienda, con la fecha de alta de su producto. */
export async function cargarVariantesTN(db, tienda) {
  return db.q(
    `select v.sku, v.barcode, v.variant_id, p.tn_id, p.creado_en from tn_variante v join tn_producto p on p.tienda = v.tienda and p.tn_id = v.tn_product_id where v.tienda = $1`,
    [tienda],
  ).then((rs) => rs.map((r) => ({ ...r, creado_en: r.creado_en ? new Date(r.creado_en).toISOString() : null })))
}
