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

const esInterna = (kind) => kind === 'solicitudesinternas'
/**
 * Cuánto SALIÓ de un ítem — espeja la venta de GN de cada flujo: la sesión de fotos vende lo PREPARADO por escaneo (`verif`, topeado a
 * lo pedido) y ⛔ los ítems nuevos; la solicitud interna ⛔ tiene fase de preparado: vende TODO su `qty`, `nuevo` incluido.
 */
const salioDe = (s, it, kind) => (esInterna(kind) ? Number(it.qty) || 0 : Math.min(Number((s.verif || {})[it.vid]) || 0, Number(it.qty) || 0))

const clave = (it, dep) => `${it.pid}:${it.sid}:${dep}`

/** Las prendas que salieron, agrupadas por variante y depósito: `Map<clave, { product_id, size_id, deposito, cantidad, sku }>`. */
export function salieronDe(s, store, kind = 'sesionfotos') {
  const deps = DEPOSITO_DE[store]
  const out = new Map()
  if (!deps) return out
  for (const it of s.items || []) {
    if (!it || (it.nuevo && !esInterna(kind)) || !entero(it.pid) || !entero(it.sid) || !deps[it.origen]) continue
    const cantidad = salioDe(s, it, kind)
    if (cantidad <= 0) continue
    const k = clave(it, deps[it.origen])
    const previa = out.get(k)
    if (previa) previa.cantidad += cantidad
    else out.set(k, { product_id: Number(it.pid), size_id: Number(it.sid), deposito: deps[it.origen], cantidad, sku: it.sku ? String(it.sku).slice(0, 80) : null })
  }
  return out
}

/** Lo que VOLVIÓ por variante y depósito (`devuelto` por vid, topeado a lo que salió de ese ítem). `Map<clave, cantidad>`. */
export function volvieronDe(s, store, kind = 'sesionfotos') {
  const deps = DEPOSITO_DE[store]
  const out = new Map()
  if (!deps) return out
  for (const it of s.items || []) {
    if (!it || (it.nuevo && !esInterna(kind)) || !entero(it.pid) || !entero(it.sid) || !deps[it.origen]) continue
    const salio = salioDe(s, it, kind)
    const n = Math.min(Number((s.devuelto || {})[it.vid]) || 0, salio)
    if (n > 0) out.set(clave(it, deps[it.origen]), (out.get(clave(it, deps[it.origen])) ?? 0) + n)
  }
  return out
}

/** El pedido de `crearSalida` para esta solicitud, o `null` si ⛔ corresponde (no salió, no es retornable, nada preparado). */
export function pedidoDeSolicitud(kind, s, store) {
  const tipo = tipoDe(kind, s)
  if (!tipo || !s.id) return null
  const renglones = [...salieronDe(s, store, kind).values()]
  if (!renglones.length) return null
  const gn = {}
  for (const o of ['deposito', 'local']) { const v = s.ventas?.[o]?.id; if (v != null && v !== '') gn[o] = String(v) }
  return { linea: store, tipo, ref: String(s.id), detalle: String(s.descripcion || s.motivo || '').slice(0, 300) || undefined, gn_sale_ids: gn, renglones }
}

/**
 * Lo que hay que ANOTAR como devuelto, dado lo que el documento ya tiene: `[{ n, cantidad }]` (sólo lo que SUBIÓ; la devolución
 * que se reinicia ⛔ se deshace en el motor). `renglonesDoc` = los renglones de `salidasDe`.
 */
export function devolverDe(s, store, renglonesDoc, kind = 'sesionfotos') {
  const volvieron = volvieronDe(s, store, kind)
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
 * El motivo del ajuste sale del motivo de la solicitud (Bruno, 25-oct): Moldería, Prueba y Otro son USO INTERNO (operativo, espera al
 * admin); los demás (Consumo, Video/contenido, Muestra) siguen como `consumible` (marketing, al instante).
 * @returns {{ linea: string, deposito: string, motivo: 'consumible'|'uso_interno', ref: string, detalle?: string, renglones: { product_id: number, size_id: number, sku: string|null, cantidad: number }[] }[]}
 */
/** `uso_interno` para Moldería / Prueba / Otro; `consumible` para el resto. */
export const motivoDeConsumo = (motivo) => (/molder|prueba|^\s*otro\s*$/i.test(String(motivo || '')) ? 'uso_interno' : 'consumible')

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
  const motivo = motivoDeConsumo(s.motivo)
  return [...porDeposito].map(([deposito, lista]) => ({ linea: store, deposito, motivo, ref: `${s.id}:${deposito}`, detalle, renglones: [...lista.values()] }))
}

/**
 * El CANJE (`/api/crear-venta` con `proposito: 'canje'`, los dos caminos: mostrador y envío) como ajuste `canje` del motor. Puro.
 * Un solo depósito por pedido (el `origen` de la venta de GN) ⇒ un ajuste, `ref` = `<solicitudId>:<depósito>` (sql/050): reintentar
 * ⛔ lo repite. `[]` si ⛔ corresponde: no es canje, falta el id del canje, la marca ⛔ es conocida o no queda ningún renglón válido.
 * `b` es el cuerpo del pedido a crear-venta (`items: [{ product_id, size_id, quantity }]`, GN y motor comparten ids de variante).
 */
export function canjeDe(b, store) {
  if (!b || b.proposito !== 'canje' || !b.solicitudId) return []
  const deposito = DEPOSITO_DE[store]?.[b.origen]
  if (!deposito) return []
  const porVariante = new Map()
  for (const it of Array.isArray(b.items) ? b.items : []) {
    if (!it || !entero(it.product_id) || !entero(it.size_id) || !entero(it.quantity)) continue
    const k = `${it.product_id}:${it.size_id}`
    const previo = porVariante.get(k)
    if (previo) previo.cantidad -= Number(it.quantity)
    else porVariante.set(k, { product_id: Number(it.product_id), size_id: Number(it.size_id), sku: it.sku ? String(it.sku).slice(0, 80) : null, cantidad: -Number(it.quantity) })
  }
  if (!porVariante.size) return []
  const detalle = String(b.comments || '').slice(0, 300) || undefined
  return [{ linea: store, deposito, motivo: 'canje', ref: `${b.solicitudId}:${deposito}`, detalle, renglones: [...porVariante.values()] }]
}
