/**
 * Qué se vendió de los productos de una campaña, y **a qué precio salió cada unidad**.
 *
 * 🔑 **Por qué no sale del ETL.** El ETL trae ventas agregadas en ventanas fijas (7/15/30/60/90 días
 * y meses cerrados) y una campaña dura del 12 al 27 de agosto: ninguna ventana cae ahí. Pero sobre
 * todo, su `select` de `venta_detalles` es `sale_id, product_id, size_id, size, quantity` — **sin
 * plata**. La tabla tiene además `unit_price` y `total`, y ahí está la única respuesta posible a la
 * pregunta que importa: *¿el precio de sale llegó a estar puesto?* Mientras los precios se carguen a
 * mano en Gestión Nube (el token no tiene permiso para escribir productos: `PATCH /productos/{id}`
 * contesta 403 `Invalid ability provided`), contrastar lo decidido contra lo cobrado es el único
 * control de calidad que existe sobre esa carga.
 *
 * ⛔ **Ampliar el select del ETL para traer esas dos columnas: no.** `venta_detalles` es la tabla
 * más grande y el payload de BDI ya pesa ~14,7 MB en IndexedDB; dos columnas más las pagarían las
 * 42 secciones para que las use una. Va una consulta puntual, acotada a los productos de la campaña
 * y a su rango de fechas: medido, 172 filas y ~15 KB para 8 productos en 16 días.
 *
 * El camino es el mismo que usa Reposición en producción (`lib/reposicion/cliente.ts`): las ventas
 * del rango dan los ids, y los detalles se piden por `sale_id` entre el mínimo y el máximo y se
 * cruzan contra el conjunto de ids. `venta_detalles` no tiene fecha propia — el sale_id es el único
 * puente.
 *
 * 🔑 **Las dos consultas ya no las hace el navegador: las hace el servidor** (escalón 3 de la Fase
 * S). El motivo es justamente lo que dice el párrafo de arriba: esas dos columnas son plata, y con
 * la anon key —que viaja en el bundle— la tabla entera se bajaba desde afuera (122.952 líneas en
 * BDI, 35.426 en Zattia). Del otro lado hay sesión y el permiso de la sección, que es lo que la
 * anon key no puede tener.
 *
 * **El cruce y el reparto de la plata se quedaron acá**, tal cual estaban. Lo único que cambió es
 * de dónde vienen las filas.
 */

import type { Marca } from '../nav.datos'
import { apiFetch } from '../api-fetch'

/** Una línea de venta de un producto de la campaña, ya cruzada con su fecha y su canal. */
export interface LineaVenta {
  pid: string
  /** `date_sale`, YYYY-MM-DD. */
  fecha: string
  canal: string
  unidades: number
  /** Lo cobrado por esa línea. */
  plata: number
  /** Lo cobrado por unidad. Es el número que se contrasta contra el precio decidido. */
  precioUnitario: number
}

type FilaVentaLiq = { id: number; date_sale: string | null; channel: string | null }
type FilaDetalleLiq = {
  sale_id: number | string
  product_id: number | string | null
  quantity: number | null
  unit_price: number | null
  total: number | null
}

/**
 * Las ventas de estos productos entre dos fechas, una fila por línea de venta.
 *
 * `hasta` es inclusivo: una campaña que termina el 27 incluye lo que se vendió el 27.
 *
 * Devuelve `[]` sin consultar si no hay productos o si el rango está vacío. **No** filtra canales ni
 * excluye las ventas técnicas: eso lo hace `lib/liquidacion/resultado.ts`, que es puro y testeable.
 * Acá sólo se baja lo que hay.
 */
