/**
 * Cliente de Devoluciones. Entra por el router `/api/postventa?recurso=devoluciones` (Vercel
 * cuenta una función por archivo de ruta y el proyecto vive cerca del tope del plan Hobby).
 *
 * Todo va con `apiFetch`, que manda la credencial del Monitor en `x-monitor-auth`. Las acciones
 * que mueven plata las rechaza el servidor si quien las pide no es de administración — el gate
 * de la UI es comodidad, no seguridad.
 */

import { apiFetch } from '@/lib/api-fetch'
import { CUENTAS } from '@/lib/cuentas'
import { sbFetch } from '@/lib/supabase/rest'
import { crearFalla } from '@/lib/postventa/fallas/cliente'
import type { Marca } from '@/lib/nav.datos'
import { laFallaDescuentaStock } from './tipos'
import type {
  Compensacion, DestinoPrenda, DevolucionRow, EstadoDevolucion, FotoReclamo, ItemDevolucion,
  MotivoDevolucion, OrdenTN,
} from './tipos'

const API = '/api/postventa?recurso=devoluciones'
/** El mismo endpoint que usa Cambios para traer una orden. Sin auth: es lectura de TN. */
const ORDEN_API = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'
/** Escribe stock en la tienda. El mismo que usa Integraciones (acción `stock`). */
const TN_STOCK_API = 'https://bdi-catalogo.vercel.app/api/tn-categorias'

async function postear(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok || !d.ok) throw new Error(String(d.error || `Error ${r.status}`))
  return d
}

export async function leerDevoluciones(marca: Marca, opts?: { estado?: EstadoDevolucion; soloPendientes?: boolean }): Promise<DevolucionRow[]> {
  const qs = [
    `store=${marca}`,
    opts?.estado ? `estado=${opts.estado}` : '',
    opts?.soloPendientes ? 'pendientes=1' : '',
    `nc=${Date.now()}`,
  ].filter(Boolean).join('&')
  const r = await apiFetch(`${API}&${qs}`)
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudieron leer las devoluciones.')
  return (d.devoluciones || []) as DevolucionRow[]
}

/**
 * Trae una orden de Tienda Nube por número.
 *
 * Los campos de plata (forma de pago, descuentos, subtotal) **pueden no venir**: dependen de que
 * bdi-catalogo tenga desplegada la versión que los mapea. Si faltan, el monto se carga a mano en
 * lugar de calcularse — el módulo sigue funcionando, solo pierde el automatismo.
 */
export async function buscarOrden(marca: Marca, numero: string | number): Promise<OrdenTN | null> {
  const r = await fetch(`${ORDEN_API}?orden=${encodeURIComponent(String(numero))}&store=${marca}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!d) throw new Error('No se pudo consultar Tienda Nube.')
  if (d.error) throw new Error(String(d.error))
  return (d.orden || null) as OrdenTN | null
}

/** ¿Esta orden trae los datos para calcular la plata sola, o hay que cargarla a mano? */
export function ordenTraeDatosDePlata(orden: OrdenTN | null | undefined): boolean {
  return !!orden && orden.subtotal != null && Number(orden.subtotal) > 0
}

type FilaInv = { product_id: number | string; size_id: number | string | null; sku: string | null }
type FilaProd = { id: number | string; unit_cost: number | string | null; retailer_price: number | string | null }

/**
 * Le pega a los ítems de la orden de TN sus datos de Gestión Nube: los ids de la variante (sin
 * ellos no se puede crear la falla ni tocar stock) y el costo.
 *
 * El cruce es **por SKU exacto**, que es lo que hay: los `product_id` de TN y de GN son mundos
 * distintos. Si un SKU no aparece en GN el ítem queda como vino y se avisa en pantalla — es
 * preferible a adivinar un cruce difuso cuando lo que sigue es tocar stock.
 *
 * Misma consulta que usa `BuscarArticuloGN`: el costo vive en `productos`, no en `inventario`.
 */
export async function enriquecerConGN(marca: Marca, items: ItemDevolucion[]): Promise<ItemDevolucion[]> {
  const skus = [...new Set(items.map((i) => (i.sku || '').trim()).filter(Boolean))]
  if (!skus.length) return items
  try {
    const lista = skus.map((s) => `"${s.replace(/"/g, '')}"`).join(',')
    const inv = await sbFetch<FilaInv>(CUENTAS[marca], 'inventario', `select=product_id,size_id,sku&sku=in.(${encodeURIComponent(lista)})`)
    if (!inv.length) return items
    const porSku = new Map<string, FilaInv>()
    for (const r of inv) if (r.sku && !porSku.has(r.sku)) porSku.set(r.sku, r)

    const pids = [...new Set(inv.map((r) => String(r.product_id)))]
    const prods = pids.length
      ? await sbFetch<FilaProd>(CUENTAS[marca], 'productos', `select=id,unit_cost,retailer_price&id=in.(${pids.join(',')})`)
      : []
    const costo = new Map(prods.map((p) => [String(p.id), p.unit_cost == null ? null : Number(p.unit_cost)]))

    return items.map((it) => {
      const g = it.sku ? porSku.get(it.sku.trim()) : undefined
      if (!g) return it
      return {
        ...it,
        product_id: String(g.product_id),
        size_id: g.size_id == null ? null : String(g.size_id),
        costo: it.costo ?? costo.get(String(g.product_id)) ?? null,
      }
    })
  } catch {
    // Sin los datos de GN el reclamo se puede cargar igual; lo que no se va a poder es crear la
    // falla ni corregir stock desde acá.
    return items
  }
}

