// Métricas de Meta Ads (API de Marketing, solo lectura, scope ads_read).
// Dos modos:
//   GET /api/meta-ads                         → lista las cuentas del token con su total (para el selector).
//   GET /api/meta-ads?account=<id>&preset=... → DETALLE de una cuenta: totales + anuncios agrupables por
//                                               campaña + serie diaria + desglose por plataforma/ubicación.
// Rango por preset (last_30d default) o since/until.
//
// Seguridad: exige un usuario válido del Monitor (patrón observaciones.js).
// Token: META_ADS_TOKEN (system user, no vence). Si falta → 500.
import { exigirUsuario, soloMismoOrigen } from './_auth.js';

const GRAPH = 'https://graph.facebook.com/v25.0';
const TOKEN = process.env.META_ADS_TOKEN;

const PRESETS = new Set(['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'maximum']);
// Ventana de atribución fija: cambia mucho los números de ventas/ROAS, así que la explicitamos.
const ATTR = encodeURIComponent(JSON.stringify(['7d_click', '1d_view']));
// Compras dedup cross-surface (pixel + CAPI + on-Meta): la fuente única de verdad de ventas.
const COMPRA = 'omni_purchase';
// Objetivos de campaña que buscan VENDER. Es lo que separa el ROAS que importa del ruido: una
// campaña de tráfico o de reconocimiento baja el ROAS de la cuenta sin que eso signifique nada,
// porque no está optimizando para comprar. Meta usa los nombres nuevos (OUTCOME_*) y los viejos.
const OBJETIVOS_VENTA = new Set(['OUTCOME_SALES', 'CONVERSIONS', 'PRODUCT_CATALOG_SALES', 'CATALOG_SALES']);
const OBJETIVOS_TRAFICO = new Set(['OUTCOME_TRAFFIC', 'LINK_CLICKS', 'OUTCOME_ENGAGEMENT', 'POST_ENGAGEMENT', 'PAGE_LIKES']);
/**
 * Visitas al perfil (Instagram/Facebook). El `action_type` exacto de Meta cambia entre versiones
 * y no está documentado de forma estable, así que NO se hardcodea un nombre: se busca por patrón
 * sobre las acciones que devuelve la fila. Si Meta lo llama distinto, el dato queda en 0 en vez
 * de romper — mismo criterio que el resto de los enriquecimientos.
 */
const RE_PERFIL = /profile_visit|profile_view|profile_engagement/i;

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
  const rango = rangoQS(q);
  const rangoEco = q.since && q.until ? { since: q.since, until: q.until } : (PRESETS.has(q.preset) ? q.preset : 'last_30d');

  return q.account ? await detalle(res, String(q.account), rango, rangoEco) : await overview(res, rango, rangoEco);
}

// ── Mutación: pausar o activar un anuncio ───────────────────────────────────────
// Solo admin o quien tenga el sub-permiso `meta-ads.pausar` en alguna marca. Es una
// escritura que afecta la entrega/gasto en vivo, pero reversible (se vuelve a activar).
// El token debe tener scope ads_management; si es ads_read, Meta contesta con su error.
function puedePausar(perfil) {
  if (perfil && perfil.admin) return true;
  const acc = (perfil && perfil.acceso) || {};
  return Object.values(acc).some((m) => m && m['meta-ads.pausar']);
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
  };
}

// Suma un conjunto de filas (para el subtotal de campaña / fallback de cuenta). Los ratios se recalculan
// desde los agregados (no se promedian); reach NO se suma (es dedup) → se omite en subtotales.
function sumar(rows) {
  const t = { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, perfil: 0 };
  for (const r of rows) {
    t.spend += r.spend; t.impressions += r.impressions; t.clicks += r.clicks; t.purchases += r.purchases; t.revenue += r.revenue;
    t.perfil += r.perfil || 0;
  }
  return {
    ...t,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks ? t.spend / t.clicks : 0,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : 0,
    roas: t.spend ? t.revenue / t.spend : 0,
    costoPerfil: t.perfil ? t.spend / t.perfil : 0,
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
