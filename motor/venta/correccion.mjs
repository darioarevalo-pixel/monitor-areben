/**
 * CORREGIR EL PRECIO de una venta ya hecha, CASO 1: sin mover plata (sql/036; Bruno 24-oct). La venta, sus líneas y sus
 * pagos ⛔ se editan: la corrección es una fila inmutable con el precio antes/después de cada línea, el motivo y quién.
 * El total nuevo = el vigente + la diferencia de importes de las líneas corregidas (el descuento por forma de pago ⛔ se
 * recalcula). Se compara con lo COBRADO y la diferencia queda guardada y visible, para resolverla a mano. Si la venta está A CUENTA,
 * la diferencia va a la cuenta corriente (25-nov).
 * Con factura (`venta_factura`) ⇒ `FACTURADA`. Quién puede (el interruptor `precio`) lo decide el monitor, ⛔ el motor.
 *
 * `db` conectado y sin transacción. Devuelven `{ ok: true, … }` o `{ ok: false, error: { codigo, mensaje, campo? } }`.
 */
import { randomUUID } from 'node:crypto'
import { movimientoDe, mueveStock } from './armar.mjs'
import { costosDe } from './costo.mjs'
import { guardarAjuste } from '../stock/ajuste.mjs'

const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const UUID = /^[0-9a-f-]{36}$/i
const pesos = (n) => Math.round(Number(n) * 100) / 100
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
/** ¿La base tiene esa tabla? (una base sin la 017 o la 025 ⛔ tiene pedidos ni cuenta corriente: ⛔ se consulta, rompería la transacción). */
const hay = async (db, tabla) => (await q(db, 'select to_regclass($1) is not null as hay', [tabla]))[0]?.hay === true

/** El precio y el importe VIGENTES de cada línea (el de la última corrección, o el original). */
async function vigentes(db, ventaId) {
  return q(db, `select l.id::text as id, l.n, l.cantidad, l.sku,
      coalesce(c.precio_despues, l.precio)::float as precio, coalesce(c.importe_despues, l.importe)::float as importe
    from venta_linea l
    left join lateral (select cl.precio_despues, cl.importe_despues from venta_correccion_linea cl
      join venta_correccion k on k.id = cl.correccion_id where cl.venta_linea_id = l.id order by k.creada_en desc, k.id desc limit 1) c on true
    where l.venta_id = $1 order by l.n`, [ventaId])
}

/**
 * @param {{ venta_id: string, motivo: string, usuario: string, lineas: { n?: number, linea_id?: string, precio: number }[] }} e
 *   Cada línea se nombra por `n` (el renglón de la venta) o por `linea_id`; `precio` es el UNITARIO nuevo.
 */
