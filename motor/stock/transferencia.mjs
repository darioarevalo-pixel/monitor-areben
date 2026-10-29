/**
 * LA TRANSFERENCIA COMO DOCUMENTO (paso 7, sesión A; Bruno 24-oct: «cuando se apaga se apaga»). Las tablas son sql/034; el
 * contrato para las pantallas, `TRANSFERENCIA.md`. Lo usa el monitor (copia del motor, `scripts/traer-motor.mjs`).
 *
 * borrador → armada → en_transito → recibida   (y `cancelada`, sólo antes de salir)
 *
 * - `crearTransferencia`: el documento con número `T-<n>` por línea. `libre` (lector, sin pedido) o `reposicion` (el armado del
 *   monitor; `origen_ref` evita duplicarlo: crear dos veces el mismo armado devuelve el mismo documento).
 * - `armarTransferencia`: lo ESCANEADO en el depósito de salida (reemplaza lo armado antes). ⛔ mueve el libro.
 * - `enviarTransferencia`: confirma. El libro anota la SALIDA (−enviada en `desde`) AL INSTANTE y la prenda queda en tránsito.
 * - `recibirTransferencia`: lo escaneado en destino. El libro anota la ENTRADA (+recibida en `hacia`); la diferencia contra lo
 *   enviado queda marcada en cada renglón con quién envió y quién recibió (⛔ se ajusta sola: la cierra un ajuste).
 * - `cancelarTransferencia`: borrador o armada, con motivo. En tránsito ⛔ se cancela: se recibe (aunque sea con 0).
 *
 * 🔑 El motor ⛔ conoce a GN. Mientras GN sirva, el monitor espeja la transferencia allá al enviar y anota el id en
 * `gn_transfer_id`. 🔑 El libro puede no tener la prenda en el depósito (el stock de Zattia en GN ⛔ cierra): al enviar eso es un
 * AVISO (`SIN_STOCK_EN_LIBRO`), ⛔ un freno: la prenda está en la estantería y hay que moverla.
 */
import { nivelesDe } from './ajuste.mjs'

export const ESTADOS = ['borrador', 'armada', 'en_transito', 'recibida', 'cancelada']
export const ORIGENES = ['libre', 'reposicion']
export const MAX_RENGLONES = 500

const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const entero = (x) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && Number.isInteger(Number(x))
const claveDe = (r) => `${r.product_id}:${r.size_id}`
const quien = (x) => String(x ?? '').trim()

/**
 * Valida una lista `[{ product_id, size_id, sku?, barcode?, cantidad }]`: variantes enteras, sin repetir, cantidad entera.
 * Devuelve `{ ok, lista }` con cantidades numéricas. `minimo` = 0 acepta ceros (el escaneo que se vació). Puro.
 */
export function limpiarLista(entrada, { minimo = 1 } = {}) {
  const l = Array.isArray(entrada) ? entrada : []
  if (l.length > MAX_RENGLONES) return falla('ENTRADA_INVALIDA', `Más de ${MAX_RENGLONES} prendas: partila`, 'renglones')
  const vistas = new Set()
  const lista = []
  for (const r of l) {
    if (!entero(r?.product_id) || !entero(r?.size_id)) return falla('ENTRADA_INVALIDA', 'Una prenda sin variante', 'renglones')
    const k = claveDe(r)
    if (vistas.has(k)) return falla('ENTRADA_INVALIDA', `La prenda ${r.sku || k} está dos veces`, 'renglones')
    vistas.add(k)
    if (!entero(r.cantidad) || Number(r.cantidad) < minimo) return falla('ENTRADA_INVALIDA', `La cantidad de ${r.sku || k} tiene que ser un entero de ${minimo} o más`, 'renglones')
    lista.push({ product_id: Number(r.product_id), size_id: Number(r.size_id), sku: r.sku ?? null, barcode: r.barcode ?? null, cantidad: Number(r.cantidad) })
  }
  return { ok: true, lista }
}

