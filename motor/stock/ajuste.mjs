/**
 * EL AJUSTE DE STOCK CON MOTIVO (paso 7, sesión B; Bruno 18-oct: «el conteo va al libro, ⛔ Excel; admin aprueba»). Lo usa
 * la pestaña `erp › Ajustes` del monitor (copia del motor, `scripts/traer-motor.mjs`). Las tablas son sql/026.
 *
 * 🔑 Hasta el corte GN sirve y el ERP es la PRUEBA ⇒ el ajuste mueve SÓLO el libro (⛔ GN, ⛔ TN). La lista de trabajo es lo
 * que la conciliación marca «El ERP dice otro stock» (TN = GN y el libro aparte) y las ventas con PIN (`detalle.contar`):
 * se cuenta la prenda y el libro pasa a lo contado.
 *
 * Dos pasos: `crearAjuste` lo deja `para_aprobar` con la foto del libro (`antes`) de cada renglón; `aprobarAjuste` escribe
 * un movimiento `ajuste` por renglón con la `diferencia` de ese momento (una venta entre el conteo y la aprobación ⛔ la
 * cambia: el libro ya la descontó, y la estantería también). `rechazarAjuste` lo cierra sin mover nada.
 *
 * Motivos (DECISIONES 8): `conteo` da lo CONTADO (diferencia = contado − libro); los demás dan la cantidad que SALE
 * (fallado, canje, regalo) o la que se mueve, con signo (`otro`, con texto obligatorio). ⛔ ingreso ni cambio.
 */


export const MOTIVOS = {
  conteo: 'Conteo',
  fallado: 'Fallado',
  canje: 'Influencer / canje',
  regalo: 'Regalo / sorteo / donación',
  otro: 'Otro',
}
/** Los que sacan prendas del stock: la cantidad va en negativo. */
const SOLO_SALEN = new Set(['fallado', 'canje', 'regalo'])
export const FUENTES = ['mano', 'conciliacion', 'contar']
export const MAX_RENGLONES = 500
/** Un conteo del módulo de Depósito (el del Excel para GN) más nuevo que esto sobre la misma prenda ⇒ aviso. */
const CONTEO_RECIENTE_MS = 3 * 864e5

const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const entero = (x) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && Number.isInteger(Number(x))
const claveDe = (r) => `${r.product_id}:${r.size_id}`

/**
 * El ajuste listo para escribir: `{ ok, ajuste, renglones }` o `{ ok: false, error }`. Puro.
 * @param {any} e `{ linea, deposito, motivo, detalle?, fuente?, usuario, renglones: [{ product_id, size_id, sku?, barcode?, contado? | cantidad? }] }`
 * @param {{ empresa_id: string, depositos: string[], niveles: Map<string, number> }} ctx el libro de ese depósito, por variante
 */
