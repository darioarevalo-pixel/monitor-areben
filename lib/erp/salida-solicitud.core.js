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
  const renglones = renglonesQueSalen(b.items)
  if (!renglones.length) return []
  const detalle = String(b.comments || '').slice(0, 300) || undefined
  return [{ linea: store, deposito, motivo: 'canje', ref: `${b.solicitudId}:${deposito}`, detalle, renglones }]
}

/** Los renglones de un pedido a crear-venta como lo que SALE del libro (cantidad en negativo), sumados por variante. */
function renglonesQueSalen(items) {
  const porVariante = new Map()
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !entero(it.product_id) || !entero(it.size_id) || !entero(it.quantity)) continue
    const k = `${it.product_id}:${it.size_id}`
    const previo = porVariante.get(k)
    if (previo) previo.cantidad -= Number(it.quantity)
    else porVariante.set(k, { product_id: Number(it.product_id), size_id: Number(it.size_id), sku: it.sku ? String(it.sku).slice(0, 80) : null, cantidad: -Number(it.quantity) })
  }
  return [...porVariante.values()]
}

/**
 * La línea de un pedido a crear-venta SI va al ERP (erp-stunned §8.4: la línea tiene corte en `erp_corte` y ya pasó). Puro.
 * `lineas` = la línea de cada `product_id`, leída por el SERVIDOR del espejo (⛔ el sku que manda la pantalla); `enErp` = las
 * líneas de esa base que ya cortaron. `null` = ningún renglón es de una línea en el ERP (sigue a GN, como siempre);
 * `{ error }` si mezcla una línea del ERP con otra (o con una sin corte): cada documento es de UNA línea.
 * @param {any[]} items @param {Map<number, string>} lineas @param {string[]} enErp @param {string} que «La falla», «La solicitud»…
 */
export function lineaErpDe(items, lineas, enErp, que) {
  const deEllos = items.map((it) => it && lineas.get(Number(it.product_id)))
  const delErp = [...new Set(deEllos.filter((l) => l && enErp.includes(l)))]
  if (!delErp.length) return null
  if (delErp.length > 1 || deEllos.some((l) => l !== delErp[0])) {
    return { error: `${que} mezcla productos de ${delErp.join(' y ')} (que ya va por el ERP) con productos de otra línea: cargalos por separado.` }
  }
  return { linea: delErp[0] }
}

/**
 * La FALLA de una línea que ya está en el ERP (`/api/crear-venta` con `proposito: 'falla'`) como ajuste `fallado` del motor. Puro.
 * 🔑 Desde el corte, el GN de la línea ⛔ mueve su libro (error 13) ⇒ su falla ⛔ va a GN: el ajuste ES la baja, ⛔ una sombra.
 * Bruno 30-oct: baja al CARGARLA, como hacía la venta de GN ⇒ quien llama lo aprueba en el acto. Stunned desde el 28-oct; BDI y
 * Zattia desde su corte (antes, `null` y la venta de GN de siempre).
 * `null` si ⛔ corresponde (no es falla, ningún renglón de una línea en el ERP); `{ error }` si mezcla o le falta algo.
 * @param {any} b el cuerpo del pedido a crear-venta @param {string} store @param {Map<number, string>} lineas @param {string[]} enErp
 */
export function fallaErpDe(b, store, lineas, enErp) {
  if (!b || b.proposito !== 'falla') return null
  const items = Array.isArray(b.items) ? b.items : []
  const l = lineaErpDe(items, lineas, enErp, 'La falla')
  if (!l || l.error) return l
  if (!b.solicitudId) return { error: 'Falta el id de la falla.' }
  const deposito = DEPOSITO_DE[l.linea]?.[b.origen]
  if (!deposito) return { error: `Origen desconocido: ${b.origen}` }
  const renglones = renglonesQueSalen(items)
  if (renglones.length !== items.length) return { error: 'Hay renglones sin variante o con cantidad inválida.' }
  const detalle = String(b.comments || '').slice(0, 300) || undefined
  return { linea: l.linea, deposito, motivo: 'fallado', ref: `${b.solicitudId}:${deposito}`, detalle, renglones }
}

/**
 * El CANJE de una línea que ya está en el ERP (hoy sólo BDI tiene canjes) como ajuste `canje` APLICADO, ⛔ la venta de GN. Puro.
 * Antes del corte el canje es la venta de GN + el ajuste EN SOMBRA (`canjeDe`); desde el corte el ajuste ES la baja ⇒ mismo `ref`
 * que la sombra (`<solicitudId>:<depósito>`): reintentar ⛔ lo repite. `null` = ⛔ es de una línea en el ERP (sigue a GN).
 * @param {any} b el cuerpo del pedido a crear-venta @param {string} store @param {Map<number, string>} lineas @param {string[]} enErp
 */
export function canjeErpDe(b, store, lineas, enErp) {
  if (!b || b.proposito !== 'canje') return null
  const items = Array.isArray(b.items) ? b.items : []
  const l = lineaErpDe(items, lineas, enErp, 'El canje')
  if (!l || l.error) return l
  if (!b.solicitudId) return { error: 'Falta el id del canje.' }
  const deposito = DEPOSITO_DE[l.linea]?.[b.origen]
  if (!deposito) return { error: `Origen desconocido: ${b.origen}` }
  const renglones = renglonesQueSalen(items)
  if (renglones.length !== items.length) return { error: 'Hay renglones sin variante o con cantidad inválida.' }
  const detalle = String(b.comments || '').slice(0, 300) || undefined
  return { linea: l.linea, deposito, motivo: 'canje', ref: `${b.solicitudId}:${deposito}`, detalle, renglones }
}

