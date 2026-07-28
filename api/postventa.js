// Post-venta: UNA puerta para los recursos del módulo —fallas, solicitudes y reclamos— que de otro
// modo serían endpoints sueltos.
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
//   GET  /api/postventa?recurso=fallas|solicitudes|reclamos|reclamo&...
//   POST /api/postventa?recurso=...  (o { recurso } en el body)
//
// Cada handler valida por su cuenta, así que este router no afloja ningún control: solo elige a
// quién le pasa el request. `devoluciones` además exige función de administración para lo que
// mueve plata.
//
// ⚠️ `reclamo` y `canje` son las excepciones y hay que saberlo: **no piden sesión del Monitor**.
// Son los links que se le mandan al cliente (para subir las fotos de su reclamo) y a la creadora
// (para cargar sus datos de envío), o sea que están abiertos a internet. Se defienden con un token
// de 64 hex, con vencimiento y revocable, y cada uno deja escribir sólo un puñado de campos de ESA
// fila: fotos y relato en `_reclamo.js`, contacto y dirección en `_canje-portal.js`.
import fallas from './_fallas.js';
import solicitudes from './_solicitudes.js';
import reclamos from './_reclamos.js';
import reclamo from './_reclamo.js';
import canjes from './_canjes.js';
import canje from './_canje-portal.js';

// `cambios` ya no está: un cambio es un reclamo cuya salida es otro producto, así que se atiende
// por `reclamos` (acciones `cambio` / `procesar`). La tabla `cambios` estaba vacía en las dos
// marcas, así que no hubo nada que migrar.
//
// `canjes` no es post-venta, y está acá por la misma razón que los demás: cuelga de esta puerta
// para no gastar uno de los 12 archivos de ruta. Además es el único que habla SIEMPRE con la base
// de BDI, para las tres marcas — ver el encabezado de `_canjes.js`.
//
// `canje` (en singular) es al canje lo que `reclamo` al reclamo: el link público, sin sesión. Ver
// abajo.
const RECURSOS = { fallas, solicitudes, reclamos, reclamo, canjes, canje };

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
