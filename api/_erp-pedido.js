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
import { cuentaDelPedido, packDe, packsEnRenglones, precioDeTienda, promoDe, renglonGuardado, soloPack } from '../lib/erp/precio-tienda.core.js'

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
  // Las reglas de la tienda se piden ANTES de la base, en paralelo (1 min en memoria).
  const reglas = leerReglas(deps)
  return deps.conMotor('bdi', 'El pedido', async (pg) => {
    if (!(await hay064(pg))) return { status: 409, error: 'Falta la migración del pedido en la base (sql/064).' }
    return fichaConConexion(pg, String(pedidoId), escribir, { reglas: await reglas, precioManual: !!deps.precioManual })
  })
}

/** Las reglas de la tienda, o null si ⛔ contestó (la hoja se ve igual; guardar un cambio avisa). */
async function leerReglas(deps, fresco = false) {
  try {
    if (deps.reglas) return await deps.reglas(fresco)
    const { reglasVigentes } = await import('./_tienda-precios.js')
    return await reglasVigentes({ fresco })
  } catch (e) {
    console.warn('[erp-pedido] las reglas de la tienda:', e?.message)
    return null
  }
}

/**
 * Lo que la cuenta de la tienda necesita de cada producto (Areben Gestión): precio de la lista mayorista, costo vigente
 * (para la oferta por margen) y sus talles.
 * @param {import('pg').ClientBase} pg @param {string} marca @param {number[]} ids
 * @returns {Promise<Map<string, { lista: number|null, costo: number|null, categoria: string|null, variantes: Array<{ size_id: number, talle: string|null }> }>>}
 */
export async function datosDeProductos(pg, marca, ids) {
  const unicos = [...new Set(ids.map(Number).filter((x) => x > 0))]
  const m = new Map()
  if (!unicos.length) return m
  const [pre, cos, tal, cat] = await Promise.all([
    pg.query(`select product_id::text, precio from precio_lista where marca = $1 and lista = 'mayorista' and product_id = any($2::bigint[]) and precio is not null`, [marca, unicos]).then((r) => r.rows),
    pg.query(`select product_id::text, costo from costo_vigente where marca = $1 and product_id = any($2::bigint[])`, [marca, unicos]).then((r) => r.rows).catch(() => []),
    pg.query(`select product_id::text, size_id, talle from variante where product_id = any($1::bigint[]) and activa`, [unicos]).then((r) => r.rows),
    pg.query(`select id::text, categoria from producto where id = any($1::bigint[])`, [unicos]).then((r) => r.rows).catch(() => []),
  ])
  for (const id of unicos) m.set(String(id), { lista: null, costo: null, categoria: null, variantes: [] })
  for (const r of cat) if (m.has(r.id)) m.get(r.id).categoria = r.categoria ?? null
  for (const r of pre) m.get(r.product_id).lista = Number(r.precio)
  for (const r of cos) if (m.has(r.product_id)) m.get(r.product_id).costo = Number(r.costo)
  for (const r of tal) m.get(r.product_id)?.variantes.push({ size_id: Number(r.size_id), talle: r.talle })
  return m
}

/**
 * Los renglones de la hoja con qué es cada uno para la tienda (`tipo`, `base` sin el descuento por monto) y los packs del
 * pedido (cuántos lleva y el armado), para el total en el momento. Sin reglas ⇒ `tienda: null`.
 */
