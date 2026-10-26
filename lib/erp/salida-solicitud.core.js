/**
 * De la SOLICITUD del monitor (sesión de fotos / solicitud interna retornable) a la SALIDA del motor (sql/048). Puro: sin red
 * ni base. Lo usa `api/_salida-documento.js` después de cada guardado de `api/_solicitudes.js`.
 *
 * 🔑 El documento ESPEJA la venta de GN (`construirPedidosVenta`, lib/sesionfotos/ventas.ts): sale lo PREPARADO por escaneo
 * (`min(verif, qty)`), por origen, y los ítems nuevos / sin variante quedan afuera. Sin esa igualdad el modo en sombra
 * compararía manzanas con peras.
 */

/** El depósito canónico del motor por origen de la solicitud (lib/depositos.mjs del motor). */
export const DEPOSITO_DE = {
  bdi: { deposito: 'deposito_minorista', local: 'local' },
  zattia: { deposito: 'deposito', local: 'local' },
  stunned: { deposito: 'deposito', local: 'local' },
}

const entero = (x) => Number.isInteger(Number(x)) && Number(x) > 0
const salio = (s) => !!(s && s.ventas && typeof s.ventas === 'object' && Object.keys(s.ventas).length)

/** `foto` | `produccion` | `interna`, o `null` si esta solicitud ⛔ es una salida con vuelta (consumo, evento, la que no salió). */
export function tipoDe(kind, s) {
  if (!salio(s)) return null
  if (kind === 'sesionfotos') return 'foto'
  if (kind === 'solicitudesinternas' && s.tipo === 'retornable') return /producci/i.test(String(s.motivo || '')) ? 'produccion' : 'interna'
  return null
}

const clave = (it, dep) => `${it.pid}:${it.sid}:${dep}`

/** Las prendas que salieron, agrupadas por variante y depósito: `Map<clave, { product_id, size_id, deposito, cantidad, sku }>`. */
export function salieronDe(s, store) {
  const deps = DEPOSITO_DE[store]
  const out = new Map()
  if (!deps) return out
  for (const it of s.items || []) {
    if (!it || it.nuevo || !entero(it.pid) || !entero(it.sid) || !deps[it.origen]) continue
    const cantidad = Math.min(Number((s.verif || {})[it.vid]) || 0, Number(it.qty) || 0)
    if (cantidad <= 0) continue
    const k = clave(it, deps[it.origen])
    const previa = out.get(k)
    if (previa) previa.cantidad += cantidad
    else out.set(k, { product_id: Number(it.pid), size_id: Number(it.sid), deposito: deps[it.origen], cantidad, sku: it.sku ? String(it.sku).slice(0, 80) : null })
  }
  return out
}

/** Lo que VOLVIÓ por variante y depósito (`devuelto` por vid, topeado a lo que salió de ese ítem). `Map<clave, cantidad>`. */
export function volvieronDe(s, store) {
  const deps = DEPOSITO_DE[store]
  const out = new Map()
  if (!deps) return out
  for (const it of s.items || []) {
    if (!it || it.nuevo || !entero(it.pid) || !entero(it.sid) || !deps[it.origen]) continue
    const salio = Math.min(Number((s.verif || {})[it.vid]) || 0, Number(it.qty) || 0)
    const n = Math.min(Number((s.devuelto || {})[it.vid]) || 0, salio)
    if (n > 0) out.set(clave(it, deps[it.origen]), (out.get(clave(it, deps[it.origen])) ?? 0) + n)
  }
  return out
}

/** El pedido de `crearSalida` para esta solicitud, o `null` si ⛔ corresponde (no salió, no es retornable, nada preparado). */
export function pedidoDeSolicitud(kind, s, store) {
  const tipo = tipoDe(kind, s)
  if (!tipo || !s.id) return null
  const renglones = [...salieronDe(s, store).values()]
  if (!renglones.length) return null
  const gn = {}
  for (const o of ['deposito', 'local']) { const v = s.ventas?.[o]?.id; if (v != null && v !== '') gn[o] = String(v) }
  return { linea: store, tipo, ref: String(s.id), detalle: String(s.descripcion || s.motivo || '').slice(0, 300) || undefined, gn_sale_ids: gn, renglones }
}

/**
 * Lo que hay que ANOTAR como devuelto, dado lo que el documento ya tiene: `[{ n, cantidad }]` (sólo lo que SUBIÓ; la devolución
 * que se reinicia ⛔ se deshace en el motor). `renglonesDoc` = los renglones de `salidasDe`.
 */
export function devolverDe(s, store, renglonesDoc) {
  const volvieron = volvieronDe(s, store)
  const out = []
  for (const r of renglonesDoc) {
    const delta = Math.min(volvieron.get(`${r.product_id}:${r.size_id}:${r.deposito}`) ?? 0, r.cantidad) - r.devuelta
    if (delta > 0) out.push({ n: r.n, cantidad: delta })
  }
  return out
}

/** ¿Volvió todo lo que salió (con lo que ya tiene el documento + lo que se va a anotar)? Si sí, se puede CERRAR sin declarar nada. */
export function volvioTodo(renglonesDoc, aDevolver) {
  const extra = new Map(aDevolver.map((d) => [d.n, d.cantidad]))
  return renglonesDoc.length > 0 && renglonesDoc.every((r) => r.devuelta + (extra.get(r.n) ?? 0) + r.consumida + r.danada + r.perdida === r.cantidad)
}

/**
 * El CONSUMO (solicitud interna `tipo: 'consumo'`: baja definitiva, ⛔ vuelve) como ajustes `consumible` del motor. Puro.
 * Uno por depósito (un ajuste tiene un solo depósito), con `ref` = `<solicitud>:<depósito>` ⇒ guardar la solicitud otra vez
 * ⛔ repite el gasto (sql/050). Devuelve `[]` si ⛔ corresponde: no es consumo, está pendiente o rechazada (todavía no hay
 * baja), o la venta de GN ⛔ salió. A diferencia de la salida con vuelta, una interna vende todo `qty` (sin escaneo ni `verif`).
 * @returns {{ linea: string, deposito: string, motivo: 'consumible', ref: string, detalle?: string, renglones: { product_id: number, size_id: number, sku: string|null, cantidad: number }[] }[]}
 */
export function consumoDe(kind, s, store) {
  if (kind !== 'solicitudesinternas' || !s || s.tipo !== 'consumo' || !s.id || !salio(s)) return []
  if (s.estado === 'pendiente' || s.estado === 'rechazada') return []
  const deps = DEPOSITO_DE[store]
  if (!deps) return []
  const porDeposito = new Map()
  for (const it of s.items || []) {
    if (!it || !entero(it.pid) || !entero(it.sid) || !deps[it.origen] || !entero(it.qty)) continue
    const dep = deps[it.origen]
    const lista = porDeposito.get(dep) ?? new Map()
    const k = `${it.pid}:${it.sid}`
    const previo = lista.get(k)
    if (previo) previo.cantidad -= Number(it.qty)
    else lista.set(k, { product_id: Number(it.pid), size_id: Number(it.sid), sku: it.sku ? String(it.sku).slice(0, 80) : null, cantidad: -Number(it.qty) })
    porDeposito.set(dep, lista)
  }
  const detalle = String(s.descripcion || s.motivo || '').slice(0, 300) || undefined
  return [...porDeposito].map(([deposito, lista]) => ({ linea: store, deposito, motivo: 'consumible', ref: `${s.id}:${deposito}`, detalle, renglones: [...lista.values()] }))
}
