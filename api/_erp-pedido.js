/**
 * El PEDIDO MAYORISTA en el panel de WhatsApp (plan «BDI directo al ERP», paso 3; pedido de Darío §2-§3, Bruno 30-oct).
 * El núcleo es del motor (`motor/pedido/venta.mjs`, sql/064): el pedido entra como una venta que RESERVA, todo a cuenta; el
 * pago se imputa al pedido (Pagado / Pagó una parte / Sin pagar); «Mandar a preparar» lo decide Darío a mano, esté pago o
 * no; el freno va en el despacho (Logística, con Ger). Acá sólo la puerta.
 *
 * 🔑 ESCONDIDO, como la cuenta corriente del panel (`docs/secciones/crm.md` § Lo ESCONDIDO del panel):
 *   - leer (los pedidos del chat, la ficha, «Preparados sin pagar») ⇒ detrás de `PANEL_CUENTA_CORRIENTE`;
 *   - escribir (entrar, cambiar, mandar a preparar, anular) ⇒ ADEMÁS detrás de `VENTA_MAYORISTA_REAL=bdi` (409 apagado).
 *     Mientras GN viva, la venta mayorista la registra la copia de GN (`bin/mayorista.mjs` del motor): un pedido entrado acá
 *     reservaría dos veces. Se prende el día del corte de BDI, junto con apagar esa copia.
 * Sin la sql/064 en la base, las lecturas contestan vacío (`falta064`) en vez de romper.
 */
import { panelCuentaPrendido } from './_erp-clientes.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Los pedidos SIN ENTRAR que se buscan por el teléfono del chat: los de los últimos días (el catálogo manda el teléfono escrito a mano). */
const DIAS_SIN_ENTRAR = 60

/** ¿La llave de escribir está prendida? Sin el motor nuevo o con un typo en la variable ⇒ apagada (⛔ rompe el panel). */
export async function escribirPrendido(env = process.env) {
  try {
    const { ventaMayoristaRealEn } = await import('../motor/pedido/venta.mjs')
    return ventaMayoristaRealEn('bdi', env)
  } catch {
    return false
  }
}

async function hay064(pg) {
  const { rows: [r] } = await pg.query(`select exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pedido_mayorista' and column_name = 'venta_id') as hay`)
  return r.hay
}

/** Los nombres del producto y del talle (catálogo propio, sql/012), por variante. */
async function nombresDe(pg, lineas) {
  const ids = [...new Set(lineas.map((l) => Number(l.product_id)).filter((x) => x > 0))]
  if (!ids.length) return { producto: new Map(), talle: new Map() }
  const prod = await pg.query('select id::text, nombre from producto where id = any($1::bigint[])', [ids]).then((r) => r.rows).catch(() => [])
  const tal = await pg.query('select product_id::text, size_id::text, talle from variante where product_id = any($1::bigint[])', [ids]).then((r) => r.rows).catch(() => [])
  return { producto: new Map(prod.map((p) => [p.id, p.nombre])), talle: new Map(tal.map((t) => [`${t.product_id}:${t.size_id}`, t.talle])) }
}

/**
 * Los pedidos del cliente del chat (los entrados al ERP) y los SIN ENTRAR que llegaron con el teléfono del chat (para
 * «Entrar al ERP» con este cliente).
 * @param {{ clienteId?: string, tel?: string, usuario?: any }} p @param {{ conMotor: Function, prendido?: boolean, escribir?: boolean }} deps
 */
