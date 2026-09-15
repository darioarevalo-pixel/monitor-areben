// Adónde puede llevar un aviso de una línea, y desde qué página sale. Lectura para el «aviso de cero».
//   GET /api/meta-ads?recurso=destinos&linea=<bdi|zattia|stunned>
//       → { destinos: [{url, ruta, nombre}], paginas: [{id, nombre, instagram}] }
//   GET /api/meta-ads?recurso=destinos&linea=<…>&url=<https://…>
//       → { destino, responde, productos } — el guard del destino + cuántos productos muestra la página.
//
// 🔑 **La mitad de la tienda NO necesita el token de Meta**: sale del menú público (ver
// `lib/meta-ads/destinos.core.js`). Por eso se despacha ARRIBA del guard del token en `api/meta-ads.js`,
// y las páginas —que sí salen de Graph— vuelven vacías con su motivo cuando el token no está.
//
// 🔴 **Este recurso NO decide nada**: el guard que manda es el que corre al ARMAR el plan
// (`ajustesDelAviso` en `_meta-planes.js`). Acá se adelanta para que la pantalla no ofrezca un destino
// que después se rechaza, y para decir «esa página tiene 0 productos» antes de gastar.

import { lineasQueVe } from '../lib/meta-ads/acciones.core.js';
import { destinosDelMenu, productosEnPagina, validarDestino } from '../lib/meta-ads/destinos.core.js';
import { graph, mensajeError, tokenMeta } from '../lib/meta-ads/graph.core.js';
import { TIENDA_BASE } from '../lib/tienda.core.js';

/** 6 s de tope, igual que el menú de Atención: la función entera tiene 10. */
const TIMEOUT_TIENDA_MS = 6000;

async function traerHtml(url) {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_TIENDA_MS),
      headers: { 'User-Agent': 'monitor-areben', Accept: 'text/html' },
      redirect: 'follow',
    });
    if (!r.ok) return { ok: false, status: r.status, motivo: `La tienda contestó ${r.status}.` };
    return { ok: true, status: r.status, html: await r.text() };
  } catch (e) {
    return { ok: false, status: 0, motivo: `La tienda no contestó (${String((e && e.message) || e).slice(0, 80)}).` };
  }
}

/**
 * Las páginas que el token maneja, con su cuenta de Instagram si Meta la da.
 *
 * ⚠️ El Instagram va en una llamada APARTE: un campo que el token no puede leer anula la consulta
 * entera (la trampa de `CAMPOS_RECETA`), y sin él las páginas igual sirven. Mismo canal que
 * `puedeUsarLaPagina`: `/me/accounts`, ⛔ nunca el nodo Página.
 */
async function paginasDelToken() {
  if (!tokenMeta()) return { paginas: [], sinPaginas: 'Meta Ads no está configurado: no se pueden listar las páginas.' };
  const [base, conIg] = await Promise.all([
    graph('me/accounts?fields=id,name&limit=100', 2),
    graph('me/accounts?fields=id,instagram_business_account{id,username}&limit=100', 2),
  ]);
  if (!base.ok) return { paginas: [], sinPaginas: `No se pudieron listar las páginas: ${mensajeError(base)}` };
  const ig = new Map();
  if (conIg.ok) {
    for (const p of (conIg.data && conIg.data.data) || []) {
      const cuenta = p && p.instagram_business_account;
      if (cuenta && cuenta.id) ig.set(String(p.id), { id: String(cuenta.id), usuario: cuenta.username ? String(cuenta.username) : null });
    }
  }
  const paginas = ((base.data && base.data.data) || []).map((p) => ({
    id: String(p.id),
    nombre: String(p.name || ''),
    instagram: ig.get(String(p.id)) || null,
  }));
  return { paginas, sinInstagram: conIg.ok ? null : mensajeError(conIg) };
}

export default async function destinosGet(res, perfil, q) {
  const linea = String((q && q.linea) || '');
  if (!TIENDA_BASE[linea]) return res.status(400).json({ error: 'Elegí una línea con tienda (bdi, zattia o stunned).' });
  if (!lineasQueVe(perfil).includes(linea)) return res.status(403).json({ error: 'No tenés permiso para ver Meta Ads en esa marca.' });

  if (q.url) {
    const v = validarDestino(String(q.url), linea);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    const h = await traerHtml(v.destino);
    return res.status(200).json({
      ok: true,
      destino: v.destino,
      responde: h.ok,
      productos: h.ok ? productosEnPagina(h.html, linea).cantidad : null,
      motivo: h.ok ? null : h.motivo,
    });
  }

  const [menu, pags] = await Promise.all([traerHtml(TIENDA_BASE[linea]), paginasDelToken()]);
  return res.status(200).json({
    ok: true,
    linea,
    destinos: menu.ok ? destinosDelMenu(menu.html, linea) : [],
    sinDestinos: menu.ok ? null : menu.motivo,
    ...pags,
  });
}
