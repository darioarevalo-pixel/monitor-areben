// @ts-check
/**
 * Etiquetas — LA BIKINI 2027 (Bruno, 26-nov: «estaría bueno que pueda escanear una parte cualquiera y salga la etiqueta de su bikini»).
 *
 * La bikini es UN producto con dos partes (corpiño + bombacha): en el ERP y en el local cada parte es una prenda con su código, y en
 * Tienda Nube la bikini es un producto aparte (variante = talle de corpiño × talle de bombacha). La Caja escanea una parte y pide la
 * otra (`lib/caja/conjuntos.core.js`). Etiquetas listaba las partes con el nombre y el precio DE LA PARTE ⇒ la etiqueta de la bikini
 * no existía.
 *
 * 🔑 Lo que imprime ahora una parte: **el nombre y el precio de SU bikini**, con la parte y el talle abajo («Corpiño · S») y **el código
 * de barras de la parte** — es lo que la Caja escanea. Sirve cualquiera de las dos partes.
 *
 * 🔑 **El precio es el MISMO que cobra la Caja**: sale de `conjuntosDeCaja` (`api/_caja-motor.js`, el precio de TN de la bikini, con su
 * promo). Medido 26-nov en producción: 23 bikinis, 138 partes, cada parte en UNA sola bikini y cada bikini con UN solo precio ⇒ la
 * parte alcanza para saber qué etiqueta va. Si algún día una bikini tiene precios distintos por talle, va el MENOR y la fila lo dice
 * (`variosPrecios`).
 *
 * ⛔ Lo que viaja al navegador es lista blanca (`bikinisParaEtiquetas`): nombre, precio, lista y qué partes la forman. ⛔ El reparto
 * del precio entre las partes (sale del costo de producción).
 *
 * @typedef {{ product_id: number, size_id: number, n: number, producto?: string | null, talle?: string | null }} PiezaBikini
 * @typedef {{ nombre: string, precio: number, lista: number | null, variosPrecios: boolean, piezas: PiezaBikini[] }} BikiniEti
 */

const clave = (/** @type {any} */ pid, /** @type {any} */ sid) => `${Number(pid)}_${Number(sid)}`;

/**
 * Las bikinis de la Caja (una por VARIANTE de TN) → una por PRODUCTO bikini, con todas sus partes. Lista blanca.
 * @param {Array<{ nombre: string, precio: number, lista?: number | null, piezas: Array<{ n: number, product_id: number, size_id: number, producto?: string | null, talle?: string | null }> }> | null | undefined} conjuntos
 * @returns {BikiniEti[]}
 */
export function bikinisParaEtiquetas(conjuntos) {
  /** @type {Map<string, BikiniEti & { _vistas: Set<string> }>} */
  const porNombre = new Map();
  for (const c of conjuntos || []) {
    const precio = Number(c.precio);
    if (!(precio > 0)) continue;
    const lista = c.lista != null && Number(c.lista) > precio ? Number(c.lista) : null;
    let b = porNombre.get(c.nombre);
    if (!b) {
      b = { nombre: c.nombre, precio, lista, variosPrecios: false, piezas: [], _vistas: new Set() };
      porNombre.set(c.nombre, b);
    } else if (precio !== b.precio) {
      b.variosPrecios = true;
      if (precio < b.precio) { b.precio = precio; b.lista = lista; }
    }
    for (const p of c.piezas || []) {
      const k = clave(p.product_id, p.size_id);
      if (b._vistas.has(k)) continue;
      b._vistas.add(k);
      b.piezas.push({ product_id: Number(p.product_id), size_id: Number(p.size_id), n: Number(p.n), producto: p.producto ?? null, talle: p.talle ?? null });
    }
  }
  return [...porNombre.values()].map(({ _vistas, ...b }) => b);
}

/** «CORPIÑO MADDIE SKY» → «Corpiño». La parte es la primera palabra del producto; sin nombre, por su lugar en la bikini. */
function nombreDeParte(/** @type {PiezaBikini} */ p) {
  const w = String(p.producto || '').trim().split(/\s+/)[0] || '';
  if (w) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  return p.n === 1 ? 'Corpiño' : 'Bombacha';
}

/**
 * pid_sid de cada parte → su bikini y qué parte es.
 * @param {BikiniEti[] | null | undefined} bikinis
 * @returns {Map<string, { bikini: BikiniEti, pieza: PiezaBikini }>}
 */
export function indiceDePartes(bikinis) {
  const m = new Map();
  for (const b of bikinis || []) for (const p of b.piezas) m.set(clave(p.product_id, p.size_id), { bikini: b, pieza: p });
  return m;
}

/**
 * Las variantes de Etiquetas con las partes de bikini rebautizadas: nombre = la bikini, variante = «Corpiño · S». El código de barras,
 * el SKU y el stock quedan los de la parte (es la prenda que se cuelga y la que escanea la Caja).
 * @template {{ id: string, pid: string, name: string, size: string }} V
 * @param {V[]} vars @param {BikiniEti[] | null | undefined} bikinis
 * @returns {Array<V & { bikini?: string }>}
 */
export function variantesComoBikini(vars, bikinis) {
  const idx = indiceDePartes(bikinis);
  if (!idx.size) return vars;
  return (vars || []).map((v) => {
    const e = idx.get(String(v.id));
    if (!e) return v;
    const talle = e.pieza.talle || v.size || '';
    return { ...v, name: e.bikini.nombre, size: talle ? `${nombreDeParte(e.pieza)} · ${talle}` : nombreDeParte(e.pieza), bikini: e.bikini.nombre };
  });
}

/**
 * Los precios de Etiquetas con el de la bikini puesto en cada producto-parte (corpiño MADDIE SKY → lo que vale la bikini MADDIE Sky).
 * Gana sobre TN y sobre el Minorista del ERP de la parte: la parte ⛔ se vende sola. Con promo (lista mayor), va tachado.
 * @template {{ precios: Record<string, number>, promos: Record<string, { normal: number, promo: number }>, fueraDeTn: Set<string> }} B
 * @param {B} base @param {BikiniEti[] | null | undefined} bikinis
 * @returns {B & { deBikini: Set<string> }}
 */
export function conPreciosDeBikini(base, bikinis) {
  const deBikini = new Set();
  if (!bikinis || !bikinis.length) return { ...base, deBikini };
  const precios = { ...base.precios };
  const promos = { ...base.promos };
  const fueraDeTn = new Set(base.fueraDeTn);
  for (const b of bikinis) {
    for (const p of b.piezas) {
      const pid = String(p.product_id);
      precios[pid] = b.precio;
      delete promos[pid];
      fueraDeTn.delete(pid);
      deBikini.add(pid);
      if (b.lista != null && b.lista > b.precio) promos[pid] = { normal: b.lista, promo: b.precio };
    }
  }
  return { ...base, precios, promos, fueraDeTn, deBikini };
}
