// El redactor: le pide a Claude el borrador de UN producto y lo devuelve validado.
//
//   POST { recurso:'tn-desc-ia', store, tn_id, nombre, insumo?, variantes?, categorias?,
//          prosaActual?, imagen?, modelo? }
//     → { ok, borrador, problemas, intentos, modelo, uso, costo }
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
// Es un archivo `_`: NO es una ruta. Entra por api/datos.js (el plan Hobby de Vercel admite
// 12 funciones por deploy y cada archivo de ruta cuenta una).
import Anthropic from '@anthropic-ai/sdk';
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

/** Techo por respuesta. El borrador entero son ~200 palabras: 2.000 sobra y acota un desborde. */
const MAX_TOKENS = 2000;

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
 * resuelve el archivo que existe. Son ~1.400 tokens de imagen, o sea US$0,0014 con Haiku.
 */
function imagenValida(x) {
  const u = String(x || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.mitiendanube\.com\//i.test(u)) return null;
  return u;
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
  // caer al default calladamente haría que un typo en la pantalla se lea como «Sonnet salió
  // baratísimo».
  const modelo = body.modelo === undefined || body.modelo === null ? MODELO_POR_DEFECTO : body.modelo;
  if (!esModelo(modelo)) {
    return res.status(400).json({ error: `modelo desconocido: ${String(body.modelo)}` });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: 'Falta ANTHROPIC_API_KEY en Vercel. Sin eso no se puede redactar (el resto de Redacción anda igual).',
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
  };

  const cliente = new Anthropic();
  const ficha = MODELOS[modelo];

  /** Una llamada al modelo. Devuelve `{texto, uso}`; `redactar` decide si hace falta otra. */
  const llamar = async (pedido) => {
    const r = await cliente.messages.create({
      model: modelo,
      max_tokens: MAX_TOKENS,
      system: pedido.system,
      messages: [{ role: 'user', content: pedido.contenido }],
      output_config: {
        // ⚠️ `effort` sólo donde el modelo lo acepta: Haiku 4.5 lo rechaza con 400.
        ...(ficha.effort ? { effort: ficha.effort } : {}),
        format: { type: 'json_schema', schema: ESQUEMA },
      },
    });

    // Un rechazo del clasificador llega con 200 y sin texto útil: si no se mira, sale como
    // «el modelo no devolvió JSON» y manda a buscar el error donde no está.
    if (r.stop_reason === 'refusal') {
      throw new Error('el modelo se negó a redactar este producto');
    }
    const bloque = (r.content || []).find((b) => b.type === 'text');
    const u = r.usage || {};
    return {
      texto: bloque ? bloque.text : '',
      uso: {
        entrada: u.input_tokens || 0,
        salida: u.output_tokens || 0,
        cacheLeido: u.cache_read_input_tokens || 0,
        cacheEscrito: u.cache_creation_input_tokens || 0,
      },
    };
  };

  try {
    const r = await redactar(ctx, llamar);
    // El costo se calcula con la fecha del servidor: el precio de intro de Sonnet vence el
    // 31-ago-2026 y la fecha del navegador la elige el navegador.
    const hoy = new Date().toISOString().slice(0, 10);
    return res.status(200).json({
      ok: !r.error,
      error: r.error || null,
      borrador: r.borrador,
      problemas: r.problemas,
      intentos: r.intentos,
      modelo,
      modeloNombre: ficha.nombre,
      uso: r.uso,
      costo: costoDe(r.uso, modelo, hoy),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'no se pudo redactar' });
  }
}
