// Trae métricas de Meta Ads (gasto/rendimiento) de las cuentas publicitarias a las
// que el system user "monitor-ads" tiene acceso de "Ver rendimiento".
// GET /api/meta-ads?preset=last_30d   (o ?since=YYYY-MM-DD&until=YYYY-MM-DD)
// Descubre las cuentas solas con /me/adaccounts (no hay IDs hardcodeados) y pide
// insights de cada una. Read-only (scope ads_read).
//
// Seguridad: mismo modelo que observaciones.js — exige un usuario válido del Monitor.
// Token: META_ADS_TOKEN (system user, no vence) desde el entorno. Si falta → 500 y el
// cliente muestra "no configurado".
import { exigirUsuario, soloMismoOrigen } from './_auth.js';

const GRAPH = 'https://graph.facebook.com/v25.0';
const TOKEN = process.env.META_ADS_TOKEN;

// Ventanas relativas que aceptamos (las mapea 1:1 a date_preset de Meta).
const PRESETS = new Set(['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'maximum']);
// Campos de insights que devolvemos (nivel cuenta).
const FIELDS = 'spend,impressions,clicks,ctr,cpc,cpm,reach,frequency';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch a Graph con reintentos ante 429 (rate limit) o 5xx, como gnFetch de observaciones.js.
async function graph(path, tries = 4) {
  const url = `${GRAPH}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(TOKEN)}`;
  let last;
  for (let a = 1; a <= tries; a++) {
    try {
      const r = await fetch(url);
      const d = await r.json().catch(() => null);
      if (r.ok) return { ok: true, data: d };
      last = { ok: false, status: r.status, error: d && d.error };
      // 4 = rate limit de Marketing API, 17/613 = user/app rate limit, 500+ = server.
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

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'método no permitido' });
  if (!TOKEN) return res.status(500).json({ error: 'Meta Ads no configurado' });

  if (!(await exigirUsuario(req, res))) return;

  const q = req.query || {};
  // Ventana: since/until explícitos, o un preset (default last_30d).
  let rango;
  if (q.since && q.until && /^\d{4}-\d{2}-\d{2}$/.test(q.since) && /^\d{4}-\d{2}-\d{2}$/.test(q.until)) {
    rango = `time_range=${encodeURIComponent(JSON.stringify({ since: q.since, until: q.until }))}`;
  } else {
    const preset = PRESETS.has(q.preset) ? q.preset : 'last_30d';
    rango = `date_preset=${preset}`;
  }

  // 1) Descubrir las cuentas del system user (las 3 asignadas), con su moneda.
  const cuentasRes = await graph('me/adaccounts?fields=account_id,name,currency&limit=100');
  if (!cuentasRes.ok) {
    return res.status(502).json({ error: 'No se pudieron listar las cuentas de Meta', detalle: mensajeError(cuentasRes) });
  }
  const cuentas = (cuentasRes.data && cuentasRes.data.data) || [];

  // 2) Insights por cuenta, en paralelo. Una cuenta sin gasto en la ventana devuelve data: [].
  const filas = await Promise.all(
    cuentas.map(async (c) => {
      const act = `act_${c.account_id}`;
      const ins = await graph(`${act}/insights?fields=${FIELDS}&${rango}`);
      const base = { id: c.account_id, nombre: c.name || act, moneda: c.currency || '' };
      if (!ins.ok) return { ...base, error: mensajeError(ins) };
      const row = ins.data && ins.data.data && ins.data.data[0];
      if (!row) return { ...base, sinDatos: true };
      return {
        ...base,
        spend: num(row.spend),
        impressions: num(row.impressions),
        clicks: num(row.clicks),
        ctr: num(row.ctr),
        cpc: num(row.cpc),
        cpm: num(row.cpm),
        reach: num(row.reach),
        frequency: num(row.frequency),
      };
    }),
  );

  return res.status(200).json({ ok: true, rango: q.since && q.until ? { since: q.since, until: q.until } : (PRESETS.has(q.preset) ? q.preset : 'last_30d'), cuentas: filas });
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
