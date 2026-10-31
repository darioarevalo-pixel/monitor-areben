/**
 * LA SALIDA CON VUELTA (sesión A; Bruno 25-oct): sesión de fotos, muestra para producción y solicitud interna retornable.
 * Sale del depósito al escanear, vuelve a los 2-3 días; lo que no vuelve se declara al CERRAR y cae en los motivos de
 * ajuste de sql/047. Tablas: sql/048. Contrato para el monitor: SALIDA.md.
 *
 * 🔑 EN SOMBRA hasta el corte: con la llave `salida_mueve_libro` apagada el documento se anota y ⛔ mueve el libro (la venta
 * de GN ya lo hace). Prendida, los documentos NUEVOS nacen moviéndolo: sale al crear, entra al devolver. El valor se guarda
 * en el documento (`mueve_libro`) ⇒ prender la llave ⛔ cambia los que ya estaban sacados.
 * 🔑 EL CORTE IMPLICA QUE LA SALIDA MUEVE EL LIBRO (Bruno 30-oct/31-oct): desde el corte de su línea (`erp_corte`, sql/063) ⛔ hay
 * venta de GN ⇒ la salida nueva mueve el libro aunque la llave esté apagada (⛔ hay que acordarse de prenderla el día del corte).
 * Y una salida que nació EN SOMBRA antes del corte y VUELVE después: el alineo del corte copió el stock de GN, que ya la tenía
 * afuera ⇒ lo que vuelve (o se cancela) ENTRA al libro; si no, la prenda queda en 0 en el ERP estando en el depósito, callada.
 * ⚠️ Si esa venta de GN ya se había cancelado en GN ANTES del corte (la prenda volvió en GN pero la solicitud se guardó después),
 * entraría dos veces: el ERP ⛔ lo puede saber.
 *
 * Cerrar exige que cada prenda esté CONTADA (devuelta + consumida + dañada + perdida = lo que salió). Lo que no volvió
 * entero se vuelve ajuste con `sin_movimiento` (la prenda ya salió): consumida ⇒ `consumible` (al instante), dañada ⇒
 * `fallado`, perdida ⇒ `faltante_robo` (esos dos esperan al admin). Todo vuelta entera ⇒ ni ajuste ni gasto.
 */
import { guardarAjuste, nivelesDe } from './ajuste.mjs'
import { configuracionDe } from './interruptores.mjs'
import { costosDe } from '../venta/costo.mjs'
import { gnYaNoManda } from '../depositos.mjs'

export const TIPOS = { foto: 'Sesión de fotos', produccion: 'Muestra para producción', interna: 'Solicitud interna' }
/** Cómo se llama en el ajuste lo que no volvió entero. */
export const MOTIVO_DE = { consumida: 'consumible', danada: 'fallado', perdida: 'faltante_robo' }
export const MAX_RENGLONES = 500

const falla = (codigo, mensaje, campo, extra) => ({ ok: false, error: { codigo, mensaje, ...(campo ? { campo } : {}), ...(extra ?? {}) } })
const entero = (x) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && Number.isInteger(Number(x))
const claveDe = (r) => `${r.product_id}:${r.size_id}`
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

