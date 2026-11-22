// @ts-check
/**
 * Caja — LOS CONJUNTOS (la bikini 2027 de Zattia = corpiño + bombacha; Bruno 21/22-nov). Núcleo puro: lo usan la pantalla, el
 * servidor (`confirmar`) y la entrada al motor, con los mismos parámetros.
 *
 * 🔑 Lo decidido (`reglas-vigentes.md` del ERP):
 *   - La bikini es UNA unidad: un producto con dos partes adentro. ⛔ se venden sueltas: escanear una parte pide la otra.
 *   - Precio: el de Tienda Nube del producto bikini (mismo de lista online y local), repartido entre las partes por COSTO de
 *     producción (lo reparte el servidor con `repartirPrecio` del motor: el costo ⛔ viaja al navegador, sólo lo que vale cada parte).
 *   - Cuenta 1 en las promos por cantidad (`unidadesParaPromos`) · ticket y factura en UNA línea (`lineasParaMostrar` del motor).
 *
 * 🔑 Cómo viaja: un renglón por PARTE (el libro y el costo son por prenda), cada uno con `conjunto: { variant_id, n }` — la variante de
 * TN de la bikini y qué parte es (1 = corpiño). Las partes de una bikini van juntas: se agregan, se suman y se sacan de a las dos.
 * La venta del motor lleva en `detalle.conjuntos` qué renglones forman cada bikini (`detalleDeConjuntos`): de ahí lo leen el ticket,
 * la factura y el cambio.
 *
 * @typedef {{ n: number, product_id: number, size_id: number, cantidad: number, precio: number, nombre?: string | null }} PiezaCaja
 * @typedef {{ variant_id: number, nombre: string, valores?: string[], precio: number, piezas: PiezaCaja[] }} ConjuntoCaja
 * @typedef {{ variant_id: number, n: number }} MarcaConjunto
 */

import { lineasParaMostrar } from '../../motor/venta/conjuntos.mjs';

/** @param {unknown} cond @param {string} msg @returns {asserts cond} */
function exigir(cond, msg) {
  if (!cond) throw new Error(msg);
}

const clave = (/** @type {any} */ pid, /** @type {any} */ sid) => `${Number(pid)}:${Number(sid)}`;
const aC = (/** @type {number} */ n) => Math.round(n * 100);

/**
 * La marca de conjunto de un renglón (la manda la pantalla), limpia; null si ⛔ trae.
 * @param {any} it @returns {MarcaConjunto | null}
 */
export function marcaDe(it) {
  const c = it && it.conjunto;
  if (!c || typeof c !== 'object') return null;
  const variant_id = Number(c.variant_id), n = Number(c.n);
  if (!(Number.isInteger(variant_id) && variant_id > 0 && Number.isInteger(n) && n >= 1 && n <= 9)) return null;
  return { variant_id, n };
}

/**
 * Las bikinis que llevan esta prenda (corpiño S ⇒ las de bombacha S, M, L de ese modelo y color).
 * @param {ConjuntoCaja[] | null | undefined} catalogo @param {number} product_id @param {number} size_id @returns {ConjuntoCaja[]}
 */
export const conjuntosConPieza = (catalogo, product_id, size_id) =>
  (catalogo || []).filter((c) => c.piezas.some((p) => clave(p.product_id, p.size_id) === clave(product_id, size_id)));

/** ¿La prenda es parte de alguna bikini? Entonces ⛔ se vende suelta. @param {ConjuntoCaja[] | null | undefined} catalogo @param {number} product_id @param {number} size_id */
export const esPieza = (catalogo, product_id, size_id) => conjuntosConPieza(catalogo, product_id, size_id).length > 0;

/**
 * 🔴 El servidor EXIGE que cada bikini venga entera y a su precio (si no, `curl`): toda parte de una bikini viaja marcada, cada
 * bikini con todas sus partes en la misma proporción y cada parte al precio que le toca. Tira con el mensaje para la pantalla.
 * @param {any[]} items los renglones que mandó la pantalla @param {ConjuntoCaja[]} catalogo
 */