export type CrearDevolucion = {
  store: Marca
  orden_tn?: string | null
  cliente?: string | null
  motivo: MotivoDevolucion
  motivo_detalle?: string | null
  items: ItemDevolucion[]
  monto_producto?: number | null
  pago_metodo?: string | null
  pago_gateway?: string | null
  gn_venta_id?: string | null
  gn_venta_number?: string | null
  destino_prenda?: DestinoPrenda | null
  fotos?: FotoReclamo[]
}

/** Crea el reclamo y devuelve su id y el token del link para el cliente. */
export async function crearDevolucion(payload: CrearDevolucion): Promise<{ id: number; token: string }> {
  const d = await postear({ action: 'crear', ...payload })
  return { id: Number(d.id), token: String(d.token || '') }
}

export type Decision = {
  store: Marca
  id: number
  destino_prenda: DestinoPrenda
  compensacion: Compensacion
  monto_producto?: number | null
  monto_acordado?: number | null
  monto_envio_devuelto?: number | null
  monto_total?: number | null
  devolver_envio?: boolean
  retorno_sugerido?: boolean
  retorno_decidido?: boolean
  envio_costo?: number | null
  costo_caso?: number | null
  cupon_codigo?: string | null
  /** Lo que se pagó por la orden entera: el servidor lo usa de techo del reintegro. */
  techo_orden?: number | null
}

/** La decisión de fondo: qué pasa con la prenda y qué recibe el cliente. Solo administración. */
export async function decidir(payload: Decision): Promise<EstadoDevolucion> {
  const d = await postear({ action: 'decidir', ...payload })
  return d.estado as EstadoDevolucion
}

/** Marca la plata como devuelta. Solo administración. */
export async function marcarReintegro(store: Marca, id: number, comprobante?: string | null): Promise<void> {
  await postear({ action: 'reintegro', store, id, comprobante })
}

/**
 * Registra que la venta original se anuló **a mano** en Gestión Nube. No la anula: GN no lo
 * permite por API (ver api/crear-venta.js). Solo administración.
 */
export async function marcarAnulacion(store: Marca, id: number): Promise<void> {
  await postear({ action: 'anulacion', store, id })
}

/** Registra que la variante quedó corregida en Tienda Nube. Solo administración. */
export async function marcarStockTn(store: Marca, id: number): Promise<void> {
  await postear({ action: 'tn-stock', store, id })
}

export async function cambiarEstado(store: Marca, id: number, estado: EstadoDevolucion, nota?: string | null): Promise<void> {
  await postear({ action: 'estado', store, id, estado, nota })
}

export async function sumarFotos(store: Marca, id: number, fotos: FotoReclamo[]): Promise<void> {
  await postear({ action: 'fotos', store, id, fotos })
}

