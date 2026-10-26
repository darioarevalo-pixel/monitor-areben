// La tanda de Reposición que GN acaba de aceptar, anotada TAMBIÉN como transferencia-documento del motor (sql/034).
// Mientras GN sirva, GN ya movió el stock al instante: acá el documento nace y recorre sus cuatro pasos de una vez
// (crear → armar → enviar con el id de GN → recibir lo mismo), sin pantalla de Recibir. El libro cuenta la tanda por el
// documento y `hechosDeReposicion` salta las que tienen documento (`documentadas`), así que ⛔ hay doble conteo.
//
// 🔴 NADA de acá frena la Reposición ni lanza: si el motor falla, la transferencia en GN ya salió y el armado queda
// cerrado; la tanda sigue contándose por `repo_armado` (sin documento). Sin `DATABASE_URL_<MARCA>` en Vercel ⛔ está
// conectado todavía: cargarla ES prenderlo, igual que la venta de la Caja (`api/_caja-motor.js`).
//
// ⛔ Archivo `_`: NO es una ruta.
import { configPg } from '../lib/pg.core.js'

const PG_DE_STORE = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' }
/** La Reposición ya esperó a GN (hasta 20 s): el documento no puede sumar más que esto. */
const TECHO_MS = 4000

/** `{ '12_34': 2 }` → renglones del motor. Lo que no es una variante o no tiene unidades queda afuera. */
export function renglonesDeTanda(prendas) {
  const out = []
  for (const [vid, n] of Object.entries(prendas || {})) {
    const [product_id, size_id] = String(vid).split('_').map(Number)
    const cantidad = Number(n)
    if (product_id > 0 && size_id > 0 && Number.isInteger(cantidad) && cantidad > 0) out.push({ product_id, size_id, cantidad })
  }
  return out
}

/**
 * @param {{ store: 'bdi'|'zattia', linea: string, armadoId: string, tanda: number, prendas: Record<string, number>,
 *   desde: 'deposito'|'local', hacia: 'deposito'|'local', gnTransferId?: string|number|null, usuario: string }} p
 * @returns {Promise<{ ok?: true, ya?: boolean, sinConexion?: true, salteada?: true, error?: string }>} ⛔ lanza
 */
export async function documentarTanda(p) {
  try {
    const conexion = process.env[PG_DE_STORE[p.store]]
    if (!conexion) return { sinConexion: true }
    const renglones = renglonesDeTanda(p.prendas)
    if (!renglones.length) return { salteada: true }
    const [{ default: pg }, m] = await Promise.all([import('pg'), import('../motor/stock/transferencia.mjs')])
    const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: TECHO_MS, statement_timeout: TECHO_MS, query_timeout: TECHO_MS })
    try {
      await db.connect()
      const base = { usuario: p.usuario || 'reposicion' }
      const c = await m.crearTransferencia(db, { ...base, linea: p.linea, desde: p.desde, hacia: p.hacia, origen: 'reposicion', origen_ref: `${p.armadoId}:t${p.tanda}`, renglones })
      if (!c.ok) return { error: `${c.error.codigo}: ${c.error.mensaje}` }
      if (c.ya) return { ok: true, ya: true }
      const id = c.transferencia.id
      const a = await m.armarTransferencia(db, { ...base, transferencia_id: id, renglones })
      if (!a.ok) return { error: `${a.error.codigo}: ${a.error.mensaje}` }
      const e = await m.enviarTransferencia(db, { ...base, transferencia_id: id, gn_transfer_id: p.gnTransferId ?? undefined })
      if (!e.ok) return { error: `${e.error.codigo}: ${e.error.mensaje}` }
      const r = await m.recibirTransferencia(db, { ...base, transferencia_id: id, renglones })
      if (!r.ok) return { error: `${r.error.codigo}: ${r.error.mensaje}` }
      return { ok: true, ya: false }
    } finally {
      await db.end().catch(() => {})
    }
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  }
}

/**
 * 🔑 LLAVE (Vercel, `TRANSFERENCIA_STUNNED_ERP=1`; sin definir = APAGADA, todo sigue por GN). Con ella, una tanda de la línea
 * Stunned ⛔ llama a GN: el documento del motor ES la transferencia (Bruno 26-oct: Stunned sale de GN y no vuelve).
 */
export const transferenciaEnErp = (linea) => linea === 'stunned' && /^(1|si|true)$/i.test(String(process.env.TRANSFERENCIA_STUNNED_ERP ?? '').trim())

/** Cuánto se le espera al motor en la vía del ERP: acá no hay GN que esperar, pero el armado está en `transfiriendo`. */
const TECHO_ERP_MS = 10_000

/**
 * La tanda como transferencia del motor SIN GN: crear → armar → enviar → recibir de una vez (todavía no hay pantalla de
 * Recibir: la salida y la entrada las anota el libro al instante, como hacía GN). 🔴 A diferencia de `documentarTanda`, acá el
 * documento ES la transferencia: cualquier falla se DEVUELVE (`error`) y el que llama vuelve el armado a `en_curso`.
 * Se retoma sola: si una vez quedó a medias (`ya`), sigue desde el estado en que está (`origen_ref` evita duplicarla).
 * @returns {Promise<{ ok: true, numero: number, ya: boolean, unidades: number, avisos: any[] } | { error: string, sinConexion?: true }>} ⛔ lanza
 */
export async function transferirEnErp(p) {
  try {
    const conexion = process.env[PG_DE_STORE[p.store]]
    if (!conexion) return { sinConexion: true, error: 'El monitor no está conectado a la base del ERP.' }
    const renglones = renglonesDeTanda(p.prendas)
    if (!renglones.length) return { error: 'No hay prendas para transferir.' }
    const [{ default: pg }, m] = await Promise.all([import('pg'), import('../motor/stock/transferencia.mjs')])
    const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: TECHO_ERP_MS, statement_timeout: TECHO_ERP_MS, query_timeout: TECHO_ERP_MS })
    try {
      await db.connect()
      const base = { usuario: p.usuario || 'reposicion' }
      const c = await m.crearTransferencia(db, { ...base, linea: p.linea, desde: p.desde, hacia: p.hacia, origen: 'reposicion', origen_ref: `${p.armadoId}:t${p.tanda}`, renglones })
      if (!c.ok) return { error: `${c.error.codigo}: ${c.error.mensaje}` }
      const id = c.transferencia.id
      const avisos = []
      let estado = c.transferencia.estado
      const pasos = [
        ['borrador', () => m.armarTransferencia(db, { ...base, transferencia_id: id, renglones }), 'armada'],
        ['armada', () => m.enviarTransferencia(db, { ...base, transferencia_id: id }), 'en_transito'],
        ['en_transito', () => m.recibirTransferencia(db, { ...base, transferencia_id: id, renglones }), 'recibida'],
      ]
      if (estado === 'cancelada') return { error: `La transferencia T-${c.transferencia.numero} está cancelada.` }
      for (const [desdeEstado, paso, haciaEstado] of pasos) {
        if (estado !== desdeEstado) continue
        const r = await paso()
        if (!r.ok) return { error: `${r.error.codigo}: ${r.error.mensaje}` }
        avisos.push(...(r.avisos || []))
        estado = haciaEstado
      }
      return { ok: true, numero: Number(c.transferencia.numero), ya: c.ya === true, unidades: renglones.reduce((x, r) => x + r.cantidad, 0), avisos }
    } finally {
      await db.end().catch(() => {})
    }
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  }
}
