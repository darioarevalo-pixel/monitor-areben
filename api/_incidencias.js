// ⚠️ Incidencias del trabajo (Darío, 20-oct-2026). Entra por `api/_agenda.js` (acciones `incidencia-*`):
// ⛔ archivo `_`, no es una ruta (plan Hobby, 12 funciones).
//
// 🔑 Se guardan en el Blob (`incidencias/<id>.json`, una por archivo, con su conversación adentro) y
// ⛔ no en una tabla: así no hubo que crear nada en la base. Son pocas por semana; si algún día son
// cientos, se pasan a una tabla. El id empieza por la hora, así que el listado sale ordenado.
//
// Quién ve qué: quien está en `quienesSeEnteran` (Darío) ve todas; el resto, sólo las suyas (y en el
// celular compartido, también las de la compañera). Las respuestas avisan al otro lado.
import crypto from 'node:crypto';
import { list, put } from '@vercel/blob';
import { avisar } from './_push.js';
import { EQUIPO } from '../lib/agenda/correo-diario.core.js';
import { quienesSeEnteran } from '../lib/agenda/aviso-terminado.core.js';
import { companerasDe } from '../lib/agenda/celular-compartido.core.js';
import { incidenciaValida, mensajeValido, tituloAviso } from '../lib/agenda/incidencias.core.js';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const conToken = TOKEN ? { token: TOKEN } : {};
const CARPETA = 'incidencias/';
const ID = /^[0-9]{13}-[0-9a-f]{8}$/;

const nombreDe = (u) => {
  const p = EQUIPO.find((x) => x.name === u);
  return (p ? p.nombre : String(u || '')).split(' ')[0];
};

async function guardar(inc) {
  await put(`${CARPETA}${inc.id}.json`, JSON.stringify(inc), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, ...conToken,
  });
}

async function leerTodas() {
  const { blobs } = await list({ prefix: CARPETA, limit: 1000, ...conToken });
  const out = await Promise.all(blobs.map(async (b) => {
    try {
      const r = await fetch(`${b.url}?v=${Date.now()}`, { cache: 'no-store' });
      return await r.json();
    } catch { return null; }
  }));
  return out.filter((x) => x && ID.test(String(x.id))).sort((a, b) => String(b.id).localeCompare(String(a.id)));
}

async function leerUna(id) {
  if (!ID.test(String(id || ''))) return null;
  return (await leerTodas()).find((x) => x.id === id) || null;
}

/** Contesta la acción `incidencia-*`. `fotosDe` viene de `_agenda.js`: las mismas reglas de fotos. */
export async function incidencias(req, res, { yo, action, b, fotosDe }) {
  const recibe = quienesSeEnteran();
  const esDario = recibe.includes(yo);
  const mias = [yo, ...companerasDe(yo).map((p) => p.name)];
  const puedeVer = (inc) => esDario || mias.includes(inc.autor);

  if (action === 'incidencias') {
    const todas = await leerTodas();
    return res.status(200).json({ ok: true, incidencias: todas.filter(puedeVer), todas: esDario });
  }

  if (action === 'incidencia-crear') {
    let v;
    try { v = incidenciaValida(b); } catch (e) { return res.status(400).json({ error: e.message }); }
    // 📱 En el celular compartido se reporta desde la solapa de la compañera, a su nombre.
    const autor = b.por && mias.includes(String(b.por)) ? String(b.por) : yo;
    const ahora = new Date();
    // 🔑 El id lo pone el celular: si el envío se cortó y se reintenta, es la misma y ⛔ se duplica
    // (ni el archivo ni el aviso). Un id raro o de otra persona no se acepta: se arma uno nuevo.
    const pedido = ID.test(String(b.id || '')) ? String(b.id) : null;
    if (pedido) {
      const ya = await leerUna(pedido);
      if (ya && ya.autor === autor) return res.status(200).json({ ok: true, incidencia: ya });
      if (ya) return res.status(409).json({ error: 'Probá de nuevo.' });
    }
    const inc = {
      id: pedido || `${ahora.getTime()}-${crypto.randomBytes(4).toString('hex')}`,
      autor, ...v, fotos: fotosDe(b.fotos), estado: 'abierta', creado: ahora.toISOString(), mensajes: [],
    };
    await guardar(inc);
    await avisar(recibe.filter((u) => u !== autor), { titulo: tituloAviso(inc, nombreDe(autor)), cuerpo: inc.texto, url: '/agenda/incidencias', tag: inc.id });
    return res.status(200).json({ ok: true, incidencia: inc });
  }

  if (action === 'incidencia-responder' || action === 'incidencia-estado') {
    const inc = await leerUna(b.id);
    if (!inc || !puedeVer(inc)) return res.status(404).json({ error: 'Esa incidencia ya no existe.' });

    if (action === 'incidencia-responder') {
      let texto;
      try { texto = mensajeValido(b.texto); } catch (e) { return res.status(400).json({ error: e.message }); }
      const de = esDario ? yo : (b.por && mias.includes(String(b.por)) ? String(b.por) : yo);
      // Mismo criterio que al crear: la respuesta reintentada (mismo `mid`) ⛔ se agrega dos veces.
      const mid = ID.test(String(b.mid || '')) ? String(b.mid) : null;
      if (mid && (inc.mensajes || []).some((m) => m.id === mid)) return res.status(200).json({ ok: true, incidencia: inc });
      inc.mensajes = [...(inc.mensajes || []), { ...(mid ? { id: mid } : {}), de, texto, at: new Date().toISOString() }];
      await guardar(inc);
      const para = esDario ? [inc.autor] : recibe;
      await avisar(para.filter((u) => u !== de), { titulo: `💬 ${nombreDe(de)} respondió`, cuerpo: texto, url: esDario ? '/agenda' : '/agenda/incidencias', tag: `${inc.id}-r` });
      return res.status(200).json({ ok: true, incidencia: inc });
    }

    // Resolver (o reabrir) lo hace Darío.
    if (!esDario) return res.status(403).json({ error: 'La resuelve Darío.' });
    const estado = b.estado === 'abierta' ? 'abierta' : 'resuelta';
    inc.estado = estado;
    inc.resuelta = estado === 'resuelta' ? { por: yo, at: new Date().toISOString() } : null;
    await guardar(inc);
    if (estado === 'resuelta') await avisar([inc.autor], { titulo: '✅ Incidencia resuelta', cuerpo: inc.texto, url: '/agenda', tag: `${inc.id}-ok` });
    return res.status(200).json({ ok: true, incidencia: inc });
  }

  return null;
}
