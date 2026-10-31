/**
 * El conteo de una LÍNEA QUE YA ESTÁ EN EL ERP (erp-stunned §8.4, Bruno 30-oct): Stunned desde el 28-oct, BDI y Zattia el día de
 * su corte (`erp_corte`). La regla vive en `lib/erp/conteo-erp.core.js` y `lib/erp/corte.core.js`; acá, la base del motor. Lo usan
 * `api/_inventario-vivo.js` (el «sistema» de esas prendas es el libro) y `api/_conteos-deposito.js` (sus diferencias son un ajuste
 * «Conteo» por línea, aplicado en el acto). ⛔ Archivo `_`: NO es una ruta.
 */
import { ajustesDeConteo, conLibro, depositoDeLoc, depositoDeUbicacion, variantesEnErp } from '../lib/erp/conteo-erp.core.js'
import { lineasEnErp } from '../lib/erp/corte.core.js'
import { baseDeLinea } from '../lib/lineas.core.js'
import { conBase, cortesDe, lineasDeProductos } from './_erp-corte.js'

const mensaje = (r) => `${r.error.codigo}: ${r.error.mensaje}`

/**
 * Las filas del vivo con el libro del ERP en las prendas de las líneas cortadas. Ninguna línea de la base cortada ⇒ como vinieron.
 * 🔴 Si la base ⛔ contesta TIRA: contar una línea cortada contra el stock viejo de GN es justo lo que esto evita.
 */
export async function libroEnErp(store, loc, rows) {
  const base = baseDeLinea(store)
  if (!base || !Array.isArray(rows) || !rows.length) return rows
  return conBase(base, async (db) => {
    const enErp = lineasEnErp(await cortesDe(db), base)
    if (!enErp.length) return rows
    const deposito = depositoDeLoc(base, loc)
    if (!deposito) throw new Error(`Depósito desconocido para el ERP: ${loc}`)
    const lineas = await lineasDeProductos(db, base, rows.map((r) => r && r.product_id))
    const variantes = variantesEnErp(rows, lineas, enErp)
    if (!variantes.length) return rows
    const { nivelesDe } = await import('../motor/stock/ajuste.mjs')
    return conLibro(rows, lineas, enErp, await nivelesDe(db, deposito, variantes))
  })
}

/**
 * La parte ERP de un conteo: un ajuste «Conteo» por línea, creado y aprobado en el acto (idempotente por `ref`: el «Reintentar» del
 * guardado devuelve el mismo). `null` si ⛔ trae nada para el ERP; `{ error }` si ⛔ se pudo.
 * @returns {Promise<null | { ok: true, ajustes: Array<{ linea: string, ajuste: number, ya: boolean, renglones: number }> } | { error: string }>}
 */
export async function conteoAlErp({ store, b, usuario }) {
  if (!b || !b.erp || !Array.isArray(b.erp.renglones) || !b.erp.renglones.length) return null
  const base = baseDeLinea(store)
  if (!base) return { error: `Marca desconocida: ${store}` }
  try {
    const m = await import('../motor/stock/ajuste.mjs')
    return await conBase(base, async (db) => {
      const enErp = lineasEnErp(await cortesDe(db), base)
      const lineas = await lineasDeProductos(db, base, b.erp.renglones.map((r) => r && r.product_id))
      const deposito = depositoDeUbicacion(base, b.ubicacion)
      const variantes = b.erp.renglones.map((r) => ({ product_id: Number(r && r.product_id), size_id: Number(r && r.size_id) })).filter((v) => Number.isInteger(v.product_id) && Number.isInteger(v.size_id))
      const niveles = deposito ? await m.nivelesDe(db, deposito, variantes) : new Map()
      const pedidos = ajustesDeConteo(b, base, lineas, enErp, niveles)
      if (!Array.isArray(pedidos)) return { error: pedidos.error }
      const quien = usuario || 'conteo'
      const ajustes = []
      for (const pedido of pedidos) {
        const c = await m.crearAjuste(db, { ...pedido, usuario: quien })
        // El libro ya está en lo contado (otra vuelta lo dejó ahí): ⛔ hay nada que mover en esa línea.
        if (!c.ok && c.error.codigo === 'SIN_DIFERENCIAS') continue
        if (!c.ok) return { error: `${pedido.linea}: ${mensaje(c)}` }
        if (c.ajuste.estado === 'rechazado') return { error: `El ajuste A-${c.ajuste.numero} de este conteo está rechazado en ERP › Ajustes.` }
        if (c.ajuste.estado !== 'aplicado') {
          const a = await m.aprobarAjuste(db, { ajuste_id: c.ajuste.id, usuario: quien })
          if (!a.ok) return { error: `El ajuste A-${c.ajuste.numero} quedó para aprobar en ERP › Ajustes (${mensaje(a)}).` }
        }
        ajustes.push({ linea: pedido.linea, ajuste: Number(c.ajuste.numero), ya: c.ya === true, renglones: pedido.renglones.length })
      }
      return ajustes.length ? { ok: true, ajustes } : null
    })
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  }
}