/** Una pata del libro: `sale` (−) del depósito de salida, `entra` (+) en el de llegada. Puro. */
export function movimientoDe(t, r, pata, cantidad, ahora) {
  const sale = pata === 'sale'
  return {
    linea: t.linea, product_id: Number(r.product_id), size_id: Number(r.size_id), sku: r.sku ?? null, barcode: r.barcode ?? null,
    deposito: sale ? t.desde : t.hacia, cantidad: sale ? -cantidad : cantidad, tipo: 'transferencia', origen: 'transferencia',
    clave: `${t.id}:${r.n}:${pata}`, origen_ref: `${t.id}:${r.n}:${pata}`,
    ocurrido_en: ahora.toISOString(), hora_exacta: true, grupo: `transf:${t.id}`,
    detalle: { transferencia: t.numero, origen: t.origen },
  }
}

/** Lo que salió contra lo que llegó, renglón por renglón: `diferencia = recibida − enviada` (negativa = faltó). Puro. */
export function diferenciasDe(renglones) {
  return renglones
    .filter((r) => r.recibida != null && Number(r.recibida) !== Number(r.enviada))
    .map((r) => ({ n: r.n, product_id: Number(r.product_id), size_id: Number(r.size_id), sku: r.sku, enviada: Number(r.enviada), recibida: Number(r.recibida), diferencia: Number(r.recibida) - Number(r.enviada) }))
}

// ── Con la base ─────────────────────────────────────────────────────────────────────────────────

const q = async (db, sql, params = []) => (await db.query(sql, params)).rows

async function enTransaccion(db, fn) {
  await db.query('begin')
  try {
    const r = await fn()
    await db.query(r && r.ok ? 'commit' : 'rollback')
    return r
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
}

async function contexto(db, linea) {
  const [m] = await q(db, 'select empresa_id from marca where id = $1', [linea])
  if (!m) return null
  // Sólo los ACTIVOS (sql/058): al Evento apagado ⛔ entra ni sale nada. Sin la 058, todos.
  const todos = await q(db, `select id, coalesce((to_jsonb(d) ->> 'activo')::boolean, true) as activo from deposito d where marca = $1`, [linea])
  return { empresa_id: m.empresa_id, depositos: todos.filter((d) => d.activo).map((d) => d.id), apagados: todos.filter((d) => !d.activo).map((d) => d.id) }
}

const numerosA = (r) => ({ ...r, product_id: Number(r.product_id), size_id: Number(r.size_id) })

async function leerRenglones(db, id) {
  return (await q(db, 'select * from stock_transferencia_renglon where transferencia_id = $1 order by n', [id])).map(numerosA)
}

/** Lee y bloquea el documento para pasarlo al estado siguiente. */
async function tomar(db, id, estados) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id ?? ''))) return falla('ENTRADA_INVALIDA', 'Falta la transferencia', 'transferencia_id')
  const [t] = await q(db, 'select * from stock_transferencia where id = $1 for update', [id])
  if (!t) return falla('NO_ENCONTRADO', 'No está esa transferencia')
  if (!estados.includes(t.estado)) {
    return { ok: false, error: { codigo: 'ESTADO_INVALIDO', mensaje: `La transferencia T-${t.numero} está ${t.estado.replace('_', ' ')}`, estado: t.estado } }
  }
  return { ok: true, t }
}

/**
 * Crea el documento en `borrador`. Para `reposicion` hace falta `origen_ref` (con tandas: `<armado>:t<n>`) y el pedido; si ya
 * existe devuelve ese mismo (`ya: true`). Para `libre` el pedido es opcional: el lector va armando.
 * @param {import('pg').ClientBase} db
 * @param {any} e `{ linea, desde, hacia, usuario, origen?, origen_ref?, nota?, renglones?: [{ product_id, size_id, sku?, barcode?, cantidad }] }`
 * @param {{ ahora?: Date }} [op]
 */