export function armarAjuste(e, { empresa_id, depositos, niveles }) {
  if (!e || typeof e !== 'object') return falla('ENTRADA_INVALIDA', 'Falta el ajuste')
  const usuario = String(e.usuario ?? '').trim()
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién hace el ajuste', 'usuario')
  if (!MOTIVOS[e.motivo]) return falla('ENTRADA_INVALIDA', `Motivo desconocido: ${e.motivo}`, 'motivo')
  const detalle = String(e.detalle ?? '').trim() || null
  if (e.motivo === 'otro' && (!detalle || detalle.length < 3)) return falla('ENTRADA_INVALIDA', 'Con motivo «Otro» hay que escribir por qué', 'detalle')
  const fuente = e.fuente ?? 'mano'
  if (!FUENTES.includes(fuente)) return falla('ENTRADA_INVALIDA', `Fuente desconocida: ${fuente}`, 'fuente')
  if (!depositos.includes(e.deposito)) return falla('ENTRADA_INVALIDA', `Depósito desconocido para ${e.linea}: ${e.deposito}`, 'deposito')
  const entrada = Array.isArray(e.renglones) ? e.renglones : []
  if (!entrada.length) return falla('ENTRADA_INVALIDA', 'El ajuste no tiene prendas', 'renglones')
  if (entrada.length > MAX_RENGLONES) return falla('ENTRADA_INVALIDA', `Más de ${MAX_RENGLONES} prendas en un ajuste: partilo`, 'renglones')

  const vistas = new Set()
  const renglones = []
  for (const r of entrada) {
    if (!entero(r?.product_id) || !entero(r?.size_id)) return falla('ENTRADA_INVALIDA', 'Una prenda sin variante', 'renglones')
    const k = claveDe(r)
    if (vistas.has(k)) return falla('ENTRADA_INVALIDA', `La prenda ${r.sku || k} está dos veces`, 'renglones')
    vistas.add(k)
    const antes = niveles.get(k) ?? 0
    let contado = null
    let diferencia
    if (e.motivo === 'conteo') {
      if (!entero(r.contado) || Number(r.contado) < 0) return falla('ENTRADA_INVALIDA', `Lo contado de ${r.sku || k} tiene que ser un número entero, 0 o más`, 'renglones')
      contado = Number(r.contado)
      diferencia = contado - antes
    } else {
      if (!entero(r.cantidad) || Number(r.cantidad) === 0) return falla('ENTRADA_INVALIDA', `Falta la cantidad de ${r.sku || k}`, 'renglones')
      diferencia = Number(r.cantidad)
      if (SOLO_SALEN.has(e.motivo) && diferencia > 0) return falla('ENTRADA_INVALIDA', `«${MOTIVOS[e.motivo]}» saca prendas: la cantidad va en negativo (${r.sku || k})`, 'renglones')
      if (antes + diferencia < 0) return falla('QUEDA_NEGATIVO', `${r.sku || k}: el libro tiene ${antes} en ${e.deposito} y el ajuste saca ${-diferencia}. Si la prenda está, primero hay que contarla`, 'renglones')
    }
    if (diferencia === 0) continue   // el conteo coincide con el libro: ⛔ hay nada que mover
    renglones.push({
      n: renglones.length + 1, empresa_id, product_id: Number(r.product_id), size_id: Number(r.size_id),
      sku: r.sku ?? null, barcode: r.barcode ?? null, antes, contado, diferencia,
    })
  }
  if (!renglones.length) return falla('SIN_DIFERENCIAS', 'Lo contado coincide con el libro: no hay nada que ajustar')
  return {
    ok: true,
    ajuste: { empresa_id, linea: e.linea, deposito: e.deposito, motivo: e.motivo, detalle, fuente, estado: 'para_aprobar', creado_por: usuario },
    renglones,
  }
}

