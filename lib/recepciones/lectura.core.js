// La lectura de la API de Ingresos (`https://ingreso2.arebensrl.com/api/ext/v1`), en funciones puras.
//
// 🔑 Reemplaza al aviso `oc.confirmada`, que Ingresos apagó el 27-oct-2026 (último recibido: 26-oct 15:00 UTC).
// Cada OC leída se traduce a la MISMA forma del aviso y entra por el mismo camino (`procesarEvento`) ⇒ el libro, el
// costo, la pantalla y el PRM ⛔ se enteran de por dónde vino.
//
// ⛔ **Es `.js` plano, no TypeScript**, porque lo importa un handler de `api/` (ver AGENTS.md).

/** Desde cuándo se lee si todavía no se leyó nada: justo después del último aviso. Recupera sola las OC perdidas. */
export const LECTURA_DESDE = '2026-10-26T15:00:06Z'
/** El margen que pide la API: un cambio puede quedar anotado con una hora un poco anterior a la consulta. */
export const MARGEN_MS = 60_000
/** Sólo estas impactaron el catálogo. `partial` todavía ⛔ tiene `confirmed_at` en la cabecera. */
const ESTADOS = { confirmed: 'confirmada', partial: 'parcial' }

/** El id del evento: cambia con cada cambio de la OC, y releer lo mismo ⛔ reprocesa. */
export const idDeEvento = (store, oc) => `api:${store}:${oc.id}:${oc.updated_at}`

/** Desde qué instante preguntar, según el último evento procesado. */
export function desdeDe(ultimo) {
  const ms = Date.parse(ultimo || '')
  return Number.isNaN(ms) ? LECTURA_DESDE : new Date(ms - MARGEN_MS).toISOString()
}

/**
 * Qué OC del listado hay que procesar, de la que cambió antes a la que cambió después.
 * 🔴 **El orden importa:** el listado viene por `id` y `confirmed_at`/`updated_at` ⛔ siguen ese orden. Si se cortara a
 * mitad de camino con el orden del listado, la próxima vuelta preguntaría desde una hora posterior a una OC sin leer.
 */
export function aProcesar(items) {
  return (items || [])
    .filter((oc) => oc && ESTADOS[oc.status] && oc.updated_at)
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at) || a.id - b.id)
}

/** Una línea cuenta recién confirmada y contada. Lo pedido ⛔ es lo recibido, y `null` ⛔ es un conteo de cero: todavía no se contó. */
const contadaDe = (l) => (l.confirmed_at && l.quantity_counted != null ? l.quantity_counted : 0)

/** El instante de confirmación: el de la OC o, si es parcial, el de su última línea confirmada. */
function confirmadaDe(oc) {
  if (oc.confirmed_at) return oc.confirmed_at
  const ms = (oc.lines || []).map((l) => Date.parse(l.confirmed_at || '')).filter((n) => !Number.isNaN(n))
  return ms.length ? new Date(Math.max(...ms)).toISOString() : null
}

/**
 * El detalle de una OC (`GET /purchase-orders/{id}`) con la forma del aviso `oc.confirmada`.
 *
 * 🔴 Las líneas van ordenadas por su `id`: la clave del libro sale de la posición del renglón
 * (`<store>:<oc>:<orden>`), así que releer la OC con otro orden duplicaría el ingreso.
 */
export function eventoDeOc(oc) {
  const lineas = [...(oc.lines || [])].sort((a, b) => a.id - b.id)
  const t = oc.totals || {}
  return {
    type: 'oc.confirmada',
    timestamp: oc.updated_at,
    origen: 'api',
    data: {
      orden_compra: {
        id: oc.id,
        label: oc.code,
        estado: ESTADOS[oc.status] || oc.status,
        fecha_compra: oc.purchase_date,
        fecha_ingreso: oc.arrival_date,
        confirmada_at: confirmadaDe(oc),
      },
      negocio: oc.business ? { id: oc.business.id, nombre: oc.business.name, slug: oc.business.slug } : null,
      proveedor: oc.supplier ? { id: oc.supplier.id, nombre: oc.supplier.name } : null,
      totales: {
        productos: t.products,
        lineas: t.lines,
        unidades_pedidas: t.units_ordered,
        unidades_contadas: t.units_counted,
        diferencia_unidades: t.units_difference,
        lineas_con_diferencia: t.lines_with_difference,
      },
      lineas: lineas.map((l) => ({
        ingresos_linea_id: l.id,
        sku: l.sku,
        codigo_barras: l.barcode,
        nombre: l.name,
        talle: l.size,
        color: l.color,
        cantidad_pedida: l.quantity_ordered,
        cantidad_contada: contadaDe(l),
        observaciones: l.notes,
        es_nuevo: l.is_new_product === true,
        imagen_url: l.image_url,
        imagen_thumb_url: l.thumbnail_url,
      })),
    },
  }
}
