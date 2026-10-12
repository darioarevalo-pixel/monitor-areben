/**
 * Mapeo y guardado del espejo de ventas. Una sola implementación para BDI, Zattia y
 * la purga histórica.
 *
 * POR QUÉ EXISTE
 * Este código vivía copiado adentro de sync-diario.js y sync-diario-zattia.js, y las
 * dos copias se separaron: la de BDI creció a 19 columnas (cliente, costo, ganancia,
 * unidades) y la de Zattia quedó en las 9 originales. Esa deriva es la razón de que
 * Zattia no tenga CRM ni márgenes. Con una sola implementación, agregarle una columna
 * a una marca es cambiar `completo`, no reescribir un script.
 *
 * `completo: false` (Zattia hoy) guarda solo las 9 columnas que su base tiene. No es
 * una decisión de producto: es que la tabla todavía no tiene las otras. Cuando se
 * agreguen, pasa a `true` y hereda todo.
 */

import { cobrosDeVentaGN } from '../../lib/arca/techo.core.js'

/** Si llega el mismo id dos veces en un lote, gana la última versión. */
export function dedupById(arr) {
  const map = new Map()
  for (const x of arr) if (x && x.id != null) map.set(String(x.id), x)
  return [...map.values()]
}

const COLUMNAS_LIBRO = (v) => ({
  gn_created_at:      v.created_at || null,
  tn_order:           v.tn_order ? String(v.tn_order) : null,
  integration_id:     v.integration_id ? String(v.integration_id) : null,
  integration_source: v.integration_source || null,
  store_id:           v.store_id ?? null,
})
const NOMBRES_LIBRO = Object.keys(COLUMNAS_LIBRO({}))

/** La venta sin las columnas del libro: para una base donde la migración todavía no corrió. */
export function sinColumnasDelLibro(fila) {
  const out = { ...fila }
  for (const k of NOMBRES_LIBRO) delete out[k]
  return out
}

export function mapVentaRow(v, { completo = true } = {}) {
  const base = {
    id:             v.id,
    number:         v.number || null,
    date_sale:      v.date_sale || null,
    total_price:    v.total_price ?? null,
    channel:        v.channel || null,
    sale_state:     v.sale_state || null,
    payment_method: v.payment_method || null,
    store:          v.store || null,
    client_name:    v.client_name || null,
    // La ECONOMÍA de la venta va en el juego base, o sea también en Zattia. GN la manda en el mismo
    // payload que todo lo demás y el mapeo la tiraba: sin estas cuatro columnas no hay contribución
    // (`api/_norte.js`), y el 21% de IVA no lo decide el canal sino `account_display` — la cuenta
    // por donde entró la plata. Ver sql/migrate-ventas-cobro.sql.
    account_display: v.account_display || null,
    discount:        v.discount ?? null,
    shipping_cost:   v.shipping_cost ?? null,
    total_cost:      v.total_cost ?? null,
    // 🔑 Lo que necesita el libro de stock (sql/migrate-ventas-gn-hora.sql): `date_sale` es un día sin
    // hora, y sin hora no se sabe si la venta fue antes o después de un conteo o de la foto del día.
    // `tn_order` cruza con el pedido de TN y `integration_id` con lo que creó el monitor.
    ...COLUMNAS_LIBRO(v),
  }
  // 🔑 `completo` quedó significando **CRM y PII**, no "todo lo demás": son los datos del cliente y
  // los ids que alimentan el padrón. Zattia sigue afuera de eso a propósito, y eso ya no le cuesta
  // el margen.
  if (!completo) return base
  return {
    ...base,
    client_id:       v.client_id || null,
    client_email:    v.client_email || null,
    client_phone:    v.client_phone || null,
    client_city:     v.client_city || null,
    client_province: v.client_province || null,
    channel_id:      v.channel_id ?? null,
    sale_type_id:    v.sale_type_id ?? null,
    profit:          v.profit ?? null,
    items_sold:      v.items_sold ?? null,
  }
}

export function mapDetalleRow(d, saleId) {
  return {
    id:           d.id,
    sale_id:      saleId,
    product_id:   d.product_id || null,
    product_name: d.product_name || null,
    size_id:      d.size_id || null,
    size:         d.size || null,
    quantity:     d.quantity ?? null,
    unit_price:   d.unit_price ?? null,
    total:        d.total ?? null,
  }
}

/**
 * Descubre clientes NUEVOS a partir de las ventas. De cada uno queda la versión de su venta MÁS
 * RECIENTE.
 *
 * 🔴 **Lo que sale de acá ya no actualiza al cliente que existe** (el `upsert` de abajo va con
 * `ignoreDuplicates`). El comentario que estaba acá decía "GN no tiene endpoint de clientes" y era
 * falso: existe, lo que faltaba era el permiso `clients:read` en la clave. Desde el 23-ago-2026 el
 * padrón lo mantiene `scripts/sync-clientes.js`, que lee la FICHA.
 *
 * Por qué importa la diferencia: la venta expone un solo teléfono (`client_phone`) y **el WhatsApp
 * está en el otro campo de la ficha** (`cellphone_number`). Mientras esto mandaba, 526 de los 785
 * clientes mayoristas figuraban sin teléfono, y 463 lo tenían cargado. Peor: como el upsert pisaba
 * todas las columnas, una venta sin teléfono **borraba un teléfono bueno**.
 */