export function exigirConjuntos(items, catalogo) {
  const porId = new Map((catalogo || []).map((c) => [Number(c.variant_id), c]));
  /** @type {Map<number, Map<number, { cantidad: number, it: any }>>} */
  const grupos = new Map();
  items.forEach((it, i) => {
    const m = marcaDe(it);
    if (!m) {
      exigir(!esPieza(catalogo, it.product_id, it.size_id), `Renglón ${i + 1}: es parte de una bikini y se vende sólo con la otra parte. Sacalo y volvé a escanearlo.`);
      return;
    }
    const c = porId.get(m.variant_id);
    exigir(c, `Renglón ${i + 1}: esa bikini ya no está en Tienda Nube. Recargá la Caja.`);
    const pz = c.piezas.find((p) => p.n === m.n);
    exigir(pz && clave(pz.product_id, pz.size_id) === clave(it.product_id, it.size_id), `Renglón ${i + 1}: el producto no es esa parte de ${c.nombre}. Recargá la Caja.`);
    exigir(aC(Number(it.precio)) === aC(pz.precio), `${c.nombre}: el precio de la bikini es el de Tienda Nube y no se cambia (se puede hacer un descuento). Recargá la Caja.`);
    const g = grupos.get(m.variant_id) || new Map();
    exigir(!g.has(m.n), `${c.nombre}: la misma parte está dos veces. Sacala y volvé a escanearla.`);
    g.set(m.n, { cantidad: Number(it.cantidad), it });
    grupos.set(m.variant_id, g);
  });
  for (const [vid, g] of grupos) {
    const c = /** @type {ConjuntoCaja} */ (porId.get(vid));
    const kits = c.piezas.map((p) => (g.get(p.n)?.cantidad ?? 0) / p.cantidad);
    exigir(kits.every((k) => k > 0 && Number.isInteger(k) && k === kits[0]), `${c.nombre}: faltan partes. La bikini se vende completa.`);
  }
}

/**
 * Los conjuntos de una venta guardada (`caja_venta.renglones`, cada parte con su `conjunto`), en la forma del motor
 * (`detalle.conjuntos`: `[{ variant_id, nombre, cantidad, piezas: [{ product_id, size_id, cantidad }] }]`).
 * @param {any[]} renglones
 */
export function detalleDeConjuntos(renglones) {
  /** @type {Map<number, any[]>} */
  const grupos = new Map();
  for (const r of renglones || []) {
    const m = marcaDe(r);
    if (m) grupos.set(m.variant_id, [...(grupos.get(m.variant_id) || []), { ...r, n: m.n }]);
  }
  return [...grupos].map(([variant_id, rs]) => {
    const orden = rs.sort((a, b) => a.n - b.n);
    // Por bikini, cada parte lleva 1 (las bikinis 2027); la cantidad es la de la parte 1.
    const cantidad = Number(orden[0].cantidad);
    return {
      variant_id,
      nombre: orden[0].conjunto?.nombre ?? null,
      cantidad,
      piezas: orden.map((r) => ({ product_id: Number(r.product_id), size_id: Number(r.size_id), cantidad: Math.max(1, Math.round(Number(r.cantidad) / cantidad)) })),
    };
  });
}

/**
 * Las unidades que ven las PROMOS: cada bikini es UNA (Bruno 22-nov, «cuenta 1 en las promos por cantidad»). Junta las partes en un
 * ítem con el precio de la bikini (la suma de las partes), el producto de cada parte (`ids`, para un alcance por productos) y las
 * categorías de todas. Devuelve los ítems y de qué renglones sale cada uno, para repartir lo que la promo descuente.
 * @param {any[]} items
 * @returns {{ ev: any[], de: number[][] }}
 */
