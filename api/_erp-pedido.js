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
import { panelAbierto } from './_erp-clientes.js'
import { cortesDeCaja } from './_caja-corte.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Los pedidos SIN ENTRAR que se buscan por el teléfono del chat: los de los últimos días (el catálogo manda el teléfono escrito a mano). */
const DIAS_SIN_ENTRAR = 60

/**
 * ¿La llave de escribir está prendida? = la venta mayorista de BDI es REAL: desde el CORTE de BDI (`erp_corte`) o con
 * `VENTA_MAYORISTA_REAL=bdi` a mano; 🛑 `ERP_NO_MANDA=bdi` la apaga (motor `lib/llave-corte.mjs`, Bruno 1-nov: «todo con
 * interruptor»). Sin el motor, sin poder leer los cortes o con un typo ⇒ APAGADA (409, ⛔ rompe el panel ni escribe).
 */
export async function escribirPrendido(env = process.env, { cortes = () => cortesDeCaja('bdi') } = {}) {
  try {
    const { ventaMayoristaReal } = await import('../motor/llave-corte.mjs')
    return ventaMayoristaReal('bdi', await cortes(), env)
  } catch {
    return false
  }
}

// La migración no se deshace: confirmada una vez, no se vuelve a preguntar (una ida a la base menos por pedido, 18-nov).
let hay064Visto = false
async function hay064(pg) {
  if (hay064Visto) return true
  const { rows: [r] } = await pg.query(`select exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pedido_mayorista' and column_name = 'venta_id') as hay`)
  if (r.hay) hay064Visto = true
  return r.hay
}

/** Los nombres del producto y del talle (catálogo propio, sql/012), por variante. */
export async function nombresDe(pg, lineas) {
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
  if (!(deps.prendido ?? await panelAbierto(usuario))) return { prendido: false }
  const cli = UUID.test(String(clienteId)) ? String(clienteId) : null
  const wa = String(tel || '').replace(/\D/g, '').slice(0, 20)
  const escribir = deps.escribir ?? (await escribirPrendido())
  if (!cli && !wa) return { prendido: true, escribir, pedidos: [], sinEntrar: [], deGn: [] }
  return deps.conMotor('bdi', 'Los pedidos del cliente', async (pg) => {
    if (!(await hay064(pg))) return { prendido: true, escribir: false, pedidos: [], sinEntrar: [], deGn: [], falta064: true }
    const pv = await import('../motor/pedido/venta.mjs')
    let pedidos = []
    if (cli) {
      const r = await pv.pedidosMayoristasDe(pg, { cliente_id: cli, limite: 30 })
      if (!r.ok) return { status: 400, error: r.error?.mensaje ?? 'No se pudieron leer los pedidos.' }
      pedidos = r.pedidos
    }
    let sinEntrar = []
    /** Los VENDIDOS POR GN (antes del corte): mismo pedido que su venta de GN ⇒ ⛔ «Entrar» (Darío 16-nov: pedido 91 = GN 33311). */
    const deGn = new Map()
    const aGn = (p) => deGn.set(p.id, { id: p.id, numero: Number(p.numero), recibido_en: p.recibido_en, total: Number(p.total), unidades: Number(p.unidades), gn_number: String(p.gn_number) })
    if (cli) {
      // Por el cliente de su venta de GN (la copia del ERP, `origen = 'gn'`): el pedido del catálogo ⛔ tiene cliente propio.
      const { rows } = await pg.query(`select p.id::text, p.numero, p.recibido_en, p.total, p.unidades, coalesce(p.gn_number, p.gn_sale_id::text) as gn_number
        from pedido_mayorista p join venta v on v.gn_sale_id = p.gn_sale_id and v.origen = 'gn' and v.marca = p.marca
        where p.marca = 'bdi' and p.anulado_en is null and p.venta_id is null and p.gn_sale_id is not null and v.cliente_id = $1
          and p.recibido_en > now() - make_interval(days => $2) order by p.recibido_en desc limit 50`, [cli, DIAS_SIN_ENTRAR])
      for (const p of rows) if (p.gn_number != null) aGn(p)
    }
    if (wa) {
      const { numeroWhatsapp } = await import('../motor/venta/cliente.mjs')
      const delChat = numeroWhatsapp(wa)
      if (delChat) {
        // 16-nov (Darío): ⛔ los que se hicieron en GN (`gn_sale_id`): ya son venta de GN y siguen por Logística; «Entrar» los
        // vendía otra vez (pedido 91, Federico Colome) ⇒ van a `deGn`, ⛔ a «sin entrar».
        // 15-nov (Darío): también los que ENTRARON a la ficha general «Pedido mayorista» (ya apartan) y esperan su cliente.
        const { FICHA_SIN_CLIENTE } = await import('../motor/venta/cliente.mjs')
        const { rows } = await pg.query(`select id::text, numero, recibido_en, total, unidades, contacto, venta_id is not null as apartado, coalesce(gn_number, gn_sale_id::text) as gn_number from pedido_mayorista
          where marca = 'bdi' and anulado_en is null and (venta_id is null or cliente_id = $2) and contacto ? 'telefono' and recibido_en > now() - make_interval(days => $1)
          order by recibido_en desc limit 200`, [DIAS_SIN_ENTRAR, FICHA_SIN_CLIENTE])
        const delNumero = rows.filter((p) => numeroWhatsapp(p.contacto?.telefono) === delChat)
        for (const p of delNumero) if (p.gn_number != null) aGn(p)
        sinEntrar = delNumero.filter((p) => p.gn_number == null)
          .map((p) => ({ id: p.id, numero: Number(p.numero), recibido_en: p.recibido_en, total: Number(p.total), unidades: Number(p.unidades), nombre: p.contacto?.nombre ?? null, apartado: p.apartado }))
      }
    }
    return { prendido: true, escribir, pedidos, sinEntrar, deGn: [...deGn.values()].sort((a, b) => String(b.recibido_en).localeCompare(String(a.recibido_en))) }
  })
}