async function tiendaDeLaFicha(pg, marca, lineas, reglas) {
  if (!reglas) return { lineas, tienda: null }
  const datos = await datosDeProductos(pg, marca, lineas.map((l) => l.product_id))
  const conTipo = lineas.map((l) => {
    const d = datos.get(String(l.product_id))
    const g = renglonGuardado(reglas, { product_id: l.product_id, size_id: l.size_id, lista: d?.lista ?? null, costo: d?.costo ?? null }, l.precio)
    return { ...l, tipo: g.tipo, base: g.base, promo: promoDe(reglas, l.product_id, d?.categoria ?? null) }
  })
  const packs = {}
  for (const [id, d] of datos) {
    const pack = packDe(reglas, id, d.variantes)
    if (!pack) continue
    const enPack = conTipo.filter((l) => String(l.product_id) === id && l.tipo === 'pack')
    const en = enPack.length ? packsEnRenglones(pack, enPack) : 0
    if (en != null) packs[id] = { ...pack, enPedido: en }
  }
  return { lineas: conTipo, tienda: { escala: reglas.escala, promos: (reglas.promos || []).map((x) => ({ id: x.id, pct: x.pct, desde: x.desde })), packs } }
}

/**
 * La ficha con una conexión ya abierta: la usa la hoja y, después de un cambio o del envío, la misma acción (Darío 18-nov:
 * guardar el envío tardaba ~5 s porque, al terminar, la hoja volvía a pedirse con otra conexión).
 * @param {import('pg').ClientBase} pg @param {string} pedidoId @param {boolean} escribir
 */