/** Los movimientos del libro de un ajuste aprobado: uno por renglón, tipo `ajuste` (sql/026). Puro. */
export function movimientosDe(ajuste, renglones, ahora) {
  return renglones.map((r) => ({
    linea: ajuste.linea, product_id: r.product_id, size_id: r.size_id, sku: r.sku, barcode: r.barcode,
    deposito: ajuste.deposito, cantidad: r.diferencia, tipo: 'ajuste', origen: 'ajuste',
    clave: `${ajuste.id}:${r.n}`, origen_ref: `${ajuste.id}:${r.n}`,
    ocurrido_en: ahora.toISOString(), hora_exacta: true, grupo: `ajuste:${ajuste.id}`,
    detalle: { ajuste: ajuste.numero, motivo: ajuste.motivo },
  }))
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

/**
 * El depósito canónico del `ubicacion` de un conteo («Deposito Minorista» ⇒ `deposito_minorista`). El monitor copia esta
 * carpeta sola (⛔ `lib/depositos.mjs`) ⇒ la regla va acá: en las dos bases el canónico es el nombre de GN en minúscula, con
 * `_` (ver POR_NOMBRE allá; Zattia trae `Deposito ` con espacio al final).
 */
const canonico = (ubicacion) => String(ubicacion ?? '').trim().toLowerCase().replace(/\s+/g, '_')

/** El libro de un depósito, por variante: lo que hay en la estantería según el ERP. */
export async function nivelesDe(db, deposito, variantes) {
  if (!variantes.length) return new Map()
  const filas = await q(db, `select product_id, size_id, coalesce(sum(cantidad), 0)::int as nivel from stock_movimiento
    where deposito = $1 and (product_id, size_id) in (select * from unnest($2::bigint[], $3::bigint[])) group by 1, 2`,
  [deposito, variantes.map((v) => Number(v.product_id)), variantes.map((v) => Number(v.size_id))])
  return new Map(filas.map((r) => [claveDe(r), r.nivel]))
}

/**
 * Los conteos del módulo de Depósito (`conteos_deposito`, el del Excel para GN) de los últimos días que tocan estas
 * prendas en este depósito. Ese conteo ENTRA SOLO al libro (`ajuste_conteo`, lib/fuentes/conteos.mjs) con la vuelta del
 * proyector ⇒ si todavía ⛔ entró, ajustar acá encima lo cuenta dos veces. Se avisa, ⛔ se frena. Una base sin la tabla ⇒ [].
 */
async function conteosRecientes(db, deposito, renglones, ahora) {
  const [{ hay }] = await q(db, `select to_regclass('conteos_deposito') is not null as hay`)
  if (!hay) return []
  const codigos = new Set(renglones.flatMap((r) => [r.barcode, r.sku].filter(Boolean).map(String)))
  if (!codigos.size) return []
  const desde = new Date(ahora.getTime() - CONTEO_RECIENTE_MS).toISOString()
  const conteos = await q(db, `select id, ubicacion, coalesce(fecha_aplicado, created_at) as cuando, detalle from conteos_deposito
    where coalesce(fecha_aplicado, created_at) >= $1`, [desde])
  const avisos = []
  for (const c of conteos) {
    if (canonico(c.ubicacion) !== deposito) continue
    for (const d of Array.isArray(c.detalle) ? c.detalle : []) {
      if (!Number(d.diferencia ?? 0)) continue
      const cod = [d.barcode, d.sku].filter(Boolean).map(String).find((x) => codigos.has(x))
      if (cod) avisos.push({ codigo: 'CONTEO_DE_DEPOSITO_RECIENTE', conteo: Number(c.id), cuando: new Date(c.cuando).toISOString(), codigo_prenda: cod })
    }
  }
  return avisos
}

async function contexto(db, linea) {
  const [m] = await q(db, 'select empresa_id from marca where id = $1', [linea])
  if (!m) return null
  const depositos = (await q(db, 'select id from deposito where marca = $1', [linea])).map((d) => d.id)
  return { empresa_id: m.empresa_id, depositos }
}

/**
 * Arma el ajuste y lo deja `para_aprobar` (⛔ mueve el libro todavía). Devuelve `{ ok, ajuste: { id, numero, … }, renglones, avisos }`.
 * @param {import('pg').ClientBase} db @param {any} e la entrada de `armarAjuste` @param {{ ahora?: Date }} [op]
 */
export async function crearAjuste(db, e, { ahora = new Date() } = {}) {
  return enTransaccion(db, async () => {
    const ctx = await contexto(db, e?.linea)
    if (!ctx) return falla('ENTRADA_INVALIDA', `Línea desconocida: ${e?.linea}`, 'linea')
    const variantes = Array.isArray(e.renglones) ? e.renglones.filter((r) => entero(r?.product_id) && entero(r?.size_id)) : []
    const niveles = await nivelesDe(db, e.deposito, variantes)
    const armado = armarAjuste(e, { ...ctx, niveles })
    if (!armado.ok) return armado
    const [n] = await q(db, `insert into stock_ajuste_numero (linea, ultimo) values ($1, 1)
      on conflict (linea) do update set ultimo = stock_ajuste_numero.ultimo + 1 returning ultimo`, [e.linea])
    const [a] = await q(db, `insert into stock_ajuste (empresa_id, linea, numero, deposito, motivo, detalle, fuente, estado, creado_por, creado_en)
      values ($1, $2, $3, $4, $5, $6, $7, 'para_aprobar', $8, $9) returning *`,
    [ctx.empresa_id, e.linea, Number(n.ultimo), armado.ajuste.deposito, armado.ajuste.motivo, armado.ajuste.detalle, armado.ajuste.fuente, armado.ajuste.creado_por, ahora.toISOString()])
    await db.query(`insert into stock_ajuste_renglon (ajuste_id, n, empresa_id, product_id, size_id, sku, barcode, antes, contado, diferencia)
      select $1, n, empresa_id, product_id, size_id, sku, barcode, antes, contado, diferencia
      from jsonb_to_recordset($2::jsonb) as x(n int, empresa_id text, product_id bigint, size_id bigint, sku text, barcode text, antes int, contado int, diferencia int)`,
    [a.id, JSON.stringify(armado.renglones)])
    const avisos = await conteosRecientes(db, armado.ajuste.deposito, armado.renglones, ahora)
    return { ok: true, ajuste: a, renglones: armado.renglones, avisos }
  })
}

async function leerParaResolver(db, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id ?? ''))) return falla('ENTRADA_INVALIDA', 'Falta el ajuste', 'ajuste_id')
  const [a] = await q(db, 'select * from stock_ajuste where id = $1 for update', [id])
  if (!a) return falla('NO_ENCONTRADO', 'No está ese ajuste')
  if (a.estado !== 'para_aprobar') return falla('YA_RESUELTO', `El ajuste A-${a.numero} ya está ${a.estado}`)
  return { ok: true, ajuste: a }
}

