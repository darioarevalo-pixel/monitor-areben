// El ARMADO de la reposición con el lector: lo que se pidió, lo que se escaneó y qué se transfiere.
// Puro. ⛔ Es `.js` plano porque lo importa `api/_repo-armado.js` (los handlers no pasan por el
// compilador de Next) y también la pantalla, por `armado.ts`.
//
// 🔑 La regla de fondo (Darío, 11-oct-2026): **la transferencia sale al final y sólo con lo
// escaneado.** Si se transfiriera lo pedido al empezar, lo que no aparece en el estante queda movido
// en el sistema y hay que corregirlo a mano.

/** Los dos sentidos. Hoy se arma sólo `llevar` (tanda 1); `devolver` es la de Camila (tanda 2). */
export const SENTIDOS = ['llevar', 'devolver']

/**
 * La solicitud de devolución todavía sin enviar (Darío, 15-oct-2026): lo que Darío o Bruno van
 * confirmando. Vive en la misma tabla con este estado; ⛔ no es un armado (no entra al historial, al
 * correo ni al índice de «uno abierto por lista»).
 */
export const SIN_ENVIAR = 'sin_enviar'

/**
 * Quién decide qué vuelve al depósito: Darío o Bruno (Darío, 15-oct-2026). La misma regla que
 * `puedeEliminarTn` (Caducados) y que Configurar: admin y uno de los dos nombres.
 */
export function esAprobador(perfil) {
  const n = String((perfil && perfil.name) || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return !!(perfil && perfil.admin) && ['BRUNO AREVALO', 'DARIO AREVALO'].includes(n)
}

/** Qué pasó con lo que no se escaneó. `rechazada` = GN no la dejó transferir (dice que no hay stock). */
export const MOTIVOS_FALTANTE = ['no-estaba', 'despues', 'rechazada']

/** Tope de unidades por renglón: viene del navegador, y un número absurdo no puede llegar a GN. */
const TOPE = 999

const texto = (v) => (v == null ? '' : String(v)).trim()
const entero = (v) => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? n : 0
}

/**
 * El pedido tal como se congela al empezar, saneado: sólo los campos que se usan, cantidades enteras
 * de 1 en adelante y un renglón por variante (si viniera repetida, se suman).
 */
export function sanearPedido(items) {
  const porVid = new Map()
  for (const x of Array.isArray(items) ? items : []) {
    const pid = texto(x && x.pid)
    const sid = texto(x && x.sid)
    const cant = Math.min(TOPE, entero(x && x.cant))
    if (!pid || !sid || cant < 1) continue
    const vid = `${pid}_${sid}`
    const prev = porVid.get(vid)
    if (prev) {
      prev.cant = Math.min(TOPE, prev.cant + cant)
      continue
    }
    porVid.set(vid, {
      vid,
      pid,
      sid,
      sku: texto(x.sku),
      barcode: texto(x.barcode),
      name: texto(x.name) || '—',
      size: texto(x.size),
      cant,
      exhibir: x.exhibir === true,
      soloAlarma: x.soloAlarma === true,
      // La caja cerrada de vidrios (BDI) se suma con un botón: no tiene etiqueta que escanear.
      ...(entero(x.caja) > 1 ? { caja: Math.min(TOPE, entero(x.caja)) } : {}),
      // Devolución: el producto viaja en su bolsa con la etiqueta de 10 × 15 (Darío, 15-oct-2026).
      ...(x.bolsa === true ? { bolsa: true } : {}),
    })
  }
  return [...porVid.values()]
}

/**
 * Lo escaneado, saneado CONTRA el pedido: sólo variantes pedidas y nunca más de lo pedido. Lo que
 * sobra se frena en la pantalla; acá se vuelve a cortar porque esto es lo que viaja a GN.
 */
export function sanearEscaneos(escaneos, pedido) {
  const out = {}
  const e = escaneos && typeof escaneos === 'object' ? escaneos : {}
  for (const l of pedido) {
    const n = Math.max(0, Math.min(l.cant, entero(e[l.vid])))
    if (n > 0) out[l.vid] = n
  }
  return out
}

/** Las respuestas a «¿no estaba, o lo dejás para después?», sólo de variantes pedidas y de la lista. */
export function sanearFaltantes(faltantes, pedido) {
  const out = {}
  const f = faltantes && typeof faltantes === 'object' ? faltantes : {}
  for (const l of pedido) if (MOTIVOS_FALTANTE.includes(f[l.vid])) out[l.vid] = f[l.vid]
  return out
}

/**
 * Los ítems de la transferencia de GN: por `product_id` + `size_id` (no por código de barras: el
 * barcode de algunas prendas es el SKU, y dos variantes pueden compartir SKU). Mismo orden que el
 * pedido, para poder leer la respuesta de GN renglón por renglón.
 */
