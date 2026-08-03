// Escribe la OBSERVACIÓN (ubicación física) del inventario en Gestión Nube,
// para TODAS las variantes de un producto en un depósito (default "Deposito Minorista").
// POST { productId, observation, store? }
//   - observation: string (se recorta a 20 chars) o vacío/null para limpiar.
// Seguridad: exige un usuario válido del Monitor (login server-side contra el KV).
// Usa GN_TOKEN (token con inventory:read + inventory:write) desde el entorno del servidor.
// GN: GET /inventario/{product_id} (trae las filas con inventory_id) +
//     PATCH /inventario/{inventory_id}/observacion { observation }.
import { exigirUsuario, soloMismoOrigen } from './_auth.js';

const GN_BASE = 'https://www.gestionnube.com/api/v1';
const TOKEN = process.env.GN_TOKEN; // token GN con inventory:read+write (env del Monitor)

const sleep = ms => new Promise(r => setTimeout(r, ms));

// fetch con reintentos: si GN responde 429 (rate limit) o 5xx, espera y reintenta.
async function gnFetch(url, opts, tries = 4) {
  let last;
  for (let a = 1; a <= tries; a++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return r;
      last = r;
      if ((r.status === 429 || r.status >= 500) && a < tries) { await sleep(900 * a); continue; }
      return r;
    } catch (e) { last = e; if (a < tries) { await sleep(900 * a); continue; } throw e; }
  }
  return last;
}

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  if (!TOKEN) return res.status(500).json({ error: 'Falta GN_TOKEN en el entorno del servidor' });

  // Escribe en el GN de producción con un token de inventory:write: sin usuario
  // válido no se sigue. Va antes de leer el body a propósito.
  if (!(await exigirUsuario(req, res))) return;

  const body = req.body || {};
  const productId = body.productId;
  const store = (body.store || 'Deposito Minorista').toLowerCase();
  const obs = (body.observation == null ? '' : String(body.observation)).trim().slice(0, 20) || null;
  if (!productId) return res.status(400).json({ error: 'Falta productId' });

  const headers = { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json', 'Content-Type': 'application/json' };

  try {
    // 1) Traer las filas de inventario del producto
    const rGet = await gnFetch(`${GN_BASE}/inventario/${productId}`, { headers });
    const dGet = await rGet.json();
    if (!rGet.ok) return res.status(rGet.status).json({ error: 'No se pudo leer el inventario del producto', detalle: JSON.stringify(dGet).slice(0, 200) });
    // GET /inventario/{id} → { variantes: [ { size_name, stock_por_tienda: [ {inventory_id, store_name, observation, ...} ] } ] }
    const filas = (dGet.variantes || []).flatMap(v =>
      (v.stock_por_tienda || []).map(s => ({ ...s, size_name: v.size_name })));
    if (body.debug) {
      return res.status(200).json({
        ok: true, debug: true, filasCount: filas.length,
        stores: [...new Set(filas.map(f => f && f.store_name))],
      });
    }
    // 2) Filtrar al depósito pedido (por nombre, tolerante)
    const target = filas.filter(f => String(f.store_name || '').toLowerCase().includes(store));
    const nombreDep = body.store || 'Deposito Minorista';
    // Sin renglones en ese depósito no hay nada que escribir, y eso NO es un éxito: es el
    // producto que ya no está en GN, o el espejo desactualizado. Contestarlo `ok: true`
    // hacía que la pantalla dijera "guardado", limpiara el pendiente y pintara el valor
    // sin que se hubiera escrito nada — el clásico "lo cargué y se revirtió solo".
    if (!target.length) return res.status(200).json({ ok: false, productId, updated: 0, total: 0, error: `sin variantes en "${nombreDep}" — probá "Traer de GN"` });
    const total = target.length;
    const want = (obs || '');                     // valor esperado tras escribir (null → '')
    const sameObs = v => (v == null ? '' : String(v)).trim() === want;

    // 3) Escribir y VERIFICAR: en cada pase, PATCH solo las variantes que aún no tienen el valor,
    //    luego re-leer y reintentar las que faltan. GN hace rate-limit con muchas variantes seguidas,
    //    así que cada pase reintenta solo las pendientes hasta que entren todas (máx 4 pases).
    //
    // El pase 1 arranca SALTEANDO las que ya tienen el valor. La carga es por producto, pero
    // GN guarda la observación por renglón de inventario y no existe endpoint por product_id
    // (documentación de gestion.moda): las llamadas las hace este handler, una por variante,
    // con pausa para no comerse el límite de 60/min. Escribir las 108 variantes de VIBE CASE
    // cuando 107 ya decían lo mismo no entraba en el tope de duración de la función, y cada
    // reintento volvía a empezar de cero. Ahora re-guardar lo que ya está bien cuesta 0
    // escrituras, y si un producto grande se corta por tiempo, el reintento sigue donde quedó.
    let pend = target.filter(f => !sameObs(f.observation)); // pendientes de este pase (filas con inventory_id)
    const yaEstaban = total - pend.length;
    let lastErr = '';
    for (let pase = 1; pase <= 4 && pend.length; pase++) {
      const errInv = [];
      for (const f of pend) {
        try {
          const rP = await gnFetch(`${GN_BASE}/inventario/${f.inventory_id}/observacion`, {
            method: 'PATCH', headers, body: JSON.stringify({ observation: obs }),
          });
          if (!rP.ok) { const t = await rP.text(); errInv.push(f.inventory_id); lastErr = `HTTP ${rP.status}: ${t.slice(0, 120)}`; }
        } catch (e) { errInv.push(f.inventory_id); lastErr = e.message; }
        await sleep(300);
      }
      // Re-leer el producto y quedarnos solo con las variantes de Minorista que NO tienen el valor todavía.
      await sleep(600);
      try {
        const rV = await gnFetch(`${GN_BASE}/inventario/${productId}`, { headers });
        const dV = await rV.json();
        if (rV.ok) {
          const filasV = (dV.variantes || []).flatMap(v => (v.stock_por_tienda || []).map(s => ({ ...s, size_name: v.size_name })));
          pend = filasV.filter(f => String(f.store_name || '').toLowerCase().includes(store) && !sameObs(f.observation));
        } else {
          // si no podemos verificar, reintentar solo las que dieron error en el PATCH
          pend = pend.filter(f => errInv.includes(f.inventory_id));
        }
      } catch (e) {
        pend = pend.filter(f => errInv.includes(f.inventory_id));
      }
    }
    const pendientes = pend.length;
    // `updated` = variantes que quedaron con el valor puesto (escritas + las que ya lo tenían).
    return res.status(200).json({ ok: pendientes === 0, productId, updated: total - pendientes, total, yaEstaban, pendientes, error: pendientes ? (lastErr || 'algunas variantes no se pudieron escribir') : undefined });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