export async function leerVentasDeCampania(
  marca: Marca,
  pids: string[],
  desde: string,
  hasta: string,
): Promise<LineaVenta[]> {
  const quiero = new Set(pids.map(String))
  if (!quiero.size || !desde || !hasta || hasta < desde) return []

  const r = await apiFetch('/api/datos?recurso=liquidacion', {
    method: 'POST',
    // ⚠️ Sin este header Vercel no parsea el body y el handler ve la campaña vacía, sin error.
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: marca, action: 'ventas-campania', pids: [...quiero], desde, hasta }),
  })
  const d = (await r.json().catch(() => ({}))) as {
    ok?: boolean
    ventas?: FilaVentaLiq[]
    detalles?: FilaDetalleLiq[]
    error?: string
  }
  if (!r.ok || !d.ok) throw new Error(d.error || `Error ${r.status} leyendo las ventas del período.`)

  const ventas = d.ventas || []
  if (!ventas.length) return []

  // El sale_id es el único puente con `venta_detalles`, que no tiene fecha. El rango de ids incluye
  // ventas de otras fechas que caen en el medio, así que el cruce final va contra este mapa y no
  // contra el rango.
  const deVenta = new Map(ventas.map((v) => [String(v.id), v]))
  const detalles = d.detalles || []

  const out: LineaVenta[] = []
  for (const d of detalles) {
    const v = deVenta.get(String(d.sale_id))
    if (!v || !v.date_sale) continue
    const pid = String(d.product_id ?? '')
    if (!quiero.has(pid)) continue

    // `quantity` en null es una unidad, igual que en Reposición: la fila existe porque algo se
    // vendió. Descartarla perdería la venta entera.
    //
    // 🔴 **Las líneas NEGATIVAS no se descartan acá, y antes sí.** Una devolución entra como
    // `quantity: -1` y devuelve la prenda al stock: para la conciliación de
    // `agotadosQueNoCierran` esa unidad **no salió**, y tragársela hacía que la pantalla pidiera
    // buscar una prenda menos de las que faltan. Medido en prod el 17-ago-2026: BODY SOUTH tenía
    // una venta y su devolución (neto 0) y la lista decía «faltan 1» sobre 2 que faltan.
    // El que sí las tiene que ignorar es `resultadoCampania`, y lo hace él: una unidad devuelta no
    // se vendió al precio de sale. Filtrar en el transporte le sacaba la decisión al que la toma.
    const unidades = Number(d.quantity ?? 1) || 0
    if (!unidades) continue

    // `total` es la fuente de la plata; `unit_price` sólo se usa si el total no vino. Al revés
    // perdería los descuentos por línea que la caja aplica sobre el precio unitario.
    const plata = d.total != null ? Number(d.total) : Number(d.unit_price ?? 0) * unidades

    out.push({
      pid,
      fecha: String(v.date_sale).slice(0, 10),
      canal: v.channel || '',
      unidades,
      plata,
      precioUnitario: unidades > 0 ? plata / unidades : 0,
    })
  }
  return out
}

/**
 * El stock de hoy de esos productos, y **de cuándo es**.
 *
 * Es la otra mitad de la conciliación de `agotadosQueNoCierran`: la foto congelada dice con cuánto
 * entró cada producto, las ventas dicen cuánto salió, y esto dice qué queda. Va aparte de
 * `leerVentasDeCampania` porque no tiene rango —el inventario es de ahora— y las dos se piden en
 * paralelo.
 *
 * 🔑 **`leidoEn` no es la hora de esta consulta: es la del sync que llenó el espejo.** El inventario
 * se actualiza una vez por día, así que decir «recién» sobre un número de ayer a la mañana mandaría
 * a alguien a caminar por un dato viejo. `null` = no se pudo saber, y eso se muestra.
 */
export async function leerStockDeCampania(
  marca: Marca,
  pids: string[],
): Promise<{ stock: Record<string, number>; leidoEn: string | null }> {
  const quiero = [...new Set(pids.map(String))]
  if (!quiero.length) return { stock: {}, leidoEn: null }

  const r = await apiFetch('/api/datos?recurso=liquidacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: marca, action: 'stock-campania', pids: quiero }),
  })
  const d = (await r.json().catch(() => ({}))) as {
    ok?: boolean
    stock?: Record<string, number>
    leidoEn?: string | null
    error?: string
  }
  if (!r.ok || !d.ok) throw new Error(d.error || `Error ${r.status} leyendo el stock de los productos.`)
  return { stock: d.stock || {}, leidoEn: d.leidoEn || null }
}