/** La salida lista para escribir: `{ ok, salida, renglones }` o `{ ok: false, error }`. Puro. */
export function armarSalida(e, { empresa_id, depositos, costos = new Map() }) {
  if (!e || typeof e !== 'object') return falla('ENTRADA_INVALIDA', 'Falta la salida')
  const usuario = String(e.usuario ?? '').trim()
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién la hace', 'usuario')
  if (!TIPOS[e.tipo]) return falla('ENTRADA_INVALIDA', `Tipo desconocido: ${e.tipo}`, 'tipo')
  const ref = String(e.ref ?? '').trim()
  if (!ref) return falla('ENTRADA_INVALIDA', 'Falta la solicitud de la que sale (ref)', 'ref')
  const entrada = Array.isArray(e.renglones) ? e.renglones : []
  if (!entrada.length) return falla('ENTRADA_INVALIDA', 'La salida no tiene prendas', 'renglones')
  if (entrada.length > MAX_RENGLONES) return falla('ENTRADA_INVALIDA', `Más de ${MAX_RENGLONES} prendas: partila`, 'renglones')
  const vistas = new Set()
  const renglones = []
  for (const r of entrada) {
    if (!entero(r?.product_id) || !entero(r?.size_id)) return falla('ENTRADA_INVALIDA', 'Una prenda sin variante', 'renglones')
    if (!depositos.includes(r.deposito)) return falla('ENTRADA_INVALIDA', `Depósito desconocido para ${e.linea}: ${r.deposito}`, 'renglones')
    if (!entero(r.cantidad) || Number(r.cantidad) <= 0) return falla('ENTRADA_INVALIDA', `Falta la cantidad de ${r.sku || claveDe(r)}`, 'renglones')
    const k = `${claveDe(r)}:${r.deposito}`
    if (vistas.has(k)) return falla('ENTRADA_INVALIDA', `La prenda ${r.sku || claveDe(r)} está dos veces en ${r.deposito}`, 'renglones')
    vistas.add(k)
    const c = costos.get(Number(r.product_id))
    renglones.push({
      n: renglones.length + 1, empresa_id, product_id: Number(r.product_id), size_id: Number(r.size_id), sku: r.sku ?? null, barcode: r.barcode ?? null,
      deposito: r.deposito, cantidad: Number(r.cantidad), costo_unitario: c ? c.costo : 0, costo_fuente: c ? c.fuente : 'sin_costo',
    })
  }
  const gn = e.gn_sale_ids && typeof e.gn_sale_ids === 'object' && !Array.isArray(e.gn_sale_ids) ? e.gn_sale_ids : {}
  return {
    ok: true, renglones,
    salida: { empresa_id, linea: e.linea, tipo: e.tipo, ref, detalle: String(e.detalle ?? '').trim() || null, gn_sale_ids: gn, creado_por: usuario },
  }
}

/** Un movimiento del libro de una salida (sólo con `mueve_libro`). `cantidad` lleva el signo. Puro. */
export function movimientoDe(salida, r, { cantidad, tipo, clave, ahora }) {
  return {
    linea: salida.linea, product_id: Number(r.product_id), size_id: Number(r.size_id), sku: r.sku ?? null, barcode: r.barcode ?? null,
    deposito: r.deposito, cantidad, tipo, origen: 'salida', clave, origen_ref: clave,
    ocurrido_en: ahora.toISOString(), hora_exacta: true, grupo: `salida:${salida.id}`, detalle: { salida: salida.numero, tipo: salida.tipo },
  }
}

const escribirMovimientos = (db, movimientos) => movimientos.length
  ? db.query(`insert into stock_movimiento (linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, ocurrido_en, hora_exacta, grupo, detalle)
      select linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, ocurrido_en, hora_exacta, grupo, detalle
      from jsonb_populate_recordset(null::stock_movimiento, $1::jsonb)`, [JSON.stringify(movimientos)])
  : null

/**
 * ¿La línea ya cortó en `ahora`? Lee `erp_corte` (sql/063). 🔴 Sin la tabla FALLA (⛔ un «nadie cortó» callado).
 * @param {import('pg').ClientBase} db @param {string} linea @param {Date} ahora
 */
export async function yaCorto(db, linea, ahora) {
  const [{ hay }] = await q(db, `select to_regclass('erp_corte') is not null as hay`)
  if (!hay) throw new Error('Falta la tabla erp_corte (sql/063): ⛔ se sabe si la salida mueve el libro.')
  const filas = await q(db, 'select linea, instante from erp_corte where linea = $1', [linea])
  return gnYaNoManda(linea, ahora, Object.fromEntries(filas.map((r) => [r.linea, new Date(r.instante).toISOString()])))
}

/** ¿Lo que VUELVE de esta salida entra al libro? Si nació moviéndolo, o si nació en sombra y su línea ya cortó (ver arriba). */
const vueltaMueve = async (db, salida, ahora) => salida.mueve_libro === true || (await yaCorto(db, salida.linea, ahora))

const num = (r) => ({ ...r, product_id: Number(r.product_id), size_id: Number(r.size_id), cantidad: Number(r.cantidad) })

/**
 * Crea la salida. Idempotente por `(linea, ref)`: la segunda vez devuelve la que ya está (`ya: true`) ⛔ duplica.
 * @param {import('pg').ClientBase} db @param {any} e `{ linea, tipo, ref, usuario, detalle?, gn_sale_ids?, renglones: [{ product_id, size_id, deposito, cantidad, sku?, barcode? }] }`
 */
