/**
 * Liquidación → ERP → Tienda Nube, la parte que habla con las bases (Stunned; Bruno 30-oct). La regla, en
 * `lib/liquidacion/erp.core.js`. Lo llama `api/_liquidacion.js` (`aplicar` y `releer-erp`); ⛔ es una ruta.
 *
 * 🔑 Dos bases: la carga va a la del motor de Zattia (Stunned vive adentro, `marca = 'stunned'`), y el aviso a la cola, que
 * vive en la de BDI para las tres tiendas (como el botón de stock, `api/_erp-empuje-stock.js`).
 */
import { configPg } from '../lib/pg.core.js';
import { cargaDeCampania, motivoDeCampania, TIENDA_ERP, TRABAJO_PRECIO } from '../lib/liquidacion/erp.core.js';

const PG_DE_MARCA = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' };
const SIN_MOTOR = 'La campaña de Stunned va por el ERP y falta la conexión del motor en Vercel: no se tocó nada.';

/** Abre la conexión del motor de esa base, corre `fn(db)` y la cierra. Sin la variable tira con el texto para la pantalla. */
export async function conMotor(base, fn) {
  const conexion = process.env[PG_DE_MARCA[base]];
  if (!conexion) throw new Error(SIN_MOTOR);
  const { default: pg } = await import('pg');
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  try {
    await db.connect();
    return await fn(db);
  } finally {
    await db.end().catch(() => {});
  }
}

/**
 * CARGA la oferta de cada producto en el ERP (todo o nada) y avisa el envío a TN.
 * @param {{ liqId: string, liqNombre: string, modo: 'poner'|'sacar', destino: 'lista'|'previa', usuario: string,
 *   items: Array<{ pid: string, precioSale: number|null, promoPrevia: number|null }> }} p
 * @returns {Promise<{ resultados: Array<{ pid: string, ok: boolean, valor?: number, quiere?: number|null, error?: string }>, pedidoEn: string|null }>}
 */
export async function pedirAlErp({ liqId, liqNombre, modo, destino, usuario, items }, deps = { conMotor }) {
  const quien = String(usuario || 'monitor');
  const r = await deps.conMotor('zattia', async (db) => {
    const { rows } = await db.query(
      `select product_id, precio from precio_lista where marca = $1 and lista = 'online' and product_id = any($2::bigint[])`,
      [TIENDA_ERP, items.map((i) => Number(i.pid))],
    );
    const lista = new Map(rows.map((f) => [String(f.product_id), f.precio == null ? null : Number(f.precio)]));
    const planes = items.map((i) => ({ pid: i.pid, ...cargaDeCampania({ modo, destino, precioSale: i.precioSale, promoPrevia: i.promoPrevia, listaErp: lista.get(i.pid) }) }));
    const buenos = planes.filter((p) => !p.error);
    if (!buenos.length) return { planes, pedidoEn: null };
    const { cargarPrecio } = await import('../motor/venta/precio.mjs');
    await db.query('begin');
    try {
      for (const p of buenos) {
        const c = await cargarPrecio(db, { marca: TIENDA_ERP, product_id: Number(p.pid), lista: 'oferta', precio: p.valor, usuario: quien, motivo: motivoDeCampania(liqId, liqNombre) });
        if (!c.ok) throw new Error(`producto ${p.pid}: ${c.error?.mensaje || 'el ERP no lo aceptó'}`);
      }
      const { rows: [ahora] } = await db.query('select now() as t');
      await db.query('commit');
      return { planes, pedidoEn: new Date(ahora.t).toISOString() };
    } catch (e) {
      await db.query('rollback').catch(() => {});
      throw e;
    }
  });
  if (r.pedidoEn) {
    await deps.conMotor('bdi', async (db) => {
      const { avisar } = await import('../motor/evento.mjs');
      await avisar(db, { tipo: TRABAJO_PRECIO, clave: TIENDA_ERP, origen: `liquidacion:${quien}`.slice(0, 60) });
    });
  }
  return {
    pedidoEn: r.pedidoEn,
    resultados: r.planes.map((p) => (p.error ? { pid: p.pid, ok: false, error: p.error } : { pid: p.pid, ok: true, valor: p.valor, quiere: p.quiere })),
  };
}

/** Los últimos envíos de precio de Stunned de la cola (el más nuevo primero), con lo que releyeron de TN. */
export async function eventosDePrecio(deps = { conMotor }) {
  return deps.conMotor('bdi', async (db) => {
    const { rows } = await db.query(
      `select id, estado, tomado_en, terminado_en, error, resultado from motor_evento where tipo = $1 and clave = $2 order by id desc limit 20`,
      [TRABAJO_PRECIO, TIENDA_ERP],
    );
    const iso = (t) => (t ? new Date(t).toISOString() : null);
    return rows.map((e) => ({ ...e, id: Number(e.id), tomado_en: iso(e.tomado_en), terminado_en: iso(e.terminado_en) }));
  });
}

/** Pide otro envío de precio de Stunned (el que relee TN). La cola junta los avisos: dos pedidos seguidos son UNO. */
export async function pedirRelectura(usuario, deps = { conMotor }) {
  return deps.conMotor('bdi', async (db) => {
    const { avisar } = await import('../motor/evento.mjs');
    return avisar(db, { tipo: TRABAJO_PRECIO, clave: TIENDA_ERP, origen: `liquidacion-releer:${usuario || 'monitor'}`.slice(0, 60) });
  });
}

/**
 * product_id → línea, por los SKU del catálogo del MOTOR (`variante`; ⛔ el espejo de GN: `tests/espejo-puertas.test.ts`),
 * con la MISMA regla que la carga de precios del ERP (`lineaDelProducto`). Sólo Zattia tiene líneas adentro.
 */
export async function lineasDe(store, pids, lineaDelProducto, deps = { conMotor }) {
  if (store !== 'zattia') return new Map(pids.map((p) => [p, store]));
  const filas = await deps.conMotor('zattia', async (db) => (await db.query(
    'select product_id, sku from variante where product_id = any($1::bigint[])', [pids.map(Number)],
  )).rows);
  const skus = new Map();
  for (const f of filas) skus.set(String(f.product_id), [...(skus.get(String(f.product_id)) || []), f.sku]);
  return new Map(pids.map((p) => [p, lineaDelProducto(store, skus.get(String(p)) || [])]));
}
