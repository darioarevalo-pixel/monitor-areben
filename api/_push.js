// 🔔 Avisos al celular (Darío, 20-oct-2026): «Nueva tarea asignada» le llega al iPhone de quien la
// tiene que hacer, aunque no tenga el Monitor abierto.
//
// Cómo funciona, en tres piezas:
//   - El celular, al tocar «Activar avisos», le pide permiso a Apple y nos da su «dirección de avisos»
//     (`suscripcion`). Se guarda acá, una por teléfono, a nombre de quien entró.
//   - Para mandar, se firma con el par de claves VAPID: la pública va en el código (también la usa el
//     navegador) y la privada SÓLO en Vercel (`VAPID_PRIVATE_KEY`). ⛔ Sin la privada no se manda nada
//     y se contesta qué falta, en vez de fallar callado.
//   - Las direcciones se guardan en el Blob (`push/<usuario>/<huella>.json`) y ⛔ no en una tabla:
//     así no hizo falta crear nada en la base. La huella sale de la dirección, así que el mismo
//     teléfono activado dos veces pisa su archivo en vez de duplicarse.
//
// 🔑 Una dirección que Apple da por muerta (404/410: borró el ícono, sacó el permiso) se borra sola al
// primer intento. Si no, cada aviso futuro le pegaría a una puerta que no existe.
import crypto from 'node:crypto';
import webpush from 'web-push';
import { del, list, put } from '@vercel/blob';

export const VAPID_PUBLICA = 'BI2EMj1OOTZDDBH2nx5xSCzoUmOjdf1ML94GcBL1BwGh-Pdvk0UTMvCjJ3HdqE9peGjc7dblsZrB1GPkQAh6sOg';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const conToken = TOKEN ? { token: TOKEN } : {};

/** Carpeta de cada usuario. El nombre puede traer espacios y tildes («Lorena Reyes»). */
function carpeta(usuario) {
  return `push/${encodeURIComponent(String(usuario)).replace(/%/g, '_')}/`;
}

/** ¿Está todo para mandar? Devuelve el motivo si falta algo. */
export function faltaParaMandar() {
  if (!process.env.VAPID_PRIVATE_KEY) return 'Falta cargar la clave de avisos (VAPID_PRIVATE_KEY) en Vercel.';
  if (!TOKEN && !process.env.BLOB_STORE_ID) return 'Falta el Blob (BLOB_READ_WRITE_TOKEN) en Vercel.';
  return null;
}

/** Valida lo que manda el navegador: una dirección https y sus dos llaves. */
export function suscripcionValida(s) {
  return !!(s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.keys
    && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string');
}

/** Guarda (o pisa) la dirección de avisos de este teléfono a nombre de `usuario`. */
export async function guardarSuscripcion(usuario, s, aparato) {
  const huella = crypto.createHash('sha256').update(s.endpoint).digest('hex').slice(0, 24);
  const cuerpo = JSON.stringify({ usuario, suscripcion: { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, aparato: String(aparato || '').slice(0, 200), alta: new Date().toISOString() });
  await put(`${carpeta(usuario)}${huella}.json`, cuerpo, {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, ...conToken,
  });
}

async function suscripcionesDe(usuario) {
  const { blobs } = await list({ prefix: carpeta(usuario), ...conToken });
  const out = [];
  for (const b of blobs) {
    try {
      const r = await fetch(`${b.url}?v=${Date.now()}`, { cache: 'no-store' });
      const d = await r.json();
      if (suscripcionValida(d.suscripcion)) out.push({ url: b.url, suscripcion: d.suscripcion });
    } catch { /* un archivo roto ⛔ frena a los demás */ }
  }
  return out;
}

/**
 * Manda `{ titulo, cuerpo, url }` a todos los teléfonos de cada usuario. ⛔ No lanza: un aviso que no
 * sale ⛔ puede tirar abajo lo que lo disparó (asignar la tarea ya quedó guardado).
 * Devuelve cuántos salieron y cuántos fallaron, por si alguien quiere mostrarlo.
 */
export async function avisar(usuarios, aviso) {
  const falta = faltaParaMandar();
  if (falta) return { enviados: 0, fallas: 0, telefonos: 0, falta };
  webpush.setVapidDetails('mailto:darioarevalo@arebensrl.com', VAPID_PUBLICA, process.env.VAPID_PRIVATE_KEY);
  const carga = JSON.stringify({ titulo: aviso.titulo, cuerpo: aviso.cuerpo || '', url: aviso.url || '/', tag: aviso.tag });
  let enviados = 0, fallas = 0, telefonos = 0;
  for (const u of [...new Set(usuarios)].filter(Boolean)) {
    let subs = [];
    try { subs = await suscripcionesDe(u); } catch { fallas++; continue; }
    telefonos += subs.length;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(s.suscripcion, carga, { TTL: 12 * 3600 });
        enviados++;
      } catch (e) {
        fallas++;
        const st = e && e.statusCode;
        if (st === 404 || st === 410) await del(s.url, conToken).catch(() => {});
      }
    }));
  }
  return { enviados, fallas, telefonos, falta: null };
}