/**
 * La FICHA del pedido: renglones con nombre, talle y STOCK REAL al lado, quién lo pidió, el pago, la zona de despacho y
 * quién cambió qué.
 * @param {{ pedidoId: string, usuario?: any }} p @param {{ conMotor: Function, prendido?: boolean, escribir?: boolean }} deps
 */
export async function pedidoDelPanel({ pedidoId = '', usuario = null }, deps) {
  if (!(deps.prendido ?? await panelAbierto(usuario))) return { prendido: false }
  if (!UUID.test(String(pedidoId))) return { status: 400, error: 'Falta el pedido' }
  const escribir = deps.escribir ?? (await escribirPrendido())
  return deps.conMotor('bdi', 'El pedido', async (pg) => {
    if (!(await hay064(pg))) return { status: 409, error: 'Falta la migración del pedido en la base (sql/064).' }
    return fichaConConexion(pg, String(pedidoId), escribir)
  })
}

/**
 * La ficha con una conexión ya abierta: la usa la hoja y, después de un cambio o del envío, la misma acción (Darío 18-nov:
 * guardar el envío tardaba ~5 s porque, al terminar, la hoja volvía a pedirse con otra conexión).
 * @param {import('pg').ClientBase} pg @param {string} pedidoId @param {boolean} escribir
 */
async function fichaConConexion(pg, pedidoId, escribir) {
  {
    const { fichaDePedidoMayorista } = await import('../motor/pedido/venta.mjs')
    const r = await fichaDePedidoMayorista(pg, { pedido_id: pedidoId })
    if (!r.ok) return { status: r.error?.codigo === 'NO_ENCONTRADO' ? 404 : 400, error: r.error?.mensaje ?? 'No se pudo leer el pedido.' }
    const n = await nombresDe(pg, r.lineas)
    const { esFichaSinCliente } = await import('../motor/venta/cliente.mjs')
    // Para el total en el momento (Darío 18-nov): el mismo redondeo que aplica el cambio al guardar.
    const { redondeoDe } = await import('../motor/venta/redondeo-db.mjs')
    const redondeo = await redondeoDe(pg, { marca: r.pedido.marca ?? 'bdi', canal: 'mayorista' }).catch(() => null)
    return {
      prendido: true, escribir, redondeo: redondeo ? { paso: Number(redondeo.paso), modo: redondeo.modo } : null, pedido: { ...r.pedido, falta_cliente: esFichaSinCliente(r.pedido.cliente_id) }, cambios: r.cambios,
      lineas: r.lineas.map((l) => ({ ...l, nombre: n.producto.get(String(l.product_id)) ?? null, talle: l.size_id == null ? null : n.talle.get(`${l.product_id}:${l.size_id}`) ?? null })),
    }
  }
}