export async function crearTransferencia(db, e, { ahora = new Date() } = {}) {
  return enTransaccion(db, async () => {
    if (!e || typeof e !== 'object') return falla('ENTRADA_INVALIDA', 'Falta la transferencia')
    const usuario = quien(e.usuario)
    if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién la crea', 'usuario')
    const origen = e.origen ?? 'libre'
    if (!ORIGENES.includes(origen)) return falla('ENTRADA_INVALIDA', `Origen desconocido: ${origen}`, 'origen')
    const origenRef = quien(e.origen_ref) || null
    if (origen === 'reposicion' && !origenRef) return falla('ENTRADA_INVALIDA', 'Una transferencia de Reposición necesita el armado (origen_ref)', 'origen_ref')
    const ctx = await contexto(db, e.linea)
    if (!ctx) return falla('ENTRADA_INVALIDA', `Línea desconocida: ${e.linea}`, 'linea')
    for (const [d, campo] of [[e.desde, 'desde'], [e.hacia, 'hacia']]) {
      if (ctx.apagados.includes(d)) return falla('DEPOSITO_APAGADO', `El depósito ${d} está apagado: activalo antes de mover mercadería`, campo)
    }
    if (!ctx.depositos.includes(e.desde)) return falla('ENTRADA_INVALIDA', `Depósito de salida desconocido para ${e.linea}: ${e.desde}`, 'desde')
    if (!ctx.depositos.includes(e.hacia)) return falla('ENTRADA_INVALIDA', `Depósito de llegada desconocido para ${e.linea}: ${e.hacia}`, 'hacia')
    if (e.desde === e.hacia) return falla('ENTRADA_INVALIDA', 'Sale y llega al mismo depósito', 'hacia')
    const l = limpiarLista(e.renglones)
    if (!l.ok) return l
    if (origen === 'reposicion' && !l.lista.length) return falla('ENTRADA_INVALIDA', 'El pedido de Reposición no tiene prendas', 'renglones')

    if (origenRef) {
      const [ya] = await q(db, 'select * from stock_transferencia where linea = $1 and origen = $2 and origen_ref = $3', [e.linea, origen, origenRef])
      if (ya) return { ok: true, ya: true, transferencia: ya, renglones: await leerRenglones(db, ya.id) }
    }
    const [n] = await q(db, `insert into stock_transferencia_numero (linea, ultimo) values ($1, 1)
      on conflict (linea) do update set ultimo = stock_transferencia_numero.ultimo + 1 returning ultimo`, [e.linea])
    const [t] = await q(db, `insert into stock_transferencia (empresa_id, linea, numero, desde, hacia, origen, origen_ref, nota, estado, creada_por, creada_en)
      values ($1, $2, $3, $4, $5, $6, $7, $8, 'borrador', $9, $10) returning *`,
    [ctx.empresa_id, e.linea, Number(n.ultimo), e.desde, e.hacia, origen, origenRef, quien(e.nota) || null, usuario, ahora.toISOString()])
    if (l.lista.length) {
      await db.query(`insert into stock_transferencia_renglon (transferencia_id, n, empresa_id, product_id, size_id, sku, barcode, pedida)
        select $1, row_number() over (), $2, product_id, size_id, sku, barcode, cantidad
        from jsonb_to_recordset($3::jsonb) as x(product_id bigint, size_id bigint, sku text, barcode text, cantidad int)`,
      [t.id, ctx.empresa_id, JSON.stringify(l.lista)])
    }
    return { ok: true, ya: false, transferencia: t, renglones: await leerRenglones(db, t.id) }
  })
}

/**
 * Guarda lo ESCANEADO al armar y la deja `armada` (se puede volver a llamar mientras siga armada: reemplaza lo anterior). Una
 * prenda del pedido que no viene vuelve a 0. En una `reposicion` ⛔ entra una prenda fuera del pedido; en una `libre` sí.
 * `avisos`: `ARMADA_MAS_QUE_PEDIDA`. Si el libro del depósito de salida tiene menos de lo armado ⇒ `SIN_STOCK_EN_LIBRO` (aviso).
 * @param {import('pg').ClientBase} db @param {{ transferencia_id: string, usuario: string, renglones: any[] }} e @param {{ ahora?: Date }} [op]
 */
