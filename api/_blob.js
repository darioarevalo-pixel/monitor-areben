// Subida a Vercel Blob, compartida por los dos que suben imágenes: `blob-upload.js` (lo usa el
// equipo, con sesión del Monitor) y `_reclamo.js` (lo usa el CLIENTE desde el link público, con
// el token de su reclamo). La lógica es la misma; lo que cambia es quién puede llamarla, y eso
// lo decide cada endpoint antes de llegar acá.
//
// Cómo se autentica contra el Blob: hay DOS formas y el store decide cuál.
//   - Los stores nuevos inyectan `BLOB_STORE_ID` y el SDK firma con OIDC (`VERCEL_OIDC_TOKEN`,
//     que Vercel pone solo en el runtime). NO hay read-write token: hay que dejar que el SDK
//     resuelva, o sea NO pasarle `token`.
//   - Los viejos inyectan `BLOB_READ_WRITE_TOKEN` y se lo pasamos explícito.
// El orden lo fija `resolveBlobAuth` del propio SDK: token explícito → OIDC+storeId → env token.
import { del, put } from '@vercel/blob';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const STORE_ID = process.env.BLOB_STORE_ID;
const MAX_BYTES = 1.5 * 1024 * 1024; // los thumbs son ~10-40 KB; 1.5 MB es un techo generoso.

/** ¿Está configurado el Blob? Si no, el llamador cae a guardar base64 (degradación segura). */
export function hayBlob() {
  return !!(TOKEN || STORE_ID);
}

/** Parte un data URL en { contentType, buffer }. Devuelve null si no es una imagen válida. */
export function parseDataUrl(dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  try {
    return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') };
  } catch {
    return null;
  }
}

function extDe(contentType) {
  const sub = contentType.split('/')[1] || 'jpg';
  return (sub === 'jpeg' ? 'jpg' : sub).toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
}

/**
 * Sube un data URL y devuelve `{ ok, url }` o `{ ok:false, status, error }`. No lanza: los dos
 * llamadores necesitan contestar un HTTP, no atrapar excepciones.
 */
export async function subirDataUrl(dataUrl, prefix) {
  if (!hayBlob()) return { ok: false, status: 500, error: 'Blob no configurado' };
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { ok: false, status: 400, error: 'dataUrl inválido (se espera una imagen base64)' };
  if (parsed.buffer.length > MAX_BYTES) return { ok: false, status: 413, error: 'imagen demasiado grande' };
  try {
    const { url } = await put(`${prefix}/foto.${extDe(parsed.contentType)}`, parsed.buffer, {
      access: 'public',
      contentType: parsed.contentType,
      addRandomSuffix: true,
      // Sin token, el SDK va por OIDC + BLOB_STORE_ID.
      ...(TOKEN ? { token: TOKEN } : {}),
    });
    return { ok: true, url };
  } catch (e) {
    return { ok: false, status: 500, error: 'No se pudo subir a Blob: ' + String((e && e.message) || e).slice(0, 200) };
  }
}

/**
 * El pathname de una URL del Blob (`https://<store>.public.blob.vercel-storage.com/<carpeta>/<x>`),
 * o null si la URL no es de un store de Vercel Blob.
 *
 * ⛔ **Se mira el host, no sólo el camino.** Lo que llega es una URL guardada en el KV, y el KV de
 * Ingresos tiene el GET abierto: sin este chequeo, `borrarBlob` sería un pedido de borrado sobre
 * cualquier cosa que alguien escriba ahí. Que el `del()` de otro store fallaría igual (el token es
 * de éste) no alcanza: el chequeo barato va primero.
 */
export function pathnameDeBlob(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !/\.blob\.vercel-storage\.com$/i.test(u.hostname)) return null;
  const camino = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  return camino || null;
}

/**
 * Borra un archivo del Blob por su URL. `{ ok }` o `{ ok:false, status, error }`; no lanza.
 *
 * 🔑 **`carpetas` es la lista de las que se pueden tocar y la decide el llamador**, no la URL: una
 * sesión del Monitor sirve para borrar la foto de una importación, no para vaciar la carpeta de las
 * piezas de Meta ni la de los reclamos.
 *
 * ⚠️ Borrar algo que ya no está **no es un error** para el SDK, y acá tampoco: el caso real es la
 * persona que saca dos veces el mismo ítem, y contestar 404 la dejaría con un cartel rojo por algo
 * que salió bien.
 */
export async function borrarBlob(url, carpetas) {
  if (!hayBlob()) return { ok: false, status: 500, error: 'Blob no configurado' };
  const camino = pathnameDeBlob(url);
  if (!camino) return { ok: false, status: 400, error: 'La URL no es de un archivo del Blob.' };
  const carpeta = camino.split('/')[0];
  if (!carpetas.includes(carpeta)) {
    return { ok: false, status: 403, error: `No se borran archivos de «${carpeta || 'la raíz'}».` };
  }
  try {
    await del(url, { ...(TOKEN ? { token: TOKEN } : {}) });
    return { ok: true };
  } catch (e) {
    return { ok: false, status: 500, error: 'No se pudo borrar del Blob: ' + String((e && e.message) || e).slice(0, 200) };
  }
}
