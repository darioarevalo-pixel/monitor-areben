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
import { TRANSFERENCIA_EN_ERP } from '../lib/erp/transferencia-doc.core.js'

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
 * 🔑 LLAVE por línea (`TRANSFERENCIA_EN_ERP` de `lib/erp/transferencia-doc.core.js`; Stunned = `TRANSFERENCIA_STUNNED_ERP=1` en
 * Vercel; sin definir = APAGADA, todo sigue por GN). Con ella, una tanda de esa línea ⛔ llama a GN: el documento del motor ES la
 * transferencia (Bruno 26-oct: Stunned sale de GN y no vuelve).
 */
export const transferenciaEnErp = (linea) => {
  const c = TRANSFERENCIA_EN_ERP[linea]
  return !!c && /^(1|si|true)$/i.test(String(process.env[c.llave] ?? '').trim())
}

/** Cuánto se le espera al motor en la vía del ERP: acá no hay GN que esperar, pero el armado está en `transfiriendo`. */
const TECHO_ERP_MS = 10_000

/**
 * Lleva el documento desde el estado en que está hasta «armada → en_transito» y, si `recibir` es `al_armar`, hasta «recibida».
 * Retoma: un paso que ya pasó se saltea. `m` es el motor (`motor/stock/transferencia.mjs`), aparte para probarlo sin base.
 * @returns {Promise<{ estado: string, avisos: any[] } | { error: string }>}
 */
export async function avanzarDocumento(m, db, { id, estado: inicial, renglones, usuario, recibir }) {
  const base = { usuario }
  const pasos = [
    ['borrador', () => m.armarTransferencia(db, { ...base, transferencia_id: id, renglones }), 'armada'],
    ['armada', () => m.enviarTransferencia(db, { ...base, transferencia_id: id }), 'en_transito'],
    ...(recibir === 'al_armar' ? [['en_transito', () => m.recibirTransferencia(db, { ...base, transferencia_id: id, renglones }), 'recibida']] : []),
  ]
  const avisos = []
  let estado = inicial
  for (const [desdeEstado, paso, haciaEstado] of pasos) {
    if (estado !== desdeEstado) continue
    const r = await paso()
    if (!r.ok) return { error: `${r.error.codigo}: ${r.error.mensaje}` }
    avisos.push(...(r.avisos || []))
    estado = haciaEstado
  }
  return { estado, avisos }
}

/**
 * La tanda como transferencia del motor SIN GN: crear → armar → enviar y, con `recibir: 'al_armar'`, también recibir de una vez
 * (la salida y la entrada las anota el libro al instante, como hacía GN). Con `'en_destino'` queda «En camino» y la recibe el local
 * en ERP › Stock › Transferencias. `recibir` es OBLIGATORIO: lo decide la línea (`recibirDe`), ⛔ el que llama. 🔴 A diferencia de `documentarTanda`, acá el
 * documento ES la transferencia: cualquier falla se DEVUELVE (`error`) y el que llama vuelve el armado a `en_curso`.
 * Se retoma sola: si una vez quedó a medias (`ya`), sigue desde el estado en que está (`origen_ref` evita duplicarla).
 * @returns {Promise<{ ok: true, numero: number, ya: boolean, unidades: number, avisos: any[] } | { error: string, sinConexion?: true }>} ⛔ lanza
 */
export async function transferirEnErp(p) {
  try {
    const conexion = process.env[PG_DE_STORE[p.store]]
    if (!conexion) return { sinConexion: true, error: 'El monitor no está conectado a la base del ERP.' }
    if (p.recibir !== 'al_armar' && p.recibir !== 'en_destino') return { error: 'Falta decir si se recibe al armar o en destino.' }
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
      if (c.transferencia.estado === 'cancelada') return { error: `La transferencia T-${c.transferencia.numero} está cancelada.` }
      const hecho = await avanzarDocumento(m, db, { id, estado: c.transferencia.estado, renglones, usuario: base.usuario, recibir: p.recibir })
      if ('error' in hecho) return { error: hecho.error }
      return { ok: true, numero: Number(c.transferencia.numero), estado: hecho.estado, ya: c.ya === true, unidades: renglones.reduce((x, r) => x + r.cantidad, 0), avisos: hecho.avisos }
    } finally {
      await db.end().catch(() => {})
    }
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  }
}
