/**
 * Cliente de Devoluciones. Entra por el router `/api/postventa?recurso=reclamos` (Vercel
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
import { calcularCambio, etiquetaEM, laFallaDescuentaStock, numeroReclamo } from './tipos'
import type {
  Compensacion, DestinoPrenda, ReclamoRow, EstadoReclamo, EnvioPaga, FotoReclamo, ItemReclamo,
  Expectativa, FormaPago, MotivoReclamo, OrdenTN, ViaRetorno,
} from './tipos'

const API = '/api/postventa?recurso=reclamos'
/** El mismo endpoint que usa Cambios para traer una orden. Sin auth: es lectura de TN. */
const ORDEN_API = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'
/** Escribe stock en la tienda. El mismo que usa Integraciones (acción `stock`). */
const TN_STOCK_API = 'https://bdi-catalogo.vercel.app/api/tn-categorias'
/**
 * Las ventas van SIEMPRE al crear-venta de producción, esté donde esté corriendo el Monitor: los
 * tokens de ventas de Gestión Nube viven solo ahí. Mismo criterio que Sesión de fotos y Cambios.
 */
const CREAR_VENTA_API = 'https://monitorareben.vercel.app/api/crear-venta'

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

export async function leerReclamos(marca: Marca, opts?: { estado?: EstadoReclamo; soloPendientes?: boolean }): Promise<ReclamoRow[]> {
  const qs = [
    `store=${marca}`,
    opts?.estado ? `estado=${opts.estado}` : '',
    opts?.soloPendientes ? 'pendientes=1' : '',
    `nc=${Date.now()}`,
  ].filter(Boolean).join('&')
  const r = await apiFetch(`${API}&${qs}`)
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudieron leer las devoluciones.')
  return (d.devoluciones || []) as ReclamoRow[]
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
export async function enriquecerConGN(marca: Marca, items: ItemReclamo[]): Promise<ItemReclamo[]> {
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

export type CrearReclamo = {
  store: Marca
  orden_tn?: string | null
  cliente?: string | null
  motivo: MotivoReclamo
  motivo_detalle?: string | null
  items: ItemReclamo[]
  monto_producto?: number | null
  pago_metodo?: string | null
  pago_gateway?: string | null
  gn_venta_id?: string | null
  gn_venta_number?: string | null
  destino_prenda?: DestinoPrenda | null
  fotos?: FotoReclamo[]
  /** Qué esperaba el cliente. Comparado después con lo que se hizo, dice cuántas veces resolvimos distinto. */
  expectativa?: Expectativa | null
  /** Solo en "pedido mal armado": lo que TENDRÍA que haber recibido. */
  items_correctos?: ItemReclamo[]
}

/** Crea el reclamo y devuelve su id y el token del link para el cliente. */
export async function crearReclamo(payload: CrearReclamo): Promise<{ id: number; token: string }> {
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
  /** Cómo vuelve el producto. `presencial` = la trae al local, sin envío ni seguimiento. */
  via_retorno?: ViaRetorno | null
  envio_costo?: number | null
  /** El envío del reemplazo, cuando se le manda otra unidad. */
  envio_ida_costo?: number | null
  /** Cambio por otro producto: lo que se lleva, cómo paga la diferencia y cuánto es. */
  items_nuevos?: ItemReclamo[]
  forma_pago?: FormaPago | null
  diferencia?: number | null
  descuento_manual?: number | null
  costo_caso?: number | null
  cupon_codigo?: string | null
  /** Lo que se pagó por la orden entera: el servidor lo usa de techo del reintegro. */
  techo_orden?: number | null
}

/** La decisión de fondo: qué pasa con el producto y qué recibe el cliente. Solo administración. */
export async function decidir(payload: Decision): Promise<EstadoReclamo> {
  const d = await postear({ action: 'decidir', ...payload })
  return d.estado as EstadoReclamo
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

export async function cambiarEstado(store: Marca, id: number, estado: EstadoReclamo, nota?: string | null): Promise<void> {
  await postear({ action: 'estado', store, id, estado, nota })
}

export async function sumarFotos(store: Marca, id: number, fotos: FotoReclamo[]): Promise<void> {
  await postear({ action: 'fotos', store, id, fotos })
}

/** Linkea las fallas creadas desde este reclamo (el producto que no vuelve a stock). */
export async function linkearFallas(store: Marca, id: number, falla_ids: number[]): Promise<void> {
  await postear({ action: 'falla', store, id, falla_ids })
}

export async function editarReclamo(store: Marca, id: number, campos: Partial<ReclamoRow>): Promise<void> {
  await postear({ action: 'editar', store, id, ...campos })
}

export async function eliminarReclamo(store: Marca, id: number): Promise<void> {
  await postear({ action: 'eliminar', store, id })
}

/**
 * Manda al ledger de Fallas el producto que volvió fallado, y linkea las fallas al reclamo.
 *
 * ⚠️ **Acá se decide si el stock se descuenta o no, y es el punto donde una unidad se pierde en
 * silencio si se elige mal.** El motor de Fallas descuenta stock al confirmar **solo si la falla
 * tiene los ids de GN**; sin ellos es una "falla libre", que solo anota.
 *
 *   - **Se le devolvió la plata** → la venta original se anula, y al anularla la unidad **vuelve
 *     al stock**. Está fallada, así que hay que volver a sacarla: la falla va CON ids.
 *   - **Se le mandó otra unidad igual** (`otra_unidad`) → la venta original NO se anula, el
 *     cliente se queda con lo que compró. Esa unidad ya salió del stock: la falla va SIN ids,
 *     porque descontarla de nuevo restaría dos veces por una sola producto.
 */
export async function pasarAFallas(
  marca: Marca,
  d: ReclamoRow,
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
 * Descuenta del stock la unidad de reemplazo que se le manda al cliente.
 *
 * **Es el agujero que tapa esta función**: cuando la salida es "le mandamos otra igual", esa
 * producto sale del depósito y sin esto no queda registrada en ningún lado — el stock queda de más
 * hasta que alguien lo descubre en un conteo.
 *
 * No es una venta comercial: es la **venta técnica** que ya usa Fallas al confirmar, a precio de
 * lista con 100% de descuento (neto $0, pero valuada real para que la analítica no se distorsione).
 * Va contra el `crear-venta` de PRODUCCIÓN, como todas las ventas del Monitor: los tokens de
 * ventas de GN viven solo ahí.
 */
export async function descontarReemplazo(
  marca: Marca,
  d: ReclamoRow,
  ctx: { user: string; pass: string },
): Promise<{ id?: string; number?: string }> {
  const items = (d.items || [])
    .filter((i) => i.product_id && i.size_id)
    .map((i) => ({ product_id: i.product_id as string, size_id: i.size_id as string, quantity: Number(i.cantidad) || 1, unit_price: Number(i.precio) || 0 }))
  if (!items.length) {
    throw new Error('Estos productos no están linkeados a Gestión Nube, así que no se puede descontar el stock del reemplazo. Cargalo a mano en GN.')
  }
  const r = await fetch(CREAR_VENTA_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store: marca,
      origen: 'deposito',
      items,
      // 100% de descuento: la unidad sale del stock pero no se cobra (ya la pagó en la compra original).
      descuento: items.reduce((s, it) => s + it.unit_price * it.quantity, 0),
      comments: `Reemplazo por falla — reclamo ${numeroReclamo(d.id)} · orden ${d.orden_tn || '?'} (Monitor)`.slice(0, 500),
      solicitudId: `devolucion-${d.id}-reemplazo`, // idempotencia: dos clicks no generan dos ventas
      proposito: 'falla',
      user: ctx.user,
      pass: ctx.pass,
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!j?.ok) throw new Error(`No se pudo descontar el stock del reemplazo en GN — ${j?.error || r.status}`)
  const venta = j.venta || {}
  await editarReclamo(marca, d.id, {
    gn_venta_reemplazo_id: venta.id ? String(venta.id) : null,
    gn_venta_reemplazo_number: venta.number ? String(venta.number) : null,
  })
  return { id: venta.id, number: venta.number }
}

// ── El cambio por otro producto ─────────────────────────────────────────────────

/** Lo que el POS guarda del cambio. Todo opcional: el borrador tiene que poder estar a medio hacer. */
export type CambioInput = {
  orden_tn?: string | null
  cliente?: string | null
  motivo?: MotivoReclamo
  items?: ItemReclamo[]
  items_nuevos?: ItemReclamo[]
  forma_pago?: FormaPago | null
  via_retorno?: ViaRetorno | null
  envio_paga?: EnvioPaga | null
  envio_costo?: number | null
  descuento_manual?: number | null
  solicitud_envio?: string | null
  seguimiento_ida?: string | null
  seguimiento_vuelta?: string | null
  diferencia?: number | null
  pagado?: boolean | null
}

/**
 * Guarda el borrador del cambio. **No pasa por Administración**: la acción `cambio` está fuera del
 * gate de admin del servidor a propósito, porque un cambio no es una decisión que haya que
 * autorizar sino una operación de mostrador.
 *
 * `techo_nuevos` es la red de seguridad del servidor: la diferencia nunca puede ser mayor que el
 * valor de lo que el cliente se lleva.
 */
export async function guardarCambio(marca: Marca, id: number, input: CambioInput, techoNuevos?: number | null): Promise<void> {
  await postear({ store: marca, action: 'cambio', id, ...input, techo_nuevos: techoNuevos ?? null })
}

/**
 * **Genera la venta REAL del cambio en Gestión Nube** y la registra en el reclamo.
 *
 * Es la operación más delicada del módulo: baja stock de lo que el cliente se lleva y **cuenta en
 * la analítica**, porque va por un canal normal y no por la venta técnica de $0 que usa Fallas.
 *
 * Dos cosas que no son obvias y que ya estaban resueltas en el motor viejo:
 *   - El **descuento a nivel venta** es Σdevueltos + los descuentos del cambio. Así la venta refleja
 *     los productos a precio de lista y el total que queda es exactamente lo que el cliente paga.
 *     Y lo devuelto se valúa por lo que **pagó** —no por precio de lista—, que es el hueco que el
 *     motor viejo tenía y le regalaba plata al cliente en toda orden con cupón.
 *   - **El envío NO viaja a GN** (decisión de Bruno): queda solo en el Monitor, aunque lo pague el
 *     cliente. Por eso el descuento se calcula contra el total de productos y no contra el total
 *     a pagar.
 */
export async function procesarCambio(
  marca: Marca,
  d: ReclamoRow,
  orden: OrdenTN | null | undefined,
  ctx: { user: string; pass: string },
): Promise<{ id?: string; number?: string }> {
  const nuevos = (d.items_nuevos || []).filter((i) => i.product_id && i.size_id)
  if (!nuevos.length) throw new Error('Lo que se lleva el cliente no está linkeado a Gestión Nube: sin eso la venta no puede descontar stock.')
  if (!d.forma_pago) throw new Error('Falta la forma de pago del cambio.')

  const cuenta = calcularCambio({
    devueltos: d.items || [], nuevos: d.items_nuevos || [], orden,
    formaPago: d.forma_pago, descuentoManual: d.descuento_manual,
    envioCosto: d.envio_costo, envioPaga: d.envio_paga,
  })
  // El descuento de la venta: lo que se le acredita por lo devuelto, más los descuentos del cambio.
  const descuento = cuenta.devueltos + cuenta.descuento

  const r = await fetch(CREAR_VENTA_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accion: 'cambio_real',
      store: marca,
      origen: 'deposito',
      items: nuevos.map((i) => ({
        product_id: i.product_id, size_id: i.size_id,
        quantity: Number(i.cantidad) || 1, unit_price: Number(i.precio) || 0,
      })),
      descuento,
      forma_pago: d.forma_pago,
      // Red de seguridad: si el crear-venta desplegado no tuviera el bloque `cambio_real`, cae al
      // camino normal y `proposito:'cambio'` hace que igual use el cliente "Cambio" de GN.
      proposito: 'cambio',
      comments: [`Cambio orden ${d.orden_tn || ''}`, etiquetaEM(d.solicitud_envio), d.cliente || '', '(Monitor)']
        .filter(Boolean).join(' · ').slice(0, 500),
      solicitudId: `reclamo-${d.id}-cambio`, // idempotencia: dos clicks no generan dos ventas
      user: ctx.user,
      pass: ctx.pass,
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!j?.ok) throw new Error(`No se pudo crear la venta del cambio en GN — ${j?.error || r.status}`)
  const venta = j.venta || {}
  await postear({
    store: marca, action: 'procesar', id: d.id,
    gn_venta_id: venta.id ? String(venta.id) : null,
    gn_venta_number: venta.number ? String(venta.number) : null,
  })
  return { id: venta.id, number: venta.number }
}

/** El producto devuelto ya volvió al stock a mano en GN. Traza de un paso manual, como `anulacion`. */
export async function marcarReingreso(marca: Marca, id: number): Promise<void> {
  await postear({ store: marca, action: 'reingreso', id })
}

/** La diferencia del cambio ya se cobró. */
export async function marcarCobrado(marca: Marca, id: number): Promise<void> {
  await postear({ store: marca, action: 'cobrado', id })
}

/**
 * Pone en 0 el stock de las variantes en Tienda Nube. Es para el caso "se vendió sin stock": lo
 * que evita que el próximo cliente compre lo mismo que no existe.
 *
 * Usa la acción `stock` de `tn-categorias` (el mismo camino que Integraciones). ⚠️ Ese endpoint
 * lee la tienda del **query param**, no del body: sin `?store=` asume 'bdi' y escribiría en la
 * tienda equivocada.
 */
export async function ponerStockCeroEnTn(marca: Marca, items: ItemReclamo[]): Promise<number> {
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