export async function armarTransferencia(db, e, { ahora = new Date() } = {}) {
  return enTransaccion(db, async () => {
    const usuario = quien(e?.usuario)
    if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién arma', 'usuario')
    const l = limpiarLista(e?.renglones, { minimo: 0 })
    if (!l.ok) return l
    const lec = await tomar(db, e?.transferencia_id, ['borrador', 'armada'])
    if (!lec.ok) return lec
    const t = lec.t
    const actuales = await leerRenglones(db, t.id)
    const porClave = new Map(actuales.map((r) => [claveDe(r), r]))
    const escaneadas = new Map(l.lista.map((r) => [claveDe(r), r]))
    if (t.origen === 'reposicion') {
      const extra = l.lista.find((r) => r.cantidad > 0 && !porClave.has(claveDe(r)))
      if (extra) return falla('FUERA_DEL_PEDIDO', `${extra.sku || claveDe(extra)} no está en el pedido de Reposición`, 'renglones')
    }
    if (!l.lista.some((r) => r.cantidad > 0)) return falla('SIN_PRENDAS', 'No hay nada escaneado para transferir')

    const avisos = []
    let n = actuales.reduce((m, r) => Math.max(m, r.n), 0)
    for (const r of l.lista) {
      const k = claveDe(r)
      const previo = porClave.get(k)
      if (previo) {
        await db.query('update stock_transferencia_renglon set armada = $3 where transferencia_id = $1 and n = $2', [t.id, previo.n, r.cantidad])
        if (t.origen === 'reposicion' && previo.pedida && r.cantidad > previo.pedida) avisos.push({ codigo: 'ARMADA_MAS_QUE_PEDIDA', product_id: r.product_id, size_id: r.size_id, sku: previo.sku, pedida: previo.pedida, armada: r.cantidad })
      } else if (r.cantidad > 0) {
        n += 1
        await db.query(`insert into stock_transferencia_renglon (transferencia_id, n, empresa_id, product_id, size_id, sku, barcode, pedida, armada)
          values ($1, $2, $3, $4, $5, $6, $7, 0, $8)`, [t.id, n, t.empresa_id, r.product_id, r.size_id, r.sku, r.barcode, r.cantidad])
      }
    }
    // Lo que el escaneo ya no trae vuelve a 0; el renglón que quedó sin pedido y sin armar se va.
    for (const r of actuales) if (!escaneadas.has(claveDe(r))) await db.query('update stock_transferencia_renglon set armada = 0 where transferencia_id = $1 and n = $2', [t.id, r.n])
    await db.query('delete from stock_transferencia_renglon where transferencia_id = $1 and pedida = 0 and armada = 0', [t.id])
    await db.query(`update stock_transferencia set estado = 'armada', armada_por = $2, armada_en = $3 where id = $1`, [t.id, usuario, ahora.toISOString()])

    const renglones = await leerRenglones(db, t.id)
    const arm = renglones.filter((r) => r.armada > 0)
    const niveles = await nivelesDe(db, t.desde, arm)
    for (const r of arm) {
      const hay = niveles.get(claveDe(r)) ?? 0
      if (hay < r.armada) avisos.push({ codigo: 'SIN_STOCK_EN_LIBRO', product_id: r.product_id, size_id: r.size_id, sku: r.sku, libro: hay, armada: r.armada })
    }
    return { ok: true, transferencia: { ...t, estado: 'armada', armada_por: usuario, armada_en: ahora.toISOString() }, renglones, avisos }
  })
}

/**
 * Confirma: `armada` → `en_transito`. Escribe en el libro la SALIDA de cada renglón armado (en UNA transacción) y deja
 * `enviada = armada`. `gn_transfer_id` (opcional) es la transferencia que el monitor ya hizo en GN.
 * @param {import('pg').ClientBase} db @param {{ transferencia_id: string, usuario: string, gn_transfer_id?: string|number }} e @param {{ ahora?: Date }} [op]
 */
