/**
 * LA CONEXIÓN CON INGRESOS (estándar de Ger A.1–A.10): el cliente de su API, lo que queda anotado de cada lectura (`conexion_lectura`,
 * sql/074) y la vuelta de costos. Lo corre el monitor, que es quien tiene los tokens (`api/_ingresos-lectura.js`).
 * 🔴 El token va sólo en la cabecera: ⛔ se sigue una redirección (se lo llevaría a otro host) y ⛔ aparece en ningún error.
 */
import { cargarCostosDeIngresos, guardarTiposDeIngreso } from './costo-ingresos.mjs'
import { candidatos, importarElegidos, skusDeOcSinCruzar, variantesDelErp } from './catalogo-ingresos.mjs'
import { leerCortes, productoIngresosManda, pruebaIngresos } from './llave-corte.mjs'

export const BASE_INGRESOS = 'https://ingreso2.arebensrl.com/api/ext/v1'
export const PERMISO_COSTOS = 'product_costs:read'
const ESPERA_MS = 10_000
const POR_PAGINA = 200
/** Hasta acá se piden de a uno; con más, conviene recorrer el catálogo entero. */
const DE_A_UNO = 20

/** Una respuesta que ⛔ fue 2xx: la lógica decide por `code` (A.10). */
export class ErrorExt extends Error {
  constructor(status, code, detalle) {
    super(`contestó ${status}${code ? ` ${code}` : ''}`)
    this.status = status
    this.code = code ?? null
    this.detalle = detalle ?? null
  }
}