export async function pedidosDelPanel({ clienteId = '', tel = '', usuario = null }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, usuario))) return { prendido: false }
  const cli = UUID.test(String(clienteId)) ? String(clienteId) : null
  const wa = String(tel || '').replace(/\D/g, '').slice(0, 20)
  const escribir = deps.escribir ?? (await escribirPrendido())
  if (!cli && !wa) return { prendido: true, escribir, pedidos: [], sinEntrar: [] }
  return deps.conMotor('bdi', 'Los pedidos del cliente', async (pg) => {
    if (!(await hay064(pg))) return { prendido: true, escribir: false, pedidos: [], sinEntrar: [], falta064: true }
    const pv = await import('../motor/pedido/venta.mjs')
    let pedidos = []
    if (cli) {
      const r = await pv.pedidosMayoristasDe(pg, { cliente_id: cli, limite: 30 })
      if (!r.ok) return { status: 400, error: r.error?.mensaje ?? 'No se pudieron leer los pedidos.' }
      pedidos = r.pedidos
    }
    let sinEntrar = []
    if (wa) {
      const { numeroWhatsapp } = await import('../motor/venta/cliente.mjs')
      const delChat = numeroWhatsapp(wa)
      if (delChat) {
        const { rows } = await pg.query(`select id::text, numero, recibido_en, total, unidades, contacto from pedido_mayorista
          where marca = 'bdi' and venta_id is null and anulado_en is null and contacto ? 'telefono' and recibido_en > now() - make_interval(days => $1)
          order by recibido_en desc limit 200`, [DIAS_SIN_ENTRAR])
        sinEntrar = rows.filter((p) => numeroWhatsapp(p.contacto?.telefono) === delChat)
          .map((p) => ({ id: p.id, numero: Number(p.numero), recibido_en: p.recibido_en, total: Number(p.total), unidades: Number(p.unidades), nombre: p.contacto?.nombre ?? null }))
      }
    }
    return { prendido: true, escribir, pedidos, sinEntrar }
  })
}

/**
 * La FICHA del pedido: renglones con nombre, talle y STOCK REAL al lado, quién lo pidió, el pago, la zona de despacho y
 * quién cambió qué.
 * @param {{ pedidoId: string, usuario?: any }} p @param {{ conMotor: Function, prendido?: boolean, escribir?: boolean }} deps
 */
export async function pedidoDelPanel({ pedidoId = '', usuario = null }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, usuario))) return { prendido: false }
  if (!UUID.test(String(pedidoId))) return { status: 400, error: 'Falta el pedido' }
  const escribir = deps.escribir ?? (await escribirPrendido())
  return deps.conMotor('bdi', 'El pedido', async (pg) => {
    if (!(await hay064(pg))) return { status: 409, error: 'Falta la migración del pedido en la base (sql/064).' }
    const { fichaDePedidoMayorista } = await import('../motor/pedido/venta.mjs')
    const r = await fichaDePedidoMayorista(pg, { pedido_id: pedidoId })
    if (!r.ok) return { status: r.error?.codigo === 'NO_ENCONTRADO' ? 404 : 400, error: r.error?.mensaje ?? 'No se pudo leer el pedido.' }
    const n = await nombresDe(pg, r.lineas)
    return {
      prendido: true, escribir, pedido: r.pedido, cambios: r.cambios,
      lineas: r.lineas.map((l) => ({ ...l, nombre: n.producto.get(String(l.product_id)) ?? null, talle: l.size_id == null ? null : n.talle.get(`${l.product_id}:${l.size_id}`) ?? null })),
    }
  })
}

/**
 * «Preparados sin pagar» (Hoy del panel): los pedidos listos de clientes sin cuenta corriente, con cuánto deben y desde
 * cuándo están listos. Vacío hasta que Logística mande «listo» (con Ger).
 * @param {{ usuario?: any }} p @param {{ conMotor: Function, prendido?: boolean }} deps
 */
export async function preparadosSinPagarDelPanel({ usuario = null }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, usuario))) return { prendido: false }
  return deps.conMotor('bdi', 'Preparados sin pagar', async (pg) => {
    if (!(await hay064(pg))) return { prendido: true, pedidos: [], falta064: true }
    const { preparadosSinPagar } = await import('../motor/pedido/venta.mjs')
    const r = await preparadosSinPagar(pg, { empresa_id: 'areben', marca: 'bdi' })
    return r.ok ? { prendido: true, pedidos: r.pedidos } : { status: 400, error: r.error?.mensaje ?? 'No se pudo leer la lista.' }
  })
}

/**
 * «Agregar producto» en la hoja (Darío §2): el catálogo de la marca del pedido por nombre, SKU o código, con la variante, el
 * stock del depósito del pedido y el precio de la lista mayorista (el mismo que va a cobrar el cambio). Sin precio ⇒ `precio:
 * null` y la pantalla ⛔ deja agregarlo. Es lectura: la misma llave que la ficha.
 * @param {{ pedidoId: string, q?: string, usuario?: any }} p @param {{ conMotor: Function, prendido?: boolean }} deps
 */