/**
 * La SOLICITUD de una línea que ya está en el ERP (sesión de fotos / solicitud interna: `/api/crear-venta` SIN `proposito`) al
 * motor, ⛔ a GN (Bruno 30-oct, erp-stunned §8.3). Puro. Mismo agujero que la falla: desde el corte el GN de la línea ⛔ mueve su
 * libro ⇒ la venta técnica ⛔ bajaba nada en el ERP. Un pedido = un origen ⇒ `ref` = `<solicitud>:<depósito>`:
 *   · fotos y retornable ⇒ `{ salida }`: salida con vuelta de la línea (baja al cargarla, sube al devolver);
 *   · consumo            ⇒ `{ ajuste }`: el mismo ajuste que arma `consumoDe` (mismo `ref` ⇒ guardar la solicitud ⛔ lo repite).
 * `b.salida` (`{ kind, tipo?, motivo? }`) lo manda la pantalla: dice QUÉ es; la LÍNEA la decide el servidor (`lineas`, del espejo).
 * `null` si ⛔ corresponde (tiene propósito o acción, ningún renglón de una línea en el ERP); `{ error }` si mezcla, si le falta algo
 * o si ⛔ dice qué es (una pantalla vieja: caer a GN sería el agujero).
 * @param {any} b el cuerpo del pedido a crear-venta @param {string} store @param {Map<number, string>} lineas @param {string[]} enErp
 */
export function solicitudErpDe(b, store, lineas, enErp) {
  if (!b || b.proposito || b.accion) return null
  const items = Array.isArray(b.items) ? b.items : []
  const l = lineaErpDe(items, lineas, enErp, 'La solicitud')
  if (!l || l.error) return l
  const linea = l.linea
  if (!b.solicitudId) return { error: 'Falta el id de la solicitud.' }
  const deposito = DEPOSITO_DE[linea]?.[b.origen]
  if (!deposito) return { error: `Origen desconocido: ${b.origen}` }
  if (!items.every((it) => entero(it.product_id) && entero(it.size_id) && entero(it.quantity))) return { error: 'Hay renglones sin variante o con cantidad inválida.' }
  const sale = renglonesQueSalen(items)
  const ref = `${b.solicitudId}:${deposito}`
  const detalle = String(b.comments || '').slice(0, 300) || undefined
  const que = b.salida && typeof b.salida === 'object' ? b.salida : {}
  if (que.kind === 'solicitudesinternas' && que.tipo === 'consumo') {
    return { ajuste: { linea, deposito, motivo: motivoDeConsumo(que.motivo), ref, detalle, renglones: sale } }
  }
  const tipo = que.kind === 'sesionfotos' ? 'foto'
    : que.kind === 'solicitudesinternas' && que.tipo === 'retornable' ? (/producci/i.test(String(que.motivo || '')) ? 'produccion' : 'interna')
    : null
  if (!tipo) return { error: 'Esta línea ya no pasa por Gestión Nube y este pedido no dice qué es: recargá la página y volvé a cargarla.' }
  const renglones = sale.map((r) => ({ product_id: r.product_id, size_id: r.size_id, deposito, cantidad: -r.cantidad, sku: r.sku }))
  return { salida: { linea, tipo, ref, detalle, renglones } }
}

/** ¿Esta «venta» de la solicitud la anotó el ERP (`erp`), ⛔ GN? La pantalla la guarda en `ventas[origen]` como cualquier otra. */
export const esVentaErp = (v) => !!(v && v.erp)

/**
 * La solicitud SIN los orígenes que fueron al ERP (sus ítems y sus «ventas»): lo que queda es lo que pasó por GN y sigue el camino
 * de siempre (la sombra). Con todo en el ERP ⇒ sin ventas ⇒ `pedidoDeSolicitud` y `consumoDe` ⛔ anotan nada. Puro.
 */
export function sinOrigenesErp(s) {
  const ventas = s && s.ventas && typeof s.ventas === 'object' ? s.ventas : {}
  const erp = Object.keys(ventas).filter((o) => esVentaErp(ventas[o]))
  if (!erp.length) return s
  return {
    ...s,
    items: (s.items || []).filter((it) => !it || !erp.includes(it.origen)),
    ventas: Object.fromEntries(Object.entries(ventas).filter(([o]) => !erp.includes(o))),
  }
}

/**
 * Los orígenes que fueron al ERP como SALIDA CON VUELTA (⛔ el consumo: ⛔ vuelve), cada uno con su línea, su `ref` y sólo sus ítems,
 * para anotar lo que volvió: `[{ origen, linea, ref, solicitud }]`. La línea viaja en la «venta» (`venta.linea`, desde el 31-oct);
 * las de antes, sin línea, son de Stunned (la única que iba al ERP). Puro.
 */
export function salidasErpDe(kind, s) {
  if (!s || !s.id || !tipoDe(kind, s)) return []
  const ventas = s.ventas || {}
  return Object.keys(ventas)
    .filter((o) => esVentaErp(ventas[o]))
    .map((o) => ({ o, linea: ventas[o].linea || 'stunned' }))
    .filter(({ o, linea }) => DEPOSITO_DE[linea]?.[o])
    .map(({ o, linea }) => ({
      origen: o,
      linea,
      ref: `${s.id}:${DEPOSITO_DE[linea][o]}`,
      solicitud: { ...s, items: (s.items || []).filter((it) => it && it.origen === o) },
    }))
}