/**
 * «Preparados sin pagar» (Hoy del panel): los pedidos listos de clientes sin cuenta corriente, con cuánto deben y desde
 * cuándo están listos. Vacío hasta que Logística mande «listo» (con Ger).
 * @param {{ usuario?: any }} p @param {{ conMotor: Function, prendido?: boolean }} deps
 */
export async function preparadosSinPagarDelPanel({ usuario = null }, deps) {
  if (!(deps.prendido ?? await panelAbierto(usuario))) return { prendido: false }
  return deps.conMotor('bdi', 'Preparados sin pagar', async (pg) => {
    if (!(await hay064(pg))) return { prendido: true, pedidos: [], falta064: true }
    const { preparadosSinPagar } = await import('../motor/pedido/venta.mjs')
    const r = await preparadosSinPagar(pg, { empresa_id: 'areben', marca: 'bdi' })
    return r.ok ? { prendido: true, pedidos: r.pedidos } : { status: 400, error: r.error?.mensaje ?? 'No se pudo leer la lista.' }
  })
}

/**
 * «Falta el cliente» (Hoy del panel, Darío 15-nov): los pedidos que entraron a la ficha general «Pedido mayorista» —apartan, pero
 * ⛔ van a preparar— con el nombre y el teléfono que escribió el cliente en el catálogo. Se resuelven desde el chat de ese número.
 * @param {{ usuario?: any }} p @param {{ conMotor: Function, prendido?: boolean }} deps
 */
export async function pedidosSinClienteDelPanel({ usuario = null }, deps) {
  if (!(deps.prendido ?? await panelAbierto(usuario))) return { prendido: false }
  return deps.conMotor('bdi', 'Falta el cliente', async (pg) => {
    if (!(await hay064(pg))) return { prendido: true, pedidos: [], falta064: true }
    const { pedidosSinCliente } = await import('../motor/pedido/venta.mjs')
    const r = await pedidosSinCliente(pg, { marca: 'bdi' })
    return r.ok ? { prendido: true, pedidos: r.pedidos } : { status: 400, error: r.error?.mensaje ?? 'No se pudo leer la lista.' }
  })
}

/**
 * El estado de los pedidos del catálogo de «Sin pago» (Darío 17-nov: Lucila Reales pagó y seguía ahí; con 20 pedidos la lista
 * se llena de lo ya resuelto). Por NÚMERO del ERP —el id con que el catálogo guarda el pedido nacido en el ERP—, sólo los
 * nacidos en el ERP (⛔ los importados de GN, que repiten números chicos). Contesta, por número: si ya está PAGO (o con
 * cuenta corriente, que no espera el pago), si está ANULADO y si todavía está en la ficha «Pedido mayorista» (ése se ve en
 * «Sin cliente»). Es lectura: la misma llave que la ficha. Sin la sql/064, vacío.
 * @param {{ numeros?: string, usuario?: any }} p @param {{ conMotor: Function, prendido?: boolean }} deps
 */
export async function estadoDePedidosDelPanel({ numeros = '', usuario = null }, deps) {
  if (!(deps.prendido ?? await panelAbierto(usuario))) return { prendido: false }
  const lista = [...new Set(String(numeros).split(',').map((x) => Number(x)).filter((x) => Number.isSafeInteger(x) && x > 0))].slice(0, 200)
  if (!lista.length) return { prendido: true, estados: {} }
  return deps.conMotor('bdi', 'El estado de los pedidos', async (pg) => {
    if (!(await hay064(pg))) return { prendido: true, estados: {}, falta064: true }
    const { estadoDePago } = await import('../motor/pedido/venta.mjs')
    const { pendienteDeVentas } = await import('../motor/cuenta/cuenta.mjs')
    const { creditoDe } = await import('../motor/cuenta/libro.mjs')
    const { esFichaSinCliente } = await import('../motor/venta/cliente.mjs')
    const { rows } = await pg.query(`select numero, total, venta_id::text, cliente_id::text, anulado_en is not null as anulado, contacto->>'telefono' as telefono from pedido_mayorista
      where marca = 'bdi' and gn_sale_id is null and numero = any($1::bigint[])`, [lista])
    const ventas = rows.filter((p) => p.venta_id && !p.anulado).map((p) => p.venta_id)
    const { pendientes } = ventas.length ? await pendienteDeVentas(pg, { venta_ids: ventas }) : { pendientes: {} }
    const creditos = new Map()
    const estados = {}
    for (const p of rows) {
      const sinCliente = !p.cliente_id || esFichaSinCliente(p.cliente_id)
      let pago = null
      let cuenta = false
      if (p.venta_id && !p.anulado && !sinCliente) {
        pago = estadoDePago({ total: Number(p.total), pendiente: pendientes[p.venta_id] ?? 0 }).estado
        if (!creditos.has(p.cliente_id)) creditos.set(p.cliente_id, (await creditoDe(pg, p.cliente_id))?.credito === true)
        cuenta = creditos.get(p.cliente_id)
      }
      estados[String(p.numero)] = { pago, cuenta, anulado: !!p.anulado, sinCliente, telefono: p.telefono || null }
    }
    return { prendido: true, estados }
  })
}

