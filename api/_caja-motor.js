// La venta de la Caja, anotada TAMBIÉN en el motor (opción (a), Bruno 14-oct). La regla y la forma de la
// entrada viven en `lib/caja/motor.core.js`; acá está la conexión pg (⛔ supabase-js: el motor escribe en
// UNA transacción) y el repaso de las que quedaron afuera — y de las que se ANULARON en GN (`anulada_en_gn`,
// la anotan el cierre y el sync): el repaso las anula también en el motor (`anularVenta`).
//
// 🔴 NADA de acá frena a la cajera ni lanza: si el motor falla, la venta en GN ya salió. Se devuelve qué
// pasó y el handler lo anota en el log. Sin `DATABASE_URL_<MARCA>` en Vercel ⛔ está conectado todavía:
// cargarla (la URL del rol `motor`, puerto 6543) ES prenderlo, igual que el anular de `erp › Ventas`.
//
// ⛔ Archivo `_`: NO es una ruta.
import { COLUMNAS_MOTOR, DIAS_REPASO, REPASO_POR_VUELTA, anularEnMotor, entradaDelMotor, entradaDelMotorErp, faltanEnMotor } from '../lib/caja/motor.core.js'
import { configPg } from '../lib/pg.core.js'
import { SQL_STOCK_VARIANTE_LIBRO, stockDeVarianteLibro } from '../lib/stunned/inventario-erp.core.js'
import { marcaDeVentaErp } from '../lib/caja/corte-caja.core.js'
import { prendasQueFaltan } from '../lib/caja/pin-venta.core.js'

const PG_DE_STORE = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' }
/** El motor tiene que contestar rápido: la cajera está esperando el ticket. Lo que no entra, lo sube el repaso. */
const TECHO_MS = 4000

async function conMotor(store, fn) {
  const conexion = process.env[PG_DE_STORE[store]]
  if (!conexion) return { sinConexion: true }
  const [{ default: pg }, motor] = await Promise.all([import('pg'), import('../motor/venta/registrar.mjs')])
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: TECHO_MS, statement_timeout: TECHO_MS, query_timeout: TECHO_MS })
  try {
    await db.connect()
    return await fn(db, motor.registrarVenta, motor)
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  } finally {
    await db.end().catch(() => {})
  }
}

async function anotarCada(db, registrarVenta, ventas) {
  const r = { anotadas: 0, yaEstaban: 0, fallidas: [] }
  for (const v of ventas) {
    const out = await registrarVenta(db, entradaDelMotor(v))
    if (!out.ok) r.fallidas.push({ id: v.id, codigo: out.error.codigo, mensaje: out.error.mensaje })
    else if (out.ya_existia) r.yaEstaban++
    else r.anotadas++
  }
  return r
}

/**
 * El stock de una variante de una línea que ya está en el ERP (`erp_corte`), en el LIBRO: GN ⛔ lo mueve desde el corte.
 * @returns {Promise<{ local: number, deposito: number, evento: number } | { error: string }>} ⛔ Lanza.
 */
export async function stockDelLibro(store, linea, productId, sizeId) {
  const r = await conMotor(store, async (db) => stockDeVarianteLibro((await db.query(SQL_STOCK_VARIANTE_LIBRO, [String(productId), String(sizeId), String(linea)])).rows))
  if (r.sinConexion) return { error: 'El ERP no está conectado (falta DATABASE_URL en Vercel)' }
  return r
}

/**
 * Las prendas del ticket que el libro ⛔ cubre en `deposito` (`lib/caja/pin-venta.core.js`). Sin poder leerlo devuelve `{ error }`.
 * @returns {Promise<any[] | { error: string }>} ⛔ Lanza.
 */
export async function faltanEnElLibro(store, linea, deposito, renglones) {
  const r = await conMotor(store, async (db) => {
    const niveles = new Map()
    for (const v of renglones) {
      const clave = `${Number(v.product_id)}:${Number(v.size_id)}`
      if (niveles.has(clave)) continue
      const { rows } = await db.query(SQL_STOCK_VARIANTE_LIBRO, [String(v.product_id), String(v.size_id), String(linea)])
      niveles.set(clave, stockDeVarianteLibro(rows)[deposito] ?? 0)
    }
    return { faltan: prendasQueFaltan(renglones, (p, s) => niveles.get(`${p}:${s}`) ?? 0) }
  })
  if (r.sinConexion) return { error: 'El ERP no está conectado (falta DATABASE_URL en Vercel)' }
  return r.error ? { error: r.error } : r.faltan
}

