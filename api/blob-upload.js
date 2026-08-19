// Sube archivos a Vercel Blob y devuelve su URL pública. **Dos caminos, una sola función.**
//
//   POST { dataUrl, prefix? }                  → miniaturas: el archivo viaja en el body
//   POST { type: 'blob.generate-client-token' } → archivos grandes: el archivo NO pasa por acá
//   POST { accion: 'borrar', url }              → saca del Blob un archivo ya subido
//
// El primero es el de siempre (Fundas, Diseños): una data URL chica que produce
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
// El tercero es el que faltaba desde el principio: **nada borraba nunca**. Con miniaturas de 30 KB
// daba igual; desde que la galería de Ingresos sube videos de la proveedora, un ítem que se saca de
// la pantalla y deja el archivo arriba para siempre es espacio que se paga y no se recupera.
//
// ⚠️ Es una de las 12 funciones del plan Hobby. Los dos caminos nuevos entran como ramas de la que
// ya existía justamente para no gastar otra.
//
// Seguridad: mismo modelo que observaciones.js — exige un usuario válido del Monitor (login
// server-side contra el KV). No es admin-only: Fundas la usan no-admins.
// Si el Blob no está configurado, responde 500 y el cliente cae a guardar base64 (degradación).
import { handleUpload } from '@vercel/blob/client';
import { borrarBlob, hayBlob, subirDataUrl } from './_blob.js';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';
import { TIPOS_MEDIA } from '../lib/media.core.js';
import { TIPOS_PIEZA } from '../lib/meta-ads/pieza.core.js';
import { esAdmin, puedeSub } from '../lib/permisos.core.js';

const PREFIJOS = new Set(['fundas', 'ingresos', 'disenos']);

/**
 * ⭐ **Las carpetas que admiten el camino de cliente, con su tope y sus formatos.**
 *
 * La carpeta la fija el servidor mirando el `pathname` que manda el browser; lo que no está en esta
 * tabla no se firma. Sin eso, una sesión del Monitor sirve para escribir en cualquier carpeta del
 * Blob, incluidas las de Fundas y las de los reclamos.
 *
 * Los topes son distintos porque los archivos lo son: una pieza de Meta puede ser un video largo en
 * buena calidad, y lo que manda la proveedora por chat para mostrar el producto es un clip corto.
 * En los dos casos el tope existe para que un archivo equivocado falle rápido y no se lleve el
 * cuarto de hora de alguien.
 */
const CARPETAS_CLIENTE = {
  piezas: { tipos: TIPOS_PIEZA, tope: 512 * 1024 * 1024 },
  ingresos: { tipos: TIPOS_MEDIA, tope: 200 * 1024 * 1024 },
};

/**
 * De qué carpetas se puede borrar, y quién.
 *
 * ⛔ **Sólo `ingresos`.** Borrar es la única operación de acá que destruye algo, así que la lista
 * arranca con lo único que hoy tiene un botón que lo pide —el × de la galería— y no con «todas las
 * que se pueden subir». Una pieza de Meta ya subida puede estar viva adentro de un aviso: borrarla
 * del Blob no rompe el aviso (Meta se queda con su copia), pero tampoco lo pidió nadie.
 *
 * 🔑 **El permiso es el mismo que dibuja el botón** (`ingresos.editar` o admin): si el servidor
 * pidiera menos, el × de una pantalla de sólo-lectura serviría igual desde la consola.
 */
const CARPETAS_BORRABLES = ['ingresos'];

/** Ingresos proyectados es sólo de BDI (`brands: ['bdi']` en el registro de secciones). */
const puedeBorrarIngresos = (perfil) => esAdmin(perfil) || puedeSub(perfil, 'bdi', 'ingresos', 'editar');

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  if (!hayBlob()) return res.status(500).json({ error: 'Blob no configurado' });

  // Sin usuario válido no se sube (va antes de tocar el body, como observaciones.js). Vale para los
  // dos caminos: firmar un permiso de subida es tan sensible como subir.
  //
  // 🔴 **Que el camino de cliente llegue hasta acá con sesión no es gratis**: la llamada la hace el
  // `fetch` interno de `@vercel/blob/client`, no el nuestro, así que el header viaja sólo porque
  // `useSubirPiezas` se lo pasa por la opción `headers` de `upload()`. Sin eso este guard contesta
  // **403 a un usuario perfectamente logueado** y el SDK lo traduce a «Failed to retrieve the client
  // token», un cartel que no menciona la sesión por ningún lado. Pasó en prod el 9-ago-2026.
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const body = req.body || {};

  // El camino de cliente se reconoce por el sobre que manda el SDK, no por un parámetro nuestro.
  if (typeof body.type === 'string' && body.type.startsWith('blob.')) {
    return await permisoDeSubida(req, res, body);
  }

  if (body.accion === 'borrar') {
    if (!puedeBorrarIngresos(perfil)) {
      return res.status(403).json({ error: 'No tenés permiso para borrar archivos de Ingresos proyectados.' });
    }
    const r = await borrarBlob(body.url, CARPETAS_BORRABLES);
    if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
    return res.status(200).json({ ok: true });
  }

  const prefix = PREFIJOS.has(body.prefix) ? body.prefix : 'fundas';
  const r = await subirDataUrl(body.dataUrl, prefix);
  if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
  return res.status(200).json({ ok: true, url: r.url });
}

/**
 * Firma el permiso con el que el browser sube directo al Blob.
 *
 * ⛔ **La carpeta la fija el servidor, no el cliente.** El `pathname` llega del browser y podría
 * decir cualquier cosa; lo único que se acepta es que empiece con una de `CARPETAS_CLIENTE`. Sin
 * este chequeo, una sesión del Monitor sirve para escribir en cualquier carpeta del Blob, incluidas
 * las de Fundas y las de los reclamos.
 *
 */
async function permisoDeSubida(req, res, body) {
  try {
    const salida = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        const carpeta = String(pathname || '').split('/')[0];
        const reglas = Object.prototype.hasOwnProperty.call(CARPETAS_CLIENTE, carpeta) && String(pathname).includes('/')
          ? CARPETAS_CLIENTE[carpeta]
          : null;
        if (!reglas) {
          throw new Error(`Los archivos van en una de estas carpetas: ${Object.keys(CARPETAS_CLIENTE).join(', ')}.`);
        }
        return {
          allowedContentTypes: reglas.tipos,
          maximumSizeInBytes: reglas.tope,
          // Dos personas suben `reel.mp4` el mismo día y ninguna pisa a la otra.
          addRandomSuffix: true,
        };
      },
    });
    return res.status(200).json(salida);
  } catch (e) {
    // El SDK tira con el motivo adentro; devolverlo tal cual es lo que hace que el cartel del
    // browser diga «pesa más de la cuenta» en vez de «falló la subida».
    return res.status(400).json({ error: (e && e.message) || 'No se pudo autorizar la subida.' });
  }
}
