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
// ⚠️ Es una de las 12 funciones del plan Hobby. Los caminos nuevos entran como ramas de la que ya
// existía justamente para no gastar otra.
//
// 🔴 **DESDE EL 21-ago-2026 ESTE ARCHIVO TIENE UNA CARA ABIERTA A INTERNET.** Hasta ese día todo
// acá exigía sesión del Monitor. Ahora hay una cuarta rama:
//
//   POST { type:'blob.generate-client-token', payload:{ clientPayload:'canje:<token>' } }
//
// que la usa **la creadora de un canje desde su celular**, sin sesión, con el token de su link.
// Existe porque el contenido que ella entrega se le pedía en una carpeta de Drive y eso se trababa
// por permisos de Google: terminaba llegando por WhatsApp, comprimido. Ahora sube desde el mismo
// link que ya tiene.
//
// Todo lo que la protege vive en `_canje-token.js` y en `permisoDeLaCreadora` de acá abajo. Lo que
// hay que tener presente al tocar este archivo: **el orden de los guards importa**. La rama pública
// va ANTES de `exigirUsuario`, así que cualquier chequeo que se agregue "arriba de todo" pensando
// que abajo hay una sesión, no la va a haber.
//
// Seguridad del resto: mismo modelo que observaciones.js — exige un usuario válido del Monitor
// (login server-side contra el KV). No es admin-only: Fundas la usan no-admins.
// Si el Blob no está configurado, responde 500 y el cliente cae a guardar base64 (degradación).
import { handleUpload } from '@vercel/blob/client';
import { borrarBlob, hayBlob, subirDataUrl } from './_blob.js';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';
import {
  buscarPorToken, carpetaDeCanje, clienteMaestro, contarEvidencias, esTokenDeCanje, topeDeEvidencias,
} from './_canje-token.js';
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
 * El tope por archivo del contenido que sube la creadora.
 *
 * 🔑 **Es el único de los tres que lo firma alguien sin sesión**, así que acá el tope no es sólo
 * "que un archivo equivocado falle rápido": es lo que acota cuánto puede escribir en el Blob quien
 * tenga el link. La otra mitad del cerco es el tope de filas por canje (`tope_evidencias_por_canje`,
 * 30 por defecto), que se cuenta ANTES de firmar. Los dos juntos son el techo real por canje.
 *
 * ⛔ **Acá el archivo NO se achica** (a diferencia de la galería de Ingresos, que baja las fotos a
 * 1.500 px): esto puede terminar en una pauta, así que sube el original. Por eso 200 MB y no menos.
 */
const TOPE_CONTENIDO_BYTES = 200 * 1024 * 1024;

/** Las columnas del canje que hacen falta para decidir si se firma. Nada más viaja. */
const CANJE_COLS_FIRMA = 'id, store, estado, token_vence';

/**
 * El sobre con el que el portal se identifica. Va en `clientPayload` y no en un header porque
 * `upload()` de `@vercel/blob/client` hace su propia llamada a este endpoint: `clientPayload` es el
 * único canal que el SDK garantiza que llega hasta `onBeforeGenerateToken`.
 */
const PREFIJO_CANJE = 'canje:';

/** El token del canje si el sobre es de la creadora; `null` si esta llamada no es de ella. */
function tokenDeCanjeDelBody(body) {
  if (body.type !== 'blob.generate-client-token') return null;
  const cp = body.payload && body.payload.clientPayload;
  if (typeof cp !== 'string' || !cp.startsWith(PREFIJO_CANJE)) return null;
  return cp.slice(PREFIJO_CANJE.length).trim();
}

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

  // 🔴 **La rama de la creadora va PRIMERO, y a propósito.** Es la única que no tiene sesión: se
  // identifica con el token de su canje. Si estuviera debajo de `exigirUsuario` no llegaría nunca.
  const tokenCanje = tokenDeCanjeDelBody(req.body || {});
  if (tokenCanje !== null) return await permisoDeLaCreadora(req, res, req.body || {}, tokenCanje);

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

/**
 * Firma el permiso con el que **la creadora** sube su contenido, autenticada con el token de su
 * canje en vez de con una sesión del Monitor.
 *
 * Las cuatro barreras, en orden, y por qué el orden es el orden:
 *
 *  1. **Forma del token** — lo que no la tiene ni siquiera se consulta contra la base.
 *  2. **El canje que abre** — `buscarPorToken` es la MISMA que usa el portal: vencido, revocado o
 *     en un estado que ya cerró ⇒ `null`. ⛔ No copiar esa regla acá; el día que cambie tiene que
 *     cambiar en un solo lugar.
 *  3. **El tope, ANTES de firmar.** Firmar y dejar que falle al registrar sería regalarle a
 *     cualquiera con el link una escritura gratis en el Blob por cada intento.
 *  4. **La carpeta** — sale del `id` del canje que abrió el token, y el `pathname` que manda el
 *     browser sólo se acepta si cae adentro. Un token del canje 5 no firma nada de `canjes/6/`,
 *     ni de `ingresos/`, ni de `fundas/`.
 *
 * 🔑 **Todo lo que contesta es 404 o 409, nunca 403.** Desde afuera "no existe", "venció" y "ya
 * cerró" tienen que ser indistinguibles: es el mismo criterio del portal, y es lo que hace que el
 * link no sirva para averiguar nada.
 */
async function permisoDeLaCreadora(req, res, body, token) {
  if (!esTokenDeCanje(token)) return res.status(404).json({ error: 'no encontrado' });

  const supabase = clienteMaestro();
  if (!supabase) return res.status(500).json({ error: 'No se pudo subir. Escribinos y lo resolvemos.' });

  try {
    const canje = await buscarPorToken(supabase, token, CANJE_COLS_FIRMA);
    if (!canje) return res.status(404).json({ error: 'no encontrado' });

    const [{ data: cfg }, previas] = await Promise.all([
      supabase.from('canje_config').select('tope_evidencias_por_canje').eq('store', canje.store).maybeSingle(),
      contarEvidencias(supabase, canje.id),
    ]);
    if (previas >= topeDeEvidencias(cfg)) {
      return res.status(409).json({ error: 'Ya subiste todo lo que entra. Si falta algo, escribinos.' });
    }

    const carpeta = carpetaDeCanje(canje.id) + '/';
    const salida = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        // El nombre del archivo lo elige su celular; la carpeta la decide el token. Lo único que se
        // acepta del browser es que el pathname caiga adentro de la carpeta de ESTE canje.
        if (!String(pathname || '').startsWith(carpeta)) {
          throw new Error('No se pudo subir ese archivo.');
        }
        return {
          allowedContentTypes: TIPOS_MEDIA,
          maximumSizeInBytes: TOPE_CONTENIDO_BYTES,
          // Dos creadoras suben `reel.mp4` y ninguna pisa a la otra. Y ella misma puede mandar dos
          // versiones del mismo archivo sin que la segunda se lleve puesta la primera.
          addRandomSuffix: true,
        };
      },
    });
    return res.status(200).json(salida);
  } catch (e) {
    // El SDK tira con el motivo adentro (`pesa más de la cuenta`, `formato no permitido`), y eso es
    // lo que ella lee. Lo que NO sale de acá es nada sobre el canje: si llegó hasta este punto el
    // token era válido, así que el mensaje habla del archivo y no del link.
    return res.status(400).json({ error: (e && e.message) || 'No se pudo subir ese archivo.' });
  }
}
