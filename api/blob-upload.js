// Sube una miniatura (data URL base64) a Vercel Blob y devuelve su URL pública.
// POST { dataUrl, prefix? }
//   - dataUrl: "data:image/jpeg;base64,...." (la produce lib/imagenes.imgAThumb).
//   - prefix:  carpeta lógica en el Blob ("fundas" | "ingresos"). Default "fundas".
// Seguridad: mismo modelo que observaciones.js — exige un usuario válido del Monitor
// (login server-side contra el KV). No es admin-only: Fundas la usan no-admins.
// Requiere BLOB_READ_WRITE_TOKEN en el entorno (lo agrega el Blob store al linkearlo).
// Si falta el token, responde 500 y el cliente cae a guardar base64 (degradación segura).
import { put } from '@vercel/blob';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const MAX_BYTES = 1.5 * 1024 * 1024; // los thumbs son ~10-40 KB; 1.5 MB es un techo generoso.
const PREFIJOS = new Set(['fundas', 'ingresos']);

// Parte un data URL en { contentType, buffer }. Devuelve null si no es una imagen válida.
function parseDataUrl(dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  try {
    return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') };
  } catch {
    return null;
  }
}

// Extensión razonable a partir del content-type (para que la URL termine en .jpg/.png/…).
function extDe(contentType) {
  const sub = contentType.split('/')[1] || 'jpg';
  return (sub === 'jpeg' ? 'jpg' : sub).toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
}

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  if (!TOKEN) return res.status(500).json({ error: 'Blob no configurado' });

  // Sin usuario válido no se sube (va antes de tocar el body, como observaciones.js).
  if (!(await exigirUsuario(req, res))) return;

  const body = req.body || {};
  const parsed = parseDataUrl(body.dataUrl);
  if (!parsed) return res.status(400).json({ error: 'dataUrl inválido (se espera una imagen base64)' });
  if (parsed.buffer.length > MAX_BYTES) return res.status(413).json({ error: 'imagen demasiado grande' });

  const prefix = PREFIJOS.has(body.prefix) ? body.prefix : 'fundas';

  try {
    const { url } = await put(`${prefix}/foto.${extDe(parsed.contentType)}`, parsed.buffer, {
      access: 'public',
      contentType: parsed.contentType,
      addRandomSuffix: true,
      token: TOKEN,
    });
    return res.status(200).json({ ok: true, url });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo subir a Blob', detalle: String(e && e.message || e).slice(0, 200) });
  }
}
