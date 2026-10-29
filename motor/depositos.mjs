/**
 * Los depósitos de Gestión Nube con su nombre canónico, y la línea de cada producto.
 *
 * 🔑 Un solo lugar. En el monitor el mapa está escrito fijo en tres (`api/_inventario-vivo.js`,
 * `api/crear-venta.js`, `lib/caja/marcas.core.js`) y se dejaron como están: esta app no los importa.
 *
 * ⚠️ En Zattia el depósito se llama `Deposito ` con un espacio al final (en `inventario`, en
 * `ventas.store` y en `stock_foto`) ⇒ se compara recortado.
 */

/** Las dos bases del monitor. Stunned vive adentro de la de Zattia. */
export const BASES = ['bdi', 'zattia']

const POR_NOMBRE = {
  bdi: { 'local': 'local', 'deposito minorista': 'deposito_minorista', 'deposito mayorista': 'deposito_mayorista' },
  zattia: { 'local': 'local', 'deposito': 'deposito' },
}

/**
 * Los store_id de GN, medidos: Zattia el 11-oct-2026 con la transferencia de prueba (7741/7742),
 * BDI del mensaje a Darío (Minorista 13307 ↔ Local 18393). El Mayorista de BDI no tiene id medido.
 */
const POR_ID = {
  bdi: { 18393: 'local', 13307: 'deposito_minorista' },
  zattia: { 11780: 'local', 18210: 'deposito' },
}

/** El depósito canónico de un `store_name` de GN, o null si no se conoce (⛔ se adivina). */
export function depositoDe(base, storeName) {
  if (storeName == null) return null
  return POR_NOMBRE[base]?.[String(storeName).trim().toLowerCase()] ?? null
}

/** ¿Es un depósito que GN conoce? El Evento (sql/058) ⛔: GN ⛔ lo tiene y el alineo ⛔ lo toca. */
export function esDeGN(base, deposito) {
  return Object.values(POR_NOMBRE[base] ?? {}).includes(deposito)
}

/** El depósito canónico de un `store_id` de GN, o null. */
export function depositoDeId(base, storeId) {
  if (storeId == null) return null
  return POR_ID[base]?.[Number(storeId)] ?? null
}

/**
 * La línea de un producto: en la base de Zattia, Stunned es el prefijo `STU` del SKU. Copia de
 * `lineaDe` de `lib/lineas.core.js` del monitor (esta app no lo importa). Lo mismo que allá: un
 * producto de Stunned sin SKU cae en Zattia, y no hay otra señal para separarlo.
 */
export function lineaDe(base, sku) {
  if (base === 'zattia') return sku && /^stu/i.test(String(sku)) ? 'stunned' : 'zattia'
  return 'bdi'
}

/**
 * 🔴 Desde cuándo GN ⛔ le dice nada al libro de una LÍNEA (error 13, Bruno 28-oct: «desde esta noche no se proyecta más, porque
 * la venta entra bien»): la línea vive en el ERP y sus ventas (Caja, pedidos de TN) bajan el libro directo. Lo que GN siga
 * trayendo —la integración de TN que se importó sola la #140 como GN #31028, una venta cargada a mano, un borrado— contaría
 * DOS VECES. El instante es el del ALINEO del corte (`alinear --motivo "corte de Stunned"`, grupo `alineo:2026-10-28`):
 * hasta ahí GN y el libro coinciden. ⛔ Zattia ni BDI: siguen vendiendo por GN y su proyección es lo único que el libro sabe.
 */
export const CORTES_GN = Object.freeze({ stunned: '2026-10-28T23:40:27.759Z' })

/**
 * ¿GN ya ⛔ manda en esa línea en ese instante? `cortes` es obligatorio (⛔ un default que olvida el corte callado).
 * @param {string} linea @param {string|Date} instante @param {Record<string,string>} cortes
 */
export function gnYaNoManda(linea, instante, cortes) {
  if (!cortes) throw new Error('gnYaNoManda: faltan los cortes (CORTES_GN).')
  const c = cortes[linea]
  return !!c && new Date(instante).getTime() >= Date.parse(c)
}

/** El día de Argentina (UTC−3, sin horario de verano) de un instante. */
export function fechaAR(instante) {
  const d = instante instanceof Date ? instante : new Date(instante)
  return new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10)
}

/** La medianoche de Argentina de un día (`2026-10-12` ⇒ 2026-10-12T03:00:00Z). */
export function medianocheAR(fecha) {
  return new Date(`${String(fecha).slice(0, 10)}T03:00:00.000Z`)
}

/** El día siguiente a una fecha `YYYY-MM-DD`. */
export function diaSiguiente(fecha, n = 1) {
  const d = new Date(`${String(fecha).slice(0, 10)}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * El índice de variantes del espejo `inventario`: (product_id, size_id) ⇒ sku y barcode, y
 * barcode ⇒ variante y sku ⇒ variante, para las fuentes que no traen la variante de GN.
 * @param {Array<{product_id:number,size_id:number,sku?:string,barcode?:string}>} filas
 */
export function indiceDeVariantes(filas) {
  const porVariante = new Map()
  const porBarcode = new Map()
  const porSku = new Map()
  for (const f of filas) {
    const k = `${f.product_id}:${f.size_id}`
    if (!porVariante.has(k)) porVariante.set(k, { product_id: Number(f.product_id), size_id: Number(f.size_id), sku: f.sku || null, barcode: f.barcode || null })
    const v = porVariante.get(k)
    if (f.barcode) porBarcode.set(String(f.barcode).trim().toUpperCase(), v)
    if (f.sku) porSku.set(String(f.sku).trim().toUpperCase(), v)
  }
  return {
    variante: (pid, sid) => porVariante.get(`${pid}:${sid}`) ?? null,
    porBarcode: (b) => (b ? porBarcode.get(String(b).trim().toUpperCase()) ?? null : null),
    porSku: (s) => (s ? porSku.get(String(s).trim().toUpperCase()) ?? null : null),
  }
}
