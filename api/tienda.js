// Tienda online: una puerta para los recursos propios de la sección Tienda Nube.
//
// Arranca con uno solo (`ignorados`), y aun así nace como router por lo que aprendimos en
// la Fase 2A: Vercel cuenta **una función serverless por archivo de ruta** en `api/`, y el
// plan Hobby admite 12. Sumar un archivo por cada cosita nueva ya frenó todos los deploys
// una vez —sin error visible, con la app sirviendo la versión anterior—, así que cada
// dominio entra por una puerta y crece con `?recurso=`.
//
// Los archivos con `_` no son rutas (Vercel los ignora), por eso el handler real vive en
// `_tn-ignorados.js` y acá solo se despacha. La auth la valida cada handler.
//
//   GET/POST /api/tienda?recurso=ignorados&...
import ignorados from './_tn-ignorados.js';
import { soloMismoOrigen } from './_auth.js';

const RECURSOS = { ignorados };

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  const recurso = String(req.query?.recurso || (req.body && req.body.recurso) || '');
  const destino = RECURSOS[recurso];
  if (!destino) {
    return res.status(400).json({ error: `recurso inválido (usá ${Object.keys(RECURSOS).join(', ')})` });
  }
  return destino(req, res);
}