/**
 * «Agregar producto» en la hoja (Darío §2): el catálogo de la marca del pedido por nombre, SKU o código, con la variante, el
 * stock del depósito del pedido y el precio de la lista mayorista (el mismo que va a cobrar el cambio). Sin precio ⇒ `precio:
 * null` y la pantalla ⛔ deja agregarlo. Es lectura: la misma llave que la ficha.
 * @param {{ pedidoId: string, q?: string, usuario?: any }} p @param {{ conMotor: Function, prendido?: boolean }} deps
 */
export async function productosParaElPanel({ pedidoId = '', q = '', usuario = null }, deps) {
  if (!(deps.prendido ?? await panelAbierto(usuario))) return { prendido: false }
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
  : ['ANULADO', 'VENDIDO_EN_GN', 'EN_PREPARACION', 'SIN_ENTRAR', 'FALTA_CLIENTE', 'TIENE_PAGOS', 'SIN_PRECIO', 'SIN_TALLE', 'SIN_RENGLONES', 'CAMBIO_DE_LLAVE', 'SIN_CUENTA_CORRIENTE', 'CONFLICTO_IDEMPOTENCIA'].includes(codigo) ? 409 : 400)

export const ACCIONES_PEDIDO = ['pedido-entrar', 'pedido-cambiar', 'pedido-a-preparar', 'pedido-anular', 'pedido-envio']

/**
 * Entrar al ERP, cambiar, mandar a preparar, anular y poner el ENVÍO. Doble llave: el panel Y `VENTA_MAYORISTA_REAL`.
 * `pedido-envio` (Darío 15-nov, sql/084): `{ pedidoId, envio, transporte? }` — el envío que paga el cliente en origen (EM) se suma al
 * total; `envio` vacío o 0 lo saca. 🔴 Con el pedido FACTURADO (entera o alguna parte) ⛔: cambiaría el total de una venta ya
 * facturada. Eso lo ve esta puerta (las facturas viven en `facturas`, ⛔ en el motor).
 * @param {{ accion: string, body: any, usuario: string|null, quien?: any }} p
 * @param {{ conMotor: Function, prendido?: boolean, escribir?: boolean, puedeAnular?: boolean, facturacion?: (ventaId: string, total: number) => Promise<{ entera: any, partes: number }|null> }} deps
 */
