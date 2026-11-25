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
/** Las líneas que viven en una base (las de `erp_corte`, sql/063). */
/** Desde acá arrancan los ids nacidos en el ERP (`catalogo_id`, sql/012): GN ⛔ los tuvo. */
export const CATALOGO_ID_DESDE = 1_000_000_000

export const lineasDeBase = (base) => (base === 'zattia' ? ['zattia', 'stunned'] : base === 'bdi' ? ['bdi'] : [])

/**
 * ¿Todas las líneas de la base ya cortaron (`erp_corte`)? Entonces GN ⛔ cuenta para su stock: el sync diario deja de guardar la
 * foto (BDI desde el 14-nov; Zattia+Stunned desde el 22-nov) y el libro ⛔ la pide (22-nov: libro:bdi falló cada noche por eso).
 * @param {string} base @param {Record<string, string>} cortes línea → instante
 */
export const todasCortaron = (base, cortes) => lineasDeBase(base).length > 0 && lineasDeBase(base).every((l) => Boolean(cortes?.[l]))

export function lineaDe(base, sku) {
  if (base === 'zattia') return sku && /^stu/i.test(String(sku)) ? 'stunned' : 'zattia'
  return 'bdi'
}

/**
 * 🔴 Desde cuándo GN ⛔ le dice nada al libro de una LÍNEA (error 13, Bruno 28-oct: «desde esta noche no se proyecta más, porque
 * la venta entra bien»): la línea vive en el ERP y sus ventas (Caja, pedidos de TN) bajan el libro directo. Lo que GN siga
 * trayendo —la integración de TN que se importó sola la #140 como GN #31028, una venta cargada a mano, un borrado— contaría
 * DOS VECES. El instante es el del ALINEO del corte: hasta ahí GN y el libro coinciden.
 * 🔑 Los cortes viven en la tabla `erp_corte` (sql/063, inmutable): ⛔ en una constante. Era `CORTES_GN` acá + una llave aparte en
 * el monitor, dos cosas que se desincronizan (30-oct). Los lee `cargarCortes` (lib/cargar.mjs); los escribe `alinear --corte`.
 */

/**
 * ¿GN ya ⛔ manda en esa línea en ese instante? `cortes` es obligatorio (⛔ un default que olvida el corte callado).
 * @param {string} linea @param {string|Date} instante @param {Record<string,string>} cortes
 */
export function gnYaNoManda(linea, instante, cortes) {
  if (!cortes) throw new Error('gnYaNoManda: faltan los cortes (erp_corte).')
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
export function indiceDeVariantes(filas, vinculos = [], kits = []) {
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
  // 🔑 Los vínculos de TN (sql/076) ganan al código y al SKU; uno que apunta a una variante que ⛔ está se ignora.
  const porVarianteTN = new Map()
  for (const f of vinculos) {
    const v = porVariante.get(`${f.product_id}:${f.size_id}`)
    if (v) porVarianteTN.set(String(f.variant_id), v)
  }
  // 🔑 Los CONJUNTOS de TN (sql/093): una variante de TN = varias prendas. Un conjunto con una pieza que ⛔ está queda ROTO (null en
  // `piezasTN` no: `{ rota: true }`), para que nadie lo trate como prenda suelta ni mande stock con una pieza de menos.
  const conjuntos = new Map()
  for (const f of kits) {
    const id = String(f.variant_id)
    if (!conjuntos.has(id)) conjuntos.set(id, [])
    conjuntos.get(id).push(f)
  }
  const piezasTN = new Map()
  for (const [id, fs] of conjuntos) {
    const piezas = fs.sort((a, b) => Number(a.n) - Number(b.n)).map((f) => {
      const v = porVariante.get(`${f.product_id}:${f.size_id}`)
      return v ? { ...v, cantidad: Number(f.cantidad || 1), n: Number(f.n) } : null
    })
    piezasTN.set(id, piezas.every(Boolean) ? piezas : { rota: true })
  }
  const enConjuntos = new Map()
  for (const [id, ps] of piezasTN) if (Array.isArray(ps)) for (const p of ps) {
    const k = `${p.product_id}:${p.size_id}`
    if (!enConjuntos.has(k)) enConjuntos.set(k, [])
    enConjuntos.get(k).push(Number(id))
  }
  return {
    variante: (pid, sid) => porVariante.get(`${pid}:${sid}`) ?? null,
    porVarianteTN: (id) => (id != null ? porVarianteTN.get(String(id)) ?? null : null),
    /** Las piezas del conjunto (`[{ product_id, size_id, sku, barcode, cantidad, n }]`), `{ rota: true }`, o null si ⛔ es conjunto. */
    piezasTN: (id) => (id != null ? piezasTN.get(String(id)) ?? null : null),
    /** Los conjuntos de TN (variant_id) que usan esa prenda del ERP. */
    conjuntosDe: (pid, sid) => enConjuntos.get(`${pid}:${sid}`) ?? [],
    porBarcode: (b) => (b ? porBarcode.get(String(b).trim().toUpperCase()) ?? null : null),
    porSku: (s) => (s ? porSku.get(String(s).trim().toUpperCase()) ?? null : null),
  }
}
