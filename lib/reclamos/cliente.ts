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
import { crearFalla, registrarVentaGN } from '@/lib/postventa/fallas/cliente'
import type { Marca } from '@/lib/nav.datos'
import { calcularCambio, laFallaDescuentaStock, loQueFaltaDescontar, numeroReclamo } from './tipos'
import { notaVentaTecnica } from './nota'
import type { RetornoRow } from './retornos'
import type {
  Compensacion, DestinoPrenda, ReclamoRow, EstadoReclamo, EnvioPaga, FotoReclamo, ItemReclamo,
  Expectativa, FormaPago, FormaRetencion, MotivoReclamo, OrdenTN, RespuestaRetencion, ViaRetorno,
} from './tipos'

const API = '/api/postventa?recurso=reclamos'
/** El mismo endpoint que usa Cambios para traer una orden. Sin auth: es lectura de TN. */
const ORDEN_API = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'
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
 * Lo mínimo para derivar el aviso del sidebar: las columnas que mira `alertasDe` y nada más.
 *
 * ⛔ **No es `leerReclamos` con otro nombre.** Esto lo pide **cada admin cada 3 minutos**
 * (`POLL_AVISOS_MS`), así que baja por `vista=avisos`, que recorta las columnas: medido sobre las
 * 10 filas de BDI, **1.925 bytes por fila con el listado completo contra 344 con éstas** — y las
 * que se van son el relato del cliente, sus datos y todos los montos, que un aviso no necesita.
 *
 * ⚠️ Devuelve **todo lo que baja, incluido lo cerrado**: quién sigue vivo lo contesta
 * `ESTADOS_ABIERTOS` en el núcleo, y filtrarlo también acá sería la segunda copia de esa lista.
 */
export async function leerReclamosParaAviso(marca: Marca): Promise<ReclamoRow[]> {
  const r = await apiFetch(`${API}&store=${marca}&vista=avisos&nc=${Date.now()}`)
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudieron leer los reclamos.')
  return (d.devoluciones || []) as ReclamoRow[]
}

/**
 * El link del cliente, a pedido y de a uno.
 *
 * El token **nunca** viaja en el listado (`COLS` de `_reclamos.js` no lo incluye): un listado se
 * loguea, se cachea y se comparte. Antes esto no existía y la lista armaba el link con el `id`
 * como respaldo, lo que producía un 404 seguro — el portal exige 32+ hex.
 */
export async function leerToken(marca: Marca, id: number): Promise<{ token: string | null; vence: string | null }> {
  const r = await apiFetch(`${API}&vista=token&store=${marca}&id=${id}&nc=${Date.now()}`)
  const d = await r.json().catch(() => ({}))
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo leer el link del cliente.')
  return { token: (d.token as string) || null, vence: (d.vence as string) || null }
}

