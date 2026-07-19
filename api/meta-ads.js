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
  if (soloMismoOrigen(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'método no permitido' });
  if (!TOKEN) return res.status(500).json({ error: 'Meta Ads no configurado' });
  if (!(await exigirUsuario(req, res))) return;

  const q = req.query || {};
  const rango = rangoQS(q);
  const rangoEco = q.since && q.until ? { since: q.since, until: q.until } : (PRESETS.has(q.preset) ? q.preset : 'last_30d');

  return q.account ? await detalle(res, String(q.account), rango, rangoEco) : await overview(res, rango, rangoEco);
}

// ── Modo overview: las 3 cuentas con su total (para el selector) ────────────────
async function overview(res, rango, rangoEco) {
  const cuentasRes = await graph('me/adaccounts?fields=account_id,name,currency&limit=100');
  if (!cuentasRes.ok) return res.status(502).json({ error: 'No se pudieron listar las cuentas de Meta', detalle: mensajeError(cuentasRes) });
  const cuentas = (cuentasRes.data && cuentasRes.data.data) || [];

  const filas = await Promise.all(
    cuentas.map(async (c) => {
      const base = { id: c.account_id, nombre: c.name || `act_${c.account_id}`, moneda: c.currency || '' };
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

  const [totRes, adsRes, dayRes, plRes] = await Promise.all([
    graph(`${act}/insights?fields=account_name,account_currency,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas&${rango}&${attr}`),
    insightsTodas(`${act}/insights?level=ad&fields=ad_id,ad_name,adset_name,campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,inline_link_clicks,actions,action_values,purchase_roas&filtering=${encodeURIComponent(JSON.stringify([{ field: 'spend', operator: 'GREATER_THAN', value: 0 }]))}&${rango}&${attr}&limit=500`),
    graph(`${act}/insights?fields=spend,actions,action_values&time_increment=1&${rango}&${attr}&limit=500`),
    graph(`${act}/insights?fields=spend,actions,action_values&breakdowns=publisher_platform,platform_position&${rango}&${attr}&limit=500`),
  ]);

  if (!adsRes.ok) return res.status(502).json({ error: 'No se pudieron traer los anuncios de la cuenta', detalle: adsRes.error });

  const totRow = totRes.ok && totRes.data && totRes.data.data && totRes.data.data[0];
  const moneda = (totRow && totRow.account_currency) || '';
  const nombre = (totRow && totRow.account_name) || act;
  const totales = totRow ? metricasDe(totRow) : sumar(adsRes.rows.map(adDe));

  // Anuncios → agrupar por campaña, subtotal por campaña, ordenar por gasto.
  const ads = adsRes.rows.map(adDe);
  const porCamp = new Map();
  for (const a of ads) {
    if (!porCamp.has(a.campaign_id)) porCamp.set(a.campaign_id, { id: a.campaign_id, nombre: a.campaign_name, ads: [] });
    porCamp.get(a.campaign_id).ads.push(a);
  }
  const campañas = [...porCamp.values()]
    .map((c) => ({ id: c.id, nombre: c.nombre, totales: sumar(c.ads), ads: c.ads.sort((x, y) => y.spend - x.spend) }))
    .sort((a, b) => b.totales.spend - a.totales.spend);

  const daily = (dayRes.ok ? (dayRes.data.data || []) : [])
    .map((row) => ({ date: row.date_start, spend: num(row.spend), revenue: accion(row.action_values, COMPRA), purchases: accion(row.actions, COMPRA) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const placements = (plRes.ok ? (plRes.data.data || []) : [])
    .map((row) => ({ platform: row.publisher_platform || '', position: row.platform_position || '', spend: num(row.spend), purchases: accion(row.actions, COMPRA), revenue: accion(row.action_values, COMPRA) }))
    .filter((p) => p.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  return res.status(200).json({ ok: true, rango: rangoEco, cuenta: { id: account, nombre, moneda }, totales, campañas, daily, placements });
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
  };
}

// Suma un conjunto de filas (para el subtotal de campaña / fallback de cuenta). Los ratios se recalculan
// desde los agregados (no se promedian); reach NO se suma (es dedup) → se omite en subtotales.
function sumar(rows) {
  const t = { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
  for (const r of rows) {
    t.spend += r.spend; t.impressions += r.impressions; t.clicks += r.clicks; t.purchases += r.purchases; t.revenue += r.revenue;
  }
  return {
    ...t,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks ? t.spend / t.clicks : 0,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : 0,
    roas: t.spend ? t.revenue / t.spend : 0,
  };
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
