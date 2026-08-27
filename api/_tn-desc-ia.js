// El redactor: le pide a Gemini el borrador de UN producto y lo devuelve validado.
//
//   POST { recurso:'tn-desc-ia', store, tn_id, nombre, insumo?, variantes?, categorias?,
//          prosaActual?, imagen?, bullets?, modelo? }
//     → { ok, borrador, problemas, intentos, modelo, uso, costo }
//
// 🔑 Desde el 27-ago-2026 devuelve SÓLO `{parrafo}`: los bullets se componen desde la ficha de
// atributos y no los escribe nadie. `bullets` entra como CONTEXTO —los datos que ya están
// escritos abajo— para que el párrafo no los repita.
//
// 🔴 **Es el único endpoint del monitor que gasta plata por apretar un botón.** Por eso pide
// el sub `gen-desc.publicar` —el mismo que aprobar— y no alcanza con ver la sección: cargar
// el insumo lo hace el local y es gratis; pedir un borrador sale unos milésimos de dólar cada
// vez, y a nadie le avisa. Es la misma línea que ya trazó `api/_tn-desc.js`, en el mismo lugar.
//
// ⛔ NO escribe: ni en `tn_descripciones` ni en TiendaNube. Devuelve el borrador y se para.
// Guardarlo es otro verbo (`op:'borrador'` de `_tn-desc.js`) y aprobarlo es un tercero, y los
// dos los aprieta una persona mirando el texto. Un redactor que además guardara dejaría en la
// base borradores que nadie leyó.
//
// ⛔ Y NO recibe el prompt del cliente: recibe los datos del producto y arma el pedido acá con
// `lib/tn-desc/redactor.core.js`. Un endpoint que reenvíe a la API un `system` cualquiera es
// una puerta abierta a nuestra cuenta con forma de campo de texto.
//
// 🔑 **Éste es el ÚNICO archivo que sabe que del otro lado hay Gemini.** El núcleo recibe la
// función de llamada por parámetro; ni la pantalla, ni el validador, ni la tabla, ni publicar
// en la tienda se enteran de quién escribió. Cambiar de proveedor otra vez es reescribir
// `llamar` y `usoDe`, acá abajo, y nada más.
//
// ⛔ Sin SDK, a propósito: la API se habla con `fetch` contra el endpoint REST. Una dependencia
// más es una cosa más que actualizar, y acá son treinta líneas de JSON.
//
// Es un archivo `_`: NO es una ruta. Entra por api/datos.js (el plan Hobby de Vercel admite
// 12 funciones por deploy y cada archivo de ruta cuenta una).
import { exigirUsuario } from './_auth.js';
import { puedeSub, esAdmin } from '../lib/permisos.core.js';
import {
  ESQUEMA,
  MODELOS,
  MODELO_POR_DEFECTO,
  costoDe,
  esModelo,
  redactar,
} from '../lib/tn-desc/redactor.core.js';

const URL_API = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/** Techo por respuesta. El borrador entero son ~200 palabras: 2.000 sobra y acota un desborde. */
const MAX_TOKENS = 2000;

/**
 * Los bullets que ya tiene la ficha, limpios. Lo que manda el navegador no se usa crudo:
 * entran al prompt, así que un objeto cualquiera acá sería texto arbitrario adentro del pedido.
 */
function bulletsDe(x) {
  if (!Array.isArray(x)) return [];
  return x
    .map((b) => ({
      etiqueta: String((b && b.etiqueta) || '').trim().slice(0, 30),
      texto: String((b && b.texto) || '').trim().slice(0, 80),
    }))
    .filter((b) => b.etiqueta && b.texto)
    .slice(0, 10);
}

/** Una lista de textos, limpia. Lo que manda el navegador no se usa crudo. */
function textos(x, tope) {
  if (!Array.isArray(x)) return [];
  return x
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .slice(0, tope);
}

/**
 * La foto que se le muestra al modelo. Sólo del CDN de TiendaNube y sólo por https: si esto
 * aceptara cualquier URL, el campo sería un pedido de red saliente firmado por nosotros.
 *
 * ⚠️ Va el tamaño que TiendaNube tenga guardado (hoy 1024×1024). Probado el 19-ago-2026: el
 * CDN **no redimensiona a pedido** — `-480-480`, `-480-640` y `-240-240` contestan 403, sólo
 * resuelve el archivo que existe.
 */