export function unidadesParaPromos(items) {
  /** @type {any[]} */
  const ev = [];
  /** @type {number[][]} */
  const de = [];
  /** @type {Map<number, number>} */
  const grupo = new Map();
  items.forEach((it, i) => {
    const m = marcaDe(it);
    if (!m) { ev.push(it); de.push([i]); return; }
    const k = grupo.get(m.variant_id);
    if (k == null) { grupo.set(m.variant_id, ev.length); ev.push(null); de.push([i]); } else de[k].push(i);
  });
  de.forEach((idx, k) => {
    if (ev[k]) return;
    const partes = idx.map((i) => items[i]);
    const p1 = partes.find((p) => marcaDe(p)?.n === 1) || partes[0];
    const cantidad = Number(p1.cantidad) || 0;
    const totalC = partes.reduce((s, p) => s + aC(Number(p.cantidad) * Number(p.precio)), 0);
    ev[k] = {
      product_id: p1.product_id, size_id: p1.size_id, cantidad,
      precio: cantidad ? totalC / 100 / cantidad : 0,
      ids: partes.map((p) => Number(p.product_id)),
      categorias: [...new Set(partes.flatMap((p) => p.categorias || []))],
      // Un descuento a mano en cualquier parte es de la bikini: la promo ⛔ la toca.
      ...(partes.some((p) => p.rebaja != null || Number(p.descuento || 0) > 0) ? { rebaja: { tipo: 'pesos', valor: 0 } } : {}),
    };
  });
  return { ev, de };
}

/**
 * Reparte lo que la promo descontó a una bikini entre sus partes, por lo que vale cada una (centavos exactos: lo que sobra, a la última).
 * @param {number} pesosC lo descontado, en centavos @param {any[]} partes los renglones de la bikini @returns {number[]} centavos por parte
 */
export function repartirDescuento(pesosC, partes) {
  const pesos = partes.map((p) => aC(Number(p.cantidad) * Number(p.precio)));
  const suma = pesos.reduce((s, x) => s + x, 0);
  let resto = pesosC;
  return pesos.map((w, i) => {
    const c = i === pesos.length - 1 ? resto : suma ? Math.round((pesosC * w) / suma) : 0;
    resto -= c;
    return c;
  });
}

/** «CORPIÑO MADDIE CAMO» ⇒ «Corpiño»: la parte, para el detalle de la bikini en el ticket. @param {unknown} nombre */
const parteDe = (nombre) => {
  const w = String(nombre ?? '').trim().split(/\s+/)[0] || '';
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
};

/**
 * Los renglones de una venta guardada PARA MOSTRAR (ticket, mail): cada bikini en UNA línea (Bruno 22-nov) —«Bikini MADDIE · Camo»,
 * talle «Corpiño S / Bombacha M»—, con la regla del motor (`lineasParaMostrar`, la misma de la factura). El resto, como está.
 * @param {any[]} renglones `caja_venta.renglones`
 * @returns {Array<{ nombre: string | null, talle: string | null, cantidad: number, precio: number, importe: number, promos: string[] | null, sku: string | null, foto: string | null }>}
 */
export function renglonesParaMostrar(renglones) {
  const rs = renglones || [];
  const conjuntos = detalleDeConjuntos(rs);
  if (!conjuntos.length) {
    return rs.map((r) => ({ nombre: r.nombre ?? null, talle: r.talle ?? null, cantidad: r.cantidad, precio: r.precio, importe: r.importe ?? Math.round(r.cantidad * r.precio * 100) / 100, promos: r.promos ?? null, sku: r.sku ?? null, foto: r.foto ?? null }));
  }
  return lineasParaMostrar(rs.map((r) => ({ ...r, importe: r.importe ?? Math.round(r.cantidad * r.precio * 100) / 100 })), conjuntos).map((/** @type {any} */ f) => {
    if (!f.conjunto) {
      const r = f.linea;
      // Un renglón que quedó partido (raro: una parte suelta) sale con lo que queda.
      return { nombre: r.nombre ?? null, talle: r.talle ?? null, cantidad: f.cantidad, precio: r.precio, importe: f.importe, promos: r.promos ?? null, sku: r.sku ?? null, foto: r.foto ?? null };
    }
    const partes = /** @type {any[]} */ (f.partes);
    const lista = partes.reduce((s, p) => s + Number(p.precio) * (Math.abs(Number(p.cantidad)) / Math.abs(f.cantidad)), 0);
    return {
      nombre: f.nombre,
      talle: partes.map((p) => [parteDe(p.nombre), p.talle].filter(Boolean).join(' ')).join(' / ') || null,
      cantidad: f.cantidad,
      precio: Math.round(lista * 100) / 100,
      importe: f.importe,
      promos: [...new Set(partes.flatMap((p) => p.promos || []))].length ? [...new Set(partes.flatMap((p) => p.promos || []))] : null,
      sku: partes[0].sku ?? null,
      foto: partes[0].foto ?? null,
    };
  });
}