export async function productosParaElPanel({ pedidoId = '', q = '', usuario = null }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, usuario))) return { prendido: false }
  if (!UUID.test(String(pedidoId))) return { status: 400, error: 'Falta el pedido' }
  const texto = String(q || '').trim().slice(0, 80)
  if (texto.length < 2) return { prendido: true, productos: [] }
  return deps.conMotor('bdi', 'Buscar el producto', async (pg) => {
    const { productosParaPedido } = await import('../motor/pedido/venta.mjs')
    const r = await productosParaPedido(pg, { pedido_id: String(pedidoId), q: texto })
    if (!r.ok) return { status: r.error?.codigo === 'NO_ENCONTRADO' ? 404 : 400, error: r.error?.mensaje ?? 'No se pudo buscar.' }
    return { prendido: true, productos: r.productos }
  })
}

/** El código del motor ⇒ el status de la puerta. */
const statusDe = (codigo) => (codigo === 'NO_ENCONTRADO' ? 404
  : ['ANULADO', 'EN_PREPARACION', 'SIN_ENTRAR', 'SIN_PRECIO', 'SIN_TALLE', 'SIN_RENGLONES', 'CAMBIO_DE_LLAVE', 'SIN_CUENTA_CORRIENTE', 'CONFLICTO_IDEMPOTENCIA'].includes(codigo) ? 409 : 400)

export const ACCIONES_PEDIDO = ['pedido-entrar', 'pedido-cambiar', 'pedido-a-preparar', 'pedido-anular']

/**
 * Entrar al ERP, cambiar, mandar a preparar y anular. Doble llave: el panel Y `VENTA_MAYORISTA_REAL`.
 * @param {{ accion: string, body: any, usuario: string|null, quien?: any }} p
 * @param {{ conMotor: Function, prendido?: boolean, escribir?: boolean }} deps
 */
export async function accionDePedido({ accion, body, usuario, quien = usuario }, deps) {
  if (!ACCIONES_PEDIDO.includes(accion)) return { status: 400, error: 'Acción desconocida' }
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, quien))) return { status: 409, error: 'La cuenta corriente del panel está apagada.' }
  if (!(deps.escribir ?? (await escribirPrendido()))) return { status: 409, error: 'Los pedidos se manejan desde acá el día que BDI pasa al ERP. Hasta entonces, en Gestión Nube.' }
  if (!UUID.test(String(body?.pedidoId || ''))) return { status: 400, error: 'Falta el pedido' }
  if (!usuario) return { status: 400, error: 'Falta quién lo hace' }
  return deps.conMotor('bdi', 'El pedido', async (pg) => {
    const pv = await import('../motor/pedido/venta.mjs')
    const pedido_id = String(body.pedidoId)
    let r
    if (accion === 'pedido-entrar') {
      if (!UUID.test(String(body.clienteId || ''))) return { status: 400, error: 'Falta el cliente' }
      r = await pv.entrarPedidoMayorista(pg, { pedido_id, cliente_id: String(body.clienteId), persona_id: UUID.test(String(body.personaId || '')) ? String(body.personaId) : null, usuario })
    } else if (accion === 'pedido-cambiar') {
      if (!Array.isArray(body.lineas)) return { status: 400, error: 'Faltan los renglones' }
      r = await pv.cambiarPedidoMayorista(pg, { pedido_id, lineas: body.lineas.map((l) => ({ product_id: Number(l?.productId), size_id: Number(l?.sizeId), cantidad: Number(l?.cantidad) })), usuario })
    } else if (accion === 'pedido-a-preparar') {
      r = await pv.mandarAPreparar(pg, { pedido_id, usuario })
    } else {
      r = await pv.anularPedidoDelErp(pg, { pedido_id, motivo: String(body.motivo ?? ''), usuario })
    }
    if (!r.ok) return { status: statusDe(r.error?.codigo), error: r.error?.mensaje ?? 'No se pudo.' }
    return { ok: true, ya: !!r.ya, sinCambios: !!r.sin_cambios, avisarDeposito: !!r.avisar_deposito, ventaId: r.venta_id ?? null }
  })
}
