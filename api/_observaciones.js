// Escribe la OBSERVACIÓN (ubicación física) del inventario en Gestión Nube Y en el ERP (motor sql/066),
// para TODAS las variantes de un producto en el depósito de la marca.
// 🔴 Desde el corte de la línea del producto (`erp_corte`) escribe SÓLO el ERP (Bruno 31-oct; docs/secciones/ubicaciones.md).
// POST { marca?, productId, observation }
//   - marca: 'bdi' (default, como era antes) | 'zattia' (sumada el 13-oct-2026, Darío).
//   - observation: string (se recorta a 20 chars) o vacío/null para limpiar.
// Seguridad: exige un usuario válido del Monitor con la sección Ubicaciones en ESA marca.
// Usa el token de GN de la marca (inventory:read + inventory:write) desde el entorno del servidor.
// 🔑 El depósito lo decide el servidor por la marca, ⛔ el pedido: así nadie escribe en otro depósito.
// GN: GET /inventario/{product_id} (trae las filas con inventory_id) +
//     PATCH /inventario/{inventory_id}/observacion { observation }.
import { exigirUsuario, soloMismoOrigen } from './_auth.js';
import { GN_TOKENS } from './_gn.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { lineaEnErp } from '../lib/erp/corte.core.js';
import { lineaDe } from '../lib/lineas.core.js';
import { conBase, cortesDe, lineasDeProductos } from './_erp-corte.js';

const GN_BASE = 'https://www.gestionnube.com/api/v1';
// El depósito de cada marca, con el nombre de GN. ⚠️ El de Zattia es 'Deposito ' (con espacio al
// final); se compara sin espacios de los costados. Es el de Lorena, ⛔ el de atrás del local.
const DEPOSITO = { bdi: 'Deposito Minorista', zattia: 'Deposito' };
// El mismo depósito con el nombre canónico del ERP (motor `lib/depositos.mjs`).
const DEPOSITO_ERP = { bdi: 'deposito_minorista', zattia: 'deposito' };
const enDeposito = (f, dep) => String(f.store_name || '').trim().toLowerCase() === dep.toLowerCase();

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

  // Escribe en el GN de producción con un token de inventory:write: sin usuario
  // válido no se sigue. Va antes de leer el body a propósito.
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const body = req.body || {};
  const marca = String(body.marca || 'bdi').toLowerCase();
  const dep = DEPOSITO[marca];
  if (!dep) return res.status(400).json({ error: 'marca inválida (bdi o zattia)' });
  if (!puedeVerAlguna(perfil, marca, ['ubicaciones'])) {
    return res.status(403).json({ error: 'Cargar ubicaciones pide la sección Ubicaciones en esta marca.' });
  }
  const TOKEN = GN_TOKENS[marca];
  if (!TOKEN) return res.status(500).json({ error: `Falta el token de GN de ${marca} en el entorno del servidor` });
  const productId = body.productId;
  const obs = (body.observation == null ? '' : String(body.observation)).trim().slice(0, 20) || null;
  if (!productId) return res.status(400).json({ error: 'Falta productId' });

  // 🔑 EL ERP (motor sql/066; erp-stunned §8.5, Bruno 31-oct): escritura DOBLE desde ya en todas las marcas, y desde el corte de
  // la línea del producto (`erp_corte`) SÓLO el ERP. Sin saber si la línea cortó ⛔ se elige camino (503, como los conteos).
  let erp;
  try {
    erp = await alErp({ marca, productId, obs, usuario: perfil.name || 'ubicaciones' });
  } catch (e) {
    return res.status(503).json({ error: `No se pudo saber si la línea ya está en el ERP: ${e instanceof Error ? e.message : String(e)}`, reintentable: true });
  }
  if (erp.enErp) {
    const r = erp.resultado;
    if (!r.ok) return res.status(200).json({ ok: false, productId, updated: 0, total: 0, error: `ERP: ${String(r.error.mensaje).replace(/\u26D4\s*/g, 'no ')}`, reintentable: r.error.codigo !== 'SIN_VARIANTES' });
    return res.status(200).json({ ok: true, productId, updated: r.variantes, total: r.variantes, yaEstaban: r.variantes - r.cambiadas, pendientes: 0, erp: { linea: erp.linea, soloErp: true } });
  }
  // Línea sin cortar: GN sigue siendo la verdad; si el ERP falló ⛔ frena (la copia del día antes del corte lo empareja).
  if (!erp.resultado.ok) console.error(`[ubicaciones] el ERP no guardó ${marca}/${productId}: ${erp.resultado.error.codigo} ${erp.resultado.error.mensaje}`);

  const headers = { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json', 'Content-Type': 'application/json' };

  try {
    // 1) Traer las filas de inventario del producto
    const rGet = await gnFetch(`${GN_BASE}/inventario/${productId}`, { headers });
    const dGet = await rGet.json();
    // 429/5xx = GN frenó por ráfaga (pasa al guardar muchos seguidos, 19-oct-2026 con Lorena):
    // se avisa `reintentable` para que la pantalla insista después de una pausa. Sin esto el
    // producto quedaba como error definitivo y no entraba en las rondas de reintento.
    if (!rGet.ok) return res.status(rGet.status).json({ error: 'No se pudo leer el inventario del producto', detalle: JSON.stringify(dGet).slice(0, 200), reintentable: rGet.status === 429 || rGet.status >= 500 });
    // GET /inventario/{id} → { variantes: [ { size_name, stock_por_tienda: [ {inventory_id, store_name, observation, ...} ] } ] }
    const filas = (dGet.variantes || []).flatMap(v =>
      (v.stock_por_tienda || []).map(s => ({ ...s, size_name: v.size_name })));
    if (body.debug) {
      return res.status(200).json({
        ok: true, debug: true, filasCount: filas.length,
        stores: [...new Set(filas.map(f => f && f.store_name))],
      });
    }
    // 2) Filtrar al depósito de la marca (por nombre, sin los espacios de los costados)
    const target = filas.filter(f => enDeposito(f, dep));
    const nombreDep = dep;
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
      // Re-leer el producto y quedarnos solo con las variantes del depósito que NO tienen el valor todavía.
      await sleep(600);
      try {
        const rV = await gnFetch(`${GN_BASE}/inventario/${productId}`, { headers });
        const dV = await rV.json();
        if (rV.ok) {
          const filasV = (dV.variantes || []).flatMap(v => (v.stock_por_tienda || []).map(s => ({ ...s, size_name: v.size_name })));
          pend = filasV.filter(f => enDeposito(f, dep) && !sameObs(f.observation));
        } else {
          // si no podemos verificar, reintentar solo las que dieron error en el PATCH
          pend = pend.filter(f => errInv.includes(f.inventory_id));
        }
      } catch {
        pend = pend.filter(f => errInv.includes(f.inventory_id));
      }
    }
    const pendientes = pend.length;
    // `updated` = variantes que quedaron con el valor puesto (escritas + las que ya lo tenían).
    return res.status(200).json({ ok: pendientes === 0, productId, updated: total - pendientes, total, yaEstaban, pendientes, erp: { linea: erp.linea, ok: erp.resultado.ok }, error: pendientes ? (lastErr || 'algunas variantes no se pudieron escribir') : undefined });
  } catch (e) {
    return res.status(500).json({ error: e.message, reintentable: true });
  }
}

