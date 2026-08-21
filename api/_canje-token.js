// La llave del portal de canjes: qué abre un token, y qué se le deja hacer con él.
//
// # Por qué es un archivo aparte
//
// **Dos endpoints tienen que resolver el mismo token y ninguno puede copiar al otro:**
//
//   - `api/_canje-portal.js` → lo que ella ve y guarda (sus datos, lo que elige de la vitrina).
//   - `api/blob-upload.js`   → firma el permiso con el que su celular sube el contenido al Blob.
//
// El segundo nació el 21-ago-2026, cuando la entrega del contenido dejó de ser «dejalo en esta
// carpeta de Drive» —que se trababa por permisos de Google y terminaba llegando por WhatsApp— y
// pasó a ser una subida desde el mismo link que ella ya tiene. Copiar `buscarPorToken` en el
// segundo endpoint sería poner la definición de «este link todavía sirve» en dos lugares: el día
// que se agregue un estado o se acorte el vencimiento, uno de los dos se entera y el otro no, y el
// que no se entera es el que firma permisos de escritura en el Blob.
//
// # La lente con la que hay que leer esto
//
// Todo lo de acá se ejecuta **sin sesión, con un dato que viaja por WhatsApp**. Las tres barreras:
//
//   1. La **forma** del token se chequea antes de consultar nada (`esTokenDeCanje`).
//   2. El **estado** decide si el link sigue vivo (`ABIERTO`): antes de `acuerdo` no hay token, y
//      `cerrar` lo revoca poniéndolo en `null`.
//   3. La **carpeta** del Blob la deriva el servidor del canje que abrió el token, nunca del
//      `pathname` que manda el browser. Y al registrar la URL se vuelve a exigir esa misma carpeta:
//      sin eso, el link sirve para pegar cualquier URL de internet adentro de la ficha de un canje.
//
// ⛔ Este archivo **no importa nada del monitor**, igual que `_canje-portal.js`: arrastrar
// `_auth.js` + `permisos.core.js` al camino público es justo lo que se está evitando.
import { createClient } from '@supabase/supabase-js';

/** 64 hex es lo que genera `canje-respuesta`; el rango tolera tokens viejos y no afloja nada. */
const TOKEN_RE = /^[a-f0-9]{32,128}$/i;

/** ¿Tiene forma de token? Lo que no la tiene ni siquiera se consulta contra la base. */
export function esTokenDeCanje(token) {
  return TOKEN_RE.test(String(token || ''));
}

/**
 * Estados en los que el link todavía sirve. Antes de `acuerdo` no hay token; `cerrado` lo revoca.
 *
 * 🔑 `en_curso` —«Esperando el contenido»— está adentro, y **es la razón por la que la subida no
 * necesita mandarle ningún link nuevo**: es el mismo de siempre y sigue vivo justo cuando hace
 * falta. ⛔ No reemplazar por `!esTerminal(estado)`: `propuesta` y `enviada` no son terminales y
 * tampoco tienen token, pero un día podrían tenerlo y esta lista dice explícitamente que no.
 */
export const ABIERTO = ['acuerdo', 'preparando', 'en_curso'];

/** La base maestra de canjes: una sola para las tres marcas. Espejo de `_canjes.js`. */
export function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

/** El cliente de la maestra, o `null` si falta la credencial (el llamador decide qué contesta). */
export function clienteMaestro() {
  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return null;
  return createClient(cfg.url, cfg.key);
}

/**
 * Busca el canje del token. `null` si no existe, venció, no arrancó o ya terminó.
 *
 * @param cols las columnas a traer. Las pide el llamador porque cada uno necesita las suyas y este
 *   archivo no es dueño de la whitelist de lo que sale a internet — de eso se ocupa `paraLaPersona`.
 */
export async function buscarPorToken(supabase, token, cols) {
  const { data, error } = await supabase.from('canjes').select(cols).eq('token', token).maybeSingle();
  // El error se loguea aunque ella vea 404 igual. Sin esto, un problema de base (una columna que no
  // existe, credenciales vencidas) se ve EXACTAMENTE igual que un link inválido y nadie entiende
  // por qué "el link no anda". Ya pasó con el portal de reclamos.
  if (error) console.error(`[canje-token] ${error.message}`);
  if (!data) return null;
  if (data.token_vence && new Date(data.token_vence).getTime() < Date.now()) return null;
  if (!ABIERTO.includes(data.estado)) return null;
  return data;
}

/** La carpeta del Blob de esta sección. Es la clave de `CARPETAS_CLIENTE` en `blob-upload.js`. */
export const CARPETA_CONTENIDO = 'canjes';

/**
 * Un canje por carpeta. Lo que sube ella queda separado de lo del canje de al lado, así el permiso
 * firmado con SU token no sirve para escribir arriba de lo de otra.
 */
export function carpetaDeCanje(canjeId) {
  return `${CARPETA_CONTENIDO}/${canjeId}`;
}

/**
 * ¿Esta URL es un archivo del Blob, de la carpeta de ESTE canje?
 *
 * 🔴 Es la barrera que hace que registrar la URL no sea un agujero. El browser sube el archivo y
 * después nos manda la URL (no hay `onUploadCompleted`, ver el encabezado de `blob-upload.js`), así
 * que el `POST` que la registra recibe un string de afuera. Sin este chequeo, cualquiera con el
 * link puede dejar una URL de internet colgada adentro de la ficha del canje, que la mira el equipo.
 */
export function esUrlDeContenido(url, canjeId) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  // El host del store: `<id>.public.blob.vercel-storage.com`. El punto de adelante importa — sin él
  // `evilpublic.blob.vercel-storage.com` pasaría.
  if (!u.hostname.endsWith('.public.blob.vercel-storage.com')) return false;
  return u.pathname.startsWith(`/${carpetaDeCanje(canjeId)}/`);
}

/**
 * Cuántas filas de evidencia tiene el canje. Es el mismo número que cuenta `evidencia-agregar` en
 * `api/_canjes.js`: **una sola cuenta y un solo tope** por canje, así lo que ella sube y lo que
 * carga el equipo no llevan dos contadores que dicen cosas distintas sobre la misma tabla.
 */
export async function contarEvidencias(supabase, canjeId) {
  const { count, error } = await supabase
    .from('canje_evidencias')
    .select('id', { count: 'exact', head: true })
    .eq('canje_id', canjeId);
  if (error) throw new Error(error.message);
  return count || 0;
}

/** El tope de la marca, con el mismo default que la migración (`canje_config`). */
export function topeDeEvidencias(cfg) {
  return Number(cfg && cfg.tope_evidencias_por_canje) || 30;
}
