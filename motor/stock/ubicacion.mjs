/**
 * LA UBICACIÓN FÍSICA DE CADA PRENDA (sql/066; erp-stunned §8 punto 5, diseño aprobado por Bruno el 31-oct).
 *
 * Una fila por línea × depósito × producto × talle, como la `observation` de GN. La pantalla Ubicaciones del monitor carga POR
 * PRODUCTO: `guardarUbicacion` escribe el mismo texto en todas las variantes del producto en ese depósito. Texto vacío = sin
 * ubicación ⇒ se borran las filas.
 *
 * 🔑 Las variantes del producto salen del catálogo (`variante`) + las que manda el que llama (el monitor pasa las del espejo de GN,
 *    que pueden ser más nuevas que la copia del catálogo) + las que ya tienen ubicación (para que limpiar las limpie todas).
 * 🔑 `copiarDeGn`: el día antes del corte de la línea, lo que dice GN (el espejo `inventario`) pasa al ERP ⇒ arranca completo.
 *    Antes del corte GN es la verdad (las pantallas leen de ahí): la copia PISA lo distinto y BORRA lo que GN ⛔ tiene. Una línea
 *    ya cortada ⛔ se copia (el ERP manda), salvo `aunqueCorto` (Stunned: cortó el 28-oct, antes de que existiera esta tabla).
 */
import { depositoDe, lineaDe, lineasDeBase } from '../depositos.mjs'

const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const q = async (db, sql, p = []) => (await db.query(sql, p)).rows

/** Lo que entra: recortado, a lo sumo 20 (como GN), y recortado otra vez. `''` = sin ubicación. */
export function normalizarUbicacion(texto) {
  return (texto == null ? '' : String(texto)).trim().slice(0, 20).trim()
}

async function hayTabla(db) {
  const [{ hay }] = await q(db, `select to_regclass('public.ubicacion') is not null as hay`)
  return hay
}

async function empresaDe(db, linea) {
  const [m] = await q(db, 'select empresa_id from marca where id = $1', [linea])
  return m?.empresa_id ?? null
}

async function existeDeposito(db, linea, deposito) {
  return (await q(db, 'select 1 from deposito where marca = $1 and id = $2', [linea, deposito])).length > 0
}

/**
 * Escribe la ubicación de un producto (todas sus variantes) en un depósito.
 * @returns {Promise<{ ok: true, variantes: number, cambiadas: number } | { ok: false, error: { codigo: string, mensaje: string } }>}
 */
export async function guardarUbicacion(db, { linea, deposito, product_id, texto, usuario, size_ids = [] }) {
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién carga la ubicación', 'usuario')
  const pid = Number(product_id)
  if (!Number.isInteger(pid) || pid <= 0) return falla('ENTRADA_INVALIDA', 'Falta el producto', 'product_id')
  if (!(await hayTabla(db))) return falla('SIN_MIGRACION', 'Falta la migración 066 (ubicacion) en esta base')
  const empresa = await empresaDe(db, linea)
  if (!empresa) return falla('ENTRADA_INVALIDA', `Línea desconocida: ${linea}`, 'linea')
  if (!(await existeDeposito(db, linea, deposito))) return falla('ENTRADA_INVALIDA', `Depósito desconocido para ${linea}: ${deposito}`, 'deposito')
  const valor = normalizarUbicacion(texto)

  const talles = new Set((size_ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))
  for (const r of await q(db, 'select size_id from variante where empresa_id = $1 and product_id = $2', [empresa, pid])) talles.add(Number(r.size_id))
  const previas = await q(db, `select size_id, texto from ubicacion where empresa_id = $1 and linea = $2 and deposito = $3 and product_id = $4`,
    [empresa, linea, deposito, pid])
  for (const r of previas) talles.add(Number(r.size_id))
  if (!talles.size) return falla('SIN_VARIANTES', `El producto ${pid} ⛔ tiene variantes conocidas por el ERP`)

  const antes = new Map(previas.map((r) => [Number(r.size_id), r.texto]))
  const lista = [...talles].sort((a, b) => a - b)
  const cambiadas = lista.filter((s) => (antes.get(s) ?? '') !== valor).length
  if (!cambiadas) return { ok: true, variantes: lista.length, cambiadas: 0 }

  if (!valor) {
    await db.query('delete from ubicacion where empresa_id = $1 and linea = $2 and deposito = $3 and product_id = $4', [empresa, linea, deposito, pid])
  } else {
    await db.query(`insert into ubicacion (empresa_id, linea, deposito, product_id, size_id, texto, actualizado_por, fuente)
      select $1, $2, $3, $4, s, $5, $6, 'pantalla' from unnest($7::bigint[]) s
      on conflict (empresa_id, linea, deposito, product_id, size_id) do update
        set texto = excluded.texto, actualizado_por = excluded.actualizado_por, actualizado_en = now(), fuente = 'pantalla'
        where ubicacion.texto is distinct from excluded.texto`,
    [empresa, linea, deposito, pid, valor, usuario, lista])
  }
  return { ok: true, variantes: lista.length, cambiadas }
}