/** Regenera el link cuando venció. Solo sirve mientras el reclamo no esté decidido. */
export async function reemitirToken(marca: Marca, id: number): Promise<string> {
  const d = await postear({ action: 'reemitir-token', store: marca, id })
  return String(d.token || '')
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

    // 🔑 **El costo ya no se pide acá** (pieza B del escalón 3 de la Fase S): `unit_cost` salió del
    // navegador. Lo resuelve el servidor cuando hace falta guardarlo —al crear la falla— con la
    // clave de servicio. Esta función sigue haciendo lo único que la pantalla necesita de verdad:
    // pegarle a cada ítem los ids de la variante, sin los cuales no se puede tocar stock.
    //
    // `costo` se respeta si el ítem ya venía con uno (lo tipea una persona); lo que se fue es la
    // consulta que lo adivinaba desde `productos`.
    return items.map((it) => {
      const g = it.sku ? porSku.get(it.sku.trim()) : undefined
      if (!g) return it
      return {
        ...it,
        product_id: String(g.product_id),
        size_id: g.size_id == null ? null : String(g.size_id),
        costo: it.costo ?? null,
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
  /**
   * **Null cuando no hay producto en juego** (una demora, una cancelación). No es un dato que
   * falta: es que no hay nada que decidir sobre un producto, y el servidor sólo lo exige cuando el
   * caso y su escenario dicen que sí lo hay.
   */
  destino_prenda: DestinoPrenda | null
  /** Cuál de las respuestas cerradas del caso se encontró. En tres casos decide la plata. */
  escenario?: string | null
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
  /**
   * **La oferta de retención**: cuánto se le ofreció para que se lo quede, en qué, y qué contestó.
   *
   * 🔑 **`retencion_respuesta: null` con monto ⛔ NO es media oferta: es «se la mandamos y todavía
   * no contestó»**, que es el estado en el que el reclamo se queda mientras el local espera. Lo
   * que el servidor sigue rechazando es lo otro — una respuesta **sin** monto ("no aceptó" ¿qué?).
   *
   * ⚠️ **Mandar el monto es tocar la oferta.** Quien no la está tocando manda `retencion_monto`
   * sin definir y ⛔ no pisa nada; quien lo manda con `retencion_respuesta: null` está diciendo
   * que la respuesta todavía no existe, y ahí sí se borra la que hubiera.
   */
  retencion_respuesta?: RespuestaRetencion | null
  retencion_monto?: number | null
  /** En qué se le ofreció: plata o cupón. Va junta con el monto, o ninguna. */
  retencion_forma?: FormaRetencion | null
  /**
   * **El destino de cada producto**, como mapa índice → destino. `null` en un índice lo devuelve al
   * destino del reclamo. ⛔ Los productos no se reenvían: salen de la orden, y dejar que la decisión
   * los reescriba abre la puerta a que una pantalla vieja los pise con menos datos.
   */
  destinos?: Record<number, DestinoPrenda | null> | null
  /**
   * Qué pidió el cliente. Se puede completar ACÁ y no sólo al abrir el reclamo: en la mayoría de
   * los casos se sabe recién después de escribirle, así que exigirlo en el alta era pedir que
   * alguien lo invente. `null` no pisa lo que ya estuviera cargado.
   */
  expectativa?: Expectativa | null
  /**
   * Sólo en "pedido mal armado": lo que el cliente recibió POR ERROR. Se carga al decidir y no en
   * el alta, porque hasta ver las fotos no se sabe qué le mandaron — y es el dato del que salen las
   * dos correcciones de stock.
   */
  items_correctos?: ItemReclamo[]
  /** Lo que se pagó por la orden entera: el servidor lo usa de techo del reintegro. */
  techo_orden?: number | null
}

/** La decisión de fondo: qué pasa con el producto y qué recibe el cliente. Solo administración. */
export async function decidir(payload: Decision): Promise<EstadoReclamo> {
  const d = await postear({ action: 'decidir', ...payload })
  return d.estado as EstadoReclamo
}

/**
 * **Muda el reclamo a otro caso, conservando la historia.**
 *
 * Es la salida de escape del centro: cinco casos terminan en "si pasa X, en realidad es otro caso"
 * —una disconformidad que resulta ser una publicación mal hecha, un "no llegó" que finalmente
 * llegó tarde—. El `.docx` de casos lo decía como un consejo al costado, y así no lo hace nadie:
 * el número, las fotos, el relato y el historial se pierden si hay que abrir otro reclamo.
 */
export async function reclasificar(store: Marca, id: number, motivo: MotivoReclamo, nota?: string | null): Promise<void> {
  await postear({ action: 'reclasificar', store, id, motivo, nota })
}

/**
 * Lo que se le manda al cliente ya salió del depósito.
 *
 * ⛔ No es de administración: despacha Depósito. El pendiente lo dejan las tres resoluciones que le
 * mandan algo —cambio, reposición y reenvío— y hasta el 25-ago-2026 **no había con qué tildarlo**,
 * así que ninguna de las tres se podía cerrar.
 */
/**
 * Anota de qué OTRA venta salió el producto de más.
 *
 * 🔑 El excedente es el único caso que toca dos ventas, y hasta el 26-ago-2026 la segunda quedaba
 * a cargo de que alguien se acordara: el escenario decía «se guarda cuál y se avisa» y no se
 * guardaba nada. El número es obligatorio del lado del servidor por lo mismo que el cupón exige el
 * código — es lo único que prueba que alguien fue a mirar la otra venta.
 *
 * @param unidades Índices en la lista, o `undefined` = todas las que faltaban.
 */
export async function anotarOtraVenta(
  store: Marca, id: number, orden: string, unidades?: number[],
): Promise<void> {
  await postear({ action: 'otra-venta', store, id, otra_orden: orden, ...(unidades ? { unidades } : {}) })
}

export async function marcarDespachado(store: Marca, id: number): Promise<void> {
  await postear({ action: 'despachado', store, id })
}

/**
 * **Qué contestó el cliente a la oferta de que se lo quede.**
 *
 * 🔑 **Sólo viaja la respuesta.** El monto y la forma ya están en la fila —los decidió
 * Administración al armar la oferta— y mandarlos de nuevo desde la pantalla sería dejar que el
 * local los pise sin querer. La rama que se aplica al aceptar la deriva el servidor con
 * `camposAlContestarLaOferta`.
 */
export async function contestarLaOferta(store: Marca, id: number, respuesta: RespuestaRetencion): Promise<void> {
  await postear({ action: 'retencion-respuesta', store, id, respuesta })
}

/**
 * El cupón ya existe en la tienda, con su código.
 *
 * 🔑 **El código es obligatorio**: es lo único que prueba que el cupón se creó de verdad. Antes
 * `cupon_codigo` se tipeaba suelto y nada avisaba si nunca se había emitido, así que el reclamo se
 * cerraba "con cupón" y el cliente descubría en la próxima compra que el código no anda.
 */
export async function marcarCuponEmitido(store: Marca, id: number, cupon_codigo: string): Promise<void> {
  await postear({ action: 'cupon-emitido', store, id, cupon_codigo })
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

/**
 * Registra que la unidad fantasma se dio de baja **a mano en Gestión Nube**.
 *
 * No la da de baja: GN no expone ingresos ni ajustes por API, igual que la anulación de ventas.
 * Es una traza de un paso manual, y lo que hace el sistema es no dejar que nadie se olvide.
 *
 * ⚠️ **No es de administración**: quien detecta que el producto no está es Local, y tiene que
 * poder resolverlo sin pedirle permiso a nadie.
 */
export async function marcarBajaGN(store: Marca, id: number): Promise<void> {
  await postear({ action: 'gn-baja', store, id })
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

/**
 * **Soltar la decisión: el reclamo vuelve a estar sin decidir.**
 *
 * Borra la resolución y los seis pendientes que cuelgan de ella; ⛔ no toca el análisis (escenario,
 * costo de traerlo, destinos, montos, la oferta de retención). El servidor rechaza soltarla si ya
 * se ejecutó algo — la regla vive allá, no acá.
 */
export async function liberarDecision(store: Marca, id: number): Promise<void> {
  await postear({ action: 'liberar-decision', store, id })
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
  extra?: { pvpFeria?: number | null; usuario?: string; pass?: string },
): Promise<number[]> {
  const descuenta = laFallaDescuentaStock(d.compensacion)
  const ids: number[] = []
  for (const it of d.items || []) {
    const { id, barcode } = await crearFalla(
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

    /**
     * La venta $0 que saca la unidad de Gestión Nube. **Sólo cuando corresponde**, y el matiz es lo
     * que hace que esto no descuente de más:
     *
     *  - Si se le mandó **otra unidad**, la venta original NO se anula: el cliente conserva lo que
     *    pagó. La unidad fallada que volvió **ya salió de GN** con esa venta, así que no hay nada
     *    que descontar. El reemplazo se descuenta aparte, con `descontarReemplazo`.
     *  - Si se le devolvió la **plata**, la venta original SÍ se anula y al anularla GN devuelve
     *    +1. Esa unidad no es vendible, así que hay que volver a sacarla — y de eso se encarga
     *    esta venta técnica.
     *
     * Es lo que dice `laFallaDescuentaStock`, que estaba escrita y nunca se conectaba a GN: la
     * falla se creaba en el Monitor y el stock quedaba contado de más.
     */
    if (id && descuenta && it.product_id && it.size_id && extra?.pass) {
      await registrarVentaGN(
        marca,
        {
          id,
          product_id: it.product_id,
          size_id: it.size_id,
          cantidad: Number(it.cantidad) || 1,
          sku: it.sku ?? null,
          motivo: `Reclamo ${d.numero || numeroReclamo(d.id)}`,
          barcode: barcode ?? null,
          ubicacion: 'deposito',
          precio_lista: it.precio == null ? null : Number(it.precio),
        },
        { user: extra.usuario || '', pass: extra.pass },
        // La nota la arma el RECLAMO, no el ledger: la fila de la falla no sabe de qué orden ni de
        // qué cliente salió esa unidad, y en Gestión Nube eso es lo único que la explica.
        notaVentaTecnica('falla', d, { usuario: extra.usuario, barcode }),
      )
    }
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
      comments: notaVentaTecnica('reemplazo', d, { usuario: ctx.user }),
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

/**
 * Saca del stock las unidades **sanas** que se queda el cliente, con una venta técnica al cliente
 * RECLAMO de Gestión Nube.
 *
 * 🔑 **Es la otra mitad de `pasarAFallas`, y existe para no tener que pasar por ahí.** Hasta el
 * 26-ago-2026 el único camino para sacar del stock una unidad que se le regala al cliente era darla
 * de alta en Fallas: eso la valúa a PVP de feria y la deja en la lista de lo que se revende como
 * falla, dos afirmaciones falsas sobre un producto impecable. Ahora la falla va al cliente FALLA y
 * lo sano al cliente RECLAMO, y el ledger de Fallas queda limpio.
 *
 * ⚠️ **Una venta por reclamo, con todas las unidades que falten** —no una por unidad—: es un solo
 * movimiento de depósito y así queda un solo número de venta al que ir a mirar. El sello es igual
 * por unidad, que es donde vive el dato.
 *
 * ⛔ Va contra el `crear-venta` de PRODUCCIÓN, también desde localhost: los tokens de ventas de GN
 * viven sólo ahí.
 */
export async function descontarRegaladas(
  marca: Marca,
  d: ReclamoRow,
  ctx: { user: string; pass: string },
): Promise<{ id?: string; number?: string; descontadas: number }> {
  const faltan = loQueFaltaDescontar(d)
  if (!faltan.length) throw new Error('No hay ningún producto sano pendiente de descontar en este reclamo.')
  const items = faltan
    .filter((u) => u.item.product_id && u.item.size_id)
    .map((u) => ({
      product_id: u.item.product_id as string,
      size_id: u.item.size_id as string,
      quantity: Number(u.item.cantidad) || 1,
      unit_price: Number(u.item.precio) || 0,
    }))
  // Mismo corte que `descontarReemplazo`: sin el artículo de GN no hay stock que mover, y fallar
  // acá es mejor que dejar creer que se descontó.
  if (!items.length) {
    throw new Error('Estos productos no están linkeados a Gestión Nube, así que no se puede descontar el stock. Cargalo a mano en GN.')
  }
  const r = await fetch(CREAR_VENTA_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store: marca,
      origen: 'deposito',
      items,
      // Precio de lista + 100 % de descuento: sale del stock, no se cobra, y queda valuada real.
      descuento: items.reduce((s, it) => s + it.unit_price * it.quantity, 0),
      comments: notaVentaTecnica('regalada', d, { usuario: ctx.user }),
      solicitudId: `reclamo-${d.id}-regaladas`, // idempotencia: dos clicks no generan dos ventas
      proposito: 'reclamo',
      user: ctx.user,
      pass: ctx.pass,
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!j?.ok) throw new Error(`No se pudo descontar el stock en GN — ${j?.error || r.status}`)
  const venta = j.venta || {}
  // El sello va DESPUÉS de que la venta exista: al revés, un fallo de GN dejaría el reclamo
  // diciendo que la unidad ya salió y nadie la volvería a buscar.
  await postear({
    action: 'descontado',
    store: marca,
    id: d.id,
    unidades: faltan.map((u) => u.i),
    gn_venta_number: venta.number ? String(venta.number) : null,
  })
  return { id: venta.id, number: venta.number, descontadas: faltan.length }
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
      comments: notaVentaTecnica('cambio', d, { usuario: ctx.user }),
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

/**
 * La bandeja de retornos: **columnas mínimas**, por la puerta angosta del handler.
 *
 * ⛔ No es `leerReclamos` con un filtro: la diferencia es de permiso, no de comodidad. Depósito
 * entra a esta vista con el permiso `retornos` y no ve ni el relato del cliente, ni los montos, ni
 * la llave del portal público.
 */
export async function leerRetornos(marca: Marca): Promise<RetornoRow[]> {
  const r = await apiFetch(`${API}&store=${marca}&vista=retornos&nc=${Date.now()}`)
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo leer la bandeja de retornos.')
  return (d.devoluciones || []) as RetornoRow[]
}

/**
 * Llegó. Es el gesto de la bandeja, y por eso es una acción propia y no `cambiarEstado(...,
 * 'recibido')`: con el permiso de la bandeja se puede hacer éste y ningún otro cambio de estado.
 */
export async function marcarRecibido(
  marca: Marca,
  id: number,
  opciones?: { nota?: string; unidades?: number[] },
): Promise<{ todoLlego: boolean; faltan: number }> {
  // `unidades` son los índices en la lista de lo que vuelve. Sin ellos llegó **todo**, que es lo
  // que este verbo significaba antes de que se pudiera recibir de a una.
  const d = await postear({
    store: marca, action: 'recibir', id,
    nota: opciones?.nota || null,
    ...(opciones?.unidades ? { unidades: opciones.unidades } : {}),
  })
  return { todoLlego: d.todoLlego !== false, faltan: Number(d.faltan) || 0 }
}

/** El producto devuelto ya volvió al stock a mano en GN. Traza de un paso manual, como `anulacion`. */
export async function marcarReingreso(marca: Marca, id: number): Promise<void> {
  await postear({ store: marca, action: 'reingreso', id })
}

/** La diferencia del cambio ya se cobró. */
export async function marcarCobrado(marca: Marca, id: number): Promise<void> {
  await postear({ store: marca, action: 'cobrado', id })
}


/** El link que se le pasa al cliente para que cargue fotos y cuente qué pasó. */
export function linkDelCliente(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://monitor.arebensrl.com'
  return `${base}/reclamo/${token}`
}
