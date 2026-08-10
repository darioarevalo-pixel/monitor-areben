// Sube archivos a Vercel Blob y devuelve su URL pública. **Dos caminos, una sola función.**
//
//   POST { dataUrl, prefix? }                  → miniaturas: el archivo viaja en el body
//   POST { type: 'blob.generate-client-token' } → piezas: el archivo NO pasa por acá
//
// El primero es el de siempre (Fundas, Ingresos, Diseños): una data URL chica que produce
// `lib/imagenes.imgAThumb` y que `_blob.js` sube del lado del servidor.
//
// 🔑 **El segundo existe porque un video no entra por el primero.** El body de una función de Vercel
// topea en ~4,5 MB, así que un archivo de 80 MB no puede pasar por acá de ninguna forma. En el
// camino de cliente esta función sólo firma un permiso de subida de un minuto; los bytes van del
// browser al Blob directo, sin tocar la función. Por eso no hay tope de tamaño que dependa de
// Vercel, y por eso este archivo no aprendió a recibir archivos grandes: aprendió a NO recibirlos.
//
// ⚠️ **A propósito no hay `onUploadCompleted`.** Ese callback lo llama Vercel Blob desde su
// infraestructura, sin la sesión del Monitor, así que atenderlo obligaría a abrirle un agujero al
// `soloMismoOrigen` + `exigirUsuario` de acá abajo. Sin el callback, el SDK ni siquiera lo
// registra (avisa sólo si se le da un `callbackUrl` sin handler), y no hace falta: el browser
// recibe la URL del Blob al terminar y es él quien la manda al plan. Nada que guardar de este lado.
//
// ⚠️ Es una de las 12 funciones del plan Hobby. El camino nuevo entra como una rama de la que ya
// existía justamente para no gastar otra.
//
// Seguridad: mismo modelo que observaciones.js — exige un usuario válido del Monitor (login
// server-side contra el KV). No es admin-only: Fundas la usan no-admins.
// Si el Blob no está configurado, responde 500 y el cliente cae a guardar base64 (degradación).
import { handleUpload } from '@vercel/blob/client';
import { hayBlob, subirDataUrl } from './_blob.js';
import { exigirUsuario, soloMismoOrigen, sobreDeCredenciales, usuarioValido } from './_auth.js';

const PREFIJOS = new Set(['fundas', 'ingresos', 'disenos']);

/** La carpeta del Blob donde viven las piezas de Meta. Es la única que admite el camino de cliente. */
const CARPETA_PIEZAS = 'piezas';

/**
 * Lo que Meta acepta como pieza, en tipos MIME.
 *
 * ⚠️ **La lista es estricta y el cliente manda el `contentType` a mano** (lo deduce de la extensión
 * con `claseDePieza`). Un archivo que llega de Drive puede venir como `application/octet-stream`, y
 * si eso se aceptara acá, cualquier cosa podría subirse al Blob con una sesión del Monitor.
 */
const TIPOS_PIEZA = [
  'video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'video/x-msvideo',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
];

/**
 * El techo de una pieza. Meta admite bastante más, pero el que sube es un browser con la red de la
 * oficina: 512 MB ya es un video largo en buena calidad, y un tope explícito es lo que evita que un
 * archivo equivocado se lleve el cuarto de hora de alguien antes de fallar.
 */
const TOPE_PIEZA_BYTES = 512 * 1024 * 1024;

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  if (!hayBlob()) return res.status(500).json({ error: 'Blob no configurado' });

  const body = req.body || {};

  // El camino de cliente se reconoce por el sobre que manda el SDK, no por un parámetro nuestro.
  //
  // 🔴 **Su sesión NO puede exigirse acá arriba**, y eso costó una subida rota en prod: la llamada
  // la hace el `fetch` interno de `@vercel/blob/client`, que no lleva el header `x-monitor-auth`.
  // El guard de arriba contestaba **403** a un usuario perfectamente logueado y el SDK lo traducía
  // a «Failed to retrieve the client token», un cartel que no dice nada de sesiones. La sesión de
  // este camino se exige adentro de `onBeforeGenerateToken`, con el sobre que viaja en el cuerpo:
  // el mismo KV, la misma respuesta, otro sobre.
  if (typeof body.type === 'string' && body.type.startsWith('blob.')) {
    return await permisoDeSubida(req, res, body);
  }

  // Sin usuario válido no se sube (va antes de tocar el body, como observaciones.js).
  if (!(await exigirUsuario(req, res))) return;

  const prefix = PREFIJOS.has(body.prefix) ? body.prefix : 'fundas';
  const r = await subirDataUrl(body.dataUrl, prefix);
  if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
  return res.status(200).json({ ok: true, url: r.url });
}

/**
 * Firma el permiso con el que el browser sube directo al Blob.
 *
 * ⛔ **La carpeta la fija el servidor, no el cliente.** El `pathname` llega del browser y podría
 * decir cualquier cosa; lo único que se acepta es que empiece con `piezas/`. Sin este chequeo, una
 * sesión del Monitor sirve para escribir en cualquier carpeta del Blob, incluidas las de Fundas y
 * las de los reclamos.
 *
 * ⛔ **Y la sesión se exige acá adentro, no antes.** Es el único lugar donde el sobre está a mano:
 * el SDK lo trae como `clientPayload`. Firmar un permiso de subida es tan sensible como subir, así
 * que la pregunta al KV es la misma que hace `exigirUsuario` — lo único que cambia es de dónde sale
 * el sobre. Que esto viva adentro del callback y no en el handler es lo que hace que un fallo de
 * sesión llegue al browser como un cartel legible en vez de como un 403 mudo del SDK.
 */
async function permisoDeSubida(req, res, body) {
  try {
    const salida = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { user, pass, token } = sobreDeCredenciales(clientPayload);
        if (!(await usuarioValido(user, pass, token))) {
          throw new Error('Necesitás estar logueado en el Monitor para subir una pieza.');
        }
        if (!String(pathname || '').startsWith(`${CARPETA_PIEZAS}/`)) {
          throw new Error(`Las piezas van en la carpeta «${CARPETA_PIEZAS}».`);
        }
        return {
          allowedContentTypes: TIPOS_PIEZA,
          maximumSizeInBytes: TOPE_PIEZA_BYTES,
          // Dos personas suben `reel.mp4` el mismo día y ninguna pisa a la otra.
          addRandomSuffix: true,
        };
      },
    });
    return res.status(200).json(salida);
  } catch (e) {
    // El SDK tira con el motivo adentro; devolverlo tal cual es lo que hace que el cartel del
    // browser diga «pesa más de 512 MB» en vez de «falló la subida».
    return res.status(400).json({ error: (e && e.message) || 'No se pudo autorizar la subida.' });
  }
}
