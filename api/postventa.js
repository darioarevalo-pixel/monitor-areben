// Post-venta: UNA puerta para los tres recursos del módulo —fallas, cambios y
// solicitudes— que antes eran tres endpoints sueltos (`api/fallas.js`, `api/cambios.js`,
// `api/solicitudes.js`).
//
// POR QUÉ ESTÁN JUNTOS
// --------------------
// Vercel cuenta **una función serverless por archivo** en `api/`, y el plan Hobby admite
// 12 por deploy. Al agregar el endpoint de solicitudes (Fase 2A) el proyecto llegó a 13
// contando la ruta de Next, y **el deploy entero dejó de publicar**: la app seguía viva con
// la versión anterior y los commits nuevos morían con "No more than 12 Serverless
// Functions can be added to a Deployment on the Hobby plan". Ese fue el bug real, no el
// código.
//
// Los archivos que empiezan con `_` NO son rutas (Vercel los ignora para el filesystem
// routing, como `_auth.js`), así que no cuentan. Moviendo los tres handlers a `_fallas.js`
// / `_cambios.js` / `_solicitudes.js` y despachando desde acá, `api/` pasó de 12 archivos
// de ruta a 10: entra el de solicitudes y quedan dos lugares libres para lo que venga.
//
// La lógica de cada recurso NO se tocó: son los mismos handlers, con el mismo contrato.
// Lo único que cambia es la puerta por la que se entra.
//
//   GET  /api/postventa?recurso=fallas|cambios|solicitudes&...
//   POST /api/postventa?recurso=...  (o { recurso } en el body)
//
// Los tres validan usuario del Monitor por su cuenta (cada uno llama a `exigirUsuario`),
// así que este router no afloja ningún control: solo elige a quién le pasa el request.
import fallas from './_fallas.js';
import cambios from './_cambios.js';
import solicitudes from './_solicitudes.js';

const RECURSOS = { fallas, cambios, solicitudes };

export default async function handler(req, res) {
  // Acepta el recurso por query (sirve para GET y POST) o en el body, por si algún
  // llamador prefiere mandarlo ahí. El resto del request llega intacto al handler.
  const recurso = String(req.query?.recurso || (req.body && req.body.recurso) || '');
  const destino = RECURSOS[recurso];
  if (!destino) {
    return res.status(400).json({ error: `recurso inválido (usá ${Object.keys(RECURSOS).join(', ')})` });
  }
  return destino(req, res);
}