/**
 * El PIN de la encargada para vender sin stock: `{ autoriza }` armado ACÁ (⛔ se acepta uno que venga del navegador) o `{ status, error }`.
 * @returns {Promise<{ autoriza: { usuario: string, motivo: 'pin_encargada' } } | { status: number, error: string }>} ⛔ Lanza.
 */
export async function autorizarPinDeVenta(store, persona, pin) {
  const quien = String(persona ?? '').trim().toLowerCase()
  if (!quien || quien.length > 100 || typeof pin !== 'string') return { status: 400, error: 'Elegí a la encargada y escribí su PIN.' }
  const r = await conMotor(store, async (db) => {
    const { verificarPin } = await import('../motor/stock/pin.mjs')
    return verificarPin(db, { usuario: quien, pin })
  })
  if (r.sinConexion || (r.error && typeof r.error === 'string')) return { status: 503, error: 'No se pudo probar el PIN: la venta NO se guardó. Probá de nuevo en un momento.' }
  if (r.error) return { status: 403, error: r.error.mensaje }
  return { autoriza: { usuario: r.usuario, motivo: 'pin_encargada' } }
}

/**
 * ¿Está PRENDIDO el depósito Evento de Stunned en el ERP (motor sql/058)? Sin la 058 ⛔ hay fila ⇒ apagado.
 * @returns {Promise<{ activo: boolean } | { error: string }>} ⛔ Lanza.
 */
export async function eventoActivo(store) {
  const r = await conMotor(store, async (db) => {
    const { rows } = await db.query(`select coalesce((to_jsonb(d) ->> 'activo')::boolean, false) as activo from deposito d where marca = 'stunned' and id = 'evento'`);
    return { activo: rows[0]?.activo === true };
  });
  if (r.sinConexion) return { error: 'El ERP no está conectado (falta DATABASE_URL en Vercel)' };
  if (r.error) return { error: `No se pudo leer el ERP (${r.error}).` };
  return r;
}

/**
 * La venta de una línea que ya está en el ERP (`erp_corte`): el motor ES la venta (⛔ copia de GN), REAL (`prueba: false`) y de
 * la marca de su línea (`marcaDeVentaErp`). A diferencia de `anotarEnMotor`, sin conexión o con error DEVUELVE el fallo (la
 * cajera lo ve y se reintenta). ⛔ Lanza.
 * @param {string} store @param {any} venta la fila de `caja_venta` @returns {Promise<{ ok: true, numero: number | null } | { ok: false, error: string, reintentable?: boolean }>}
 */
export async function registrarEnErp(store, venta) {
  let marca;
  try {
    marca = marcaDeVentaErp({ ...venta, store: venta.store || store });
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), reintentable: false };
  }
  const r = await conMotor(store, async (db, registrarVenta) => {
    const out = await registrarVenta(db, entradaDelMotorErp(venta, { marca }));
    return out.ok ? { ok: true, numero: Number(out.venta?.numero) || null } : { ok: false, error: `${out.error.codigo}: ${out.error.mensaje}`, reintentable: out.error.codigo !== 'CONFLICTO_IDEMPOTENCIA' };
  });
  if (r.sinConexion) return { ok: false, error: 'El ERP no está conectado (falta DATABASE_URL en Vercel).', reintentable: true };
  if (r.error) return { ok: false, error: `No se pudo hablar con el ERP (${r.error}).`, reintentable: true };
  return r;
}

/**
 * Anota en el motor UNA venta que acaba de llegar a GN. ⛔ Lanza.
 * @param {string} store @param {any} venta la fila de `caja_venta` (con `renglones` y `pagos`)
 */
export async function anotarEnMotor(store, venta) {
  if (!venta || venta.estado !== 'en_gn') return { salteada: true }
  return conMotor(store, (db, registrarVenta) => anotarCada(db, registrarVenta, [venta]))
}

/**
 * El repaso: las ventas en GN de los últimos días que el motor ⛔ tiene (falló, o se resolvieron a mano).
 * Va en la vuelta de `reintentar-pendientes` del POS. ⛔ Lanza.
 * @param {any} sb supabase de la marca @param {string} store
 */
