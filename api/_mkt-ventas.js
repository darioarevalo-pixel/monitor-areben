/**
 * Ventas de Marketing (`/api/datos?recurso=mkt-ventas`).
 *
 * Un solo verbo: **traer las ventas de hoy al espejo**. Todo lo demás que dibuja la sección sale de
 * datos que ya tiene el navegador (el ETL) o de puertas que ya existían (`?metas=1` de Norte,
 * `?resultado=1` de Liquidación).
 *
 * # Por qué hace falta el botón
 *
 * 🔴 **El espejo se llena una vez por día.** El único reloj agendado es `sync-diario.yml`
 * (`0 6 * * *`, o sea ~3 de la mañana acá); `sync-ventas-hoy.yml` existe pero se dispara a mano
 * desde GitHub. Medido el 18-ago-2026 a las 16:52 ART: el contador diario mostraba **1 sola venta
 * online** de ese día. Sin este botón, la pantalla que contesta «¿cómo venimos hoy?» sólo sirve
 * al día siguiente.
 *
 * ⚠️ **No es una función de Vercel**: entra por la puerta de `api/datos.js` (el plan Hobby admite
 * 12 y hay 7 usadas).
 */

import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { traerVentasDeHoy } from './_ventas-hoy.js';

const CFG = {
  bdi: { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY },
  zattia: { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY },
};

/**
 * Cuánto tiene que pasar entre dos traídas de la misma marca.
 *
 * 🔴 **Es lo único que frena el gasto de cupo de Gestión Nube desde acá.** El
 * `concurrency: gestion-nube` que comparten los ocho workflows **no alcanza a una función de
 * Vercel** —eso ya está comentado en `api/_liquidacion.js`— así que diez toques seguidos al botón
 * serían diez consultas a GN si no fuera por esto.
 */
export const ESPERA_MS = 60_000;

/** La fila de `sync_state` donde vive el reloj de este botón. */
const CLAVE_SYNC = 'ventas-hoy-mkt';

/**
 * ¿Puede volver a traer? `ultimo` es el ISO de la traída anterior.
 *
 * ⚠️ **Es POR MARCA y aparte del de Liquidación**, que vive en `datos.ventasSync` de la campaña.
 * Son dos preguntas distintas —«¿ya sincronicé ESTA campaña?» y «¿ya traje las ventas de hoy?»— y
 * fundirlas haría que apretar en una pantalla frene la otra sin que nada lo diga.
 */
export function puedeTraer(ultimo, ahoraMs, esperaMs = ESPERA_MS) {
  if (!ultimo) return true;
  const t = Date.parse(ultimo);
  return !Number.isFinite(t) || ahoraMs - t >= esperaMs;
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // La puerta va donde está la fuerza: esto ESCRIBE en `ventas`, `venta_detalles` y `clientes` del
  // espejo de producción, y gasta cupo de Gestión Nube.
  if (!puedeVerAlguna(perfil, store, ['mkt-ventas'])) {
    return res.status(403).json({ error: 'No tenés acceso a Ventas de Marketing en esta marca.' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

  const b = req.body || {};
  if (b.action !== 'traer-ventas-hoy') return res.status(400).json({ error: 'acción desconocida' });

  const cfg = CFG[store];
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    const ahoraMs = Date.now();
    const ahora = new Date(ahoraMs).toISOString();

    const { data: previo } = await supabase.from('sync_state')
      .select('updated_at').eq('clave', CLAVE_SYNC).maybeSingle();

    // Recién traído: se contesta `ok` con `salteado`, no un error. Apretar dos veces no es una
    // equivocación de nadie y no tiene por qué pintarse de rojo.
    if (!puedeTraer(previo?.updated_at, ahoraMs)) {
      return res.status(200).json({ ok: true, salteado: true, traidoEn: previo.updated_at, ventas: 0, detalles: 0 });
    }

    const traido = await traerVentasDeHoy(supabase, store, ahoraMs);
    if (!traido.ok) return res.status(traido.status).json({ error: traido.error });

    // 🔑 **Fila propia (`ventas-hoy-mkt`), no la de `diario`.** Los cinco lectores de `sync_state`
    // filtran por `clave = 'diario'` (medido con grep antes de escribir esto): pisarla haría que
    // «el sync corrió hace 3 minutos» lo diga un botón y no el sync, que es otra cosa.
    const { error } = await supabase.from('sync_state')
      .upsert({ clave: CLAVE_SYNC, updated_at: ahora }, { onConflict: 'clave' });
    if (error) throw new Error(error.message);

    return res.status(200).json({
      ok: true, traidoEn: ahora, truncado: traido.truncado,
      ventas: traido.ventas, detalles: traido.detalles, clientes: traido.clientes,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'error inesperado' });
  }
}
