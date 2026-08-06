// Métricas de Meta Ads (API de Marketing, solo lectura, scope ads_read).
// Tres modos:
//   GET /api/meta-ads                         → lista las cuentas del token con su total (para el selector).
//   GET /api/meta-ads?account=<id>&preset=... → DETALLE de una cuenta: totales + anuncios agrupables por
//                                               campaña + serie diaria + desglose por plataforma/ubicación.
//   GET /api/meta-ads?recurso=etapas          → CENSO de campañas repartido por LÍNEA de pauta (bdi,
//                                               zattia, stunned) para el diagnóstico de etapas
//                                               (TOFU/MOFU/BOFU). Incluye las pausadas.
//   GET /api/meta-ads?recurso=creativos&campania=<id>
//                                             → los AVISOS de una campaña con su creativo (imagen,
//                                               título, texto, botón) y su gasto. A demanda, para
//                                               que Etapas muestre CON QUÉ se está hablando.
// Rango por preset (last_30d default) o since/until.
//
// Seguridad: exige un usuario válido del Monitor (patrón observaciones.js).
// Token: META_ADS_TOKEN (system user, no vence). Si falta → 500.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';
// Los permisos se IMPORTAN, no se copian: la misma implementación que usa la app.
import { esAdmin, marcasConAcceso, puedeSub, puedeVer } from '../lib/permisos.core.js';
// La clasificación por etapa TAMBIÉN se importa, por el mismo motivo y desde un `.js` gemelo.
import { estaAlAire, etapaDeObjetivo, OBJETIVOS_TRAFICO, OBJETIVOS_VENTA, UMBRALES_ETAPA } from '../lib/meta-ads/etapas.core.js';
// Y las líneas de pauta, que son las que dicen de qué marca es cada campaña.
import { lineasDeMarca, sugerirLinea } from '../lib/meta-ads/lineas.core.js';

const GRAPH = 'https://graph.facebook.com/v25.0';
const TOKEN = process.env.META_ADS_TOKEN;