/**
 * Aprueba: escribe en el libro un movimiento `ajuste` por renglón (en UNA transacción) y lo marca `aplicado`.
 * `avisos` trae los renglones cuyo libro se movió desde que se armó (ventas en el medio): la diferencia ⛔ cambia.
 * @param {import('pg').ClientBase} db @param {{ ajuste_id: string, usuario: string }} e @param {{ ahora?: Date }} [op]
 */
export async function aprobarAjuste(db, e, { ahora = new Date() } = {}) {
  return enTransaccion(db, async () => {
    const usuario = String(e?.usuario ?? '').trim()
    if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién aprueba', 'usuario')
    const l = await leerParaResolver(db, e?.ajuste_id)
    if (!l.ok) return l
    const a = l.ajuste
    const renglones = (await q(db, 'select * from stock_ajuste_renglon where ajuste_id = $1 order by n', [a.id]))
      .map((r) => ({ ...r, product_id: Number(r.product_id), size_id: Number(r.size_id) }))
    const ahoraNivel = await nivelesDe(db, a.deposito, renglones)
    const avisos = []
    for (const r of renglones) {
      const hoy = ahoraNivel.get(claveDe(r)) ?? 0
      if (hoy !== r.antes) avisos.push({ codigo: 'LIBRO_SE_MOVIO', product_id: r.product_id, size_id: r.size_id, sku: r.sku, antes: r.antes, ahora: hoy })
    }
    const movimientos = movimientosDe(a, renglones, ahora)
    await db.query(`insert into stock_movimiento (linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, ocurrido_en, hora_exacta, grupo, detalle)
      select linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, ocurrido_en, hora_exacta, grupo, detalle
      from jsonb_populate_recordset(null::stock_movimiento, $1::jsonb)`, [JSON.stringify(movimientos)])
    await db.query(`update stock_ajuste set estado = 'aplicado', resuelto_por = $2, resuelto_en = $3 where id = $1`, [a.id, usuario, ahora.toISOString()])
    return { ok: true, ajuste: { id: a.id, numero: a.numero, estado: 'aplicado' }, movimientos: movimientos.length, avisos }
  })
}

/** Rechaza sin mover nada; el motivo es obligatorio (queda a la vista de quien lo armó). */
export async function rechazarAjuste(db, e, { ahora = new Date() } = {}) {
  return enTransaccion(db, async () => {
    const usuario = String(e?.usuario ?? '').trim()
    const motivo = String(e?.motivo ?? '').trim()
    if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién rechaza', 'usuario')
    if (motivo.length < 3) return falla('ENTRADA_INVALIDA', 'Falta por qué se rechaza', 'motivo')
    const l = await leerParaResolver(db, e?.ajuste_id)
    if (!l.ok) return l
    await db.query(`update stock_ajuste set estado = 'rechazado', resuelto_por = $2, resuelto_en = $3, rechazo = $4 where id = $1`, [l.ajuste.id, usuario, ahora.toISOString(), motivo])
    return { ok: true, ajuste: { id: l.ajuste.id, numero: l.ajuste.numero, estado: 'rechazado' } }
  })
}

/** Los ajustes de una línea (los más nuevos primero: el número es por línea), con sus renglones. Una base sin la 026 ⇒ `{ sinTablas: true }`. */
export async function ajustesDe(db, { linea, estado = null, limite = 100 }) {
  const [{ hay }] = await q(db, `select to_regclass('stock_ajuste') is not null as hay`)
  if (!hay) return { sinTablas: true, ajustes: [] }
  const ajustes = await q(db, `select a.*, coalesce((select jsonb_agg(to_jsonb(r) order by r.n) from stock_ajuste_renglon r where r.ajuste_id = a.id), '[]') as renglones
    from stock_ajuste a where a.linea = $1 and ($2::text is null or a.estado = $2) order by a.numero desc limit $3`,
  [linea, estado, Math.min(Number(limite) || 100, 500)])
  // Los que esperan aprobación traen el libro de AHORA en cada renglón (`ahora`): si se movió desde que se contó, el admin
  // lo ve ANTES de aprobar (una venta de una prenda que el conteo ⛔ vio).
  for (const a of ajustes.filter((x) => x.estado === 'para_aprobar')) {
    const hoy = await nivelesDe(db, a.deposito, a.renglones)
    for (const r of a.renglones) r.ahora = hoy.get(claveDe(r)) ?? 0
  }
  return { sinTablas: false, ajustes }
}