async function fichaConConexion(pg, pedidoId, escribir, { reglas = null, precioManual = false } = {}) {
  {
    const { fichaDePedidoMayorista } = await import('../motor/pedido/venta.mjs')
    const r = await fichaDePedidoMayorista(pg, { pedido_id: pedidoId })
    if (!r.ok) return { status: r.error?.codigo === 'NO_ENCONTRADO' ? 404 : 400, error: r.error?.mensaje ?? 'No se pudo leer el pedido.' }
    const n = await nombresDe(pg, r.lineas)
    const { esFichaSinCliente } = await import('../motor/venta/cliente.mjs')
    // Para el total en el momento (Darío 18-nov): el mismo redondeo que aplica el cambio al guardar.
    const { redondeoDe } = await import('../motor/venta/redondeo-db.mjs')
    const redondeo = await redondeoDe(pg, { marca: r.pedido.marca ?? 'bdi', canal: 'mayorista' }).catch(() => null)
    const conNombre = r.lineas.map((l) => ({ ...l, nombre: n.producto.get(String(l.product_id)) ?? null, talle: l.size_id == null ? null : n.talle.get(`${l.product_id}:${l.size_id}`) ?? null }))
    const t = await tiendaDeLaFicha(pg, r.pedido.marca ?? 'bdi', conNombre, reglas).catch((e) => { console.warn('[erp-pedido] tienda de la hoja:', e?.message); return { lineas: conNombre, tienda: null } })
    return {
      prendido: true, escribir, precioManual, redondeo: redondeo ? { paso: Number(redondeo.paso), modo: redondeo.modo } : null, pedido: { ...r.pedido, falta_cliente: esFichaSinCliente(r.pedido.cliente_id) }, cambios: r.cambios,
      lineas: t.lineas, tienda: t.tienda,
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
  const reglas = leerReglas(deps)
  return deps.conMotor('bdi', 'Buscar el producto', async (pg) => {
    const { productosParaPedido } = await import('../motor/pedido/venta.mjs')
    const r = await productosParaPedido(pg, { pedido_id: String(pedidoId), q: texto })
    if (!r.ok) return { status: r.error?.codigo === 'NO_ENCONTRADO' ? 404 : 400, error: r.error?.mensaje ?? 'No se pudo buscar.' }
    const R = await reglas
    if (!R || !r.productos.length) return { prendido: true, productos: r.productos, tienda: !!R }
    // Con los precios de la tienda (Darío 18-nov): cada talle con su precio y qué es; el pack, si tiene.
    const datos = await datosDeProductos(pg, 'bdi', r.productos.map((p) => p.product_id))
    return {
      prendido: true, tienda: true,
      productos: r.productos.map((p) => {
        const d = datos.get(String(p.product_id))
        const variantes = p.variantes.map((v) => ({ ...v, ...precioDeTienda(R, { product_id: p.product_id, size_id: v.size_id, lista: p.precio, costo: d?.costo ?? null }) }))
        return { ...p, variantes, pack: packDe(R, p.product_id, p.variantes), soloPack: soloPack(R, p.product_id), promo: promoDe(R, p.product_id, d?.categoria ?? null) }
      }),
    }
  })
}

/** El código del motor ⇒ el status de la puerta. */
const statusDe = (codigo) => (codigo === 'NO_ENCONTRADO' ? 404
  : ['ANULADO', 'VENDIDO_EN_GN', 'EN_PREPARACION', 'SIN_ENTRAR', 'FALTA_CLIENTE', 'TIENE_PAGOS', 'SIN_PRECIO', 'SIN_TALLE', 'SIN_RENGLONES', 'CAMBIO_DE_LLAVE', 'SIN_CUENTA_CORRIENTE', 'CONFLICTO_IDEMPOTENCIA'].includes(codigo) ? 409 : 400)

/** Darío (admin): el único que pone precio a mano en el pedido (18-nov: «solo yo, soy el único que usa el CRM»). */
export function esDario(perfil) {
  const n = String(perfil?.name || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
  return !!perfil?.admin && n === 'DARIO AREVALO'
}

export const ACCIONES_PEDIDO = ['pedido-entrar', 'pedido-cambiar', 'pedido-a-preparar', 'pedido-anular', 'pedido-envio']

/**
 * Entrar al ERP, cambiar, mandar a preparar, anular y poner el ENVÍO. Doble llave: el panel Y `VENTA_MAYORISTA_REAL`.
 * `pedido-envio` (Darío 15-nov, sql/084): `{ pedidoId, envio, transporte? }` — el envío que paga el cliente en origen (EM) se suma al
 * total; `envio` vacío o 0 lo saca. 🔴 Con el pedido FACTURADO (entera o alguna parte) ⛔: cambiaría el total de una venta ya
 * facturada. Eso lo ve esta puerta (las facturas viven en `facturas`, ⛔ en el motor).
 * @param {{ accion: string, body: any, usuario: string|null, quien?: any }} p
 * `pedido-cambiar` (Darío 18-nov): `{ lineas: [{ productId, sizeId, cantidad, precio? }], packs?: [{ productId, packs }] }` — el
 * precio de cada renglón lo pone `preciosDelCambio` con las reglas de la tienda; `precio` sólo en uno NUEVO y sólo Darío.
 * @param {{ conMotor: Function, prendido?: boolean, escribir?: boolean, puedeAnular?: boolean, precioManual?: boolean, reglas?: (fresco: boolean) => Promise<any>, anotarPacks?: (id: string, delta: number) => Promise<boolean>, facturacion?: (ventaId: string, total: number) => Promise<{ entera: any, partes: number }|null> }} deps
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
    const avisos = []
    if (accion === 'pedido-entrar') {
      if (!UUID.test(String(body.clienteId || ''))) return { status: 400, error: 'Falta el cliente' }
      r = await pv.entrarPedidoMayorista(pg, { pedido_id, cliente_id: String(body.clienteId), persona_id: UUID.test(String(body.personaId || '')) ? String(body.personaId) : null, usuario })
    } else if (accion === 'pedido-cambiar') {
      if (!Array.isArray(body.lineas)) return { status: 400, error: 'Faltan los renglones' }
      // Los precios los decide ESTA puerta con las reglas de la tienda, recién leídas (Darío 18-nov): ⛔ el navegador.
      const R = await leerReglas(deps, true)
      if (!R) return { status: 503, error: 'No pude leer los precios de la tienda. Probá de nuevo en un minuto.' }
      const actual = await pv.fichaDePedidoMayorista(pg, { pedido_id })
      if (!actual.ok) return { status: statusDe(actual.error?.codigo), error: actual.error?.mensaje ?? 'No se pudo leer el pedido.' }
      const ids = [...actual.lineas, ...body.lineas.map((l) => ({ product_id: l?.productId })), ...(Array.isArray(body.packs) ? body.packs.map((x) => ({ product_id: x?.productId })) : [])]
        .map((l) => Number(l.product_id)).filter((x) => Number.isSafeInteger(x) && x > 0)
      const datos = await datosDeProductos(pg, actual.pedido.marca ?? 'bdi', ids)
      const c = preciosDelCambio({ actuales: actual.lineas, lineas: body.lineas, packs: body.packs, reglas: R, datos, precioManual: !!deps.precioManual })
      if (c.status) return c
      r = await pv.cambiarPedidoMayorista(pg, { pedido_id, lineas: c.pedidas, usuario })
      if (r.ok && !r.sin_cambios) {
        const anotar = deps.anotarPacks || (async (id, d) => (await import('./_tienda-precios.js')).anotarPacksEnTienda(id, d))
        for (const [id, d] of c.deltaPacks) if (!(await anotar(id, d))) avisos.push('El pack no se pudo descontar de la tienda: corregilo en Marketing › Lotes.')
      }
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
        const f = await fichaConConexion(pg, pedido_id, true, { reglas: await leerReglas(deps), precioManual: !!deps.precioManual })
        if (!f.status) ficha = f
      } catch (e) {
        console.warn('[erp-pedido] la hoja después del cambio:', e?.message)
      }
    }
    return { ok: true, ya: !!r.ya, sinCambios: !!r.sin_cambios, avisarDeposito: !!r.avisar_deposito, ventaId: r.venta_id ?? null, ...(avisos.length ? { avisos } : {}), ...(ficha ? { ficha } : {}) }
  })
}

/**
 * Los PRECIOS de un cambio del pedido, como en la tienda (Darío 18-nov). Puro (la puerta le pasa reglas y datos).
 *   - Lo que ya estaba: su precio guardado (`renglonGuardado`); si es regular, se recalcula el descuento por monto.
 *   - Lo nuevo: el precio de la tienda; con `precio`, el precio a mano (sólo Darío, sólo en lo nuevo).
 *   - `packs`: [{ productId, packs }] = cuántos packs en total de ese diseño; se arman con su cantidad por modelo.
 *   - El descuento por monto, sobre TODO el pedido (lo regular), aparece o se va según el subtotal.
 * @param {{ actuales: Array<{ product_id: number|string, size_id: number|string|null, cantidad: number, precio: number }>, lineas: any[], packs?: Array<{ productId: number|string, packs: number }>, reglas: any, datos: Map<string, any>, precioManual?: boolean }} p
 * @returns {{ status: number, error: string } | { pedidas: Array<{ product_id: number, size_id: number, cantidad: number, precio: number }>, deltaPacks: Array<[string, number]>, cuenta: any }}
 */
export function preciosDelCambio({ actuales, lineas, packs = [], reglas: R, datos, precioManual = false }) {
  const k = (pid, sid) => `${Number(pid)}:${Number(sid)}`
  const info = (pid) => datos.get(String(pid)) ?? { lista: null, costo: null, categoria: null, variantes: [] }
  const promo = (pid) => promoDe(R, pid, info(pid).categoria ?? null)
  const guardados = new Map(actuales.map((l) => {
    const d = info(l.product_id)
    return [k(l.product_id, l.size_id), { ...renglonGuardado(R, { product_id: l.product_id, size_id: l.size_id, lista: d.lista, costo: d.costo }, l.precio), product_id: Number(l.product_id), cantidad: Number(l.cantidad) }]
  }))
  const packsAntes = new Map()
  const renglones = []
  const deltaPacks = []
  const conPack = new Set()
  for (const x of Array.isArray(packs) ? packs : []) {
    const pid = String(Number(x?.productId))
    const n = Number(x?.packs)
    if (!Number.isInteger(n) || n < 0) return { status: 400, error: 'La cantidad de packs es un número entero' }
    const pack = packDe(R, pid, info(pid).variantes)
    if (!pack) return { status: 409, error: 'Ese producto no se vende en pack.' }
    const delDiseno = actuales.filter((l) => String(l.product_id) === pid)
    const enPack = delDiseno.filter((l) => guardados.get(k(l.product_id, l.size_id)).tipo === 'pack')
    if (delDiseno.length > enPack.length && n > 0) return { status: 409, error: 'Ese diseño ya está suelto en el pedido.' }
    const antes = enPack.length ? packsEnRenglones(pack, enPack) ?? 0 : 0
    if (pack.quedan != null && n - antes > pack.quedan) return { status: 409, error: pack.quedan ? `Quedan ${pack.quedan} packs.` : 'No quedan packs.' }
    packsAntes.set(pid, antes)
    conPack.add(pid)
    for (const m of pack.modelos) if (n > 0) renglones.push({ product_id: Number(pid), size_id: m.size_id, cantidad: m.cantidad * n, base: pack.precio, tipo: 'pack' })
    if (n !== antes && pack.quedan != null) deltaPacks.push([pid, n - antes])
  }
  const vistas = new Set(renglones.map((r) => k(r.product_id, r.size_id)))
  for (const l of lineas) {
    const pid = Number(l?.productId), sid = Number(l?.sizeId), cantidad = Number(l?.cantidad)
    if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(sid) || sid <= 0) return { status: 400, error: 'Un renglón sin producto o sin talle' }
    if (!Number.isInteger(cantidad) || cantidad < 0) return { status: 400, error: 'La cantidad es un número entero' }
    if (conPack.has(String(pid))) return { status: 409, error: 'Ese diseño va en pack: se cambia por packs.' }
    const clave = k(pid, sid)
    if (vistas.has(clave)) return { status: 400, error: 'Un talle aparece dos veces' }
    vistas.add(clave)
    if (cantidad === 0) continue
    const g = guardados.get(clave)
    const aMano = l?.precio == null || l.precio === '' ? null : Number(l.precio)
    if (g) {
      if (aMano != null) return { status: 400, error: 'El precio a mano va sólo en lo que se agrega.' }
      renglones.push({ product_id: pid, size_id: sid, cantidad, base: g.base, tipo: g.tipo, promo: promo(pid) })
      continue
    }
    if (aMano != null) {
      if (!precioManual) return { status: 403, error: 'El precio a mano es sólo de Darío.' }
      if (!(Number.isFinite(aMano) && aMano > 0)) return { status: 400, error: 'El precio es un monto mayor a 0' }
      renglones.push({ product_id: pid, size_id: sid, cantidad, base: aMano, tipo: 'fijo' })
      continue
    }
    const enPackYa = actuales.some((a) => Number(a.product_id) === pid && guardados.get(k(a.product_id, a.size_id)).tipo === 'pack')
    if (enPackYa && packDe(R, pid, info(pid).variantes)) return { status: 409, error: 'Ese diseño va en pack en el pedido.' }
    const d = info(pid)
    const t = precioDeTienda(R, { product_id: pid, size_id: sid, lista: d.lista, costo: d.costo })
    if (t.precio == null) return { status: 409, error: `El producto ${pid} no tiene precio mayorista cargado` }
    if (t.tipo === 'pack' && packDe(R, pid, d.variantes)) return { status: 409, error: 'Ese diseño se vende sólo en pack.' }
    renglones.push({ product_id: pid, size_id: sid, cantidad, base: t.precio, tipo: t.tipo, promo: promo(pid) })
  }
  if (!renglones.length) return { status: 409, error: 'El pedido quedaría vacío: para eso se anula' }
  const cuenta = cuentaDelPedido(R, renglones)
  return { pedidas: cuenta.lineas.map((r) => ({ product_id: r.product_id, size_id: r.size_id, cantidad: r.cantidad, precio: r.precio })), deltaPacks, cuenta }
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