export async function crearSalida(db, e, { ahora = new Date() } = {}) {
  return enTransaccion(db, async () => {
    const [m] = await q(db, 'select empresa_id from marca where id = $1', [e?.linea])
    if (!m) return falla('ENTRADA_INVALIDA', `Línea desconocida: ${e?.linea}`, 'linea')
    const [previa] = await q(db, 'select * from salida where linea = $1 and ref = $2', [e.linea, String(e.ref ?? '').trim()])
    if (previa) return { ok: true, ya: true, salida: previa, renglones: await q(db, 'select * from salida_renglon where salida_id = $1 order by n', [previa.id]) }
    const depositos = (await q(db, 'select id from deposito where marca = $1', [e.linea])).map((d) => d.id)
    const ids = [...new Set((Array.isArray(e.renglones) ? e.renglones : []).filter((r) => entero(r?.product_id)).map((r) => Number(r.product_id)))]
    const armado = armarSalida(e, { empresa_id: m.empresa_id, depositos, costos: await costosDe(db, ids) })
    if (!armado.ok) return armado
    // La llave, o el corte de la línea: desde el corte ⛔ hay venta de GN que baje el stock.
    const mueve = (await configuracionDe(db, { linea: e.linea })).salida_mueve_libro === true || (await yaCorto(db, e.linea, ahora))
    const [n] = await q(db, `insert into salida_numero (linea, ultimo) values ($1, 1)
      on conflict (linea) do update set ultimo = salida_numero.ultimo + 1 returning ultimo`, [e.linea])
    const s = armado.salida
    const [salida] = await q(db, `insert into salida (empresa_id, linea, numero, tipo, ref, detalle, gn_sale_ids, mueve_libro, creado_por, creado_en)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10) returning *`,
    [s.empresa_id, s.linea, Number(n.ultimo), s.tipo, s.ref, s.detalle, JSON.stringify(s.gn_sale_ids), mueve, s.creado_por, ahora.toISOString()])
    await db.query(`insert into salida_renglon (salida_id, n, empresa_id, product_id, size_id, sku, barcode, deposito, cantidad, costo_unitario, costo_fuente)
      select $1, n, empresa_id, product_id, size_id, sku, barcode, deposito, cantidad, costo_unitario, costo_fuente
      from jsonb_to_recordset($2::jsonb) as x(n int, empresa_id text, product_id bigint, size_id bigint, sku text, barcode text, deposito text, cantidad int, costo_unitario numeric, costo_fuente text)`,
    [salida.id, JSON.stringify(armado.renglones)])
    const avisos = []
    if (mueve) {
      for (const dep of new Set(armado.renglones.map((r) => r.deposito))) {
        const delDep = armado.renglones.filter((r) => r.deposito === dep)
        const niveles = await nivelesDe(db, dep, delDep)
        for (const r of delDep) {
          const hay = niveles.get(claveDe(r)) ?? 0
          if (hay < r.cantidad) avisos.push({ codigo: 'SIN_STOCK_EN_LIBRO', product_id: r.product_id, size_id: r.size_id, sku: r.sku, libro: hay, sale: r.cantidad })
        }
      }
      await escribirMovimientos(db, armado.renglones.map((r) => movimientoDe(salida, r, { cantidad: -r.cantidad, tipo: 'salida_vuelta', clave: `${salida.id}:${r.n}:sale`, ahora })))
    }
    return { ok: true, ya: false, salida, renglones: armado.renglones, avisos }
  })
}

async function leerAbierta(db, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id ?? ''))) return falla('ENTRADA_INVALIDA', 'Falta la salida', 'salida_id')
  const [s] = await q(db, 'select * from salida where id = $1 for update', [id])
  if (!s) return falla('NO_ENCONTRADA', 'No está esa salida')
  if (s.estado !== 'salio') return falla('YA_RESUELTA', `La salida S-${s.numero} ya está ${s.estado}`)
  return { ok: true, salida: s, renglones: (await q(db, 'select * from salida_renglon where salida_id = $1 order by n for update', [id])).map(num) }
}

const contada = (r) => r.devuelta + r.consumida + r.danada + r.perdida

/**
 * Anota lo que VOLVIÓ (puede ser en varias veces). `renglones: [{ n, cantidad }]`. Con `mueve_libro` la prenda entra al libro.
 * Devolver de más ⛔ entra.
 */