export async function corregirPrecio(db, e) {
  if (!UUID.test(String(e?.venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const motivo = texto(e.motivo)
  if (!motivo) return falla('ENTRADA_INVALIDA', 'Falta el motivo', 'motivo')
  const usuario = texto(e.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién corrige', 'usuario')
  if (!Array.isArray(e.lineas) || !e.lineas.length) return falla('ENTRADA_INVALIDA', 'No hay líneas que corregir', 'lineas')
  const pedidas = []
  for (const [i, l] of e.lineas.entries()) {
    const precio = Number(l?.precio)
    if (!Number.isFinite(precio) || precio < 0) return falla('ENTRADA_INVALIDA', 'El precio es un número desde 0', `lineas[${i}].precio`)
    if (!Number.isInteger(l?.n) && !UUID.test(String(l?.linea_id ?? ''))) return falla('ENTRADA_INVALIDA', 'Falta cuál línea (n o linea_id)', `lineas[${i}]`)
    pedidas.push({ n: l.n, linea_id: l.linea_id, precio: pesos(precio) })
  }
  await db.query('begin')
  try {
    const r = await dentro(db, e, motivo, usuario, pedidas)
    await db.query(r.ok ? 'commit' : 'rollback')
    return r
  } catch (x) {
    await db.query('rollback').catch(() => {})
    throw x
  }
}

async function dentro(db, e, motivo, usuario, pedidas) {
  const [v] = await q(db, 'select id, empresa_id, marca, numero, tipo, estado, total::float as total, prueba from venta where id = $1 for update', [e.venta_id])
  if (!v) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  if (v.estado === 'anulada') return falla('ANULADA', `La venta ${v.numero} está anulada`)
  if (v.tipo !== 'venta') return falla('ES_CAMBIO', `La ${v.numero} es un cambio: el precio se corrige en la venta original`)
  const [f] = await q(db, 'select 1 from venta_factura where venta_id = $1 limit 1', [v.id])
  if (f) return falla('FACTURADA', `La venta ${v.numero} ya tiene factura: el precio se corrige con una nota de crédito`)
  const [c] = await q(db, `select exists (select 1 from venta where venta_original_id = $1 and estado = 'confirmada') as hay`, [v.id])
  if (c.hay) return falla('CON_CAMBIO', `La venta ${v.numero} ya tuvo un cambio: el precio ya no se corrige acá`)
  const lineas = await vigentes(db, v.id)
  const vistas = new Set()
  const filas = []
  for (const [i, p] of pedidas.entries()) {
    const l = lineas.find((x) => (p.linea_id ? x.id === String(p.linea_id).toLowerCase() : x.n === p.n))
    if (!l) return falla('NO_ENCONTRADA', 'Esa línea no es de la venta', `lineas[${i}]`)
    if (vistas.has(l.id)) return falla('ENTRADA_INVALIDA', 'La misma línea dos veces', `lineas[${i}]`)
    vistas.add(l.id)
    if (pesos(l.precio) === p.precio) continue   // ⛔ fila de un «cambio» que deja todo igual
    filas.push({ id: l.id, precio_antes: pesos(l.precio), precio_despues: p.precio, importe_antes: pesos(l.importe),
      importe_despues: pesos(l.importe + (p.precio - l.precio) * l.cantidad) })
  }
  if (!filas.length) return falla('SIN_CAMBIO', 'Los precios ya son esos')
  const [ult] = await q(db, 'select total_despues::float as t from venta_correccion where venta_id = $1 order by creada_en desc, id desc limit 1', [v.id])
  const totalAntes = pesos(ult ? ult.t : v.total)
  const totalDespues = pesos(totalAntes + filas.reduce((s, x) => s + x.importe_despues - x.importe_antes, 0))
  if (totalDespues < 0) return falla('ENTRADA_INVALIDA', 'El total no puede quedar en negativo', 'lineas')
  const [{ cobrado: pagado }] = await q(db, 'select coalesce(sum(monto), 0)::float as cobrado from venta_pago where venta_id = $1', [v.id])
  // A CUENTA (Darío 25-nov, pedido M-124 de Fabio): la diferencia la toma la cuenta corriente, como al cambiar un pedido
  // (`cambiarPedido`) ⇒ lo «cobrado» acompaña al total y ⛔ queda diferencia suelta. Sin esto la venta decía un total y la cuenta otro.
  const compra = await compraACuenta(db, v)
  const cobrado = compra ? pesos(pagado + totalDespues - totalAntes) : pesos(pagado)
  const diferencia = compra ? 0 : pesos(totalDespues - pagado)
  const [k] = await q(db, `insert into venta_correccion (empresa_id, marca, venta_id, motivo, total_antes, total_despues, cobrado, diferencia, prueba, usuario)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id::text, creada_en`,
  [v.empresa_id, v.marca, v.id, motivo, totalAntes, totalDespues, cobrado, diferencia, v.prueba, usuario])
  for (const x of filas) {
    await q(db, `insert into venta_correccion_linea (correccion_id, venta_linea_id, precio_antes, precio_despues, importe_antes, importe_despues)
      values ($1, $2, $3, $4, $5, $6)`, [k.id, x.id, x.precio_antes, x.precio_despues, x.importe_antes, x.importe_despues])
  }
  const cuenta = compra ? await precioACuenta(db, v, compra, usuario) : []
  await precioAlPedido(db, v, filas, totalDespues, usuario)
  return { ok: true, correccion: { id: k.id, venta_id: v.id, numero: Number(v.numero), total_antes: totalAntes, total_despues: totalDespues,
    cobrado, diferencia, motivo, usuario, creada_en: k.creada_en, lineas: filas, cuenta } }
}

/**
 * El PEDIDO MAYORISTA de la venta toma los precios corregidos y el total (Darío 25-nov, M-124): si ⛔, el panel muestra lo viejo y
 * el próximo cambio del pedido PISA la corrección (el cambio arma la venta desde los renglones del pedido). Sin pedido, nada.
 * Queda en el historial del pedido como `edicion`. Dentro de la transacción del que llama.
 */
async function precioAlPedido(db, v, filas, totalDespues, usuario) {
  if (!await hay(db, 'pedido_mayorista')) return
  const [p] = await q(db, `select id::text, empresa_id, total::float as total, unidades, lineas from pedido_mayorista
    where venta_id = $1 and anulado_en is null for update`, [v.id])
  if (!p || !Array.isArray(p.lineas)) return
  const delas = await q(db, 'select id::text, product_id, size_id from venta_linea where id = any($1::uuid[])', [filas.map((x) => x.id)])
  const nuevo = new Map()
  for (const x of filas) {
    const l = delas.find((d) => d.id === x.id)
    if (l) nuevo.set(`${Number(l.product_id)}:${Number(l.size_id)}`, x.precio_despues)
  }
  const lineas = p.lineas.map((l) => {
    const precio = nuevo.get(`${Number(l.product_id)}:${Number(l.size_id)}`)
    return precio == null ? l : { ...l, precio }
  })
  const totalCatalogo = pesos(lineas.reduce((s, l) => s + Number(l.precio) * Number(l.cantidad), 0))
  await q(db, 'update pedido_mayorista set lineas = $2::jsonb, total = $3, total_catalogo = $4, editado_en = now() where id = $1',
    [p.id, JSON.stringify(lineas), totalDespues, totalCatalogo])
  await q(db, `insert into pedido_mayorista_cambio (empresa_id, pedido_id, motivo, antes, despues, usuario) values ($1, $2, 'edicion', $3::jsonb, $4::jsonb, $5)`,
    [p.empresa_id, p.id, JSON.stringify({ total: p.total, unidades: Number(p.unidades), lineas: p.lineas }),
      JSON.stringify({ total: totalDespues, unidades: Number(p.unidades), lineas, de: 'corregir-precio' }), usuario])
}

/** La compra de la venta en la cuenta corriente (la mayorista y la que dejó algo a cuenta), o null. */
async function compraACuenta(db, v) {
  if (!await hay(db, 'cuenta_movimiento')) return null
  const [compra] = await q(db, `select cliente_id::text, marca, empresa_id, prueba from cuenta_movimiento where empresa_id = $1 and ref = $2 and tipo = 'compra'`,
    [v.empresa_id, `venta:${v.id}`])
  return compra ?? null
}

/**
 * Pasa a la cuenta corriente cada corrección de PRECIO de la venta que todavía ⛔ está ahí (la de recién y las de antes de este
 * arreglo, que no la movían). Una fila `correccion` por corrección, con la misma ref que usa `cambiarPedido` ⇒ ⛔ se duplica.
 * Dentro de la transacción del que llama. Devuelve lo que cargó: `[{ correccion, monto }]`.
 */
async function precioACuenta(db, v, compra, usuario) {
  const faltan = await q(db, `select k.id::text, k.motivo, (k.total_despues - k.total_antes)::float as monto from venta_correccion k
    where k.venta_id = $1 and coalesce(to_jsonb(k)->>'tipo', 'precio') = 'precio' and k.total_despues <> k.total_antes
      and not exists (select 1 from cuenta_movimiento m where m.empresa_id = $2 and m.ref = 'venta:' || $1::text || ':correccion:' || k.id::text)
    order by k.creada_en, k.id`, [v.id, v.empresa_id])
  for (const f of faltan) {
    await q(db, `insert into cuenta_movimiento (empresa_id, marca, cliente_id, tipo, ref, monto, venta_id, detalle, prueba, usuario, ocurrida_en)
      values ($1, $2, $3, 'correccion', $4, $5, $6, $7::jsonb, $8, $9, now())`,
    [compra.empresa_id, compra.marca, compra.cliente_id, `venta:${v.id}:correccion:${f.id}`, pesos(f.monto), v.id,
      JSON.stringify({ correccion: f.id, motivo: f.motivo, de: 'precio' }), compra.prueba, usuario])
  }
  return faltan.map((f) => ({ correccion: f.id, monto: pesos(f.monto) }))
}

/**
 * Pone al día la cuenta corriente y el pedido del panel con las correcciones de precio de UNA venta que no los movieron (las de
 * antes del 25-nov).
 * Sin venta a cuenta ⇒ `NO_A_CUENTA`. ⛔ Duplica: la ref de cada fila es la de su corrección.
 */
export async function precioPendienteACuenta(db, { venta_id, usuario }) {
  if (!UUID.test(String(venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const quien = texto(usuario)
  if (!quien) return falla('ENTRADA_INVALIDA', 'Falta quién', 'usuario')
  await db.query('begin')
  try {
    const [v] = await q(db, 'select id::text, empresa_id, numero, estado from venta where id = $1 for update', [venta_id])
    if (!v) { await db.query('rollback'); return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id') }
    const compra = await compraACuenta(db, v)
    if (!compra) { await db.query('rollback'); return falla('NO_A_CUENTA', `La venta ${v.numero} no está a cuenta`) }
    const cargado = await precioACuenta(db, v, compra, quien)
    // Y el pedido del panel, con lo último de cada renglón corregido (de la más vieja a la más nueva: gana la última).
    const filas = await q(db, `select cl.venta_linea_id::text as id, cl.precio_despues::float as precio_despues from venta_correccion_linea cl
      join venta_correccion k on k.id = cl.correccion_id where k.venta_id = $1 and coalesce(to_jsonb(k)->>'tipo', 'precio') = 'precio'
      order by k.creada_en, k.id`, [v.id])
    const [ult] = await q(db, 'select total_despues::float as t from venta_correccion where venta_id = $1 order by creada_en desc, id desc limit 1', [v.id])
    if (filas.length && ult) await precioAlPedido(db, v, filas, pesos(ult.t), quien)
    await db.query('commit')
    return { ok: true, cargado }
  } catch (x) {
    await db.query('rollback').catch(() => {})
    throw x
  }
}

/** Las correcciones de una venta (de la más vieja a la más nueva) y su estado vigente: total, cobrado y lo que falta resolver. */
export async function correccionesDe(db, { venta_id }) {
  if (!UUID.test(String(venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const [v] = await q(db, 'select total::float as total from venta where id = $1', [venta_id])
  if (!v) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const correcciones = await q(db, `select k.id::text, coalesce(to_jsonb(k)->>'tipo', 'precio') as tipo, k.motivo, k.usuario, k.creada_en, k.total_antes::float, k.total_despues::float, k.cobrado::float, k.diferencia::float,
      (select coalesce(json_agg(json_build_object('n', l.n, 'precio_antes', cl.precio_antes::float, 'precio_despues', cl.precio_despues::float) order by l.n), '[]')
        from venta_correccion_linea cl join venta_linea l on l.id = cl.venta_linea_id where cl.correccion_id = k.id) as lineas
    from venta_correccion k where k.venta_id = $1 order by k.creada_en, k.id`, [venta_id])
  for (const k of correcciones) if (k.tipo === 'productos') k.renglones = await renglonesDe(db, k.id)
  const [{ cobrado }] = await q(db, 'select coalesce(sum(monto), 0)::float as cobrado from venta_pago where venta_id = $1', [venta_id])
  const total = correcciones.length ? correcciones.at(-1).total_despues : v.total
  // A CUENTA (25-nov): lo que falta lo tiene la cuenta corriente ⇒ ⛔ «faltan cobrar» en la ficha.
  const [a] = await hay(db, 'cuenta_movimiento') ? await q(db, `select 1 from cuenta_movimiento where ref = $1 and tipo = 'compra' limit 1`, [`venta:${venta_id}`]) : []
  if (a) return { ok: true, correcciones, total, cobrado: pesos(total), diferencia: 0, aCuenta: true }
  return { ok: true, correcciones, total, cobrado: pesos(cobrado), diferencia: pesos(total - cobrado) }
}

/**
 * CORREGIR LOS PRODUCTOS de una venta ya hecha, CON EL MISMO NÚMERO (sql/088; Bruno 16/18-nov, la #33748 de BDI cargada con
 * TEMPLADO 9D en vez de 9D PREMIUM). La venta y sus líneas ⛔ se editan: se AGREGAN líneas —
 *   · `sacar: [{ linea_id, cantidad }]` ⇒ una línea NEGATIVA que apunta a la original (`linea_origen_id`), al precio vigente;
 *   · `agregar: [{ product_id, size_id, cantidad, precio }]` ⇒ una línea nueva (precio UNITARIO).
 * Cada una con su movimiento del libro en el DEPÓSITO DE LA VENTA (`movimientoDe`, la misma clave que cualquier línea) ⇒ lo
 * que se saca vuelve al estante, lo que se agrega sale, y las reglas de la noche cierran igual. Una venta de prueba ⛔ mueve.
 * El total nuevo se compara con lo COBRADO y la diferencia queda guardada y a la vista (como `corregirPrecio`: ⛔ mueve plata).
 * Frena lo mismo que el precio (anulada, cambio, factura, ya cambiada) y además: la de TN/ML (se corrige en su plataforma),
 * la mayorista y la que dejó algo a cuenta (fase 2: la cuenta corriente), y la de GN (su stock lo movió GN).
 * `ref` (opcional): la misma en la misma venta devuelve la misma corrección (el «Guardar» dos veces).
 * @param {import('pg').ClientBase} db
 * @param {{ venta_id: string, motivo: string, usuario: string, ref?: string,
 *   sacar?: { linea_id: string, cantidad: number }[], agregar?: { product_id: number, size_id: number, cantidad: number, precio: number }[] }} e
 */
export async function corregirProductos(db, e) {
  if (!UUID.test(String(e?.venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const motivo = texto(e.motivo)
  if (!motivo) return falla('ENTRADA_INVALIDA', 'Falta el motivo', 'motivo')
  const usuario = texto(e.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién corrige', 'usuario')
  const ref = e.ref == null ? null : texto(String(e.ref))
  const sacar = Array.isArray(e.sacar) ? e.sacar : []
  const agregar = Array.isArray(e.agregar) ? e.agregar : []
  if (!sacar.length && !agregar.length) return falla('SIN_CAMBIO', 'No hay nada que sacar ni agregar')
  for (const [i, s] of sacar.entries()) {
    if (!UUID.test(String(s?.linea_id ?? ''))) return falla('ENTRADA_INVALIDA', 'Falta cuál línea', `sacar[${i}].linea_id`)
    if (!(Number.isInteger(s.cantidad) && s.cantidad > 0)) return falla('ENTRADA_INVALIDA', 'La cantidad es un entero mayor que 0', `sacar[${i}].cantidad`)
  }
  for (const [i, a] of agregar.entries()) {
    if (!(Number.isSafeInteger(a?.product_id) && a.product_id > 0 && Number.isSafeInteger(a?.size_id) && a.size_id >= 0)) return falla('ENTRADA_INVALIDA', 'Falta el producto', `agregar[${i}]`)
    if (!(Number.isInteger(a.cantidad) && a.cantidad > 0)) return falla('ENTRADA_INVALIDA', 'La cantidad es un entero mayor que 0', `agregar[${i}].cantidad`)
    const precio = Number(a.precio)
    if (!Number.isFinite(precio) || precio < 0) return falla('ENTRADA_INVALIDA', 'El precio es un número desde 0', `agregar[${i}].precio`)
  }
  await db.query('begin')
  try {
    const r = await productosDentro(db, { venta_id: e.venta_id, motivo, usuario, ref, sacar, agregar })
    await db.query(r.ok ? 'commit' : 'rollback')
    return r
  } catch (x) {
    await db.query('rollback').catch(() => {})
    throw x
  }
}

async function productosDentro(db, { venta_id, motivo, usuario, ref, sacar, agregar }) {
  const [v] = await q(db, 'select * from venta where id = $1 for update', [venta_id])
  if (!v) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  if (ref) {
    const [ya] = await q(db, 'select id::text from venta_correccion where venta_id = $1 and ref = $2', [v.id, ref])
    if (ya) return { ok: true, ya_existia: true, correccion: await unaCorreccion(db, ya.id) }
  }
  if (v.estado === 'anulada') return falla('ANULADA', `La venta ${v.numero} está anulada`)
  if (v.tipo !== 'venta') return falla('ES_CAMBIO', `La ${v.numero} es un cambio: se corrige la venta original`)
  const [f] = await q(db, 'select 1 from venta_factura where venta_id = $1 limit 1', [v.id])
  if (f) return falla('FACTURADA', `La venta ${v.numero} ya tiene factura: se corrige con una nota de crédito`)
  const [c] = await q(db, `select exists (select 1 from venta where venta_original_id = $1 and estado = 'confirmada') as hay`, [v.id])
  if (c.hay) return falla('CON_CAMBIO', `La venta ${v.numero} ya tuvo un cambio: los productos ya no se corrigen acá`)
  if (v.origen === 'tn' || v.origen === 'ml') return falla('DE_LA_TIENDA', `La venta ${v.numero} es de ${v.origen === 'tn' ? 'Tienda Nube' : 'Mercado Libre'}: se corrige el pedido allá`)
  if (v.origen === 'mayorista') return falla('ES_MAYORISTA', `La venta ${v.numero} es mayorista: el pedido se cambia desde el panel`)
  const [cta] = await q(db, `select exists (select 1 from cuenta_movimiento where ref = $1) as hay`, [`venta:${v.id}`]).catch(() => [{ hay: false }])
  if (cta.hay) return falla('A_CUENTA', `La venta ${v.numero} dejó algo a cuenta: todavía no se corrige acá`)
  if (!v.prueba && !mueveStock(v)) return falla('NO_MUEVE_STOCK', `El stock de la venta ${v.numero} lo movió Gestión Nube: no se corrige acá`)

  const lineas = await q(db, `select l.id::text as id, l.n, l.product_id::text, l.size_id::text, l.sku, l.barcode, l.cantidad, l.costo_unitario::float, l.costo_fuente,
      coalesce(c.precio_despues, l.precio)::float as precio, coalesce(c.importe_despues, l.importe)::float as importe,
      coalesce((select -sum(d.cantidad) from venta_linea d join venta x on x.id = d.venta_id
        where d.linea_origen_id = l.id and x.estado = 'confirmada'), 0)::int as sacado
    from venta_linea l
    left join lateral (select cl.precio_despues, cl.importe_despues from venta_correccion_linea cl join venta_correccion k on k.id = cl.correccion_id
      where cl.venta_linea_id = l.id order by k.creada_en desc, k.id desc limit 1) c on true
    where l.venta_id = $1 order by l.n`, [v.id])
  const nuevas = []
  const pedidoPorLinea = new Map()
  for (const [i, s] of sacar.entries()) {
    const l = lineas.find((x) => x.id === String(s.linea_id).toLowerCase())
    if (!l || l.cantidad <= 0) return falla('NO_ENCONTRADA', 'Esa línea no es de la venta', `sacar[${i}].linea_id`)
    const ya = (pedidoPorLinea.get(l.id) || 0) + s.cantidad
    if (ya + l.sacado > l.cantidad) return falla('DE_MAS', `De ${l.sku || 'esa línea'} quedan ${l.cantidad - l.sacado - (ya - s.cantidad)}`, `sacar[${i}].cantidad`)
    pedidoPorLinea.set(l.id, ya)
    const unitario = pesos(l.importe / l.cantidad)
    nuevas.push({ product_id: Number(l.product_id), size_id: Number(l.size_id), sku: l.sku, barcode: l.barcode, cantidad: -s.cantidad,
      precio: pesos(l.precio), importe: -pesos(unitario * s.cantidad), linea_origen_id: l.id, costo_unitario: l.costo_unitario, costo_fuente: l.costo_fuente })
  }
  if (agregar.length) {
    const vars = await q(db, `select va.product_id::text, va.size_id::text, va.sku, va.barcode from variante va join producto p on p.empresa_id = va.empresa_id and p.id = va.product_id
      where va.empresa_id = $1 and p.marca = $2 and (va.product_id, va.size_id) in (select * from unnest($3::bigint[], $4::bigint[]))`,
    [v.empresa_id, v.marca, agregar.map((a) => a.product_id), agregar.map((a) => a.size_id)])
    const costos = await costosDe(db, [...new Set(agregar.map((a) => a.product_id))])
    for (const [i, a] of agregar.entries()) {
      const va = vars.find((x) => x.product_id === String(a.product_id) && x.size_id === String(a.size_id))
      if (!va) return falla('NO_ENCONTRADA', `El producto ${a.product_id}/${a.size_id} no es de ${v.marca}`, `agregar[${i}]`)
      const costo = costos.get(a.product_id)
      nuevas.push({ product_id: a.product_id, size_id: a.size_id, sku: va.sku, barcode: va.barcode, cantidad: a.cantidad,
        precio: pesos(a.precio), importe: pesos(a.precio * a.cantidad), linea_origen_id: null,
        costo_unitario: costo ? costo.costo : null, costo_fuente: costo ? costo.fuente : null })
    }
  }
  const [ult] = await q(db, 'select total_despues::float as t from venta_correccion where venta_id = $1 order by creada_en desc, id desc limit 1', [v.id])
  const totalAntes = pesos(ult ? ult.t : v.total)
  const totalDespues = pesos(totalAntes + nuevas.reduce((s, x) => s + x.importe, 0))
  if (totalDespues < 0) return falla('ENTRADA_INVALIDA', 'El total no puede quedar en negativo', 'sacar')
  const [{ cobrado }] = await q(db, 'select coalesce(sum(monto), 0)::float as cobrado from venta_pago where venta_id = $1', [v.id])
  const diferencia = pesos(totalDespues - cobrado)
  const [k] = await q(db, `insert into venta_correccion (empresa_id, marca, venta_id, motivo, total_antes, total_despues, cobrado, diferencia, prueba, usuario, tipo, ref)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'productos', $11) returning id::text`,
  [v.empresa_id, v.marca, v.id, motivo, totalAntes, totalDespues, pesos(cobrado), diferencia, v.prueba, usuario, ref])
  const { movimientos, avisos } = await escribirRenglones(db, v, k.id, nuevas, lineas)
  return { ok: true, ya_existia: false, correccion: await unaCorreccion(db, k.id), movimientos: movimientos.length, avisos }
}

/**
 * CAMBIAR UN PEDIDO MAYORISTA CON EL MISMO NÚMERO (sql/090; Bruno 18-nov: «son más las ventas mayoristas que se editan que otra
 * cosa»). Reemplaza a `reemplazarVenta` (anular + venta nueva con otro número) en el cambio de renglones y en el envío del pedido.
 * Recibe cómo QUEDA el pedido —`lineas` (una por talle, con su precio unitario), el `total` (redondeado + envío) y el `detalle`
 * que cambia (envío, transporte, ajuste)— y escribe sólo la DIFERENCIA, con las líneas de la 088:
 *   · lo que baja o sale = línea NEGATIVA contra la original (`linea_origen_id`), al precio vigente;
 *   · lo que sube o entra = línea positiva nueva;
 *   · un talle que cambia de PRECIO sale entero y vuelve a entrar al precio nuevo (el libro mueve −n y +n: queda igual).
 * La diferencia del total va a la CUENTA CORRIENTE (`cuenta_movimiento` tipo `correccion`, se netea con la compra): la mayorista
 * es toda a cuenta ⇒ `cobrado` = el total nuevo y `diferencia` 0 (⛔ aparece «con saldo» por la corrección).
 * Sin transacción propia: corre DENTRO de la del pedido (bloquea la venta). Frena: anulada, cambio, factura, ⛔ mayorista.
 * @param {import('pg').ClientBase} db
 * @param {{ venta_id: string, lineas: { product_id: number, size_id: number, cantidad: number, precio: number }[], total: number,
 *   detalle?: Record<string, any>|null, motivo: string, usuario: string, pedido_id?: string, pedido_numero?: number,
 *   faltante?: boolean, vuelven?: { product_id: number, size_id: number, cantidad: number }[] }} e
 * `faltante` (el depósito ya lo está armando, Bruno 18-nov: «falta un producto ⇒ se edita y se descuenta»): lo que BAJA ⛔ vuelve
 * al estante —⛔ está— ⇒ además de la línea negativa, un ajuste «Faltante o robo» APLICADO en el acto que lo saca del libro (queda
 * en Stock › Ingresos y ajustes con el pedido y la venta). Lo que el depósito sí vuelve a poner en el estante va en `vuelven`.
 * @returns {Promise<{ ok: true, sin_cambios: boolean, correccion?: any, movimientos: number, avisos: any[], delta: number } | { ok: false, error: any }>}
 */
export async function corregirPedidoDentro(db, e) {
  const motivo = texto(e?.motivo), usuario = texto(e?.usuario)
  if (!motivo) return falla('ENTRADA_INVALIDA', 'Falta el motivo', 'motivo')
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién lo cambia', 'usuario')
  if (!UUID.test(String(e?.venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const total = pesos(e.total)
  if (!Number.isFinite(total) || total < 0) return falla('ENTRADA_INVALIDA', 'El total es un monto desde 0', 'total')
  const [v] = await q(db, 'select * from venta where id = $1 for update', [e.venta_id])
  if (!v) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  if (v.estado === 'anulada') return falla('ANULADA', `La venta ${v.numero} está anulada`)
  if (v.origen !== 'mayorista') return falla('NO_ES_MAYORISTA', `La venta ${v.numero} no es de un pedido mayorista`)
  if (v.tipo !== 'venta') return falla('ES_CAMBIO', `La ${v.numero} es un cambio`)
  const [f] = await q(db, 'select 1 from venta_factura where venta_id = $1 limit 1', [v.id])
  if (f) return falla('FACTURADA', `La venta ${v.numero} ya tiene factura: se corrige con una nota de crédito`)
  const [c] = await q(db, `select exists (select 1 from venta where venta_original_id = $1 and estado = 'confirmada') as hay`, [v.id])
  if (c.hay) return falla('CON_CAMBIO', `La venta ${v.numero} ya tuvo un cambio`)

  const lineas = await q(db, `select l.id::text as id, l.n, l.product_id::text, l.size_id::text, l.sku, l.barcode, l.cantidad, l.costo_unitario::float, l.costo_fuente,
      coalesce(c.precio_despues, l.precio)::float as precio, coalesce(c.importe_despues, l.importe)::float as importe,
      coalesce((select -sum(d.cantidad) from venta_linea d where d.linea_origen_id = l.id), 0)::int as sacado
    from venta_linea l
    left join lateral (select cl.precio_despues, cl.importe_despues from venta_correccion_linea cl join venta_correccion k on k.id = cl.correccion_id
      where cl.venta_linea_id = l.id order by k.creada_en desc, k.id desc limit 1) c on true
    where l.venta_id = $1 order by l.n`, [v.id])
  const cent = (x) => Math.round(Number(x) * 100)
  const kv = (pid, sid) => `${Number(pid)}:${Number(sid)}`
  // Lo VIVO de cada talle: las líneas originales (cantidad > 0) con lo que les queda, a su precio unitario vigente.
  const vivas = new Map()
  for (const l of lineas.filter((x) => x.cantidad > 0)) {
    const queda = l.cantidad - l.sacado
    if (queda <= 0) continue
    const k = kv(l.product_id, l.size_id)
    if (!vivas.has(k)) vivas.set(k, [])
    vivas.get(k).push({ ...l, queda, unitario: pesos(l.importe / l.cantidad) })
  }
  const quiero = new Map()
  for (const [i, l] of (Array.isArray(e.lineas) ? e.lineas : []).entries()) {
    const pid = Number(l?.product_id), sid = Number(l?.size_id), cantidad = Number(l?.cantidad), precio = pesos(l?.precio)
    if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(sid) || sid < 0) return falla('ENTRADA_INVALIDA', 'Falta el producto', `lineas[${i}]`)
    if (!Number.isInteger(cantidad) || cantidad < 0) return falla('ENTRADA_INVALIDA', 'La cantidad es un entero desde 0', `lineas[${i}].cantidad`)
    if (!Number.isFinite(precio) || precio < 0) return falla('ENTRADA_INVALIDA', 'El precio es un número desde 0', `lineas[${i}].precio`)
    const k = kv(pid, sid)
    if (quiero.has(k)) return falla('ENTRADA_INVALIDA', 'Un talle aparece dos veces', `lineas[${i}]`)
    if (cantidad > 0) quiero.set(k, { product_id: pid, size_id: sid, cantidad, precio })
  }
  const sacar = []   // { linea, cantidad }
  const agregar = [] // { product_id, size_id, cantidad, precio }
  const bajas = []   // lo que BAJA de cada talle (⛔ lo que cambia de precio): { product_id, size_id, sku, barcode, cantidad }
  for (const k of new Set([...vivas.keys(), ...quiero.keys()])) {
    const hay = vivas.get(k) ?? []
    const q2 = quiero.get(k)
    const vivo = hay.reduce((s, l) => s + l.queda, 0)
    if (vivo > (q2 ? q2.cantidad : 0)) bajas.push({ product_id: Number(hay[0].product_id), size_id: Number(hay[0].size_id), sku: hay[0].sku, barcode: hay[0].barcode, cantidad: vivo - (q2 ? q2.cantidad : 0) })
    // Las de OTRO precio salen enteras; las del mismo precio se ajustan (de la más nueva a la más vieja).
    const mismas = q2 ? hay.filter((l) => cent(l.unitario) === cent(q2.precio)) : []
    for (const l of hay) if (!mismas.includes(l)) sacar.push({ linea: l, cantidad: l.queda })
    let tengo = mismas.reduce((s, l) => s + l.queda, 0)
    const quiero2 = q2 ? q2.cantidad : 0
    if (quiero2 > tengo) agregar.push({ ...q2, cantidad: quiero2 - tengo })
    for (const l of [...mismas].sort((a, b) => b.n - a.n)) {
      if (tengo <= quiero2) break
      const baja = Math.min(l.queda, tengo - quiero2)
      sacar.push({ linea: l, cantidad: baja })
      tengo -= baja
    }
  }
  const nuevas = sacar.map(({ linea: l, cantidad }) => ({ product_id: Number(l.product_id), size_id: Number(l.size_id), sku: l.sku, barcode: l.barcode,
    cantidad: -cantidad, precio: pesos(l.precio), importe: -pesos(l.unitario * cantidad), linea_origen_id: l.id, costo_unitario: l.costo_unitario, costo_fuente: l.costo_fuente }))
  if (agregar.length) {
    const vars = await q(db, `select va.product_id::text, va.size_id::text, va.sku, va.barcode from variante va join producto p on p.empresa_id = va.empresa_id and p.id = va.product_id
      where va.empresa_id = $1 and p.marca = $2 and (va.product_id, va.size_id) in (select * from unnest($3::bigint[], $4::bigint[]))`,
    [v.empresa_id, v.marca, agregar.map((a) => a.product_id), agregar.map((a) => a.size_id)])
    const costos = await costosDe(db, [...new Set(agregar.map((a) => a.product_id))])
    for (const a of agregar) {
      const va = vars.find((x) => x.product_id === String(a.product_id) && x.size_id === String(a.size_id))
      const costo = costos.get(a.product_id)
      nuevas.push({ product_id: a.product_id, size_id: a.size_id, sku: va?.sku ?? null, barcode: va?.barcode ?? null, cantidad: a.cantidad,
        precio: pesos(a.precio), importe: pesos(a.precio * a.cantidad), linea_origen_id: null,
        costo_unitario: costo ? costo.costo : null, costo_fuente: costo ? costo.fuente : null })
    }
  }
  const [ult] = await q(db, 'select total_despues::float as t from venta_correccion where venta_id = $1 order by creada_en desc, id desc limit 1', [v.id])
  const totalAntes = pesos(ult ? ult.t : v.total)
  const [fic] = await q(db, `select detalle from venta_ficha where id = $1`, [v.id])
  const detalleAntes = fic?.detalle ?? v.detalle ?? {}
  const detalle = e.detalle && typeof e.detalle === 'object' ? e.detalle : null
  const cambiaDetalle = detalle && Object.entries(detalle).some(([key, val]) => JSON.stringify(detalleAntes[key] ?? null) !== JSON.stringify(val ?? null))
  if (!nuevas.length && cent(total) === cent(totalAntes) && !cambiaDetalle) return { ok: true, sin_cambios: true, movimientos: 0, avisos: [], delta: 0 }
  const delta = pesos(total - totalAntes)
  const [{ cobrado }] = await q(db, 'select coalesce(sum(monto), 0)::float as cobrado from venta_pago where venta_id = $1', [v.id])
  // La mayorista es toda a cuenta: la diferencia la toma la cuenta corriente (abajo) ⇒ lo «cobrado» acompaña al total.
  const [k] = await q(db, `insert into venta_correccion (empresa_id, marca, venta_id, motivo, total_antes, total_despues, cobrado, diferencia, prueba, usuario, tipo, detalle)
    values ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, 'pedido', $10::jsonb) returning id::text`,
  [v.empresa_id, v.marca, v.id, motivo, totalAntes, total, pesos(cobrado + delta), v.prueba, usuario, detalle ? JSON.stringify(detalle) : null])
  const { movimientos, avisos } = await escribirRenglones(db, v, k.id, nuevas, lineas)
  // FALTA (pedido ya en manos del depósito): lo que baja ⛔ vuelve al estante ⇒ sale del libro con un ajuste, en esta transacción.
  let faltante = null
  if (e.faltante && !v.prueba && bajas.length) {
    const vuelven = new Map()
    for (const x of Array.isArray(e.vuelven) ? e.vuelven : []) {
      const kk = kv(x?.product_id, x?.size_id)
      vuelven.set(kk, (vuelven.get(kk) ?? 0) + Math.max(0, Math.trunc(Number(x?.cantidad) || 0)))
    }
    const renglones = bajas.map((b) => ({ ...b, cantidad: -(b.cantidad - Math.min(b.cantidad, vuelven.get(kv(b.product_id, b.size_id)) ?? 0)) })).filter((b) => b.cantidad < 0)
    if (renglones.length) {
      const pedido = e.pedido_numero != null ? `el pedido ${e.pedido_numero}` : 'el pedido'
      const a = await guardarAjuste(db, { linea: v.marca, deposito: v.deposito, motivo: 'faltante_robo', usuario, ref: `pedido-faltante:${k.id}`,
        detalle: `Faltó al armar ${pedido} (venta ${v.numero})`, renglones }, { instantaneo: true })
      if (!a.ok) throw Object.assign(new Error(a.error?.mensaje ?? 'No se pudo registrar el faltante'), { falla: a })
      faltante = { ajuste: Number(a.ajuste.numero), renglones: renglones.map((r) => ({ product_id: r.product_id, size_id: r.size_id, sku: r.sku, cantidad: -r.cantidad })) }
    }
  }
  if (delta) {
    const [compra] = await q(db, `select cliente_id::text, marca, empresa_id, prueba from cuenta_movimiento where empresa_id = $1 and ref = $2 and tipo = 'compra'`, [v.empresa_id, `venta:${v.id}`])
    if (!compra) throw new Error(`La venta ${v.numero} no tiene su compra en la cuenta corriente: no se puede corregir el total`)
    await q(db, `insert into cuenta_movimiento (empresa_id, marca, cliente_id, tipo, ref, monto, venta_id, detalle, prueba, usuario, ocurrida_en)
      values ($1, $2, $3, 'correccion', $4, $5, $6, $7::jsonb, $8, $9, now())`,
    [compra.empresa_id, compra.marca, compra.cliente_id, `venta:${v.id}:correccion:${k.id}`, delta, v.id,
      JSON.stringify({ correccion: k.id, motivo, ...(e.pedido_id ? { pedido: String(e.pedido_id) } : {}) }), compra.prueba, usuario])
  }
  return { ok: true, sin_cambios: false, correccion: await unaCorreccion(db, k.id), movimientos: movimientos.length, avisos, delta, faltante }
}

/**
 * Las líneas nuevas de una corrección (de productos o de pedido), su `venta_correccion_renglon` y su movimiento del libro en el
 * DEPÓSITO DE LA VENTA, fechado AHORA (⛔ el día de la venta). La de prueba ⛔ mueve. Avisa (⛔ frena) lo que se agrega y el libro
 * ⛔ tiene. Dentro de la transacción del que llama.
 */
async function escribirRenglones(db, v, correccionId, nuevas, lineas) {
  if (!nuevas.length) return { movimientos: [], avisos: [] }
  const k = { id: correccionId }
  const ultimoN = lineas.reduce((m, l) => Math.max(m, Number(l.n)), 0)
  const filas = nuevas.map((x, i) => ({ id: randomUUID(), venta_id: v.id, n: ultimoN + i + 1, product_id: x.product_id, size_id: x.size_id,
    sku: x.sku ?? null, barcode: x.barcode ?? null, cantidad: x.cantidad, precio: x.precio, descuento: 0, rebaja: 0, importe: x.importe,
    costo_unitario: x.costo_unitario ?? null, costo_fuente: x.costo_fuente ?? null, linea_origen_id: x.linea_origen_id }))
  await db.query('insert into venta_linea select * from jsonb_populate_recordset(null::venta_linea, $1::jsonb)', [JSON.stringify(filas)])
  await db.query('insert into venta_correccion_renglon (venta_linea_id, correccion_id) select unnest($1::uuid[]), $2', [filas.map((x) => x.id), k.id])
  // El libro: la prenda se movió AHORA (⛔ el día de la venta), en el depósito de la venta. La de prueba ⛔ mueve.
  const ahora = new Date().toISOString()
  const movimientos = v.prueba ? [] : filas.map((l) => ({ ...movimientoDe(v, l, 'venta'), ocurrido_en: ahora, detalle: { venta_numero: Number(v.numero), correccion: k.id } }))
  if (movimientos.length) {
    await db.query(`insert into stock_movimiento (linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, ocurrido_en, hora_exacta, grupo, detalle)
      select linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, ocurrido_en, hora_exacta, grupo, detalle
      from jsonb_populate_recordset(null::stock_movimiento, $1::jsonb)`, [JSON.stringify(movimientos)])
  }
  // Aviso (⛔ freno, como la venta): lo que se agrega y el libro del depósito ⛔ tiene.
  const avisos = []
  for (const l of filas.filter((x) => x.cantidad > 0)) {
    const [s] = await q(db, 'select coalesce(sum(cantidad), 0)::int as nivel from stock_movimiento where linea = $1 and product_id = $2 and size_id = $3 and deposito = $4', [v.marca, l.product_id, l.size_id, v.deposito])
    if (s.nivel < 0) avisos.push({ codigo: 'SIN_STOCK_EN_LIBRO', product_id: l.product_id, size_id: l.size_id, sku: l.sku, nivel: s.nivel })
  }
  return { movimientos, avisos }
}

/** Una corrección con sus líneas (de precio o de productos), como la devuelve `correccionesDe`. */
async function unaCorreccion(db, id) {
  const [k] = await q(db, `select k.id::text, k.venta_id::text, v.numero, k.tipo, k.motivo, k.usuario, k.creada_en, k.total_antes::float, k.total_despues::float,
      k.cobrado::float, k.diferencia::float from venta_correccion k join venta v on v.id = k.venta_id where k.id = $1`, [id])
  return { ...k, numero: Number(k.numero), renglones: await renglonesDe(db, id) }
}

const renglonesDe = (db, correccionId) => q(db, `select l.id::text as linea_id, l.n, l.product_id::text, l.size_id::text, l.sku, l.cantidad, l.precio::float, l.importe::float,
    l.linea_origen_id::text from venta_correccion_renglon r join venta_linea l on l.id = r.venta_linea_id where r.correccion_id = $1 order by l.n`, [correccionId])

export { vigentes as lineasVigentes }