export async function pedirExt(ruta, { token, base = BASE_INGRESOS, fetch = globalThis.fetch }) {
  const r = await fetch(`${base}${ruta}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(ESPERA_MS),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'AreBenERP/1.0' },
  })
  const cuerpo = await r.json().catch(() => null)
  if (!r.ok) throw new ErrorExt(r.status, typeof cuerpo?.code === 'string' ? cuerpo.code : null, typeof cuerpo?.detail === 'string' ? cuerpo.detail.slice(0, 200) : null)
  return cuerpo
}

/** Todas las páginas de un listado (A.7). */
export async function listarExt(ruta, o) {
  const items = []
  const sep = ruta.includes('?') ? '&' : '?'
  for (let offset = 0; ; offset += POR_PAGINA) {
    if (o.hasta && Date.now() > o.hasta) throw new ErrorExt(0, 'sin_tiempo', 'No alcanzó el tiempo: sigue la vuelta siguiente.')
    const p = await pedirExt(`${ruta}${sep}limit=${POR_PAGINA}&offset=${offset}`, o)
    items.push(...(p?.items ?? []))
    if (offset + POR_PAGINA >= (p?.total ?? 0)) return items
  }
}

/** Quién es el token y hasta cuándo sirve. 🔴 Un token de otro negocio guardaría datos en la marca equivocada. */
export async function mirarToken(negocio, o) {
  const me = await pedirExt('/me', o)
  const slug = me?.business?.slug ?? me?.store?.slug
  if (slug !== negocio) throw new ErrorExt(200, 'otro_negocio', `El token de ${negocio} es de ${slug ?? 'otro negocio'}.`)
  return { vence: me.expires_at ?? null, permisos: Array.isArray(me.scopes) ? me.scopes : [] }
}

/** Anota una lectura. `cursor` y `token_vence_en` sin dato conservan el anterior. */
export async function anotarLectura(db, { sistema, negocio, ok, status = null, code = null, detalle = null, vence, cursor, resumen = null, ahora = new Date() }) {
  await db.query(`insert into conexion_lectura as c (empresa_id, sistema, negocio, ultimo_intento_en, ultimo_ok_en, status, code, detalle, token_vence_en, cursor, resumen)
    values ('areben', $1, $2, $3, case when $4::boolean then $3::timestamptz end, $5, $6, $7, $8, $9, $10::jsonb)
    on conflict (empresa_id, sistema, negocio) do update set ultimo_intento_en = excluded.ultimo_intento_en, ultimo_ok_en = coalesce(excluded.ultimo_ok_en, c.ultimo_ok_en),
      status = excluded.status, code = excluded.code, detalle = excluded.detalle, token_vence_en = coalesce(excluded.token_vence_en, c.token_vence_en),
      cursor = coalesce(excluded.cursor, c.cursor), resumen = coalesce(excluded.resumen, c.resumen)`,
  [sistema, negocio, ahora, !!ok, status, code, detalle, vence ?? null, cursor ?? null, resumen == null ? null : JSON.stringify(resumen)])
}

/** Lo que se sabe de un error, para anotarlo. */
export const datosDelError = (e) => (e instanceof ErrorExt
  ? { status: e.status || null, code: e.code, detalle: e.detalle }
  : { status: null, code: 'sin_respuesta', detalle: String(e?.name === 'TimeoutError' ? 'No contestó a tiempo.' : 'No se pudo consultar.') })

async function productosDe(ids, o) {
  if (ids.length > DE_A_UNO) return listarExt('/products', o)
  const salida = []
  for (const id of ids) {
    try { salida.push(await pedirExt(`/products/${id}`, o)) } catch (e) { if (e?.status !== 404) throw e }
  }
  return salida
}

/**
 * Una vuelta de una marca, en la base de control `control` (BDI) y la de la marca `db`:
 * mira el token, guarda el tipo de ingreso y, si manda o es un seco, carga los costos. ⛔ tira: el resultado queda anotado.
 * @param {{ control: any, db: any, negocio: 'bdi'|'zattia', token: string, manda: boolean, seco?: boolean, hasta?: number, fetch?: typeof globalThis.fetch, ahora?: Date }} a
 */
export async function correrCostos({ control, db, negocio, token, manda, seco = false, hasta, fetch = globalThis.fetch, ahora = new Date() }) {
  const o = { token, fetch, hasta }
  const sistema = 'ingresos-costos'
  const anotar = (d) => (seco ? null : anotarLectura(control, { sistema, negocio, ahora, ...d }))
  let vence
  try {
    const t = await mirarToken(negocio, o)
    vence = t.vence
    const salida = { manda, seco, vence, tipos: null, costos: null }
    if (t.permisos.includes('suppliers:read')) salida.tipos = await guardarTiposDeIngreso(db, { proveedores: await listarExt('/suppliers', o), escribir: !seco })
    if (!t.permisos.includes(PERMISO_COSTOS)) {
      const detalle = `El token ⛔ tiene el permiso ${PERMISO_COSTOS}.`
      await anotar({ ok: true, status: 200, code: 'sin_permiso', detalle, vence, resumen: salida })
      return { ...salida, sin_permiso: true }
    }
    if (manda || seco) {
      // 🔴 Siempre la lista entera, ⛔ desde un cursor: un costo que hoy ⛔ cruza (el producto todavía ⛔ existe acá) se perdería al avanzar.
      const costos = await listarExt('/product-costs', o)
      const productos = await productosDe([...new Set(costos.map((c) => Number(c.product_id)))], o)
      const { sin_cruce, ...r } = await cargarCostosDeIngresos(db, { marca: negocio, costos, productos, escribir: manda && !seco })
      salida.costos = { ...r, sin_cruce: sin_cruce.length }
    }
    await anotar({ ok: true, status: 200, vence, resumen: salida })
    return salida
  } catch (e) {
    const d = datosDelError(e)
    await anotar({ ok: false, vence, ...d })
    return { error: d.code ?? `contestó ${d.status}`, status: d.status, detalle: d.detalle }
  }
}

/** Sólo desde el corte de la marca y sin el freno (`ERP_NO_MANDA`). Sin eso, el motivo: la pantalla lo dice y ⛔ se le pregunta nada a Ingresos. */
async function puedeImportar(db, negocio, env, ahora) {
  const cortes = await leerCortes(db)
  if (productoIngresosManda(negocio, cortes, env, ahora)) return { manda: true, corte: cortes[negocio] }
  const desde = cortes[negocio] ? null : pruebaIngresos(negocio, env)
  if (desde) return { manda: true, corte: desde, prueba: true }
  return { manda: false, corte: cortes[negocio] ?? null, motivo: cortes[negocio] ? 'frenada' : 'sin_corte' }
}

/**
 * «Actualizar Ingresos»: lo que Ingresos tiene y el ERP ⛔, para elegir. Lee, ⛔ escribe. A PEDIDO: ⛔ tiene cron (Bruno, 3-nov).
 * @param {{ control: any, db: any, negocio: 'bdi'|'zattia', token: string, env?: any, fetch?: typeof globalThis.fetch, ahora?: Date }} a
 */
export async function leerParaImportar({ control, db, negocio, token, env = process.env, fetch = globalThis.fetch, ahora = new Date() }) {
  const p = await puedeImportar(db, negocio, env, ahora)
  if (!p.manda) return p
  const o = { token, fetch }
  await mirarToken(negocio, o)
  const productos = await listarExt('/products', o)
  const skusDeOc = await skusDeOcSinCruzar({ control, db, marca: negocio, corte: p.corte })
  return { ...p, ...candidatos({ marca: negocio, productos, variantes: await variantesDelErp(db), corte: p.corte, skusDeOc }) }
}

/**
 * Importa lo elegido. Vuelve a mirar el corte y a leer Ingresos: ⛔ se confía en lo que la pantalla leyó hace un rato.
 * @param {{ control: any, db: any, negocio: 'bdi'|'zattia', token: string, elegidos: number[], usuario: string, env?: any, fetch?: typeof globalThis.fetch, ahora?: Date }} a
 */
export async function importarDeIngresos({ control, db, negocio, token, elegidos, usuario, env = process.env, fetch = globalThis.fetch, ahora = new Date() }) {
  const p = await puedeImportar(db, negocio, env, ahora)
  if (!p.manda) return p
  const o = { token, fetch }
  await mirarToken(negocio, o)
  const productos = await listarExt('/products', o)
  const skusDeOc = await skusDeOcSinCruzar({ control, db, marca: negocio, corte: p.corte })
  return { manda: true, ...(await importarElegidos(db, { marca: negocio, productos, corte: p.corte, skusDeOc, elegidos, usuario })) }
}