export async function accionDePedido({ accion, body, usuario, quien = usuario }, deps) {
  if (!ACCIONES_PEDIDO.includes(accion)) return { status: 400, error: 'Acción desconocida' }
  if (!(deps.prendido ?? await panelAbierto(quien))) return { status: 409, error: 'La cuenta corriente del panel está apagada.' }
  if (!(deps.escribir ?? (await escribirPrendido()))) return { status: 409, error: 'Los pedidos se manejan desde acá el día que BDI pasa a Areben Gestión. Hasta entonces, en Gestión Nube.' }
  if (!UUID.test(String(body?.pedidoId || ''))) return { status: 400, error: 'Falta el pedido' }
  if (!usuario) return { status: 400, error: 'Falta quién lo hace' }
  // Anular: sólo Darío y Bruno, con motivo (Darío 15-nov). El que llama dice si el perfil es uno de los dos (`esAprobador`).
  if (accion === 'pedido-anular') {
    if (!deps.puedeAnular) return { status: 403, error: 'Anular un pedido es sólo de Darío y Bruno.' }
    if (!String(body.motivo ?? '').trim()) return { status: 400, error: 'Falta el motivo' }
  }
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
    } else if (accion === 'pedido-envio') {
      const crudo = body.envio == null || String(body.envio).trim() === '' ? null : Number(body.envio)
      if (crudo != null && (!Number.isFinite(crudo) || crudo < 0)) return { status: 400, error: 'El envío es un monto en pesos' }
      const ficha = await pv.fichaDePedidoMayorista(pg, { pedido_id })
      if (ficha.ok && ficha.pedido.venta_id) {
        const leer = deps.facturacion || (async (ventaId, total) => {
          const { facturacionDeVenta } = await import('./_erp-factura-mayorista.js')
          const { ambienteSeguro } = await import('./_erp.js')
          const { baseFacturacion } = await import('./_facturacion.js')
          const { ambiente } = ambienteSeguro()
          return ambiente ? facturacionDeVenta(baseFacturacion(), { ambiente, ventaId, total }) : null
        })
        const fac = await leer(String(ficha.pedido.venta_id), Number(ficha.pedido.total))
        if (fac?.entera || fac?.partes > 0) return { status: 409, error: 'El pedido ya tiene factura: el envío no se cambia.' }
      }
      r = await pv.ponerEnvioPedido(pg, { pedido_id, envio: crudo, transporte: body.transporte == null ? null : String(body.transporte), usuario })
    } else if (accion === 'pedido-a-preparar') {
      r = await pv.mandarAPreparar(pg, { pedido_id, usuario })
    } else {
      r = await pv.anularPedidoDelErp(pg, { pedido_id, motivo: String(body.motivo ?? ''), usuario })
    }
    if (!r.ok) return { status: statusDe(r.error?.codigo), error: r.error?.mensaje ?? 'No se pudo.' }
    if (accion === 'pedido-entrar' || accion === 'pedido-a-preparar') await whatsappDesdeElPedido(pg, pedido_id)
    // Cambio y envío: la hoja nueva viaja en la misma respuesta, así la pantalla ⛔ la vuelve a pedir (Darío 18-nov, ~5 s).
    let ficha
    if (accion === 'pedido-cambiar' || accion === 'pedido-envio') {
      try {
        const f = await fichaConConexion(pg, pedido_id, true)
        if (!f.status) ficha = f
      } catch (e) {
        console.warn('[erp-pedido] la hoja después del cambio:', e?.message)
      }
    }
    return { ok: true, ya: !!r.ya, sinCambios: !!r.sin_cambios, avisarDeposito: !!r.avisar_deposito, ventaId: r.venta_id ?? null, ...(ficha ? { ficha } : {}) }
  })
}

/**
 * El cliente sin WhatsApp en su ficha toma el del pedido (el teléfono de la nota del catálogo). Darío 17-nov: Lucila Reales
 * se cargó nueva sin número y su pedido llegó a Logística sin teléfono ni cliente. ⛔ pisa uno que ya tenga; ⛔ frena nada:
 * si falla, el pedido ya quedó hecho.
 * @param {import('pg').ClientBase} pg @param {string} pedido_id
 */
export async function whatsappDesdeElPedido(pg, pedido_id) {
  try {
    const [p] = (await pg.query(`select c.empresa_id, c.id::text as cliente_id, p.contacto->>'telefono' as telefono
      from pedido_mayorista p join cliente c on c.id = p.cliente_id
      where p.id = $1 and nullif(trim(coalesce(c.whatsapp, '')), '') is null`, [pedido_id])).rows
    if (!p?.telefono) return
    const { esFichaSinCliente } = await import('../motor/venta/cliente.mjs')
    if (esFichaSinCliente(p.cliente_id)) return // la ficha general «Pedido mayorista» ⛔ es de nadie
    const { ponerContactoCliente } = await import('../motor/venta/cliente.mjs')
    await ponerContactoCliente(pg, { empresa_id: p.empresa_id, cliente_id: p.cliente_id, whatsapp: p.telefono })
  } catch (e) {
    console.warn('[erp-pedido] no se pudo completar el WhatsApp del cliente desde el pedido:', e?.message)
  }
}