function imagenValida(x) {
  const u = String(x || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.mitiendanube\.com\//i.test(u)) return null;
  return u;
}

/** El tipo de la foto sale de la extensión, salvo que el CDN diga otra cosa al contestar. */
function tipoDe(url) {
  const ext = (String(url).split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1];
  const m = { png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  return m[String(ext).toLowerCase()] || 'image/jpeg';
}

/** Techo de la foto. Las de TiendaNube pesan ~90 KB; 8 MB es un desborde, no una prenda. */
const MAX_FOTO = 8 * 1024 * 1024;

/**
 * Baja la foto y la deja lista para mandar como bytes.
 *
 * 🔴 **Gemini NO va a buscar la URL por nosotros.** Medido el 24-ago-2026 contra la API real:
 * el mismo pedido con la foto por `uri` contesta **429 «Resource has been exhausted»**, y con
 * los bytes adentro contesta 200. No es un límite de imágenes —es de ir a buscarlas— y no se
 * ve como un error de imagen: se ve como una cuota agotada, que manda a mirar la facturación.
 *
 * 🔑 Y bajarla nosotros es lo correcto igual: la URL ya estaba en una lista blanca del CDN de
 * TiendaNube (`imagenValida`), así que el pedido de red sale a un lugar que elegimos nosotros.
 *
 * ⛔ Si no se puede bajar, se corta con un error y NO se redacta sin foto. De los 41 productos
 * mudos no hay ni insumo ni prosa previa: sin la foto, el modelo escribiría a partir del
 * nombre y nada más — que es exactamente lo que esta sección no hace.
 *
 * 🔑 `traer` se declara por lo que ESTE código usa —cuatro cosas— y no como un `fetch` entero.
 * Así el banco puede pasarle una respuesta de mentira de cuatro líneas en vez de fabricar un
 * `Response` completo, que es puro ruido alrededor de lo que se está probando.
 *
 * @param {string} url
 * @param {(u: string) => Promise<{ok: boolean, status: number, headers?: {get(k: string): string | null} | null, arrayBuffer(): Promise<ArrayBufferLike>}>} [traer]
 */
export async function bajarFoto(url, traer = fetch) {
  let r;
  try {
    r = await traer(url);
  } catch (e) {
    throw new Error(`no se pudo bajar la foto del producto: ${e instanceof Error ? e.message : 'falló la red'}`);
  }
  if (!r.ok) throw new Error(`no se pudo bajar la foto del producto (el CDN contestó ${r.status})`);

  const bytes = Buffer.from(await r.arrayBuffer());
  if (!bytes.length) throw new Error('la foto del producto vino vacía');
  if (bytes.length > MAX_FOTO) throw new Error('la foto del producto pesa demasiado');

  // El `content-type` del CDN manda sobre la extensión: el archivo dice `.jpg` y viene webp
  // más seguido de lo que parece, y un `mime_type` equivocado lo rechaza Google.
  const dice = String((r.headers && r.headers.get && r.headers.get('content-type')) || '').split(';')[0].trim();
  return { data: bytes.toString('base64'), mime_type: /^image\//.test(dice) ? dice : tipoDe(url) };
}

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/**
 * El texto que devolvió el modelo. Está anidado en `steps[].content[].text`, y se juntan
 * TODOS los pedazos de todos los `model_output`: un texto partido en dos bloques leído a
 * medias entra como JSON roto y sale por pantalla como «el modelo no devolvió JSON», que
 * manda a buscar el error donde no está.
 */
export function textoDeRespuesta(j) {
  const pasos = Array.isArray(j && j.steps) ? j.steps : [];
  const trozos = [];
  for (const paso of pasos) {
    if (paso && paso.type !== 'model_output') continue;
    for (const c of Array.isArray(paso && paso.content) ? paso.content : []) {
      if (c && c.type === 'text' && typeof c.text === 'string') trozos.push(c.text);
    }
  }
  return trozos.join('');
}

/**
 * Lo que consumió la llamada.
 *
 * 🔴 **La doc de Gemini no dice si `total_output_tokens` ya trae adentro los tokens de
 * pensar.** Las dos lecturas dan costos distintos y la de menos es la que empuja la decisión
 * hacia el modelo equivocado. No se adivina: si el total cierra sin sumarlos, están adentro y
 * no se cobran de nuevo; si no cierra —o si no vino el total— se cobran aparte.
 */
export function usoDe(j) {
  const u = (j && j.usage) || {};
  const entrada = num(u.total_input_tokens);
  const salida = num(u.total_output_tokens);
  const pensado = num(u.total_thought_tokens);
  const total = num(u.total_tokens);
  const yaAdentro = total > 0 && entrada + salida === total;
  return { entrada, salida, pensado: yaAdentro ? 0 : pensado, cacheLeido: num(u.total_cached_tokens) };
}

/**
 * La función que habla con Gemini, lista para pasarle a `redactar`.
 *
 * 🔑 Está exportada —y no escrita adentro del handler— por un motivo concreto: es la ÚNICA
 * parte del camino que ningún test puede ejercer sin gastar plata, y por lo tanto la única que
 * hay que poder correr a mano contra la API de verdad. `scripts/probar-redactor.mjs` la usa tal
 * cual. Si el probador tuviera su propia copia del cuerpo del pedido, podría pasar en verde
 * mientras producción falla — que es exactamente lo que un probador tiene que hacer imposible.
 *
 * `alRecibir` es para ese probador: recibe la respuesta cruda de Google. Producción no lo pasa.
 */
export function llamador(modelo, clave, alRecibir) {
  const ficha = MODELOS[modelo];

  /** Una llamada al modelo. Devuelve `{texto, uso}`; `redactar` decide si hace falta otra. */
  return async (pedido) => {
    const entrada = [];
    // La foto primero: es lo único que el modelo tiene para describir la prenda, y en los 41
    // mudos no hay ni insumo ni prosa previa. Va con los bytes adentro, no con la URL — ver
    // `bajarFoto`, que es donde está medido por qué.
    if (pedido.imagen) entrada.push({ type: 'image', ...(await bajarFoto(pedido.imagen)) });
    entrada.push({ type: 'text', text: pedido.texto });

    const r = await fetch(URL_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify({
        model: modelo,
        system_instruction: pedido.system,
        input: entrada,
        // ⛔ `store:false`: la ficha de un producto nuestro no se queda guardada del otro lado
        // de la API. Acá no hay conversación que continuar — cada borrador es una llamada sola.
        store: false,
        generation_config: {
          max_output_tokens: MAX_TOKENS,
          ...(ficha.pensar ? { thinking_level: ficha.pensar } : {}),
        },
        response_format: { type: 'text', mime_type: 'application/json', schema: ESQUEMA },
      }),
    });

    const j = await r.json().catch(() => null);
    if (alRecibir) alRecibir(j);

    if (!r.ok) {
      // El texto del error de Google adentro, no un «500» pelado: la mitad de las veces dice
      // exactamente qué campo no le gustó, y sin eso se depura a ciegas.
      const det = (j && j.error && (j.error.message || j.error.status)) || `HTTP ${r.status}`;
      throw new Error(`la API contestó ${r.status}: ${det}`);
    }

    // Un rechazo del filtro o un corte por techo llegan con 200: si no se miran, salen como
    // «el modelo no devolvió JSON» y mandan a buscar el error donde no está.
    const estado = j && j.status;
    if (estado === 'incomplete') throw new Error('la respuesta se cortó por el techo de tokens');
    if (estado && estado !== 'completed') {
      const det = (j.errors && j.errors[0] && (j.errors[0].message || j.errors[0].code)) || estado;
      throw new Error(`el modelo no completó el borrador (${det})`);
    }

    return { texto: textoDeRespuesta(j), uso: usoDe(j) };
  };
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'método no soportado' });

  const body = req.body || {};
  const store = String(body.store || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // El mismo candado que aprobar: acá se gasta plata.
  if (!(esAdmin(perfil) || puedeSub(perfil, store, 'gen-desc', 'publicar'))) {
    return res.status(403).json({ error: 'Redactar con IA pide el permiso de publicar en Redacción.' });
  }

  const nombre = String(body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'falta el nombre del producto' });

  // 🔴 Se elige de la lista, nunca se pasa lo que llegó: un modelo cualquiera en el cuerpo es
  // elegir por nosotros qué se factura. Un valor desconocido es un 400, no el default —
  // caer al default calladamente haría que un typo en la pantalla se lea como «Pro salió
  // baratísimo».
  const modelo = body.modelo === undefined || body.modelo === null ? MODELO_POR_DEFECTO : body.modelo;
  if (!esModelo(modelo)) {
    return res.status(400).json({ error: `modelo desconocido: ${String(body.modelo)}` });
  }

  const clave = process.env.GEMINI_API_KEY;
  if (!clave) {
    return res.status(500).json({
      ok: false,
      error: 'Falta GEMINI_API_KEY en Vercel. Sin eso no se puede redactar (el resto de Redacción anda igual).',
    });
  }

  const ctx = {
    marca: store === 'zattia' ? 'Zattia' : 'BDI',
    nombre,
    insumo: String(body.insumo || '').trim(),
    // El validador usa estas dos listas para las reglas de color y talle; el prompt, para
    // avisarlas antes. Vienen del catálogo que la pantalla ya tiene bajado.
    variantes: textos(body.variantes, 60),
    categorias: textos(body.categorias, 10),
    prosaActual: String(body.prosaActual || '').trim().slice(0, 1200),
    imagen: imagenValida(body.imagen),
    // Los bullets ya compuestos por `lib/tn-desc/atributos.core.js`. Vienen del navegador igual
    // que las variantes y la prosa actual: no deciden nada que se guarde —este endpoint no
    // guarda— y lo único que cambian es qué NO tiene que repetir el párrafo.
    bullets: bulletsDe(body.bullets),
  };

  const llamar = llamador(modelo, clave);

  try {
    const r = await redactar(ctx, llamar);
    // El costo se calcula con la fecha del servidor: el precio promocional de los Gemini 3
    // vence el 31-dic-2026 y la fecha del navegador la elige el navegador.
    const hoy = new Date().toISOString().slice(0, 10);
    return res.status(200).json({
      ok: !r.error,
      error: r.error || null,
      borrador: r.borrador,
      problemas: r.problemas,
      intentos: r.intentos,
      modelo,
      modeloNombre: MODELOS[modelo].nombre,
      uso: r.uso,
      costo: costoDe(r.uso, modelo, hoy),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'no se pudo redactar' });
  }
}