/**
 * La parte ERP de una carga: la línea del producto (del espejo, ⛔ de la pantalla), si ya cortó, y la escritura en `ubicacion` con
 * las variantes del catálogo + las del espejo en ese depósito. Una falla de la ESCRITURA vuelve en `resultado` (el que llama
 * decide según el corte); una falla al leer el corte TIRA.
 */
async function alErp({ marca, productId, obs, usuario }) {
  return conBase(marca, async (db) => {
    const cortes = await cortesDe(db);
    const pid = Number(productId);
    const linea = (await lineasDeProductos(db, marca, [pid])).get(pid) ?? lineaDe(marca, null);
    const enErp = lineaEnErp(cortes, linea);
    let resultado;
    try {
      const { rows } = await db.query(
        'select distinct size_id from inventario where product_id = $1 and lower(btrim(store_name)) = lower($2)', [pid, DEPOSITO[marca]]);
      const { guardarUbicacion } = await import('../motor/stock/ubicacion.mjs');
      resultado = await guardarUbicacion(db, {
        linea, deposito: DEPOSITO_ERP[marca], product_id: pid, texto: obs || '', usuario, size_ids: rows.map((r) => Number(r.size_id)),
      });
    } catch (e) {
      resultado = { ok: false, error: { codigo: 'ERP_CAIDO', mensaje: e instanceof Error ? e.message : String(e) } };
    }
    return { linea, enErp, resultado };
  });
}