export async function repasarMotor(sb, store) {
  if (!process.env[PG_DE_STORE[store]]) return { sinConexion: true }
  const desde = new Date(Date.now() - DIAS_REPASO * 24 * 3600 * 1000).toISOString()
  // Las anuladas en GN se buscan por CUÁNDO se anotaron (el sync mira días para atrás), ⛔ por cuándo se vendieron.
  const [enGN, anuladas] = await Promise.all([
    sb.from('caja_venta').select(COLUMNAS_MOTOR).eq('store', store).eq('estado', 'en_gn').gte('creada_en', desde).order('creada_en').limit(500),
    sb.from('caja_venta').select('id, anulada_en_gn').eq('store', store).not('anulada_en_gn', 'is', null).gte('anulada_en_gn->>en', desde).order('creada_en').limit(500),
  ])
  if (enGN.error) return { error: enGN.error.message }
  // Que fallen las anuladas (p. ej. una base sin `anulada_en_gn`) ⛔ frena anotar las ventas: se dice y se sigue.
  const errorAnuladas = anuladas.error ? anuladas.error.message : null
  const paraAnular = anuladas.error ? [] : anuladas.data
  if (!enGN.data.length && !paraAnular.length) return errorAnuladas ? { anotadas: 0, yaEstaban: 0, fallidas: [], errorAnuladas } : { anotadas: 0, yaEstaban: 0, fallidas: [] }
  return conMotor(store, async (db, registrarVenta, { anularVenta }) => {
    const ya = await db.query(`select origen_ref from venta where origen = 'caja' and origen_ref = any($1::text[])`, [enGN.data.map((v) => String(v.id))])
    const faltan = faltanEnMotor(enGN.data, ya.rows.map((r) => r.origen_ref)).slice(0, REPASO_POR_VUELTA)
    const r = await anotarCada(db, registrarVenta, faltan)
    // Después de anotar: la vendida y anulada en GN entre dos vueltas queda en el motor anulada, ⛔ ausente.
    if (errorAnuladas) r.errorAnuladas = errorAnuladas
    if (!paraAnular.length) return r
    const enMotor = await db.query(`select id, origen_ref, estado from venta where origen = 'caja' and origen_ref = any($1::text[])`, [paraAnular.map((v) => String(v.id))])
    r.anuladas = 0
    r.ncPendientes = []
    for (const a of anularEnMotor(paraAnular, enMotor.rows).slice(0, REPASO_POR_VUELTA)) {
      const out = await anularVenta(db, a)
      if (out.ok) { r.anuladas++; if (out.nc_pendiente) r.ncPendientes.push(a.venta_id) }
      // El id es el de la venta del MOTOR (⛔ el de la Caja): el aviso lo dice como «sin anular».
      else if (out.error.codigo !== 'YA_ANULADA') r.fallidas.push({ id: a.venta_id, codigo: out.error.codigo, mensaje: out.error.mensaje, anular: true })
    }
    return r
  })
}

/** Una línea de log si hubo algo que leer (⛔ ruido cuando todo anduvo o no está conectado). */
export function avisoDelMotor(r, que) {
  if (!r || r.sinConexion || r.salteada) return null
  if (r.error) return `[caja→motor] ${que}: ${r.error}`
  const partes = []
  const sinAnotar = (r.fallidas || []).filter((f) => !f.anular), sinAnular = (r.fallidas || []).filter((f) => f.anular)
  const ids = (xs) => xs.slice(0, 3).map((f) => `${String(f.id).slice(0, 8)} ${f.codigo}`).join(' · ')
  if (sinAnotar.length) partes.push(`${sinAnotar.length} sin anotar — ${ids(sinAnotar)}`)
  if (sinAnular.length) partes.push(`${sinAnular.length} sin anular en el motor — ${ids(sinAnular)}`)
  if (r.ncPendientes && r.ncPendientes.length) partes.push(`${r.ncPendientes.length} anulada(s) con factura: falta la nota de crédito — ${r.ncPendientes.slice(0, 3).map((id) => String(id).slice(0, 8)).join(' · ')}`)
  if (r.errorAnuladas) partes.push(`anuladas en GN sin leer: ${r.errorAnuladas}`)
  return partes.length ? `[caja→motor] ${que}: ${partes.join(' · ')}` : null
}

/**
 * El precio LOCAL de Stunned CARGADO en el ERP (Bruno, 28-oct: el local puede cobrar igual que Tienda Nube o distinto):
 * la lista `local` del motor, sólo las filas CARGADAS (lo que sigue a TN ⛔ viene: para eso la Caja ya lee TN).
 * ⛔ Lanza: `{ precios }` (product_id → precio), `{ sinConexion: true }` o `{ error }`.
 * @returns {Promise<{ precios: Record<string, number> } | { sinConexion: true } | { error: string }>}
 */
export async function preciosLocalStunned() {
  return conMotor('zattia', async (db) => {
    const { rows } = await db.query(`select product_id, precio from precio_lista
      where marca = 'stunned' and lista = 'local' and de_lista = 'local' and fuente = 'carga' and precio > 0`)
    return { precios: Object.fromEntries(rows.map((r) => [String(r.product_id), Number(r.precio)])) }
  })
}