export function extraerClientesDeVentas(rows) {
  const map = new Map()
  for (const v of rows) {
    if (!v.client_id) continue
    const ts = v.created_at || v.updated_at || v.date_sale || ''
    const prev = map.get(v.client_id)
    if (!prev || (ts && ts > prev._ts)) {
      map.set(v.client_id, {
        id:          v.client_id,
        name:        v.client_name || null,
        email:       v.client_email || null,
        phone:       v.client_phone || null,
        city:        v.client_city || null,
        province:    v.client_province || null,
        postal_code: v.client_postal_code || null,
        address:     v.client_address || null,
        updated_at:  new Date().toISOString(),
        _ts: ts,
      })
    }
  }
  return [...map.values()].map(({ _ts, ...rest }) => rest)
}

/**
 * Guarda un lote de ventas crudas de GN (ventas + clientes + renglones).
 * Idempotente: correrlo dos veces con las mismas filas deja el mismo resultado.
 */
export async function guardarVentasBatch(supabase, rawRows, { completo = true } = {}) {
  const raw = dedupById(rawRows)
  const ventas = dedupById(raw.map(v => mapVentaRow(v, { completo })))
  const clientes = completo ? dedupById(extraerClientesDeVentas(raw)) : []
  const detalles = dedupById(raw.flatMap(v => (v.detalles || []).map(d => mapDetalleRow(d, v.id))))

  // 🔴 Si la base todavía no tiene las columnas del libro, la venta se guarda igual sin ellas y se
  // avisa (`sinHora`): perder la hora es malo, frenar el espejo de ventas es peor.
  let sinHora = false
  for (let i = 0; i < ventas.length; i += 1000) {
    let lote = ventas.slice(i, i + 1000)
    if (sinHora) lote = lote.map(sinColumnasDelLibro)
    let { error } = await supabase.from('ventas').upsert(lote, { onConflict: 'id' })
    if (error && !sinHora && NOMBRES_LIBRO.some((c) => error.message.includes(c))) {
      sinHora = true
      ;({ error } = await supabase.from('ventas').upsert(lote.map(sinColumnasDelLibro), { onConflict: 'id' }))
    }
    if (error) throw new Error(`Error guardando ventas: ${error.message}`)
  }
  for (let i = 0; i < clientes.length; i += 500) {
    // `ignoreDuplicates`: inserta al que no existe y NO toca al que ya está. Ver el comentario de
    // `extraerClientesDeVentas` — la ficha manda, la venta sólo descubre.
    const { error } = await supabase
      .from('clientes')
      .upsert(clientes.slice(i, i + 500), { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(`Error guardando clientes: ${error.message}`)
  }
  for (let i = 0; i < detalles.length; i += 2000) {
    const { error } = await supabase.from('venta_detalles').upsert(detalles.slice(i, i + 2000), { onConflict: 'id' })
    if (error) throw new Error(`Error guardando detalles: ${error.message}`)
  }

  const c = await guardarCobros(supabase, raw)

  return {
    ventas: ventas.length, detalles: detalles.length, clientes: clientes.length, cobros: c.cobros,
    ...(sinHora ? { sinHora } : {}), ...(c.sinCobros ? { sinCobros: true } : {}),
  }
}

/**
 * Los cobros de cada venta (`ventas_cobros`, sql/migrate-ventas-cobros.sql): de ellos sale el techo de
 * facturación del mes (`lib/arca/techo.core.js`). Cada venta releída REEMPLAZA sus cobros: así una que
 * se archivó o se editó en GN queda como GN la devuelve hoy.
 *
 * ⚠️ Sólo las ventas que trajeron `payments` (el pedido llevó `include_payments=1`). Una que no los
 * trae ⛔ se toca: si no, un pedido sin cobros (la purga histórica) le borraría los que tiene.
 * 🔴 Sin la tabla (la migración no corrió en esta base) las ventas se guardan igual y se avisa
 * (`sinCobros`), como con la hora: frenar el espejo de ventas es peor.
 */
export function filasDeCobros(raw) {
  return raw.filter((v) => Array.isArray(v.payments)).flatMap((v) =>
    cobrosDeVentaGN(v, null).map((c, n) => ({
      venta_id: v.id, n, fecha: c.fecha ? String(c.fecha).slice(0, 10) : null, cuenta: c.cuenta, monto: c.monto,
    })))
}

const faltaLaTabla = (e) => e && (e.code === '42P01' || e.code === 'PGRST205' || /ventas_cobros/.test(e.message || ''))

async function guardarCobros(supabase, raw) {
  const ids = raw.filter((v) => Array.isArray(v.payments)).map((v) => v.id)
  if (!ids.length) return { cobros: 0 }
  const filas = filasDeCobros(raw)
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await supabase.from('ventas_cobros').delete().in('venta_id', ids.slice(i, i + 500))
    if (faltaLaTabla(error)) return { cobros: 0, sinCobros: true }
    if (error) throw new Error(`Error limpiando cobros: ${error.message}`)
  }
  for (let i = 0; i < filas.length; i += 2000) {
    const { error } = await supabase.from('ventas_cobros').insert(filas.slice(i, i + 2000))
    if (error) throw new Error(`Error guardando cobros: ${error.message}`)
  }
  return { cobros: filas.length }
}
