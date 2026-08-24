// "Clavados" — tabla `clavados` (ver sql/migrate-clavados.sql).
//
//   GET  ?recurso=clavados&store=bdi|zattia            → { ok, clavados, puede }
//   POST { recurso, store, accion:'marcar',  producto_id, sku, nombre, nota }
//   POST { recurso, store, accion:'sacar',   id }      → lo saca de la lista activa (no borra)
//   POST { recurso, store, accion:'borrar',  id }      → sólo si se marcó por error
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=clavados`. El plan Hobby de
// Vercel admite 12 funciones; crear `api/clavados.js` "por prolijidad" **frena todos los deploys sin
// error visible**. Ya pasó una vez.
//
// # Quién marca
//
// 🔑 **Marcar es de ADMIN; ver el estado, de quien vea Productos.** «Clavado» es una decisión de
// dirección —se le bajó el precio y a partir de ahí lo que se mide es cuánta plata vuelve—, y el
// memo que lo lee es de admins. Pero el chip tiene que verlo cualquiera que mire la fila del
// producto: si sólo lo viera Bruno, dos personas mirando el mismo producto verían dos cosas
// distintas. Mismo reparto que el memo (`esAdmin` para escribir, permiso para leer).
//
// # 🔴 `visto_en_cero` NO decide si un clavado está agotado
//
// Lo decide el **stock de hoy**, que se lee acá y se manda en cada renglón. La columna guarda
// cuándo el sistema *vio* el cero por primera vez y no cuándo llegó a cero: nadie guarda historial
// de stock. Se estampa perezosamente en el GET y eso está bien **porque ningún número depende de
// ella** — la plata de cada semana sale de las ventas de esa semana (`lib/clavados/core.js`). Si el
// recupero dependiera de este sello, un producto que se agotó el martes y que nadie miró hasta
// septiembre caería en la semana equivocada.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { esAdmin, puedeVerAlguna } from '../lib/permisos.core.js';
import { baseDeLinea } from '../lib/lineas.core.js';
import { leerTodo } from '../lib/supabase/paginar.core.js';

/** La base de CADA marca: `producto_id` es de su base. Mismo `cfgFor` que `_pedidos-clientes.js`. */
function cfgFor(store) {
  if (baseDeLinea(store) === 'zattia') {
    return {
      url: process.env.ZATTIA_SUPABASE_URL,
      key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY,
    };
  }
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

const TABLA = 'clavados';
/** Ver el chip en la fila del producto. */
const PARA_VER = ['productos', 'memo'];

/**
 * Stock y costo de los productos marcados, del espejo.
 *
 * ⚠️ El stock se suma por `product_id` sobre TODAS las filas de `inventario`, que están partidas por
 * variante y por depósito. Leer una sola fila daría el stock de un talle y el capital parado de ese
 * producto saldría dividido por la cantidad de variantes, sin que nada falle.
 */
async function espejoDe(sb, ids) {
  const stock = new Map();
  const costo = new Map();
  if (!ids.length) return { stock, costo };

  for (let i = 0; i < ids.length; i += 200) {
    const grupo = ids.slice(i, i + 200);
    const inv = await leerTodo(sb, 'inventario', (q) =>
      q.select('product_id, available_quantity').in('product_id', grupo).order('product_id'));
    for (const f of inv) {
      const k = String(f.product_id);
      stock.set(k, (stock.get(k) || 0) + (Number(f.available_quantity) || 0));
    }
    const prods = await leerTodo(sb, 'productos', (q) =>
      q.select('id, unit_cost').in('id', grupo).order('id'));
    // ⛔ `?? null` a propósito y NO `|| 0`: un costo que el sync no pudo leer tiene que llegar como
    // `null` hasta el núcleo, que es el que sabe que eso es «no medible». Aplanarlo acá haría que
    // toda la marca diera 100 % de recupero — ver `capitalParado`.
    for (const p of prods) costo.set(String(p.id), p.unit_cost ?? null);
  }
  return { stock, costo };
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  // ⛔ Sólo las dos marcas: `producto_id` vive en la base de una de las dos. `stunned` es una línea
  // adentro de Zattia y sus productos ya están en esa base.
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  if (!puedeVerAlguna(perfil, store, PARA_VER)) {
    return res.status(403).json({ error: 'No tenés acceso a los productos de esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  let sb = null;
  const db = () => {
    if (!sb) sb = createClient(cfg.url, cfg.key);
    return sb;
  };
  const yo = perfil.name || perfil.email || null;
  const escribir = esAdmin(perfil);

  try {
    if (req.method === 'GET') {
      const { data, error } = await db().from(TABLA).select('*').eq('store', store).order('marcado_en', { ascending: false });
      if (error) throw new Error(error.message);
      const filas = data || [];
      const ids = [...new Set(filas.map((f) => Number(f.producto_id)).filter((n) => Number.isInteger(n) && n > 0))];
      const { stock, costo } = await espejoDe(db(), ids);

      // El sello perezoso. Va después de leer y no puede cambiar ningún número (ver el encabezado):
      // sólo deja anotado desde cuándo lo venimos viendo en cero.
      const aSellar = filas.filter((f) => !f.visto_en_cero && (stock.get(String(f.producto_id)) || 0) <= 0);
      if (aSellar.length) {
        const ahora = new Date().toISOString();
        await db().from(TABLA).update({ visto_en_cero: ahora }).in('id', aSellar.map((f) => f.id));
        for (const f of aSellar) f.visto_en_cero = ahora;
      }

      return res.status(200).json({
        ok: true,
        clavados: filas.map((f) => ({
          ...f,
          stock: stock.get(String(f.producto_id)) ?? 0,
          unit_cost: costo.has(String(f.producto_id)) ? costo.get(String(f.producto_id)) : null,
        })),
        puede: { escribir },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
    if (!escribir) return res.status(403).json({ error: 'Sólo un administrador marca un producto como clavado.' });

    const b = req.body || {};
    const accion = String(b.accion || '');
    const ahora = new Date().toISOString();

    if (accion === 'marcar') {
      const pid = Number(b.producto_id);
      if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: 'producto_id inválido' });

      // El id lleva el arranque adentro: un producto que se cerró se puede volver a marcar y eso es
      // un ciclo NUEVO, con su propio recupero. Un id que fuera sólo `store:pid` haría que el
      // segundo ciclo pisara el historial del primero.
      const id = `${store}:${pid}:${ahora.slice(0, 10)}`;
      const { error } = await db().from(TABLA).insert([{
        id, store, producto_id: pid,
        sku: b.sku ? String(b.sku) : null,
        nombre: b.nombre ? String(b.nombre) : null,
        nota: b.nota ? String(b.nota) : null,
        marcado_en: ahora, marcado_por: yo, actualizado_en: ahora, actualizado_por: yo,
      }]);
      // El único PARCIAL de la tabla: ya hay una marca activa de ese producto. No es un error del
      // servidor, es que la respuesta correcta ya está guardada.
      if (error && /duplicate key/i.test(error.message)) {
        return res.status(409).json({ error: 'Ese producto ya está marcado como clavado.' });
      }
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id });
    }

    if (accion === 'sacar') {
      // Saca de la lista ACTIVA sin borrar: lo que ya recuperó sigue contando en la foto de las
      // semanas en que facturó. Borrar sería perder eso.
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const { error } = await db().from(TABLA)
        .update({ visto_en_cero: ahora, actualizado_en: ahora, actualizado_por: yo })
        .eq('id', id).eq('store', store);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (accion === 'borrar') {
      // ⚠️ Esto SÍ borra el historial, y por eso es una acción aparte de `sacar`: existe sólo para
      // el que se marcó por error hace un minuto. Confundir las dos es perder el recupero de un
      // producto que sí trabajó.
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const { error } = await db().from(TABLA).delete().eq('id', id).eq('store', store);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `acción inválida (${accion || 'vacía'})` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