export function itemsTransferencia(pedido, escaneos) {
  const out = []
  for (const l of pedido) {
    const n = escaneos[l.vid] || 0
    if (n > 0) out.push({ vid: l.vid, item: { product_id: Number(l.pid), size_id: Number(l.sid), quantity: n } })
  }
  return out
}

/** Cuánto se pidió, cuánto se escaneó y cuántos renglones quedaron completos. */
export function resumenArmado(pedido, escaneos) {
  let pedidas = 0
  let escaneadas = 0
  let completas = 0
  for (const l of pedido) {
    const n = escaneos[l.vid] || 0
    pedidas += l.cant
    escaneadas += n
    if (n >= l.cant) completas++
  }
  return { pedidas, escaneadas, completas, renglones: pedido.length }
}

/** Fecha de hoy en Argentina, `YYYY-MM-DD`. */
export function fechaAR(ahoraMs = Date.now()) {
  return new Date(ahoraMs - 3 * 3600_000).toISOString().slice(0, 10)
}

/**
 * Por qué GN rechazó un renglón, en palabras del depósito. Las razones son las de la documentación
 * de `POST /inventario/transferencia`.
 */
export function motivoRechazo(reason) {
  switch (reason) {
    case 'stock_insuficiente':
      return 'Sin stock suficiente en el depósito'
    case 'variante_no_en_origen':
      return 'No figura en el depósito'
    case 'barcode_no_encontrado':
      return 'Producto no encontrado'
    case 'item_duplicado':
      return 'Repetida'
    case 'cantidad_invalida':
      return 'Cantidad inválida'
    default:
      return reason ? `Rechazada (${reason})` : 'Rechazada'
  }
}

/**
 * Lo ya transferido en tandas anteriores («Transferir y continuar», la limpieza grande: Darío,
 * 12-oct-2026). Vive adentro de `transfer.transferido` ({ vid: unidades }).
 * @param {unknown} transfer
 * @returns {Record<string, number>}
 */
export function transferidoDe(transfer) {
  /** @type {any} */
  const tr = transfer
  const t = tr && typeof tr === 'object' && tr.transferido && typeof tr.transferido === 'object' ? tr.transferido : {}
  /** @type {Record<string, number>} */
  const out = {}
  for (const [vid, n] of Object.entries(t)) {
    const v = entero(n)
    if (v > 0) out[vid] = v
  }
  return out
}

/** Lo escaneado nunca baja de lo ya transferido: eso ya está en el otro depósito. */
export function conTransferido(escaneos, transferido) {
  const out = { ...escaneos }
  for (const [vid, n] of Object.entries(transferido)) out[vid] = Math.max(out[vid] || 0, n)
  return out
}

/** Lo que falta transferir: lo escaneado menos lo que ya pasó en tandas anteriores. */
export function pendienteDeTransferir(escaneos, transferido) {
  const out = {}
  for (const [vid, n] of Object.entries(escaneos)) {
    const d = n - (transferido[vid] || 0)
    if (d > 0) out[vid] = d
  }
  return out
}

/**
 * De qué depósito de GN a cuál va el armado: «llevar» es depósito → local, «devolver» al revés.
 * Lo usan el pedido a GN y la tanda que queda guardada, para que digan lo mismo.
 */
export function depositosDelArmado(sentido, dep) {
  return sentido === 'devolver' ? [dep.local, dep.deposito] : [dep.deposito, dep.local]
}

/** Suma un mapa { vid: n } a otro. */
export function sumar(a, b) {
  const out = { ...a }
  for (const [vid, n] of Object.entries(b)) out[vid] = (out[vid] || 0) + n
  return out
}

/**
 * El código corto de un armado (`ra<epoch>_<azar>` → `K3X9AB`). Va en la descripción de la
 * transferencia en GN y en el cartel de «sin confirmar»: es lo que se busca en GN para saber si salió.
 * @param {string} id
 */
export function codigoArmado(id) {
  const s = String(id || '')
  const azar = s.includes('_') ? s.slice(s.lastIndexOf('_') + 1) : s.slice(-6)
  return azar.toUpperCase()
}

/**
 * Cuánto puede durar de verdad un «transfiriendo»: el servidor se corta a los 30 s (`maxDuration` de
 * `api/datos.js`). Pasado esto, nadie lo está transfiriendo: quedó TRABADO (el servidor se cortó o no
 * pudo anotar la respuesta) y se resuelve igual que un `revisar`, mirando en GN.
 */
export const TRABADO_MS = 90_000

/** ¿Quedó trabado en `transfiriendo`? (ver `TRABADO_MS`) */
export function trabado(armado, ahoraMs = Date.now()) {
  if (!armado || armado.estado !== 'transfiriendo') return false
  const t = Date.parse(armado.actualizado_en || armado.creado_en || '')
  return Number.isFinite(t) && ahoraMs - t > TRABADO_MS
}