export async function enviarTransferencia(db, e, { ahora = new Date() } = {}) {
  return enTransaccion(db, async () => {
    const usuario = quien(e?.usuario)
    if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién envía', 'usuario')
    const lec = await tomar(db, e?.transferencia_id, ['armada'])
    if (!lec.ok) return lec
    const t = lec.t
    const renglones = await leerRenglones(db, t.id)
    const sale = renglones.filter((r) => r.armada > 0)
    if (!sale.length) return falla('SIN_PRENDAS', 'No hay nada armado para enviar')
    const niveles = await nivelesDe(db, t.desde, sale)
    const avisos = []
    for (const r of sale) {
      const hay = niveles.get(claveDe(r)) ?? 0
      if (hay < r.armada) avisos.push({ codigo: 'SIN_STOCK_EN_LIBRO', product_id: r.product_id, size_id: r.size_id, sku: r.sku, libro: hay, armada: r.armada })
    }
    const movimientos = sale.map((r) => movimientoDe(t, r, 'sale', r.armada, ahora))
    await db.query(`insert into stock_movimiento (linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, ocurrido_en, hora_exacta, grupo, detalle)
      select linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, ocurrido_en, hora_exacta, grupo, detalle
      from jsonb_populate_recordset(null::stock_movimiento, $1::jsonb)`, [JSON.stringify(movimientos)])
    await db.query('update stock_transferencia_renglon set enviada = armada where transferencia_id = $1', [t.id])
    const gn = e?.gn_transfer_id == null || e.gn_transfer_id === '' ? null : String(e.gn_transfer_id)
    await db.query(`update stock_transferencia set estado = 'en_transito', enviada_por = $2, enviada_en = $3, gn_transfer_id = coalesce($4, gn_transfer_id) where id = $1`,
      [t.id, usuario, ahora.toISOString(), gn])
    return {
      ok: true, transferencia: { id: t.id, numero: t.numero, estado: 'en_transito' }, movimientos: movimientos.length,
      unidades: sale.reduce((s, r) => s + r.armada, 0), avisos,
    }
  })
}

/**
 * Recibe en destino: `en_transito` → `recibida`. `renglones` es lo ESCANEADO al llegar; lo enviado que no viene cuenta 0
 * (faltó). Escribe en el libro la ENTRADA de lo recibido y marca la diferencia de cada renglón. Una prenda que ⛔ salió en esta
 * transferencia ⛔ se puede recibir acá (ese sobrante es un ajuste). Devuelve `diferencias` (vacío = llegó todo).
 * @param {import('pg').ClientBase} db @param {{ transferencia_id: string, usuario: string, renglones: any[] }} e @param {{ ahora?: Date }} [op]
 */
export async function recibirTransferencia(db, e, { ahora = new Date() } = {}) {
  return enTransaccion(db, async () => {
    const usuario = quien(e?.usuario)
    if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién recibe', 'usuario')
    const l = limpiarLista(e?.renglones, { minimo: 0 })
    if (!l.ok) return l
    const lec = await tomar(db, e?.transferencia_id, ['en_transito'])
    if (!lec.ok) return lec
    const t = lec.t
    const renglones = await leerRenglones(db, t.id)
    const salieron = new Map(renglones.filter((r) => r.enviada > 0).map((r) => [claveDe(r), r]))
    const ajena = l.lista.find((r) => r.cantidad > 0 && !salieron.has(claveDe(r)))
    if (ajena) return falla('NO_SALIO_EN_ESTA', `${ajena.sku || claveDe(ajena)} no salió en la transferencia T-${t.numero}: se anota como ajuste, ⛔ acá`, 'renglones')
    const escaneada = new Map(l.lista.map((r) => [claveDe(r), r.cantidad]))
    const movimientos = []
    for (const r of renglones) {
      const recibida = r.enviada > 0 ? (escaneada.get(claveDe(r)) ?? 0) : 0
      await db.query('update stock_transferencia_renglon set recibida = $3 where transferencia_id = $1 and n = $2', [t.id, r.n, recibida])
      r.recibida = recibida
      if (recibida > 0) movimientos.push(movimientoDe(t, r, 'entra', recibida, ahora))
    }
    if (movimientos.length) {
      await db.query(`insert into stock_movimiento (linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, ocurrido_en, hora_exacta, grupo, detalle)
        select linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, ocurrido_en, hora_exacta, grupo, detalle
        from jsonb_populate_recordset(null::stock_movimiento, $1::jsonb)`, [JSON.stringify(movimientos)])
    }
    await db.query(`update stock_transferencia set estado = 'recibida', recibida_por = $2, recibida_en = $3 where id = $1`, [t.id, usuario, ahora.toISOString()])
    const diferencias = diferenciasDe(renglones.filter((r) => r.enviada > 0))
    return {
      ok: true, transferencia: { id: t.id, numero: t.numero, estado: 'recibida', enviada_por: t.enviada_por, recibida_por: usuario },
      movimientos: movimientos.length, unidades: movimientos.reduce((s, m) => s + m.cantidad, 0), diferencias,
    }
  })
}

