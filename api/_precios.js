// "Precios de campaña" — la lista de precios de una liquidación, para MARKETING.
//
//   GET  ?recurso=precios&store=bdi|zattia          → las campañas compartidas con Marketing
//   GET  ?recurso=precios&store=…&liq=<id>          → { campania, items, leidoEn }
//
// ⛔ Sólo LEE. Compartir una campaña se hace desde Liquidación (`api/_liquidacion.js`,
// `action:'compartir'`, admin); marcar una estrella, por `?recurso=destacados`.
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=precios` (12 funciones de
// Hobby; un archivo de más frena todos los deploys sin error visible).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// 🔴 POR QUÉ ES UN RECURSO NUEVO Y ⛔ NO UNA QUINTA LLAVE DE `_liquidacion.js`
//
// Ese handler ya tiene cuatro llaves y tres no son de Liquidación (Etiquetas, la escritura de
// Etiquetas y la vista de Análisis). `tests/handlers-autorizacion.test.ts` está construido sobre
// la garantía de que una llave ajena **corta con `return`** antes de llegar a las `action`: sumar
// una quinta con un permiso nuevo adentro es exactamente cómo se cuela el verbo que se olvidó de
// pedir sesión. Mismo criterio que `disenos-rondas`/`votacion` en `api/datos.js`.
//
// 🔴 Y EL MOTIVO DE FONDO: MARKETING ⛔ NO PUEDE VER EL COSTO
//
// `liquidacion` queda afuera de la función `marketing` **a propósito** (`lib/permisos.core.js`),
// porque la foto congelada trae costo, markup, margen y ventas. La Feria de Septiembre de Zattia
// se vende **al costo**. Por eso lo que sale de acá pasa entero por `listaParaMarketing()`, que es
// una LISTA BLANCA: un campo se agrega ahí o no viaja. Ver `lib/precios/core.core.js`.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { leerTodo } from '../lib/supabase/paginar.core.js';
import { compartidaConMarketing, ESTADOS_VISIBLES, listaParaMarketing } from '../lib/precios/core.core.js';
import { indicePorPid } from '../lib/destacados/core.js';

function cfgFor(store) {
  if (store === 'zattia') {
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

/** Quién entra: Marketing por su sección, y quien arma la campaña para poder ver lo que ellas ven. */
const PARA_VER = ['precios', 'liquidacion'];

/**
 * La campaña, para Marketing. **Lista blanca igual que los ítems**: `estado`, `tipo`, `creadoPor` y
 * `ventasSync` ⛔ no viajan — son el estado interno de la sección de Análisis y no le dicen nada a
 * quien tiene que escribir un cartel.
 */
function aCampaniaPrecios(row, n) {
  const d = row.datos || {};
  return {
    id: row.id,
    nombre: row.nombre,
    desde: d.desde || null,
    hasta: d.hasta || null,
    nota: d.nota || null,
    n: n || 0,
  };
}

/**
 * El stock de HOY y de cuándo es.
 *
 * ⛔ **No sale de la foto congelada del ítem**, que tiene las unidades del día en que el producto
 * entró a la campaña: los de la Feria de Septiembre son del 6-sep, y una lista que manda a
 * comunicar un producto necesita saber si queda algo hoy. Mismo criterio que `stock-campania` y
 * `api/_clavados.js`.
 *
 * 🔑 **`leidoEn` es del ESPEJO, ⛔ no del request.** `inventario` no tiene fecha propia y el sync
 * corre una vez por día: contestar la hora del servidor diría «recién» sobre un número de ayer a la
 * mañana. Si no está, va `null` y la pantalla lo dice en vez de inventarlo.
 */
async function stockDe(db, pids) {
  const stock = {};
  if (!pids.length) return { stock, leidoEn: null };
  for (let i = 0; i < pids.length; i += 200) {
    const grupo = pids.slice(i, i + 200);
    const inv = await leerTodo(db, 'inventario', (q) =>
      q.select('product_id, available_quantity').in('product_id', grupo).order('product_id'));
    for (const f of inv) {
      const k = String(f.product_id);
      stock[k] = (stock[k] || 0) + (Number(f.available_quantity) || 0);
    }
  }
  const sync = await db.from('sync_state').select('updated_at').eq('clave', 'diario').maybeSingle();
  return { stock, leidoEn: (!sync.error && sync.data && sync.data.updated_at) || null };
}

/**
 * Las estrellas de la campaña.
 *
 * ⚠️ **Un error acá ⛔ no se lleva puesta la lista de precios**: se devuelve un índice vacío y las
 * estrellas salen apagadas. Es lo urgente contra lo lindo — la lista de precios tiene que abrir el
 * viernes aunque la migración de `destacados` no haya corrido todavía. Mismo criterio que
 * `leerColgadas` en `api/_liquidacion.js`, que devuelve `null` en vez de romper la portada.
 */
async function estrellasDe(db, store, liqId) {
  try {
    const { data, error } = await db.from('destacados').select('*')
      .eq('store', store).eq('liq_id', liqId).is('sacada_en', null);
    if (error) return {};
    return indicePorPid(data || []);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  if (req.method !== 'GET') return res.status(405).json({ error: 'método no permitido' });

  const store = String(req.query.store || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // ⛔ `puedeVerAlguna` y ⛔ nunca `puedeVer` pelado: la `store` la elige el request, así que la
  // pregunta correcta es "¿ve esta sección en ESTA marca?". Ver el comentario de `lib/permisos.core.js`.
  if (!puedeVerAlguna(perfil, store, PARA_VER)) {
    return res.status(403).json({ error: 'No tenés acceso a los precios de esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const db = createClient(cfg.url, cfg.key);

  try {
    const liq = String(req.query.liq || '');

    if (!liq) {
      const { data, error } = await db.from('liquidaciones').select('id, nombre, estado, datos')
        .eq('store', store).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const compartidas = (data || []).filter(compartidaConMarketing);
      if (!compartidas.length) return res.status(200).json({ ok: true, campanias: [] });

      // Los conteos se arman con dos columnas, ⛔ no bajando las fotos congeladas: una campaña de
      // 351 productos son 351 fotos con costo y ventas para dibujar un número al lado del nombre.
      // Mismo criterio que la lista de campañas de `_liquidacion.js`.
      const { data: its, error: e2 } = await db.from('liquidacion_items')
        .select('liq_id, estado').eq('store', store)
        .in('liq_id', compartidas.map((c) => c.id));
      if (e2) throw new Error(e2.message);
      const n = {};
      for (const it of its || []) {
        // La MISMA regla que filtra los renglones, para que el número del selector no prometa
        // filas que la tabla después no dibuja.
        if (!ESTADOS_VISIBLES.includes(it.estado)) continue;
        n[it.liq_id] = (n[it.liq_id] || 0) + 1;
      }
      return res.status(200).json({ ok: true, campanias: compartidas.map((c) => aCampaniaPrecios(c, n[c.id])) });
    }

    const { data: c, error: e0 } = await db.from('liquidaciones').select('id, nombre, estado, datos')
      .eq('store', store).eq('id', liq).maybeSingle();
    if (e0) throw new Error(e0.message);
    // 🔑 **No compartida y no existe contestan lo MISMO.** Un 403 «esa campaña existe pero no la
    // compartieron» le dice a quien no tiene que verla que hay algo ahí. Mismo criterio que
    // `buscarPorToken` en `api/_disenos-votacion.js`, donde vencida, cerrada e inexistente son
    // indistinguibles desde afuera.
    if (!c || !compartidaConMarketing(c)) return res.status(404).json({ error: 'Esa lista de precios no existe.' });

    const { data: filas, error: e1 } = await db.from('liquidacion_items')
      .select('datos').eq('store', store).eq('liq_id', liq);
    if (e1) throw new Error(e1.message);

    const items = listaParaMarketing((filas || []).map((r) => r.datos));
    const pids = items.map((i) => Number(i.pid)).filter((x) => Number.isInteger(x) && x > 0);
    const [{ stock, leidoEn }, estrellas] = await Promise.all([
      stockDe(db, pids),
      estrellasDe(db, store, liq),
    ]);

    return res.status(200).json({
      ok: true,
      campania: aCampaniaPrecios(c, items.length),
      items: items.map((i) => ({ ...i, stock: stock[i.pid] ?? 0, estrella: !!estrellas[i.pid] })),
      leidoEn,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