const PRESETS = new Set(['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'maximum']);
// Ventana de atribución fija: cambia mucho los números de ventas/ROAS, así que la explicitamos.
const ATTR = encodeURIComponent(JSON.stringify(['7d_click', '1d_view']));
// Compras dedup cross-surface (pixel + CAPI + on-Meta): la fuente única de verdad de ventas.
const COMPRA = 'omni_purchase';
// `OBJETIVOS_VENTA` / `OBJETIVOS_TRAFICO` se mudaron a `lib/meta-ads/etapas.core.js` (importados
// arriba): son la misma verdad que el mapa de etapas y ahí un test amarra que no se despeguen.
/**
 * Visitas al perfil (Instagram/Facebook). El `action_type` exacto de Meta cambia entre versiones
 * y no está documentado de forma estable, así que NO se hardcodea un nombre: se busca por patrón
 * sobre las acciones que devuelve la fila. Si Meta lo llama distinto, el dato queda en 0 en vez
 * de romper — mismo criterio que el resto de los enriquecimientos.
 */
const RE_PERFIL = /profile_visit|profile_view|profile_engagement/i;
/**
 * Seguidores nuevos. Mismo criterio y mismo cuidado que RE_PERFIL: Meta los nombra distinto
 * según la superficie (`follow` de Instagram, `like`/`page_like` de una página de Facebook), así
 * que se matchea por patrón. `like` va anclado para no comerse `post_reaction` ni parecidos.
 */
const RE_SEGUIDOR = /(^|\.)follow|page_like|(^|\.)like$/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function graph(path, tries = 4) {
  const url = `${GRAPH}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(TOKEN)}`;
  let last;
  for (let a = 1; a <= tries; a++) {
    try {
      const r = await fetch(url);
      const d = await r.json().catch(() => null);
      if (r.ok) return { ok: true, data: d };
      last = { ok: false, status: r.status, error: d && d.error };
      const code = d && d.error && d.error.code;
      if ((r.status === 429 || r.status >= 500 || code === 4 || code === 17 || code === 613) && a < tries) {
        await sleep(1000 * a);
        continue;
      }
      return last;
    } catch (e) {
      last = { ok: false, status: 0, error: { message: String((e && e.message) || e) } };
      if (a < tries) { await sleep(1000 * a); continue; }
      return last;
    }
  }
  return last;
}

// Sigue la paginación por cursor `after` hasta agotar (tope de 20 páginas por las dudas).
// Nació para insights y sirve para cualquier edge paginado de la Graph (lo usa también `/campaigns`).
async function insightsTodas(path) {
  let after = null, rows = [], guard = 0;
  do {
    const p = after ? `${path}&after=${encodeURIComponent(after)}` : path;
    const r = await graph(p);
    if (!r.ok) return { ok: false, error: mensajeError(r) };
    const d = r.data || {};
    if (Array.isArray(d.data)) rows = rows.concat(d.data);
    after = d.paging && d.paging.next && d.paging.cursors ? d.paging.cursors.after : null;
    guard++;
  } while (after && guard < 20);
  return { ok: true, rows };
}

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  if (!TOKEN) return res.status(500).json({ error: 'Meta Ads no configurado' });
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  // POST = mutación (pausar/activar un anuncio). Requiere ads_management en el token.
  if (req.method === 'POST') return await accionAd(req, res, perfil);

  const q = req.query || {};

  // Recursos que no son "métricas de una cuenta" entran por acá, como hace `api/datos.js`: el plan
  // Hobby admite 12 funciones y un archivo nuevo en `api/` las frena todas sin error visible.
  // Sin `&marca=`: devuelve las tres líneas de una, porque el censo que hay que pedirle a Meta es el
  // mismo para todas (una sola cuenta publicitaria). Pedirlo tres veces sería triplicar el gasto de
  // Graph para cortar los mismos datos; el corte por permiso igual se hace del lado del servidor.
  if (q.recurso === 'etapas') return await etapas(res, perfil, parseInt(q.dias, 10));
  if (q.recurso === 'creativos') return await creativos(res, perfil, String(q.campania || ''), parseInt(q.dias, 10));
  if (q.recurso === 'diagnostico') return await diagnostico(res, perfil, q.probar === '1');

  const rango = rangoQS(q);
  const rangoEco = q.since && q.until ? { since: q.since, until: q.until } : (PRESETS.has(q.preset) ? q.preset : 'last_30d');

  return q.account ? await detalle(res, String(q.account), rango, rangoEco) : await overview(res, rango, rangoEco);
}

// ── Modo etapas: el censo de campañas, repartido por línea de pauta (TOFU/MOFU/BOFU) ────────────
/**
 * Por qué esto no reusa el modo `detalle`:
 *
 * 1. **`detalle` no ve las campañas pausadas ni las que no gastaron.** Deriva las campañas de los
 *    anuncios que entregaron, con `filtering: spend > 0`. Para decir "hay 5 de una etapa y ninguna
 *    de la otra" hace falta el censo real, y el `status` de campaña hoy no se trae en ningún lado.
 * 2. **Pesa 9 llamadas por cuenta** y trae demografía, regiones, placements y creativos. Acá no
 *    hace falta nada de eso: son 2 llamadas por cuenta.
 *
 * La ventana es FIJA (30 días, o 90 si se pide) y no la del selector del Resumen: con "Hoy" a las 9
 * de la mañana todas las etapas darían cero y la pantalla gritaría un hueco falso todos los días.
 */
async function etapas(res, perfil, diasPedidos) {
  // Qué líneas puede mirar esta persona. `marcasConAcceso` es la misma que usan Inicio, Solicitudes,
  // Gerencial y el calendario: respeta la cuenta fija (y le gana al admin) y la excepción negativa.
  // Stunned entra de la mano de Zattia, que es de donde cuelga.
  const marcas = marcasConAcceso(perfil, 'meta-ads', ['bdi', 'zattia']);
  if (!marcas.length) return res.status(403).json({ error: 'No tenés permiso para ver Meta Ads.' });
  const visibles = new Set(marcas.flatMap((m) => lineasDeMarca(m)));

  const dias = diasPedidos === UMBRALES_ETAPA.diasAmplio ? UMBRALES_ETAPA.diasAmplio : UMBRALES_ETAPA.dias;
  const rango = `date_preset=last_${dias}d`;
  const attr = `action_attribution_windows=${ATTR}`;

  const cuentasRes = await graph('me/adaccounts?fields=account_id,name&limit=100');
  if (!cuentasRes.ok) return res.status(502).json({ error: 'No se pudieron listar las cuentas de Meta', detalle: mensajeError(cuentasRes) });

  // Ya no hay cuentas "de una marca": las tres líneas se pautean desde la MISMA cuenta publicitaria,
  // así que se consultan todas las del token y el corte se hace campaña por campaña, más abajo.
  const cuentas = ((cuentasRes.data && cuentasRes.data.data) || [])
    .map((c) => ({ id: String(c.account_id), nombre: nombreCuenta(c) }));

  const asignadas = await leerAsignaciones();
  if (asignadas.error) {
    return res.status(502).json({ error: 'No se pudo leer de qué marca es cada campaña', detalle: asignadas.error });
  }

  const porCuenta = await Promise.all(cuentas.map(async (cuenta) => {
    const act = `act_${cuenta.id}`;
    const [censoRes, gastoRes] = await Promise.all([
      // El censo: TODAS las campañas, incluidas las pausadas (Meta ya excluye archivadas y borradas).
      insightsTodas(`${act}/campaigns?fields=id,name,objective,status,effective_status,start_time,daily_budget,lifetime_budget&limit=500`),
      insightsTodas(`${act}/insights?level=campaign&fields=campaign_id,spend,impressions,clicks,actions,action_values&${rango}&${attr}&limit=500`),
    ]);
    if (!censoRes.ok) return { error: censoRes.error };

    // El gasto es un enriquecimiento AISLADO: si falla, las campañas igual se listan con 0 y el
    // diagnóstico dice "sin base" en vez de romper la pantalla entera.
    const gastoPorId = new Map();
    if (gastoRes.ok) for (const r of gastoRes.rows) gastoPorId.set(String(r.campaign_id), r);

    return {
      campañas: censoRes.rows.map((c) => {
        const g = gastoPorId.get(String(c.id));
        return {
          id: String(c.id),
          nombre: c.name || '(sin nombre)',
          cuentaId: cuenta.id,
          objetivo: c.objective || null,
          etapaAuto: etapaDeObjetivo(c.objective),
          // `effective_status` es el que manda: `status` dice ACTIVE aunque la cuenta esté frenada.
          estado: c.effective_status || c.status || null,
          spend: g ? num(g.spend) : 0,
          impressions: g ? num(g.impressions) : 0,
          clicks: g ? num(g.clicks) : 0,
          purchases: g ? accion(g.actions, COMPRA) : 0,
          revenue: g ? accion(g.action_values, COMPRA) : 0,
        };
      }),
    };
  }));

  const fallo = porCuenta.find((r) => r.error);
  if (fallo && porCuenta.every((r) => r.error)) {
    return res.status(502).json({ error: 'No se pudieron traer las campañas de Meta', detalle: fallo.error });
  }

  const campañas = porCuenta.flatMap((r) => r.campañas || []).sort((a, b) => b.spend - a.spend);

  // El reparto. Una campaña sin fila NO cae en ninguna línea: su plata no se la queda nadie por
  // descarte, que es exactamente el bug que este cambio vino a matar. Queda en `sinAsignar`, con lo
  // que el nombre SUGIERE, y una persona confirma.
  const lineas = {};
  for (const l of visibles) lineas[l] = [];
  const sinAsignar = [];
  for (const c of campañas) {
    const fila = asignadas.mapa.get(c.id);
    if (fila) {
      if (lineas[fila.linea]) lineas[fila.linea].push(c);
      continue;
    }
    // `tuvoActividad` es `estaAlAire` IMPORTADA, no una copia: este flag decide qué campañas se
    // reclaman en ámbar, y reclamar con un criterio distinto del que después las cuenta es prometer
    // un número que no va a moverse.
    //
    // Nació como un `||` y eso llenaba el cartel de publicaciones de Instagram promocionadas: Meta
    // le arma una campaña a cada posteo y quedan `ACTIVE` para siempre aunque hace meses que no
    // entregan. Eran 26 filas de $0 tapando las 5 que se llevaban toda la plata. ⛔ No filtrarlas
    // por el nombre ni por el objetivo: el día que se promocione un posteo con plata de verdad, esa
    // heurística esconde justo la que había que asignar. El gasto en la ventana no se puede fingir,
    // y si una empieza a gastar vuelve sola al cartel.
    sinAsignar.push({ ...c, sugerida: sugerirLinea(c.nombre), tuvoActividad: estaAlAire(c) });
  }

  return res.status(200).json({ ok: true, dias, cuentas, lineas, sinAsignar });
}

/**
 * La asignación campaña → línea, desde la base de BDI.
 *
 * ⚠️ Una sola base para las dos marcas, a propósito: de quién es una campaña es un hecho único y no
 * una decisión editorial de cada marca. El razonamiento largo está arriba de
 * `sql/migrate-meta-ads-linea.sql`.
 *
 * Si esto falla, el endpoint corta con 502 en vez de devolver el censo sin repartir: mostrar todas
 * las campañas como "sin asignar" haría creer que se perdieron las asignaciones, y alguien las
 * volvería a cargar encima.
 */
async function leerAsignaciones() {
  const url = process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return { error: 'Faltan credenciales de Supabase' };
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase.from('meta_ads_campania_linea').select('campaign_id, linea');
    if (error) return { error: error.message };
    return { mapa: new Map((data || []).map((r) => [String(r.campaign_id), r])) };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

// ── Modo creativos: los avisos de UNA campaña, con qué se ve y qué dice ─────────
/**
 * Para qué existe, si el detalle de cuenta ya lista anuncios.
 *
 * La pantalla de Etapas es **la del que tiene que craneаr los creativos**, no la del que compra
 * medios. Decirle "falta pauta de la segunda etapa" sin dejarle ver con qué pieza se está hablando
 * hoy en la primera lo deja pensando en el aire: lo que hace falta para imaginar el paso siguiente
 * es ver la foto, el gancho y el botón de lo que ya salió. Por eso esto trae el **creativo**, no
 * una fila más de números.
 *
 * Se pide por campaña y a demanda —al desplegar una fila—, no de entrada: el censo de etapas son 2
 * llamadas por cuenta y traer los creativos de las 176 campañas de una tirada lo volvería inusable.
 *
 * ⚠️ **No usa `GET /<ad_id>/previews`**, que es el iframe oficial de Meta. Ese endpoint devuelve un
 * `<iframe src="…&t=<token>">` con el access token adentro de la URL, y este token es de un system
 * user con lectura sobre TODAS las cuentas del portfolio: publicarlo en el HTML lo dejaría al
 * alcance de cualquiera que abra las herramientas del navegador. La vista se arma acá con los
 * campos del creativo (imagen, título, texto, botón) y el link al aviso publicado, que no filtra
 * nada. Si algún día hace falta el iframe de verdad, primero hay que resolver el token.
 */
async function creativos(res, perfil, campaignId, diasPedidos) {
  if (!/^\d+$/.test(campaignId)) return res.status(400).json({ error: 'campaña inválida' });

  const marcas = marcasConAcceso(perfil, 'meta-ads', ['bdi', 'zattia']);
  if (!marcas.length) return res.status(403).json({ error: 'No tenés permiso para ver Meta Ads.' });
  const visibles = new Set(marcas.flatMap((m) => lineasDeMarca(m)));

  // El corte por marca es el mismo que el del censo, y por el mismo motivo: las tres líneas salen
  // de una sola cuenta publicitaria, así que "puede ver la cuenta" no alcanza para decidir. Una
  // campaña sin asignar no se corta —se ve igual en el cartel de pendientes de la misma pantalla—.
  const asignadas = await leerAsignaciones();
  if (asignadas.error) {
    return res.status(502).json({ error: 'No se pudo leer de qué marca es cada campaña', detalle: asignadas.error });
  }
  const fila = asignadas.mapa.get(campaignId);
  if (fila && !visibles.has(fila.linea)) {
    return res.status(403).json({ error: 'Esa campaña es de una marca que no ves.' });
  }

  const dias = diasPedidos === UMBRALES_ETAPA.diasAmplio ? UMBRALES_ETAPA.diasAmplio : UMBRALES_ETAPA.dias;

  // Tres llamadas, y las dos últimas son enriquecimientos AISLADOS: si Meta rechaza una, su dato
  // queda vacío y los avisos igual se ven. La primera lleva EXACTAMENTE los campos que el modo
  // `detalle` ya usa en producción (ver `statusRes`), que es lo único probado contra esta cuenta;
  // los campos nuevos van todos en la segunda, para que un nombre de campo equivocado no se lleve
  // puesta la respuesta entera —que es lo que pasó con `business{name}` en julio—.
  const [baseRes, ricoRes, insRes] = await Promise.all([
    graph(`${campaignId}/ads?fields=id,name,effective_status,creative{thumbnail_url,effective_object_story_id,instagram_permalink_url}&limit=200`),
    graph(`${campaignId}/ads?fields=id,creative{image_url,body,title,object_story_spec}&limit=200`),
    insightsTodas(`${campaignId}/insights?level=ad&fields=ad_id,spend,impressions,clicks,actions,action_values,video_3_sec_watched_actions&date_preset=last_${dias}d&action_attribution_windows=${ATTR}&limit=200`),
  ]);

  if (!baseRes.ok) {
    return res.status(502).json({ error: 'No se pudieron traer los avisos de la campaña', detalle: mensajeError(baseRes) });
  }

  const ricoPorId = new Map();
  if (ricoRes.ok && ricoRes.data && Array.isArray(ricoRes.data.data)) {
    for (const a of ricoRes.data.data) ricoPorId.set(String(a.id), a.creative || {});
  }
  const insPorId = new Map();
  if (insRes.ok) for (const r of insRes.rows) insPorId.set(String(r.ad_id), r);

  const ads = ((baseRes.data && baseRes.data.data) || []).map((a) => {
    const id = String(a.id);
    const cr = { ...(a.creative || {}), ...(ricoPorId.get(id) || {}) };
    const g = insPorId.get(id);
    const impresiones = g ? num(g.impressions) : 0;
    const plays3s = g ? sumaAcciones(g.video_3_sec_watched_actions) : 0;
    return {
      id,
      nombre: a.name || '(sin nombre)',
      estado: a.effective_status || null,
      ...piezaDe(cr),
      spend: g ? num(g.spend) : 0,
      impressions: impresiones,
      clicks: g ? num(g.clicks) : 0,
      purchases: g ? accion(g.actions, COMPRA) : 0,
      revenue: g ? accion(g.action_values, COMPRA) : 0,
      hookRate: impresiones ? (plays3s / impresiones) * 100 : 0,
    };
  }).sort((x, y) => y.spend - x.spend);

  // `sinCreativo` es diagnóstico, no adorno: si la llamada rica falla, todos los avisos quedan con
  // la miniatura de 64 px y sin una palabra de copy, y la pantalla tiene que poder decir por qué en
  // vez de dar a entender que los avisos no tienen texto.
  return res.status(200).json({ ok: true, dias, ads, sinCreativo: !ricoRes.ok ? mensajeError(ricoRes) : null });
}

/**
 * De lo que devuelve Meta a lo que se dibuja: imagen, título, texto y botón.
 *
 * La cadena de respaldos no es paranoia: el mismo campo vive en un lugar distinto según el formato.
 * Un aviso de imagen trae `image_url` arriba; uno de video, el póster adentro de `video_data`; uno
 * armado desde una publicación, sólo `link_data.picture`. Sin la cadena, la mitad de la grilla sale
 * sin foto y parece que los avisos no tienen creativo.
 */
function piezaDe(cr) {
  const spec = cr.object_story_spec || {};
  const link = spec.link_data || {};
  const video = spec.video_data || {};
  const hijos = Array.isArray(link.child_attachments) ? link.child_attachments : [];
  const cta = (link.call_to_action && link.call_to_action.type) || (video.call_to_action && video.call_to_action.type) || null;
  const historia = cr.effective_object_story_id ? `https://www.facebook.com/${cr.effective_object_story_id}` : null;
  return {
    imagen: cr.image_url || video.image_url || link.picture || (hijos[0] && hijos[0].picture) || cr.thumbnail_url || null,
    // La miniatura viaja aparte: es la única que Meta garantiza, así que sirve de red si la grande
    // no carga (las URLs de `scontent` caducan).
    thumb: cr.thumbnail_url || null,
    titulo: cr.title || link.name || video.title || null,
    texto: cr.body || link.message || video.message || null,
    cta: cta ? ROTULO_CTA[cta] || String(cta).toLowerCase().replace(/_/g, ' ') : null,
    destino: link.link || null,
    // Un carrusel se piensa distinto que una foto sola, así que las tarjetas se cuentan y se
    // muestran. Tope de 10, que es el de Meta.
    piezas: hijos.map((h) => h && h.picture).filter(Boolean).slice(0, 10),
    esVideo: !!(video.video_id || video.image_url),
    permalink: cr.instagram_permalink_url || historia || null,
  };
}

/** Los botones de Meta, en castellano. Los que no estén caen al nombre crudo en minúsculas. */
const ROTULO_CTA = {
  SHOP_NOW: 'Comprar',
  LEARN_MORE: 'Más información',
  SIGN_UP: 'Registrarse',
  BOOK_TRAVEL: 'Reservar',
  ORDER_NOW: 'Pedir ahora',
  GET_OFFER: 'Ver la oferta',
  SEND_MESSAGE: 'Enviar mensaje',
  WHATSAPP_MESSAGE: 'Escribir por WhatsApp',
  SUBSCRIBE: 'Suscribirse',
  CONTACT_US: 'Contactarnos',
  NO_BUTTON: 'sin botón',
};

// ── Modo diagnóstico: ¿el token puede ESCRIBIR? (solo admin) ────────────────────
/**
 * Para accionar sobre la pauta (pausar, cambiar presupuesto, duplicar) hay que pasar **dos
 * candados distintos**, y confundirlos cuesta horas:
 *
 *   1. El **scope del token**: `ads_management` además de `ads_read`. Si falta, Meta contesta
 *      `(#200) Requires ads_management permission`.
 *   2. El **permiso del system user sobre la cuenta**: "Administrar campañas" y no sólo "Ver
 *      rendimiento". Si falta, Meta contesta `(#272) ... requires the user to be an admin`.
 *
 * `user_tasks` responde el candado 2 sin escribir nada: `["ANALYZE"]` es solo lectura, `MANAGE`
 * es el objetivo. El candado 1 no se puede ver de otra forma que intentando, así que `?probar=1`
 * hace la **escritura más inofensiva que existe**: pisar el nombre de una campaña con el nombre
 * que ya tiene. No cambia nada y devuelve el código de error crudo, que es el que distingue los
 * dos casos.
 *
 * `/me/permissions` va tolerado a propósito: con un token de system user Meta no siempre lo
 * contesta, y que falle no significa nada sobre los scopes.
 */
async function diagnostico(res, perfil, probar) {
  if (!esAdmin(perfil)) return res.status(403).json({ error: 'El diagnóstico del token es solo para administradores.' });

  // Los campos de la lista son los MISMOS que ya usa `overview` y están probados en prod: un
  // nombre de campo equivocado se lleva puesta la respuesta entera de Graph (pasó con
  // `business{name}` en julio). Lo nuevo va en una llamada aparte, por cuenta y aislada.
  const cuentasRes = await graph('me/adaccounts?fields=account_id,name&limit=100');
  if (!cuentasRes.ok) return res.status(502).json({ error: 'No se pudieron listar las cuentas de Meta', detalle: mensajeError(cuentasRes) });
  const cuentas = (cuentasRes.data && cuentasRes.data.data) || [];

  const permRes = await graph('me/permissions');
  const scopes = permRes.ok && permRes.data && Array.isArray(permRes.data.data)
    ? permRes.data.data.filter((p) => p.status === 'granted').map((p) => p.permission)
    : null;

  const filas = await Promise.all(cuentas.map((c) => diagnosticoCuenta(c, probar)));
  return res.status(200).json({
    ok: true,
    scopes,                                    // null = Meta no lo contestó, NO "no tiene ninguno"
    scopesMotivo: permRes.ok ? null : mensajeError(permRes),
    puedeEscribir: filas.some((f) => f.veredicto === 'escribe'),
    cuentas: filas,
  });
}

async function diagnosticoCuenta(c, probar) {
  const id = String(c.account_id || '');
  const base = { id, nombre: nombreCuenta(c) };
  const d = await graph(`act_${id}?fields=user_tasks,account_status,disable_reason,currency,min_daily_budget_low_freq,min_daily_budget_high_freq`);
  if (!d.ok) return { ...base, veredicto: 'no-se-pudo-leer', detalle: mensajeError(d) };
  const t = d.data || {};
  const tareas = Array.isArray(t.user_tasks) ? t.user_tasks : [];
  const fila = {
    ...base,
    tareas,
    // ⚠️ Los mínimos vienen en la UNIDAD MENOR de la moneda: en ARS (2 decimales) `150000` es
    // $1.500, no $150.000. Cualquier control de presupuesto tiene que dividir por 100 al mostrar
    // y multiplicar al escribir. Se expone crudo y con el divisor al lado para que no se adivine.
    moneda: t.currency || '',
    minDiarioCrudo: num(t.min_daily_budget_low_freq),
    minDiarioAlto: num(t.min_daily_budget_high_freq),
    estadoCuenta: t.account_status ?? null,
    motivoBaja: t.disable_reason ?? null,
    administra: tareas.includes('MANAGE'),
    veredicto: tareas.includes('MANAGE') ? 'permiso-de-cuenta-ok' : 'sin-permiso-de-cuenta',
  };
  if (!probar) return fila;
  return { ...fila, ...(await pruebaDeEscritura(id)) };
}

/**
 * La escritura idempotente: `POST /<campaign_id>` con el nombre que la campaña YA tiene.
 * Es la única forma de saber si el scope alcanza sin arriesgar nada.
 */
async function pruebaDeEscritura(cuentaId) {
  const camp = await graph(`act_${cuentaId}/campaigns?fields=id,name&limit=1`);
  const c0 = camp.ok && camp.data && camp.data.data && camp.data.data[0];
  if (!c0) return { prueba: { corrida: false, motivo: camp.ok ? 'la cuenta no tiene campañas para probar' : mensajeError(camp) } };

  const w = await graphPost(c0.id, { name: c0.name });
  if (w.ok) return { veredicto: 'escribe', prueba: { corrida: true, ok: true, campania: c0.name } };

  const code = (w.error && w.error.code) ?? null;
  // Los dos códigos que distinguen los candados. El resto se muestra crudo antes que adivinar.
  const veredicto = code === 200 ? 'sin-scope' : code === 272 ? 'sin-permiso-de-cuenta' : code === 190 ? 'token-invalido' : 'rechazo-desconocido';
  return { veredicto, prueba: { corrida: true, ok: false, codigo: code, campania: c0.name, detalle: mensajeError(w) } };
}

// ── Mutación: pausar o activar un anuncio ───────────────────────────────────────
// Solo admin o quien tenga el sub-permiso `meta-ads.pausar` en alguna marca. Es una
// escritura que afecta la entrega/gasto en vivo, pero reversible (se vuelve a activar).
// El token debe tener scope ads_management; si es ads_read, Meta contesta con su error.
function puedePausar(perfil) {
  // Con `puedeSub` en vez de leer `acceso` a mano se respeta la excepción negativa
  // (`'-meta-ads.pausar'`), que la versión anterior ignoraba: a alguien a quien se le había SACADO
  // el permiso, el servidor igual lo dejaba pausar campañas.
  return ['bdi', 'zattia'].some((marca) => puedeSub(perfil, marca, 'meta-ads', 'pausar'));
}

async function graphPost(path, params) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  try {
    const r = await fetch(`${GRAPH}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const d = await r.json().catch(() => null);
    if (r.ok) return { ok: true, data: d };
    return { ok: false, status: r.status, error: d && d.error };
  } catch (e) {
    return { ok: false, status: 0, error: { message: String((e && e.message) || e) } };
  }
}

async function accionAd(req, res, perfil) {
  if (!puedePausar(perfil)) return res.status(403).json({ error: 'No tenés permiso para pausar o activar anuncios.' });
  const b = req.body || {};
  const adId = String(b.ad_id || '').trim();
  const status = String(b.status || '').trim().toUpperCase();
  if (!/^\d+$/.test(adId)) return res.status(400).json({ error: 'ad_id inválido' });
  if (status !== 'ACTIVE' && status !== 'PAUSED') return res.status(400).json({ error: 'status inválido (ACTIVE o PAUSED)' });

  const r = await graphPost(adId, { status });
  if (!r.ok) return res.status(502).json({ error: 'Meta rechazó el cambio', detalle: mensajeError(r) });
  return res.status(200).json({ ok: true, status });
}

/**
 * Nombre presentable de una cuenta publicitaria.
 *
 * Meta NO deja vacío el `name` de una cuenta sin nombre propio: le pone el ID. Así, el selector
 * mostraba `1145878766790149` como si fuera un nombre.
 *
 * El portfolio dueño (`business.name`) sería el mejor reemplazo, pero pedirlo rompe la consulta
 * entera por permisos (ver `overview`), así que queda como opcional: si vino, se usa; si no, la
 * cuenta se llama "Cuenta ####" con los últimos 4 dígitos, que al menos es legible y no se
 * confunde con un nombre. El ID completo va en el title del chip.
 */
function nombreCuenta(c) {
  const id = String(c.account_id || '');
  const n = String(c.name || '').trim();
  if (n && n !== id && n !== `act_${id}`) return n;
  const biz = (c.business && String(c.business.name || '').trim()) || '';
  const cola = id.slice(-4);
  return biz ? `${biz} · ${cola}` : `Cuenta ${cola}`;
}

// ── Modo overview: las 3 cuentas con su total (para el selector) ────────────────
async function overview(res, rango, rangoEco) {
  // ⚠️ NO agregar `business{name}` acá. Exige el permiso `business_management`, que este token
  // (solo `ads_read`) no tiene, y Meta no lo ignora: rechaza la consulta ENTERA con
  // `(#100) Requires business_management permission` — o sea que la sección se queda sin una
  // sola cuenta. Pasó en producción el 26-jul-2026.
  // Una cuenta sin nombre propio cae a "Cuenta ####" (ver `nombreCuenta`); si molesta, se
  // resuelve poniéndole nombre en Ads Manager, no ampliando los permisos del token.
  const cuentasRes = await graph('me/adaccounts?fields=account_id,name,currency,timezone_name&limit=100');
  if (!cuentasRes.ok) return res.status(502).json({ error: 'No se pudieron listar las cuentas de Meta', detalle: mensajeError(cuentasRes) });
  const cuentas = (cuentasRes.data && cuentasRes.data.data) || [];

  const filas = await Promise.all(
    cuentas.map(async (c) => {
      // La zona horaria es de la CUENTA, no del navegador: `date_preset=today` lo resuelve Meta
      // allá, así que "Hoy" puede no ser el hoy de quien mira. Se muestra para que se note.
      const base = { id: c.account_id, nombre: nombreCuenta(c), moneda: c.currency || '', zona: c.timezone_name || '' };
      const ins = await graph(`act_${c.account_id}/insights?fields=spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values,purchase_roas&${rango}&action_attribution_windows=${ATTR}`);
      if (!ins.ok) return { ...base, error: mensajeError(ins) };
      const row = ins.data && ins.data.data && ins.data.data[0];
      if (!row) return { ...base, sinDatos: true };
      return { ...base, ...metricasDe(row) };
    }),
  );
  return res.status(200).json({ ok: true, rango: rangoEco, cuentas: filas });
}

// ── Modo detalle: una cuenta, con anuncios/campañas + diaria + placements ────────
async function detalle(res, account, rango, rangoEco) {
  if (!/^\d+$/.test(account)) return res.status(400).json({ error: 'account inválido' });
  const act = `act_${account}`;
  const attr = `action_attribution_windows=${ATTR}`;
  // El filtro de gasto > 0 recorta el ruido de cuentas con cientos de anuncios dormidos, pero en
  // un rango CORTO esconde justo lo que se quiere mirar: a la mañana un anuncio que todavía no
  // gastó desaparece, y "Hoy" se ve vacío aunque esté entregando. Ahí se pide todo.
  const rangoCorto = esRangoCorto(rangoEco);
  const filtroGasto = rangoCorto
    ? ''
    : `filtering=${encodeURIComponent(JSON.stringify([{ field: 'spend', operator: 'GREATER_THAN', value: 0 }]))}&`;

  // Las 4 primeras son las llamadas núcleo (no se tocan); las 4 nuevas son enriquecimientos
  // AISLADOS: si alguna falla, su dato queda vacío y el resto del detalle igual responde.
  const [totRes, adsRes, dayRes, plRes, extraRes, statusRes, ageRes, regRes, campRes] = await Promise.all([
    graph(`${act}/insights?fields=account_name,account_currency,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas&${rango}&${attr}`),
    insightsTodas(`${act}/insights?level=ad&fields=ad_id,ad_name,adset_name,campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,inline_link_clicks,actions,action_values,purchase_roas&${filtroGasto}${rango}&${attr}&limit=500`),
    graph(`${act}/insights?fields=spend,actions,action_values&time_increment=1&${rango}&${attr}&limit=500`),
    graph(`${act}/insights?fields=spend,actions,action_values&breakdowns=publisher_platform,platform_position&${rango}&${attr}&limit=500`),
    // Diagnóstico de creativos + video por anuncio (call separada para no arriesgar la de anuncios).
    insightsTodas(`${act}/insights?level=ad&fields=ad_id,quality_ranking,engagement_rate_ranking,conversion_rate_ranking,impressions,video_3_sec_watched_actions,video_thruplay_watched_actions&${filtroGasto}${rango}&${attr}&limit=500`),
    // Estado de entrega (activo/pausado/en aprendizaje) + preview del creativo + links por anuncio.
    graph(`${act}/ads?fields=id,effective_status,creative{thumbnail_url,effective_object_story_id,instagram_permalink_url}&limit=500`),
    // Quién: edad × género. Dónde: región.
    graph(`${act}/insights?breakdowns=age,gender&fields=spend,impressions,actions,action_values&${rango}&${attr}&limit=500`),
    graph(`${act}/insights?breakdowns=region&fields=spend,actions,action_values&${rango}&${attr}&limit=500`),
    // Objetivo de cada campaña: es lo único que distingue una pauta de VENTA de una de tráfico,
    // y no viene en insights. Enriquecimiento aislado: si falla, no hay ROAS de venta y listo.
    graph(`${act}/campaigns?fields=id,objective&limit=500`),
  ]);

  if (!adsRes.ok) return res.status(502).json({ error: 'No se pudieron traer los anuncios de la cuenta', detalle: adsRes.error });

  const totRow = totRes.ok && totRes.data && totRes.data.data && totRes.data.data[0];
  const moneda = (totRow && totRow.account_currency) || '';
  // `account_name` trae el mismo ID cuando la cuenta no tiene nombre propio; el overview
  // sí conoce el portfolio, así que la pantalla usa aquel nombre y este es el respaldo.
  const nombre = nombreCuenta({ account_id: account, name: totRow && totRow.account_name });
  const totales = totRow ? metricasDe(totRow) : sumar(adsRes.rows.map(adDe));

  // Índices de los enriquecimientos por ad_id.
  const extraPorId = new Map();
  if (extraRes.ok) for (const r of extraRes.rows) extraPorId.set(String(r.ad_id), r);
  const statusPorId = new Map();
  if (statusRes.ok && statusRes.data && Array.isArray(statusRes.data.data)) {
    for (const a of statusRes.data.data) {
      const cr = a.creative || {};
      // Link al aviso publicado: permalink de IG si lo hay, si no la historia de FB (page_post).
      const story = cr.effective_object_story_id ? `https://www.facebook.com/${cr.effective_object_story_id}` : null;
      const permalink = cr.instagram_permalink_url || story || null;
      statusPorId.set(String(a.id), { status: a.effective_status || null, thumb: cr.thumbnail_url || null, permalink });
    }
  }

  // Embudo (de los totales de cuenta) + video de cuenta (sumando las filas de extra).
  const funnel = totRow ? embudoDe(totRow) : [];
  const videoTotal = extraRes.ok
    ? extraRes.rows.reduce(
        (t, r) => {
          const v = videoDe(r);
          return { plays3s: t.plays3s + v.plays3s, thruplay: t.thruplay + v.thruplay, impressions: t.impressions + num(r.impressions) };
        },
        { plays3s: 0, thruplay: 0, impressions: 0 },
      )
    : { plays3s: 0, thruplay: 0, impressions: 0 };
  videoTotal.hookRate = videoTotal.impressions ? (videoTotal.plays3s / videoTotal.impressions) * 100 : 0;

  // Demografía (edad×género) y regiones, ordenadas por gasto, solo con gasto > 0.
  const demografia = (ageRes.ok ? ageRes.data.data || [] : [])
    .map((row) => ({ age: row.age || '', gender: row.gender || '', ...ventaDe(row) }))
    .filter((d) => d.spend > 0)
    .sort((a, b) => b.spend - a.spend);
  const regiones = (regRes.ok ? regRes.data.data || [] : [])
    .map((row) => ({ region: row.region || '—', ...ventaDe(row) }))
    .filter((d) => d.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 15);

  // Anuncios → agrupar por campaña, subtotal por campaña, ordenar por gasto.
  const ads = adsRes.rows.map((row) => {
    const base = adDe(row);
    const ex = extraPorId.get(String(row.ad_id));
    const st = statusPorId.get(String(row.ad_id)) || null;
    return {
      ...base,
      status: st ? st.status : null,
      thumb: st ? st.thumb : null,
      permalink: st ? st.permalink : null,
      ranking: ex ? { quality: ex.quality_ranking || null, engagement: ex.engagement_rate_ranking || null, conversion: ex.conversion_rate_ranking || null } : null,
      video: ex ? videoDe(ex) : { plays3s: 0, thruplay: 0, hookRate: 0 },
    };
  });
  // Objetivo por campaña (de la consulta aislada; si falló, quedan todas sin objetivo).
  const objetivoPorId = new Map();
  if (campRes.ok && campRes.data && Array.isArray(campRes.data.data)) {
    for (const c of campRes.data.data) objetivoPorId.set(String(c.id), c.objective || null);
  }

  const porCamp = new Map();
  for (const a of ads) {
    if (!porCamp.has(a.campaign_id)) porCamp.set(a.campaign_id, { id: a.campaign_id, nombre: a.campaign_name, ads: [] });
    porCamp.get(a.campaign_id).ads.push(a);
  }
  const campañas = [...porCamp.values()]
    .map((c) => {
      const objetivo = objetivoPorId.get(String(c.id)) || null;
      return {
        id: c.id,
        nombre: c.nombre,
        objetivo,
        // `tipo` es lo que la pantalla usa para decidir QUÉ métrica mostrar: una campaña de venta
        // se juzga por ROAS y una de tráfico por lo que cuesta traer a alguien al perfil.
        tipo: objetivo && OBJETIVOS_VENTA.has(objetivo) ? 'venta' : objetivo && OBJETIVOS_TRAFICO.has(objetivo) ? 'trafico' : 'otro',
        totales: sumar(c.ads),
        ads: c.ads.sort((x, y) => y.spend - x.spend),
      };
    })
    .sort((a, b) => b.totales.spend - a.totales.spend);

  // ROAS de las pautas de VENTA: se calcula sobre el gasto y los ingresos de esas campañas nada
  // más. El `roas` de la cuenta sigue existiendo y no se toca (lo consume la alerta del panel
  // Gerencial): esto se suma al lado, no lo reemplaza.
  // Qué action_types trajo Meta en esta cuenta. Es diagnóstico, no métrica: el nombre exacto de
  // la visita al perfil no está documentado de forma estable, así que si `perfil` da 0 esta lista
  // dice con qué nombre viene de verdad, sin tener que abrir la Graph API a mano.
  const accionesVistas = totRow && Array.isArray(totRow.actions)
    ? [...new Set(totRow.actions.map((a) => String((a && a.action_type) || '')).filter(Boolean))].sort()
    : [];

  const deVenta = campañas.filter((c) => c.tipo === 'venta');
  const gastoVenta = deVenta.reduce((t, c) => t + c.totales.spend, 0);
  const ingresoVenta = deVenta.reduce((t, c) => t + c.totales.revenue, 0);
  const ventasVenta = deVenta.reduce((t, c) => t + c.totales.purchases, 0);
  const venta = objetivoPorId.size
    ? { campañas: deVenta.length, spend: gastoVenta, revenue: ingresoVenta, purchases: ventasVenta, roas: gastoVenta ? ingresoVenta / gastoVenta : 0 }
    : null;

  const daily = (dayRes.ok ? (dayRes.data.data || []) : [])
    .map((row) => ({ date: row.date_start, spend: num(row.spend), revenue: accion(row.action_values, COMPRA), purchases: accion(row.actions, COMPRA) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const placements = (plRes.ok ? (plRes.data.data || []) : [])
    .map((row) => ({ platform: row.publisher_platform || '', position: row.platform_position || '', spend: num(row.spend), purchases: accion(row.actions, COMPRA), revenue: accion(row.action_values, COMPRA) }))
    .filter((p) => p.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  return res.status(200).json({ ok: true, rango: rangoEco, cuenta: { id: account, nombre, moneda }, totales, venta, accionesVistas, funnel, video: videoTotal, demografia, regiones, campañas, daily, placements });
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
function rangoQS(q) {
  if (q.since && q.until && /^\d{4}-\d{2}-\d{2}$/.test(q.since) && /^\d{4}-\d{2}-\d{2}$/.test(q.until)) {
    return `time_range=${encodeURIComponent(JSON.stringify({ since: q.since, until: q.until }))}`;
  }
  return `date_preset=${PRESETS.has(q.preset) ? q.preset : 'last_30d'}`;
}

// Lee el value de un action_type dentro de un array {action_type, value} (actions / action_values / purchase_roas).
function accion(arr, type) {
  if (!Array.isArray(arr)) return 0;
  const hit = arr.find((a) => a && a.action_type === type);
  return hit ? num(hit.value) : 0;
}

// Suma los `value` de un array de acciones (métricas de video: [{action_type,value}]).
function sumaAcciones(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((s, a) => s + num(a && a.value), 0);
}

// Suma los `value` de todas las acciones cuyo action_type matchea un patrón (ver RE_PERFIL).
function accionRe(arr, re) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((s, a) => s + (a && re.test(String(a.action_type || '')) ? num(a.value) : 0), 0);
}

// Pasos del embudo de compra, en orden, con su action_type de Meta.
const FUNNEL = [
  { key: 'link_click', label: 'Clic al enlace', type: 'link_click' },
  { key: 'landing_page_view', label: 'Visita a la web', type: 'landing_page_view' },
  { key: 'add_to_cart', label: 'Agregó al carrito', type: 'omni_add_to_cart' },
  { key: 'initiate_checkout', label: 'Inició compra', type: 'omni_initiated_checkout' },
  { key: 'purchase', label: 'Compró', type: 'omni_purchase' },
];
// Embudo (cantidad + costo por paso) de una fila de insights.
function embudoDe(row) {
  const spend = num(row.spend);
  return FUNNEL.map((p) => {
    const count = accion(row.actions, p.type);
    return { key: p.key, label: p.label, count, costo: count ? spend / count : 0 };
  });
}
// Métricas de video de una fila (hook = reproducciones de 3s ÷ impresiones).
function videoDe(row) {
  const plays3s = sumaAcciones(row.video_3_sec_watched_actions);
  const thruplay = sumaAcciones(row.video_thruplay_watched_actions);
  const impr = num(row.impressions);
  return { plays3s, thruplay, hookRate: impr ? (plays3s / impr) * 100 : 0 };
}
// Ventas/ingresos de una fila de breakdown (demografía/región).
function ventaDe(row) {
  return { spend: num(row.spend), purchases: accion(row.actions, COMPRA), revenue: accion(row.action_values, COMPRA) };
}

// Métricas de una fila de insights (nivel cuenta o campaña), con ventas/ROAS ya resueltas.
function metricasDe(row) {
  return {
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    frequency: num(row.frequency),
    clicks: num(row.clicks),
    ctr: num(row.ctr),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    purchases: accion(row.actions, COMPRA),
    revenue: accion(row.action_values, COMPRA),
    roas: accion(row.purchase_roas, COMPRA),
    perfil: accionRe(row.actions, RE_PERFIL),
    seguidores: accionRe(row.actions, RE_SEGUIDOR),
  };
}

// Una fila de anuncio (level=ad).
function adDe(row) {
  return {
    ad_id: row.ad_id,
    ad_name: row.ad_name || '(sin nombre)',
    adset_name: row.adset_name || '',
    campaign_id: row.campaign_id || 'sin-campaña',
    campaign_name: row.campaign_name || '(sin campaña)',
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    clicks: num(row.clicks),
    ctr: num(row.ctr),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    purchases: accion(row.actions, COMPRA),
    revenue: accion(row.action_values, COMPRA),
    roas: accion(row.purchase_roas, COMPRA),
    perfil: accionRe(row.actions, RE_PERFIL),
    seguidores: accionRe(row.actions, RE_SEGUIDOR),
  };
}

// Suma un conjunto de filas (para el subtotal de campaña / fallback de cuenta). Los ratios se recalculan
// desde los agregados (no se promedian); reach NO se suma (es dedup) → se omite en subtotales.
function sumar(rows) {
  const t = { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, perfil: 0, seguidores: 0 };
  for (const r of rows) {
    t.spend += r.spend; t.impressions += r.impressions; t.clicks += r.clicks; t.purchases += r.purchases; t.revenue += r.revenue;
    t.perfil += r.perfil || 0; t.seguidores += r.seguidores || 0;
  }
  return {
    ...t,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks ? t.spend / t.clicks : 0,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : 0,
    roas: t.spend ? t.revenue / t.spend : 0,
    costoPerfil: t.perfil ? t.spend / t.perfil : 0,
    costoSeguidor: t.seguidores ? t.spend / t.seguidores : 0,
  };
}

/**
 * ¿El rango es de pocos días? Define si se pide TODO o solo lo que gastó. Cubre los presets
 * cortos y también el rango con fechas de "Hoy y ayer", que la pantalla manda como since/until
 * porque Meta no tiene un preset para eso.
 */
function esRangoCorto(rangoEco) {
  if (rangoEco === 'today' || rangoEco === 'yesterday') return true;
  if (!rangoEco || typeof rangoEco !== 'object') return false;
  const a = Date.parse(rangoEco.since), b = Date.parse(rangoEco.until);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(b - a) <= 2 * 86400000;
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function mensajeError(r) {
  const e = r && r.error;
  const msg = (e && (e.error_user_msg || e.message)) || `HTTP ${r && r.status}`;
  return String(msg).slice(0, 200);
}
