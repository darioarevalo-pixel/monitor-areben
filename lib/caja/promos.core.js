// @ts-check
/**
 * Caja · W5 — las PROMOS del local (plan v2, Bruno 4-oct y 5-oct-2026). Núcleo puro: lo usan la
 * pantalla (para mostrar) y el servidor (para cobrar), con los mismos parámetros. ⛔ Lee el reloj ni
 * la base: `hoy` y las promos entran por parámetro.
 *
 * Las cuatro (Bruno, 4-oct): **NxM** (2x1, 3x2) · **2ª unidad al X %** · **X % sobre un alcance**
 * (categoría de Tienda Nube, productos, o todo) · **$ fijos por compra mayor a X**.
 *
 * 🔑 Decidido por Bruno al arrancar W5 (5-oct):
 * 1. **Una promo por prenda, la mejor para el cliente.**
 * 2. **La promo se SUMA al % de la forma de pago**: promo ⇒ venta ⇒ forma de pago. Por eso la promo
 *    de prenda sale como la `rebaja` en pesos del renglón, y la de compra como el descuento a la venta:
 *    `cobro()` ya hace la cascada.
 * 3. En NxM **sale gratis la más barata**.
 * 4. **Feria ⛔ entra** en promos, y **el descuento a mano de la cajera REEMPLAZA a la promo** de esa
 *    prenda. Para la de compra, lo mismo: el descuento a mano a la venta reemplaza a la promo de
 *    monto mínimo (lo decide quien llama: `descuentoVenta ?? promoVenta`).
 *
 * «La mejor para el cliente» con varias promos a la vez: se elige, de a una, la promo que MÁS ahorra
 * sobre las prendas que quedan libres, y las prendas que usa (también las que pagan en un 3x2) ya ⛔
 * entran en otra. Es la mejor de a una, ⛔ la mejor combinación posible: con las promos del local
 * (pocas y de alcances distintos) dan lo mismo.
 */

/**
 * @typedef {'nxm' | 'segunda_unidad' | 'pct' | 'monto_minimo'} TipoPromo
 * @typedef {{ tipo: 'todo' } | { tipo: 'categorias', categorias: string[] } | { tipo: 'productos', productos: Array<{ id: number, nombre: string }> }} Alcance
 * @typedef {{ id: string, nombre: string, tipo: TipoPromo, lleva?: number, paga?: number, pct?: number, minimo?: number, pesos?: number, alcance: Alcance, desde: string, hasta: string | null, activa: boolean }} Promo
 * @typedef {{ tipo: 'pct' | 'pesos', valor: number }} Rebaja
 * @typedef {{ product_id: number, size_id: number, cantidad: number, precio: number, descuento?: number, rebaja?: Rebaja | null, categorias?: string[] }} ItemPromo
 * @typedef {{ id: string, nombre: string, pesos: number }} PromoAplicada
 */

export const TIPOS_PROMO = Object.freeze(['nxm', 'segunda_unidad', 'pct', 'monto_minimo']);