export async function devolver(db, e, { ahora = new Date() } = {}) {
  return enTransaccion(db, async () => {
    const usuario = String(e?.usuario ?? '').trim()
    if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién recibe', 'usuario')
    const l = await leerAbierta(db, e?.salida_id)
    if (!l.ok) return l
    const entrada = Array.isArray(e.renglones) ? e.renglones : []
    if (!entrada.length) return falla('ENTRADA_INVALIDA', 'No hay nada que devolver', 'renglones')
    const porN = new Map(l.renglones.map((r) => [r.n, r]))
    const mueve = await vueltaMueve(db, l.salida, ahora)
    const movimientos = []
    const nuevas = new Map()
    for (const d of entrada) {
      const r = porN.get(Number(d?.n))
      if (!r) return falla('ENTRADA_INVALIDA', `No hay un renglón ${d?.n}`, 'renglones')
      if (!entero(d.cantidad) || Number(d.cantidad) <= 0) return falla('ENTRADA_INVALIDA', `Falta la cantidad devuelta de ${r.sku || claveDe(r)}`, 'renglones')
      const antes = nuevas.get(r.n) ?? r.devuelta
      const despues = antes + Number(d.cantidad)
      if (despues + r.consumida + r.danada + r.perdida > r.cantidad) {
        return falla('DEVUELVE_DE_MAS', `${r.sku || claveDe(r)}: salieron ${r.cantidad} y ya hay ${contada({ ...r, devuelta: antes })} contadas`, 'renglones')
      }
      nuevas.set(r.n, despues)
      if (mueve) movimientos.push(movimientoDe(l.salida, r, { cantidad: Number(d.cantidad), tipo: 'vuelta', clave: `${l.salida.id}:${r.n}:vuelve:${despues}`, ahora }))
    }
    for (const [n, dev] of nuevas) await db.query('update salida_renglon set devuelta = $3 where salida_id = $1 and n = $2', [l.salida.id, n, dev])
    await escribirMovimientos(db, movimientos)
    return { ok: true, salida: { id: l.salida.id, numero: l.salida.numero, estado: 'salio' }, movimientos: movimientos.length,
      faltan: l.renglones.map((r) => ({ n: r.n, sku: r.sku, falta: r.cantidad - contada({ ...r, devuelta: nuevas.get(r.n) ?? r.devuelta }) })).filter((x) => x.falta > 0) }
  })
}

/**
 * Cierra: `renglones: [{ n, consumida?, danada?, perdida? }]` es lo que NO volvió entero (más lo que se devuelve de una vez con
 * `devuelta?`). Todo renglón tiene que quedar contado completo ⇒ si no, `FALTA_CONTAR` con la lista. Arma los ajustes de gasto
 * (uno por motivo y depósito, `sin_movimiento`) en la misma transacción.
 */
export async function cerrarSalida(db, e, { ahora = new Date() } = {}) {
  return enTransaccion(db, async () => {
    const usuario = String(e?.usuario ?? '').trim()
    if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién cierra', 'usuario')
    const l = await leerAbierta(db, e?.salida_id)
    if (!l.ok) return l
    const porN = new Map(l.renglones.map((r) => [r.n, { ...r }]))
    const devueltas = new Map()
    for (const d of Array.isArray(e.renglones) ? e.renglones : []) {
      const r = porN.get(Number(d?.n))
      if (!r) return falla('ENTRADA_INVALIDA', `No hay un renglón ${d?.n}`, 'renglones')
      for (const campo of ['devuelta', 'consumida', 'danada', 'perdida']) {
        if (d[campo] == null || d[campo] === '') continue
        if (!entero(d[campo]) || Number(d[campo]) < 0) return falla('ENTRADA_INVALIDA', `«${campo}» de ${r.sku || claveDe(r)} tiene que ser un entero, 0 o más`, 'renglones')
        r[campo] += Number(d[campo])
        if (campo === 'devuelta') devueltas.set(r.n, (devueltas.get(r.n) ?? 0) + Number(d[campo]))
      }
    }
    const sinContar = [...porN.values()].filter((r) => contada(r) !== r.cantidad)
    if (sinContar.length) {
      return falla('FALTA_CONTAR', 'Hay prendas que ⛔ volvieron ni se declararon consumidas, dañadas o perdidas', 'renglones',
        { renglones: sinContar.map((r) => ({ n: r.n, sku: r.sku, product_id: r.product_id, size_id: r.size_id, sale: r.cantidad, contadas: contada(r), diferencia: r.cantidad - contada(r) })) })
    }
    const mueve = await vueltaMueve(db, l.salida, ahora)
    const movimientos = []
    for (const r of porN.values()) {
      await db.query('update salida_renglon set devuelta = $3, consumida = $4, danada = $5, perdida = $6 where salida_id = $1 and n = $2', [l.salida.id, r.n, r.devuelta, r.consumida, r.danada, r.perdida])
      const nuevaDev = devueltas.get(r.n)
      if (nuevaDev && mueve) movimientos.push(movimientoDe(l.salida, r, { cantidad: nuevaDev, tipo: 'vuelta', clave: `${l.salida.id}:${r.n}:vuelve:${r.devuelta}`, ahora }))
    }
    await escribirMovimientos(db, movimientos)
    // Un ajuste por motivo y depósito: lo que no volvió entero.
    const ajustes = []
    const avisos = []
    for (const campo of Object.keys(MOTIVO_DE)) {
      for (const dep of new Set([...porN.values()].filter((r) => r[campo] > 0).map((r) => r.deposito))) {
        const renglones = [...porN.values()].filter((r) => r[campo] > 0 && r.deposito === dep)
          .map((r) => ({ product_id: r.product_id, size_id: r.size_id, sku: r.sku, barcode: r.barcode, cantidad: -r[campo] }))
        const a = await guardarAjuste(db, {
          linea: l.salida.linea, deposito: dep, motivo: MOTIVO_DE[campo], fuente: 'salida', sin_movimiento: true, usuario,
          detalle: `${TIPOS[l.salida.tipo]} S-${l.salida.numero} (${l.salida.ref})`, renglones,
        }, { ahora })
        if (!a.ok) return a
        ajustes.push({ id: a.ajuste.id, numero: a.ajuste.numero, motivo: a.ajuste.motivo, estado: a.ajuste.estado, deposito: dep })
        avisos.push(...a.avisos)
      }
    }
    await db.query(`update salida set estado = 'cerrada', cerrado_por = $2, cerrado_en = $3 where id = $1`, [l.salida.id, usuario, ahora.toISOString()])
    return { ok: true, salida: { id: l.salida.id, numero: l.salida.numero, estado: 'cerrada' }, ajustes, avisos, movimientos: movimientos.length }
  })
}

