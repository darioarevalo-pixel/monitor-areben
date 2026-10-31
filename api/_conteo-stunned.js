/**
 * El conteo de Stunned contra el ERP (erp-stunned §8.4, Bruno 30-oct). La regla vive en `lib/erp/conteo-stunned.core.js`; acá,
 * la base del motor. Lo usan `api/_inventario-vivo.js` (el «sistema» de las STU es el libro) y `api/_conteos-deposito.js` (las
 * diferencias STU son un ajuste «Conteo» aplicado en el acto). Las dos sólo con `LECTURAS_STUNNED_ERP=1` y en Zattia.
 */
import { configPg } from '../lib/pg.core.js'
import { ajusteDeConteo, conLibro, DEPOSITO_DE_LOC, depositoDeUbicacion, variantesStunned } from '../lib/erp/conteo-stunned.core.js'
import { lineaDe, skuParaLinea } from '../lib/lineas.core.js'
import { lecturasStunnedErp } from '../lib/stunned/ventas-erp.core.js'

const TECHO_MS = 6000
const mensaje = (r) => `${r.error.codigo}: ${r.error.mensaje}`

async function conMotor(fn) {
  const conexion = process.env.DATABASE_URL_ZATTIA
  if (!conexion) throw new Error('Falta DATABASE_URL_ZATTIA: no se puede leer el ERP de Stunned.')
  const { default: pg } = await import('pg')
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: TECHO_MS, statement_timeout: TECHO_MS, query_timeout: TECHO_MS })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end().catch(() => {})
  }
}

/**
 * Las filas del vivo con el libro del ERP en las STU. Sin la llave, o si ⛔ es Zattia, como vinieron. 🔴 Si el ERP ⛔ contesta
 * TIRA: contar Stunned contra el stock viejo de GN es justo lo que esto evita.
 */
export async function libroStunnedEn(store, loc, rows) {
  if (store !== 'zattia' || !lecturasStunnedErp()) return rows
  const variantes = variantesStunned(rows)
  if (!variantes.length) return rows
  const deposito = DEPOSITO_DE_LOC[loc]
  if (!deposito) return rows
  const { nivelesDe } = await import('../motor/stock/ajuste.mjs')
  const niveles = await conMotor((db) => nivelesDe(db, deposito, variantes))
  return conLibro(rows, niveles)
}

/**
 * La parte STU de un conteo al ERP: ajuste «Conteo» de la línea `stunned`, creado y aprobado en el acto (idempotente por `ref`:
 * el «Reintentar» del guardado devuelve el mismo). `null` si ⛔ trae nada para el ERP; `{ error }` si ⛔ se pudo.
 * @returns {Promise<null | { ok: true, ajuste: number, ya: boolean, renglones: number } | { error: string }>}
 */
export async function conteoStunnedAlErp({ store, b, usuario }) {
  if (!b || !b.erp || !Array.isArray(b.erp.renglones) || !b.erp.renglones.length) return null
  if (!lecturasStunnedErp()) return { error: 'Stunned todavía no cuenta en el ERP (LECTURAS_STUNNED_ERP apagada).' }
  try {
    const m = await import('../motor/stock/ajuste.mjs')
    return await conMotor(async (db) => {
      const ids = [...new Set(b.erp.renglones.map((r) => Number(r && r.product_id)).filter(Number.isInteger))]
      const { rows } = await db.query('select id, sku, proveedor from productos where id = any($1::bigint[])', [ids])
      const lineas = new Map(rows.map((p) => [Number(p.id), lineaDe(store, skuParaLinea(p))]))
      const variantes = b.erp.renglones.map((r) => ({ product_id: Number(r.product_id), size_id: Number(r.size_id) })).filter((v) => Number.isInteger(v.product_id) && Number.isInteger(v.size_id))
      const niveles = await m.nivelesDe(db, depositoDeUbicacion(b.ubicacion), variantes)
      const pedido = ajusteDeConteo(b, store, lineas, niveles)
      if (!pedido) return null
      if (pedido.error) return { error: pedido.error }
      const quien = usuario || 'conteo'
      const c = await m.crearAjuste(db, { ...pedido, usuario: quien })
      // El libro ya está en lo contado (otra vuelta lo dejó ahí): ⛔ hay nada que mover.
      if (!c.ok && c.error.codigo === 'SIN_DIFERENCIAS') return null
      if (!c.ok) return { error: mensaje(c) }
      if (c.ajuste.estado === 'rechazado') return { error: `El ajuste A-${c.ajuste.numero} de este conteo está rechazado en ERP › Ajustes.` }
      if (c.ajuste.estado !== 'aplicado') {
        const a = await m.aprobarAjuste(db, { ajuste_id: c.ajuste.id, usuario: quien })
        if (!a.ok) return { error: `El ajuste A-${c.ajuste.numero} quedó para aprobar en ERP › Ajustes (${mensaje(a)}).` }
      }
      return { ok: true, ajuste: Number(c.ajuste.numero), ya: c.ya === true, renglones: pedido.renglones.length }
    })
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  }
}
