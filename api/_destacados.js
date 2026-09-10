// "Destacados" — los productos estrella. Tabla `destacados` (ver sql/migrate-destacados.sql).
//
//   GET  ?recurso=destacados&store=bdi|zattia            → las estrellas GENERALES de la marca
//   GET  ?recurso=destacados&store=…&liq=<id>            → las estrellas de esa campaña
//   POST { recurso, store, accion:'marcar', producto_id, liq?, sku?, nombre?, nota? }
//   POST { recurso, store, accion:'sacar',  producto_id, liq? }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=destacados`. El plan Hobby
// de Vercel admite 12 funciones; crear `api/destacados.js` "por prolijidad" **frena todos los
// deploys sin error visible**. Ya pasó una vez.
//
// # Quién marca — y acá es distinto de `clavados`
//
// 🔑 **Marcar pide lo mismo que ver, y lo decidió Bruno el 10-sep-2026** (*«también marketing»*).
// Un clavado es una decisión de dirección sobre la plata —por eso ahí escribir es `esAdmin`—; una
// estrella es *qué comunicamos*, y quien la comunica es justamente quien está mirando la lista. La
// firma (`marcada_por`) es lo que sostiene la responsabilidad, ⛔ no un candado.
//
// # ⛔ Sacar no borra
//
// `sacar` sella `sacada_en`. Quién la marcó, cuándo y **por qué** es lo que se quiere poder mirar
// después de la campaña, y es lo único que contesta "¿le pegamos a lo que dijimos que le íbamos a
// pegar?". Borrar la fila sería perder eso para ahorrar una columna.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { baseDeLinea } from '../lib/lineas.core.js';
import { ambitoDe, idDestacado } from '../lib/destacados/core.js';

/** La base de CADA marca: `producto_id` es de su base. Mismo `cfgFor` que `_clavados.js`. */
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

const TABLA = 'destacados';

// Las tres puertas por donde se ve una estrella: la lista de precios de Marketing, la campaña por
// dentro (Liquidación) y la fila de Análisis → Por producto. Quien entre por cualquiera de las tres
// la ve y la mueve; el porqué de que ver y escribir sean el mismo permiso está en el encabezado.
const PARA_VER = ['precios', 'liquidacion', 'productos'];

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const b = req.method === 'POST' ? (req.body || {}) : {};
  const store = String((req.method === 'POST' ? b.store : req.query.store) || '').toLowerCase();
  // ⛔ Sólo las dos marcas: `producto_id` vive en la base de una de las dos. `stunned` es una línea
  // adentro de Zattia y sus productos ya están en esa base.
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  if (!puedeVerAlguna(perfil, store, PARA_VER)) {
    return res.status(403).json({ error: 'No tenés acceso a los productos de esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const db = createClient(cfg.url, cfg.key);
  const yo = perfil.name || perfil.email || null;

  try {
    // El alcance viaja igual en el GET y en el POST: `?liq=` o `body.liq`, vacío = la general.
    const liq = ambitoDe(req.method === 'POST' ? b.liq : req.query.liq);

    if (req.method === 'GET') {
      // ⚠️ `.is('liq_id', null)` y ⛔ no `.eq('liq_id', null)`: en SQL `= null` ⛔ no matchea nada, y
      // PostgREST lo pasa tal cual ⇒ la lista de estrellas generales volvería siempre vacía, sin
      // error. Es el mismo modo de falla que el único parcial del SQL.
      let q = db.from(TABLA).select('*').eq('store', store).is('sacada_en', null);
      q = liq == null ? q.is('liq_id', null) : q.eq('liq_id', liq);
      const { data, error } = await q.order('marcada_en', { ascending: false });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, destacados: data || [] });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const accion = String(b.accion || '');
    const pid = Number(b.producto_id);
    if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: 'producto_id inválido' });
    const ahora = new Date().toISOString();

    if (accion === 'marcar') {
      const id = idDestacado(store, pid, liq, ahora);
      const { error } = await db.from(TABLA).insert([{
        id, store, producto_id: pid, liq_id: liq,
        sku: b.sku ? String(b.sku) : null,
        nombre: b.nombre ? String(b.nombre) : null,
        nota: b.nota ? String(b.nota) : null,
        marcada_en: ahora, marcada_por: yo,
      }]);
      // El único PARCIAL de la tabla: ya está destacado en ese alcance. ⛔ No es un error del
      // servidor, es que la respuesta correcta ya está guardada. Se contesta 200 y ⛔ no 409 como
      // `clavados`: dos personas apretando la misma estrella con un segundo de diferencia es lo
      // esperable acá —marcar es de cualquiera que vea la lista—, y un cartel rojo por eso diría
      // que algo salió mal cuando el resultado es exactamente el que se pidió.
      if (error && /duplicate key/i.test(error.message)) {
        return res.status(200).json({ ok: true, id: null, yaEstaba: true });
      }
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id });
    }

    if (accion === 'sacar') {
      // Se saca **por producto y alcance**, ⛔ no por id de fila: quien aprieta la estrella apagada
      // está mirando una fila de producto y ⛔ no sabe qué id tiene la marca activa. El `is null`
      // es lo que hace que sacar dos veces no reviva una vieja.
      let q = db.from(TABLA).update({ sacada_en: ahora, sacada_por: yo })
        .eq('store', store).eq('producto_id', pid).is('sacada_en', null);
      q = liq == null ? q.is('liq_id', null) : q.eq('liq_id', liq);
      const { error } = await q;
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `acción inválida (${accion || 'vacía'})` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