/** Cancela una salida que ⛔ ocurrió (se escaneó mal). Sólo si nada volvió ni se declaró; si mueve el libro (`vueltaMueve`) devuelve lo que sacó. */
export async function cancelarSalida(db, e, { ahora = new Date() } = {}) {
  return enTransaccion(db, async () => {
    const usuario = String(e?.usuario ?? '').trim()
    const motivo = String(e?.motivo ?? '').trim()
    if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién cancela', 'usuario')
    if (motivo.length < 3) return falla('ENTRADA_INVALIDA', 'Falta por qué se cancela', 'motivo')
    const l = await leerAbierta(db, e?.salida_id)
    if (!l.ok) return l
    if (l.renglones.some((r) => contada(r) > 0)) return falla('YA_TIENE_MOVIMIENTO', `La salida S-${l.salida.numero} ya tiene prendas devueltas o declaradas: se cierra, ⛔ se cancela`)
    const movimientos = (await vueltaMueve(db, l.salida, ahora))
      ? l.renglones.map((r) => movimientoDe(l.salida, r, { cantidad: r.cantidad, tipo: 'vuelta', clave: `${l.salida.id}:${r.n}:cancela`, ahora }))
      : []
    await escribirMovimientos(db, movimientos)
    await db.query(`update salida set estado = 'cancelada', cerrado_por = $2, cerrado_en = $3, motivo_cancelacion = $4 where id = $1`, [l.salida.id, usuario, ahora.toISOString(), motivo])
    return { ok: true, salida: { id: l.salida.id, numero: l.salida.numero, estado: 'cancelada' }, movimientos: movimientos.length }
  })
}

/** Las salidas de una línea (las más nuevas primero), con sus renglones y lo que falta de cada una. Sin la 048 ⇒ `{ sinTablas: true }`. */
export async function salidasDe(db, { linea, estado = null, ref = null, limite = 100 }) {
  const [{ hay }] = await q(db, `select to_regclass('salida') is not null as hay`)
  if (!hay) return { sinTablas: true, salidas: [] }
  const salidas = await q(db, `select s.*, coalesce((select jsonb_agg(to_jsonb(r) order by r.n) from salida_renglon r where r.salida_id = s.id), '[]') as renglones
    from salida s where s.linea = $1 and ($2::text is null or s.estado = $2) and ($3::text is null or s.ref = $3) order by s.numero desc limit $4`,
  [linea, estado, ref, Math.min(Number(limite) || 100, 500)])
  for (const s of salidas) for (const r of s.renglones) r.falta = r.cantidad - contada(r)
  return { sinTablas: false, salidas }
}