/** El nombre que lee la gente de cada tipo. */
export const NOMBRE_TIPO = Object.freeze({
  nxm: 'Lleva N, paga M',
  segunda_unidad: '2ª unidad con descuento',
  pct: '% de descuento',
  monto_minimo: '$ de descuento por compra mayor a',
});

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** @param {unknown} cond @param {string} msg @returns {asserts cond} */
function exigir(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** @param {number} n */
const aC = n => Math.round(n * 100);

/** Mayúsculas y sin espacios de más: la categoría de TN se compara así. @param {unknown} s */
export const normCategoria = s => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * Valida y limpia la lista de promos que guarda un admin. Tira con un mensaje para la pantalla.
 * @param {unknown} lista @returns {Promo[]}
 */
export function normalizarPromos(lista) {
  exigir(Array.isArray(lista) && lista.length <= 200, 'La lista de promos es inválida.');
  const ids = new Set();
  return lista.map((x, i) => {
    const p = /** @type {any} */ (x) || {};
    const n = `Promo ${i + 1}`;
    const id = String(p.id || '').trim();
    exigir(/^[A-Za-z0-9_-]{1,40}$/.test(id), `${n}: falta el id.`);
    exigir(!ids.has(id), `${n}: id repetido.`);
    ids.add(id);
    const nombre = String(p.nombre || '').trim().slice(0, 60);
    exigir(nombre, `${n}: falta el nombre.`);
    exigir(TIPOS_PROMO.includes(p.tipo), `${nombre}: tipo inválido.`);
    exigir(typeof p.desde === 'string' && FECHA.test(p.desde), `${nombre}: falta desde cuándo.`);
    exigir(p.hasta == null || p.hasta === '' || (typeof p.hasta === 'string' && FECHA.test(p.hasta) && p.hasta >= p.desde), `${nombre}: el «hasta» es anterior al «desde».`);
    /** @type {Promo} */
    const out = { id, nombre, tipo: p.tipo, alcance: alcanceValido(p.alcance, nombre), desde: p.desde, hasta: p.hasta ? p.hasta : null, activa: p.activa !== false };
    if (p.tipo === 'nxm') {
      const lleva = Number(p.lleva), paga = Number(p.paga);
      exigir(Number.isInteger(lleva) && Number.isInteger(paga) && paga >= 1 && lleva > paga && lleva <= 10, `${nombre}: «lleva» tiene que ser mayor que «paga» (por ejemplo 3x2).`);
      Object.assign(out, { lleva, paga });
    }
    if (p.tipo === 'segunda_unidad' || p.tipo === 'pct') {
      const pct = Number(p.pct);
      exigir(Number.isFinite(pct) && pct > 0 && pct <= 100, `${nombre}: el % va de 1 a 100.`);
      out.pct = pct;
    }
    if (p.tipo === 'monto_minimo') {
      const minimo = Number(p.minimo), pesos = Number(p.pesos);
      exigir(Number.isFinite(minimo) && minimo > 0, `${nombre}: falta el monto mínimo de la compra.`);
      exigir(Number.isFinite(pesos) && pesos > 0 && pesos < minimo, `${nombre}: el descuento tiene que ser menor que el mínimo de la compra.`);
      Object.assign(out, { minimo, pesos });
    }
    return out;
  });
}

/** @param {any} a @param {string} nombre @returns {Alcance} */
function alcanceValido(a, nombre) {
  exigir(a && typeof a === 'object', `${nombre}: falta a qué prendas aplica.`);
  if (a.tipo === 'todo') return { tipo: 'todo' };
  if (a.tipo === 'categorias') {
    const cats = [...new Set((Array.isArray(a.categorias) ? a.categorias : []).map(normCategoria).filter(Boolean))];
    exigir(cats.length > 0, `${nombre}: elegí al menos una categoría.`);
    return { tipo: 'categorias', categorias: cats };
  }
  if (a.tipo === 'productos') {
    const vistos = new Set();
    const productos = [];
    for (const x of Array.isArray(a.productos) ? a.productos : []) {
      const id = Number(x && x.id);
      exigir(Number.isInteger(id) && id > 0, `${nombre}: un producto sin id.`);
      if (vistos.has(id)) continue;
      vistos.add(id);
      productos.push({ id, nombre: String((x && x.nombre) || '').slice(0, 200) });
    }
    exigir(productos.length > 0, `${nombre}: elegí al menos un producto.`);
    return { tipo: 'productos', productos };
  }
  throw new Error(`${nombre}: alcance inválido.`);
}

/**
 * Las promos que valen HOY. `hoy` es `AAAA-MM-DD` y es obligatorio.
 * @param {Promo[] | null | undefined} promos @param {string} hoy @returns {Promo[]}
 */
export function promosVigentes(promos, hoy) {
  exigir(typeof hoy === 'string' && FECHA.test(hoy), 'Falta la fecha de hoy');
  return (promos || []).filter(p => p && p.activa !== false && p.desde <= hoy && (!p.hasta || hoy <= p.hasta));
}

/** ¿La prenda entra en el alcance? @param {Alcance} a @param {ItemPromo} it */
function entra(a, it) {
  if (a.tipo === 'todo') return true;
  if (a.tipo === 'productos') return a.productos.some(p => p.id === Number(it.product_id));
  const suyas = new Set((it.categorias || []).map(normCategoria));
  return a.categorias.some(c => suyas.has(c));
}

/**
 * Lo que ahorra UNA promo de prenda sobre las unidades libres que entran en su alcance.
 * Unidades ordenadas por precio de mayor a menor (empate: el orden del carrito): los grupos se arman
 * así, y la(s) gratis / con descuento son las últimas de cada grupo ⇒ las más baratas.
 * @param {Promo} p @param {Array<{ i: number, precioC: number }>} u las unidades que entran
 * @returns {{ ahorroC: number, usadas: number[], descC: Map<number, number> }} `usadas` y `descC` por índice en `u`
 */
function evaluar(p, u) {
  const orden = u.map((x, k) => ({ ...x, k })).sort((a, b) => b.precioC - a.precioC || a.k - b.k);
  /** @type {Map<number, number>} */
  const descC = new Map();
  const usadas = [];
  if (p.tipo === 'pct') {
    for (const x of orden) {
      descC.set(x.k, Math.round(x.precioC * Number(p.pct) / 100));
      usadas.push(x.k);
    }
  } else {
    const lleva = p.tipo === 'nxm' ? Number(p.lleva) : 2;
    const paga = p.tipo === 'nxm' ? Number(p.paga) : 1;
    for (let g = 0; g + lleva <= orden.length; g += lleva) {
      const grupo = orden.slice(g, g + lleva);
      grupo.forEach((x, j) => {
        usadas.push(x.k);
        if (j < paga) return;
        descC.set(x.k, p.tipo === 'nxm' ? x.precioC : Math.round(x.precioC * Number(p.pct) / 100));
      });
    }
  }
  let ahorroC = 0;
  for (const v of descC.values()) ahorroC += v;
  return { ahorroC, usadas, descC };
}

/** Un renglón con descuento a mano (la cajera): la promo ⛔ lo toca. @param {ItemPromo} it */
const aMano = it => it.rebaja != null || Number(it.descuento || 0) > 0;

/**
 * Aplica las promos vigentes al carrito.
 *
 * Devuelve los `items` listos para `renglones()`: a cada prenda con promo se le pone la `rebaja` en
 * PESOS que le toca (la suma de sus unidades) y `promos` (los nombres, para la pantalla y el ticket).
 * Las prendas de feria, las de descuento a mano y las que ⛔ entran en ninguna salen como vinieron.
 * `venta` es la promo de monto mínimo que corresponde (o null): quien llama la usa como descuento a
 * la venta SÓLO si la cajera ⛔ puso uno a mano.
 *
 * @param {{ items: ItemPromo[], promos: Promo[] | null | undefined, feriaIds: Set<number>, hoy: string }} args
 * @returns {{ items: Array<ItemPromo & { promos?: string[] }>, venta: PromoAplicada | null, aplicadas: PromoAplicada[] }}
 */
export function aplicarPromos({ items, promos, feriaIds, hoy }) {
  exigir(Array.isArray(items), 'Faltan los renglones');
  exigir(feriaIds instanceof Set, 'Faltan los productos de feria');
  const vigentes = promosVigentes(promos, hoy);
  const deCompra = vigentes.filter(p => p.tipo === 'monto_minimo');
  let libres = vigentes.filter(p => p.tipo !== 'monto_minimo');

  // Las unidades que pueden llevar promo: ni feria ni descuento a mano.
  /** @type {Array<{ i: number, precioC: number }>} */
  let unidades = [];
  items.forEach((it, i) => {
    if (aMano(it) || feriaIds.has(Number(it.product_id))) return;
    const precioC = aC(Number(it.precio) || 0);
    if (precioC <= 0) return;
    for (let q = 0; q < (Number(it.cantidad) || 0); q++) unidades.push({ i, precioC });
  });

  const pesosC = items.map(() => 0);
  /** @type {Array<Set<string>>} */
  const nombres = items.map(() => new Set());
  /** @type {PromoAplicada[]} */
  const aplicadas = [];
  for (;;) {
    let mejor = null;
    for (const p of libres) {
      const enAlcance = unidades.map((x, k) => ({ x, k })).filter(({ x }) => entra(p.alcance, items[x.i]));
      const r = evaluar(p, enAlcance.map(({ x }) => x));
      if (r.ahorroC > 0 && (!mejor || r.ahorroC > mejor.r.ahorroC)) mejor = { p, r, enAlcance };
    }
    if (!mejor) break;
    const { p, r, enAlcance } = mejor;
    const usadas = new Set(r.usadas.map(k => enAlcance[k].k));
    for (const [k, d] of r.descC) {
      const { i } = enAlcance[k].x;
      pesosC[i] += d;
      nombres[i].add(p.nombre);
    }
    aplicadas.push({ id: p.id, nombre: p.nombre, pesos: r.ahorroC / 100 });
    unidades = unidades.filter((_, k) => !usadas.has(k));
    libres = libres.filter(x => x !== p);
  }

  const salida = items.map((it, i) => (pesosC[i] > 0 ? { ...it, rebaja: { tipo: /** @type {'pesos'} */ ('pesos'), valor: pesosC[i] / 100 }, promos: [...nombres[i]] } : it));

  // La de compra: sobre lo que queda de las prendas que NO son de feria, la que más descuenta.
  const baseC = items.reduce((s, it, i) => {
    if (feriaIds.has(Number(it.product_id))) return s;
    const brutoC = aC(Number(it.cantidad) * Number(it.precio) * (1 - Number(it.descuento || 0) / 100));
    const manualC = it.rebaja && it.rebaja.tipo === 'pesos' ? aC(Number(it.rebaja.valor)) : it.rebaja && it.rebaja.tipo === 'pct' ? Math.round(brutoC * Number(it.rebaja.valor) / 100) : 0;
    return s + brutoC - manualC - pesosC[i];
  }, 0);
  /** @type {PromoAplicada | null} */
  let venta = null;
  for (const p of deCompra) {
    if (baseC < aC(Number(p.minimo))) continue;
    const pesos = Math.min(Number(p.pesos), baseC / 100);
    if (!venta || pesos > venta.pesos) venta = { id: p.id, nombre: p.nombre, pesos };
  }
  return { items: salida, venta, aplicadas };
}