/** Linkea las fallas creadas desde este reclamo (la prenda que no vuelve a stock). */
export async function linkearFallas(store: Marca, id: number, falla_ids: number[]): Promise<void> {
  await postear({ action: 'falla', store, id, falla_ids })
}

export async function editarDevolucion(store: Marca, id: number, campos: Partial<DevolucionRow>): Promise<void> {
  await postear({ action: 'editar', store, id, ...campos })
}

export async function eliminarDevolucion(store: Marca, id: number): Promise<void> {
  await postear({ action: 'eliminar', store, id })
}

/**
 * Manda al ledger de Fallas la prenda que volvió fallada, y linkea las fallas al reclamo.
 *
 * ⚠️ **Acá se decide si el stock se descuenta o no, y es el punto donde una unidad se pierde en
 * silencio si se elige mal.** El motor de Fallas descuenta stock al confirmar **solo si la falla
 * tiene los ids de GN**; sin ellos es una "falla libre", que solo anota.
 *
 *   - **Se le devolvió la plata** → la venta original se anula, y al anularla la unidad **vuelve
 *     al stock**. Está fallada, así que hay que volver a sacarla: la falla va CON ids.
 *   - **Se le mandó otra unidad igual** (`otra_unidad`) → la venta original NO se anula, el
 *     cliente se queda con lo que compró. Esa unidad ya salió del stock: la falla va SIN ids,
 *     porque descontarla de nuevo restaría dos veces por una sola prenda.
 */
export async function pasarAFallas(
  marca: Marca,
  d: DevolucionRow,
  extra?: { pvpFeria?: number | null; usuario?: string },
): Promise<number[]> {
  const descuenta = laFallaDescuentaStock(d.compensacion)
  const ids: number[] = []
  for (const it of d.items || []) {
    const { id } = await crearFalla(
      marca,
      {
        producto: it.producto,
        sku: it.sku ?? null,
        variante: it.variante ?? null,
        cantidad: Number(it.cantidad) || 1,
        motivo: `Devolución ${d.numero}${d.motivo_detalle ? ` — ${d.motivo_detalle}` : ''}`,
        valuacion_costo: it.costo ?? null,
        valuacion_pvp_feria: it.pvp_feria ?? extra?.pvpFeria ?? null,
        precio_lista: it.precio == null ? null : Number(it.precio),
        ubicacion: 'deposito',
        product_id: descuenta ? it.product_id ?? null : null,
        size_id: descuenta ? it.size_id ?? null : null,
      },
      extra?.usuario,
    )
    if (id) ids.push(id)
  }
  if (ids.length) await linkearFallas(marca, d.id, ids)
  return ids
}

/**
 * Pone en 0 el stock de las variantes en Tienda Nube. Es para el caso "se vendió sin stock": lo
 * que evita que el próximo cliente compre lo mismo que no existe.
 *
 * Usa la acción `stock` de `tn-categorias` (el mismo camino que Integraciones). ⚠️ Ese endpoint
 * lee la tienda del **query param**, no del body: sin `?store=` asume 'bdi' y escribiría en la
 * tienda equivocada.
 */
export async function ponerStockCeroEnTn(marca: Marca, items: ItemDevolucion[]): Promise<number> {
  const updates = items
    .filter((i) => i.tn_product_id && i.variant_id)
    .map((i) => ({ product_id: i.tn_product_id, variant_id: i.variant_id, stock: 0 }))
  if (!updates.length) throw new Error('Estos productos no tienen los ids de Tienda Nube: corregilo desde la tienda.')
  const r = await apiFetch(`${TN_STOCK_API}?store=${marca}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'stock', updates }),
  })
  const d = await r.json().catch(() => null)
  if (!d?.ok) throw new Error(d?.errores?.[0]?.msg || d?.error || 'No se pudo escribir el stock en Tienda Nube.')
  return Number(d.aplicados || 0)
}

/** El link que se le pasa al cliente para que cargue fotos y cuente qué pasó. */
export function linkDelCliente(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://monitor.arebensrl.com'
  return `${base}/reclamo/${token}`
}
