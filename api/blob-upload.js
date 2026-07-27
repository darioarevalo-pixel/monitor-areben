// Sube una miniatura (data URL base64) a Vercel Blob y devuelve su URL pública.
// POST { dataUrl, prefix? }
//   - dataUrl: "data:image/jpeg;base64,...." (la produce lib/imagenes.imgAThumb).
//   - prefix:  carpeta lógica en el Blob ("fundas" | "ingresos" | "disenos"). Default "fundas".
// Seguridad: mismo modelo que observaciones.js — exige un usuario válido del Monitor
// (login server-side contra el KV). No es admin-only: Fundas la usan no-admins.
//
// La subida en sí vive en `_blob.js`, compartida con el endpoint del reclamo público (donde la
// llama el cliente con el token de su reclamo en vez de una sesión).
// Si el Blob no está configurado, responde 500 y el cliente cae a guardar base64 (degradación).
import { hayBlob, subirDataUrl } from './_blob.js';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';

const PREFIJOS = new Set(['fundas', 'ingresos', 'disenos']);

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  if (!hayBlob()) return res.status(500).json({ error: 'Blob no configurado' });

  // Sin usuario válido no se sube (va antes de tocar el body, como observaciones.js).
  if (!(await exigirUsuario(req, res))) return;

  const body = req.body || {};
  const prefix = PREFIJOS.has(body.prefix) ? body.prefix : 'fundas';
  const r = await subirDataUrl(body.dataUrl, prefix);
  if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
  return res.status(200).json({ ok: true, url: r.url });
}
