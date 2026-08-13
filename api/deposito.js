// Depósito: UNA puerta para los tres recursos de la operación de depósito —el historial de
// conteos aplicados, el inventario en vivo de Gestión Nube y la observación de ubicación
// física— que antes eran tres endpoints sueltos (`api/conteos-deposito.js`,
// `api/inventario-vivo.js`, `api/observaciones.js`).
//
// POR QUÉ ESTÁN JUNTOS
// --------------------
// Es el mismo motivo que `api/postventa.js`, que conviene no volver a aprender por las malas:
// Vercel cuenta **una función serverless por archivo** en `api/`, el plan Hobby admite 12 por
// deploy, y pasarse **frena TODOS los deploys sin error visible** — la app sigue viva con la
// versión anterior y los commits nuevos mueren en silencio. El proyecto estaba en 12 de 12
// (11 rutas de `api/` + la app), o sea que cualquier archivo nuevo rompía.
//
// Los archivos que empiezan con `_` NO son rutas (Vercel los ignora para el filesystem
// routing, como `_auth.js`), así que no cuentan. Moviendo los tres handlers a
// `_conteos-deposito.js` / `_inventario-vivo.js` / `_observaciones.js` y despachando desde
// acá, `api/` pasó de 11 archivos de ruta a 9: quedan dos lugares libres.
//
// Los tres van juntos porque son la misma operación —la sección Depósito → Conteo los usa a los
// tres— y ninguno tenía rewrite ni configuración propia.
//
// La lógica de cada recurso NO se tocó: son los mismos handlers, con el mismo contrato.
// Lo único que cambia es la puerta por la que se entra.
//
//   GET  /api/deposito?recurso=conteos|inventario|observaciones&...
//   POST /api/deposito?recurso=...  (o { recurso } en el body)
//
// Los tres validan usuario del Monitor por su cuenta (cada uno llama a `exigirUsuario`),
// así que este router no afloja ningún control: solo elige a quién le pasa el request.
import conteos from './_conteos-deposito.js';
import inventario from './_inventario-vivo.js';
import observaciones from './_observaciones.js';

const RECURSOS = { conteos, inventario, observaciones };

/**
 * 🔴 **Esto vivía en `api/_inventario-vivo.js:107` y NO se estaba aplicando.**
 *
 * Vercel lee el `export const config` del **archivo de ruta**, y `_inventario-vivo.js` empieza con
 * `_`: no es una ruta, es un módulo. La config se quedó huérfana en la mudanza a la puerta
 * `?recurso=` —el handler se movió, su configuración no— y nadie lo notó porque el archivo seguía
 * ahí, diciendo 30, mientras la función corría con el default.
 *
 * Importa porque `_inventario-vivo` se presupuestó para 30 s y los presupuestos son suyos, no del
 * plan: 10 s para leer GN entero (`:70`) + 9 s para el relleno puntual (`:156`) + el espejo de
 * Supabase + la ida al KV de la auth. Cuando se pasa, Vercel devuelve su página de error y el
 * cliente (`lib/inventario-vivo/cliente.ts:19`) le hace `r.json()` encima: la persona de Depósito
 * ve un `SyntaxError` y no un mensaje.
 *
 * Va acá arriba y no en el `_`, que es donde Vercel sí la mira. Es un techo, no una reserva: los
 * otros dos recursos de esta puerta contestan en milisegundos y no pagan nada por esto.
 */
export const config = { maxDuration: 30 };

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