/** Cancela un borrador o una armada (⛔ movió nada); el motivo es obligatorio. */
export async function cancelarTransferencia(db, e, { ahora = new Date() } = {}) {
  return enTransaccion(db, async () => {
    const usuario = quien(e?.usuario)
    const motivo = quien(e?.motivo)
    if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién cancela', 'usuario')
    if (motivo.length < 3) return falla('ENTRADA_INVALIDA', 'Falta por qué se cancela', 'motivo')
    const lec = await tomar(db, e?.transferencia_id, ['borrador', 'armada'])
    if (!lec.ok) return lec
    await db.query(`update stock_transferencia set estado = 'cancelada', cancelada_por = $2, cancelada_en = $3, cancelacion = $4 where id = $1`,
      [lec.t.id, usuario, ahora.toISOString(), motivo])
    return { ok: true, transferencia: { id: lec.t.id, numero: lec.t.numero, estado: 'cancelada' } }
  })
}

/**
 * Las transferencias de una línea (las más nuevas primero), con sus renglones y las diferencias de las recibidas. `estado`
 * puede ser uno o una lista. Una base sin la 034 ⇒ `{ sinTablas: true }`.
 */
export async function transferenciasDe(db, { linea, estado = null, limite = 100 }) {
  const [{ hay }] = await q(db, `select to_regclass('stock_transferencia') is not null as hay`)
  if (!hay) return { sinTablas: true, transferencias: [] }
  const estados = estado == null ? null : [].concat(estado)
  const filas = await q(db, `select t.*, coalesce((select jsonb_agg(to_jsonb(r) order by r.n) from stock_transferencia_renglon r where r.transferencia_id = t.id), '[]') as renglones
    from stock_transferencia t where t.linea = $1 and ($2::text[] is null or t.estado = any($2)) order by t.numero desc limit $3`,
  [linea, estados, Math.min(Number(limite) || 100, 500)])
  for (const t of filas) t.diferencias = t.estado === 'recibida' ? diferenciasDe(t.renglones) : []
  return { sinTablas: false, transferencias: filas }
}

/**
 * Lo que está EN TRÁNSITO ahora, por variante: `enviada − recibida` de las que salieron y todavía ⛔ llegaron. Es lo que la
 * prenda «ocupa» sin estar en ningún depósito (para que Stock lo muestre y el disponible ⛔ lo cuente).
 */
export async function enTransito(db, { linea }) {
  const [{ hay }] = await q(db, `select to_regclass('stock_transferencia') is not null as hay`)
  if (!hay) return []
  return (await q(db, `select r.product_id::bigint, r.size_id::bigint, t.desde, t.hacia, sum(r.enviada)::int as unidades,
      array_agg(distinct t.numero order by t.numero) as transferencias
    from stock_transferencia t join stock_transferencia_renglon r on r.transferencia_id = t.id
    where t.linea = $1 and t.estado = 'en_transito' and r.enviada > 0 group by 1, 2, 3, 4 order by 1, 2`, [linea]))
    .map((r) => ({ ...r, product_id: Number(r.product_id), size_id: Number(r.size_id) }))
}