/** Las ubicaciones de las líneas pedidas (todas sus filas), opcionalmente de un depósito: `[{ linea, deposito, product_id, size_id, texto }]`. */
export async function ubicacionesDe(db, { lineas, deposito = null }) {
  if (!Array.isArray(lineas) || !lineas.length) return []
  if (!(await hayTabla(db))) throw new Error('Falta la tabla ubicacion (motor sql/066)')
  return (await q(db, `select linea, deposito, product_id, size_id, texto from ubicacion
    where linea = any($1::text[]) and ($2::text is null or deposito = $2) order by linea, deposito, product_id, size_id`, [lineas, deposito]))
    .map((r) => ({ linea: r.linea, deposito: r.deposito, product_id: Number(r.product_id), size_id: Number(r.size_id), texto: r.texto }))
}

/**
 * Lo que GN dice de una línea, como filas del ERP. Puro: `filas` son las del espejo `inventario` (product_id, size_id, store_name,
 * sku, observation). Un depósito que el motor ⛔ conoce se cuenta aparte; una variante repetida con dos textos distintos, también
 * (gana el primero, en el orden de la consulta).
 */
export function deGn(base, linea, filas) {
  const out = new Map()
  const desconocidos = new Set()
  const choques = []
  for (const r of filas || []) {
    const texto = normalizarUbicacion(r.observation)
    if (!texto) continue
    if (lineaDe(base, r.sku) !== linea) continue
    const deposito = depositoDe(base, r.store_name)
    if (!deposito) { desconocidos.add(String(r.store_name)); continue }
    const k = `${deposito}:${Number(r.product_id)}:${Number(r.size_id)}`
    const ya = out.get(k)
    if (ya) { if (ya.texto !== texto) choques.push({ ...ya, otro: texto }); continue }
    out.set(k, { deposito, product_id: Number(r.product_id), size_id: Number(r.size_id), texto })
  }
  return { filas: [...out.values()], desconocidos: [...desconocidos].sort(), choques }
}

/** Qué cambia al copiar: `{ nuevas, distintas, sobran, iguales }` (las tres primeras, listas de filas). Puro. */
export function planCopia(gn, erp) {
  const k = (r) => `${r.deposito}:${r.product_id}:${r.size_id}`
  const enErp = new Map(erp.map((r) => [k(r), r]))
  const enGn = new Set(gn.map(k))
  const nuevas = []
  const distintas = []
  let iguales = 0
  for (const r of gn) {
    const e = enErp.get(k(r))
    if (!e) nuevas.push(r)
    else if (e.texto !== r.texto) distintas.push({ ...r, antes: e.texto })
    else iguales++
  }
  const sobran = erp.filter((r) => !enGn.has(k(r)))
  return { nuevas, distintas, sobran, iguales }
}

