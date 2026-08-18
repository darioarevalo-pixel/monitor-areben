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

/** Si llega el mismo id dos veces en un lote, gana la última versión. */
export function dedupById(arr) {
  const map = new Map()
  for (const x of arr) if (x && x.id != null) map.set(String(x.id), x)
  return [...map.values()]
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
 * El padrón de clientes sale de las ventas: GN no tiene endpoint de clientes. De cada
 * cliente queda la versión de su venta MÁS RECIENTE — si se mudó, vale el domicilio
 * nuevo, no el de la primera compra.
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

  for (let i = 0; i < ventas.length; i += 1000) {
    const { error } = await supabase.from('ventas').upsert(ventas.slice(i, i + 1000), { onConflict: 'id' })
    if (error) throw new Error(`Error guardando ventas: ${error.message}`)
  }
  for (let i = 0; i < clientes.length; i += 500) {
    const { error } = await supabase.from('clientes').upsert(clientes.slice(i, i + 500), { onConflict: 'id' })
    if (error) throw new Error(`Error guardando clientes: ${error.message}`)
  }
  for (let i = 0; i < detalles.length; i += 2000) {
    const { error } = await supabase.from('venta_detalles').upsert(detalles.slice(i, i + 2000), { onConflict: 'id' })
    if (error) throw new Error(`Error guardando detalles: ${error.message}`)
  }

  return { ventas: ventas.length, detalles: detalles.length, clientes: clientes.length }
}