/**
 * Copia las ubicaciones de GN (el espejo `inventario`) al ERP para UNA línea. Sin `escribir`, sólo cuenta.
 * 🔴 Con la línea ya cortada FRENA (`YA_CORTO`): el ERP manda y la copia pisaría lo cargado después. `aunqueCorto` lo saltea.
 */
export async function copiarDeGn(db, { base, linea, escribir = false, usuario, aunqueCorto = false }) {
  if (!lineasDeBase(base).includes(linea)) return falla('ENTRADA_INVALIDA', `La línea ${linea} ⛔ vive en la base ${base}`, 'linea')
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién copia', 'usuario')
  if (!(await hayTabla(db))) return falla('SIN_MIGRACION', 'Falta la migración 066 (ubicacion) en esta base')
  const empresa = await empresaDe(db, linea)
  if (!empresa) return falla('ENTRADA_INVALIDA', `Línea desconocida: ${linea}`, 'linea')
  const [{ corte }] = await q(db, `select case when to_regclass('public.erp_corte') is null then null
    else (select instante from erp_corte where linea = $1 and instante <= now()) end as corte`, [linea])
  if (corte && !aunqueCorto) return falla('YA_CORTO', `${linea} ya está en el ERP desde ${new Date(corte).toISOString()}: la ubicación de GN ⛔ se copia (el ERP manda)`)
  // Después del pasaje del espejo (`pasaje-espejo-corte.sql`), `inventario` es la vista del ERP y lo de GN quedó en `inventario_gn`.
  const [{ tabla }] = await q(db, `select case when to_regclass('public.inventario_gn') is not null then 'inventario_gn' else 'inventario' end as tabla`)
  const crudas = await q(db, `select product_id, size_id, store_name, sku, observation from ${tabla}
    where observation is not null and btrim(observation) <> '' order by product_id, size_id, store_name`)
  const gn = deGn(base, linea, crudas)
  const erp = (await ubicacionesDe(db, { lineas: [linea] })).map(({ linea: _l, ...r }) => r)
  const plan = planCopia(gn.filas, erp)
  const resumen = {
    ok: true, escribio: false, linea, corte: corte ? new Date(corte).toISOString() : null, tabla,
    gn: gn.filas.length, iguales: plan.iguales, nuevas: plan.nuevas.length, distintas: plan.distintas.length, sobran: plan.sobran.length,
    desconocidos: gn.desconocidos, choques: gn.choques.length, muestra: { distintas: plan.distintas.slice(0, 5), sobran: plan.sobran.slice(0, 5), choques: gn.choques.slice(0, 5) },
  }
  if (!escribir || (!plan.nuevas.length && !plan.distintas.length && !plan.sobran.length)) return resumen

  await db.query('begin')
  try {
    const escribirFilas = [...plan.nuevas, ...plan.distintas]
    if (escribirFilas.length) {
      await db.query(`insert into ubicacion (empresa_id, linea, deposito, product_id, size_id, texto, actualizado_por, fuente)
        select $1, $2, x.deposito, x.product_id, x.size_id, x.texto, $3, 'gn'
          from jsonb_to_recordset($4::jsonb) as x(deposito text, product_id bigint, size_id bigint, texto text)
        on conflict (empresa_id, linea, deposito, product_id, size_id) do update
          set texto = excluded.texto, actualizado_por = excluded.actualizado_por, actualizado_en = now(), fuente = 'gn'`,
      [empresa, linea, usuario, JSON.stringify(escribirFilas)])
    }
    if (plan.sobran.length) {
      await db.query(`delete from ubicacion u using jsonb_to_recordset($3::jsonb) as x(deposito text, product_id bigint, size_id bigint)
        where u.empresa_id = $1 and u.linea = $2 and u.deposito = x.deposito and u.product_id = x.product_id and u.size_id = x.size_id`,
      [empresa, linea, JSON.stringify(plan.sobran)])
    }
    await db.query('commit')
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
  return { ...resumen, escribio: true }
}
