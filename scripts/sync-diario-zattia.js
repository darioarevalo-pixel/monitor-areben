import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { leerEstado, guardarEstado } from './lib/sync-state.mjs';
import { DIAS_REPASO, fechaDesdeRepaso, purgarVentas, purgarDetalles } from './lib/purga-ventas.mjs';
import { guardarVentasBatch } from './lib/ventas-espejo.mjs';
import { refrescarVistas } from './lib/refrescar-vistas.mjs';
import { esRateLimit, esperaRateLimit, MAX_RATE_LIMIT } from './lib/gn-rate-limit.mjs';

/** Ver el comentario gemelo en sync-diario.js: lo que falló sin frenar el sync. */
const problemas = [];

// Zattia es otra base: su propia fila en sync_state, con la misma clave 'diario'.
const SYNC_KEY = 'diario';

function loadEnv() {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* usa variables del sistema */ }
}

loadEnv();

const SUPABASE_URL = process.env.ZATTIA_SUPABASE_URL;
const SUPABASE_KEY = process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY;
const GN_TOKEN     = process.env.GN_TOKEN_ZATTIA;
const GN_BASE      = 'https://www.gestionnube.com/api/v1';
if (!SUPABASE_URL || !SUPABASE_KEY || !GN_TOKEN) {
  console.error('Faltan variables de entorno: ZATTIA_SUPABASE_URL, ZATTIA_SUPABASE_KEY, GN_TOKEN_ZATTIA');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function gnFetch(path, retries = 4) {
  const url = `${GN_BASE}/${path}`;
  // Presupuesto aparte para el corte por límite de solicitudes (ver gn-rate-limit.mjs).
  let cortes = 0;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${GN_TOKEN}`, 'Accept': 'application/json' }
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      if (attempt < retries) {
        process.stdout.write(` [retry ${attempt}/${retries - 1}]`);
        await sleep(3000 * attempt);
        continue;
      }
      throw new Error(`Respuesta no-JSON [${res.status}] en ${path}: ${text.substring(0, 200)}`);
    }
    if (!res.ok) {
      if (esRateLimit(res, data) && cortes < MAX_RATE_LIMIT) {
        cortes++;
        const wait = esperaRateLimit(res, cortes);
        console.warn(`\n  ⏳ GN cortó por límite de solicitudes en ${path}. Esperando ${Math.round(wait / 1000)}s (${cortes}/${MAX_RATE_LIMIT})...`);
        await sleep(wait);
        attempt--; // el corte no gasta el presupuesto de reintentos de arriba
        continue;
      }
      if (res.status >= 500 && attempt < retries) {
        process.stdout.write(` [retry ${attempt}/${retries - 1} status ${res.status}]`);
        await sleep(3000 * attempt);
        continue;
      }
      throw new Error(data.message || data.error || `Error ${res.status} en ${path}`);
    }
    return data;
  }
}

async function fetchAllPages(basePath) {
  const results = [];
  let page = 1;
  while (true) {
    const sep = basePath.includes('?') ? '&' : '?';
    process.stdout.write(`  página ${page}...`);
    const data = await gnFetch(`${basePath}${sep}page=${page}`);
    const items = data.data || [];
    results.push(...items);
    process.stdout.write(` ${items.length} registros\n`);
    if (!data.meta?.has_more_pages || items.length === 0) break;
    page++;
    await sleep(400);
  }
  return results;
}

// ── Sync functions ────────────────────────────────────────────────────────────


// Desactiva en el espejo los productos que GN ya no devuelve (borrados/inactivos), salvo los muy nuevos.
async function desactivarBorrados(gnIds) {
  const { data: activos, error } = await supabase.from('productos').select('id, created_at').eq('active', true);
  if (error || !activos) { if (error) console.warn('[limpieza] no se pudo leer activos:', error.message); return; }
  const CORTE = Date.now() - 2 * 24 * 60 * 60 * 1000; // no tocar los creados hace < 2 días (pueden estar indexándose en GN)
  const aDesactivar = activos.filter(p => !gnIds.has(p.id) && (!p.created_at || new Date(p.created_at).getTime() < CORTE)).map(p => p.id);
  if (!aDesactivar.length) { console.log('[limpieza] sin productos borrados para desactivar.'); return; }
  const BATCH = 200;
  for (let i = 0; i < aDesactivar.length; i += BATCH) {
    const { error: e2 } = await supabase.from('productos').update({ active: false }).in('id', aDesactivar.slice(i, i + BATCH));
    if (e2) { console.warn('[limpieza] error:', e2.message); break; }
  }
  console.log(`[limpieza] ${aDesactivar.length} producto(s) borrados en GN → marcados inactivos.`);
}

// Descarga productos CON variantes y arma los mapas. Se corre SIEMPRE (aunque los
// productos no se guarden ese día) porque el inventario los necesita para completar
// el código de barras y para saber cuáles están activos.
async function cargarProductos() {
  console.log('\n[productos] Descargando (con variantes)...');
  const rows = await fetchAllPages('productos/obtener?include_variants=1&per_page=200');
  const gnIds = new Set(rows.map(p => p.id));
  // SOLO los explícitamente inactivos, mismo criterio que scripts/sync-inventario-solo.js:73.
  // Antes era un set de activos, y todo lo que GN devolvía SIN el campo `active` — típicamente un
  // producto recién cargado — perdía también sus filas de inventario. Nuevo ≠ inactivo.
  const inactiveIds = new Set();
  const varBarcode = {};         // `${pid}|${sid}` -> barcode (completa inventario)
  const prodSku = {};            // pid -> sku (respaldo)
  const productos = rows.map(p => {
    if (p.active === 0 || p.active === false) inactiveIds.add(p.id);
    if (p.sku || p.code) prodSku[p.id] = p.sku || p.code;
    (p.variantes || []).forEach(v => { if (v.barcode) varBarcode[`${p.id}|${v.size_id}`] = v.barcode; });
    return {
      id:               p.id,
      name:             p.name,
      sku:              p.sku || p.code || null,
      category:         p.category || null,
      proveedor:        p.provider || null,
      retailer_price:   p.retailer_price ?? null,
      wholesaler_price: p.wholesaler_price ?? null,
      unit_cost:        p.unit_cost ?? null,
      active:           p.active ?? null,
      created_at:       p.created_at || null,
      updated_at:       p.updated_at || null,
    };
  });
  console.log(`[productos] ${productos.length} descargados (${inactiveIds.size} inactivos).`);
  // prodSku robusto: sumar el sku que ya está en el espejo (evita el parpadeo del fetch con productos nuevos)
  //
  // Va a `problemas[]` como todo paso que falla sin frenar el sync, así el job termina
  // en rojo y el Monitor lo muestra. Era `try { ... } catch (e) {}`, y el `catch` no
  // servía para nada: supabase-js NO lanza cuando la query falla, devuelve `{ error }`
  // — que nadie miraba. Con la base cortando por statement timeout, `data` venía null,
  // el enriquecido no ocurría, y el sync seguía mapeando los SKU con lo que trajo GN
  // nomás. Es el mismo modo de falla que tuvo las vistas materializadas rotas una
  // semana con el job en verde.
  try {
    const { data, error } = await supabase.from('productos').select('id, sku');
    if (error) problemas.push(`SKU del espejo: ${error.message} (los productos nuevos pueden quedar sin sku)`);
    (data || []).forEach(p => { if (p.sku && !prodSku[p.id]) prodSku[p.id] = p.sku; });
  } catch (e) {
    problemas.push(`SKU del espejo: ${e.message} (los productos nuevos pueden quedar sin sku)`);
  }
  await desactivarBorrados(gnIds);
  return { inactiveIds, varBarcode, prodSku, productos };
}

async function guardarProductos(productos) {
  console.log('[productos] Guardando en Supabase...');
  if (!productos.length) return 0;
  const BATCH = 500;
  for (let i = 0; i < productos.length; i += BATCH) {
    const lote = productos.slice(i, i + BATCH);
    process.stdout.write(`  upsert ${i + lote.length}/${productos.length}...\r`);
    const { error } = await supabase.from('productos').upsert(lote, { onConflict: 'id' });
    if (error) throw new Error(`Error guardando productos (lote ${i}): ${error.message}`);
  }
  process.stdout.write('\n');
  console.log(`[productos] OK`);
  return productos.length;
}

async function syncInventario(maps) {
  const { inactiveIds, varBarcode, prodSku } = maps;
  console.log('\n[inventario] Descargando (siempre completo)...');
  const rows = await fetchAllPages('inventario/obtener?per_page=200');

  // Dedup + saltear inactivos + completar sku/barcode desde productos.
  const invMap = {};
  let saltInactivos = 0;
  rows.forEach(r => {
    if (inactiveIds.has(r.product_id)) { saltInactivos++; return; } // no cargar stock de inactivos
    const skey = `${r.product_id}|${r.size_id}`;
    const key = `${r.product_id}|${r.size_id}|${r.store_name || r.store || ''}`;
    if (!invMap[key]) {
      invMap[key] = {
        product_id:         r.product_id,
        product_name:       r.product_name || null,
        size_id:            r.size_id,
        size_name:          r.size_name || null,
        store_name:         r.store_name || r.store || '',
        available_quantity: r.available_quantity ?? r.quantity ?? 0,
        sku:                r.sku || prodSku[r.product_id] || null,
        barcode:            r.barcode || varBarcode[skey] || null, // código REAL de GN (feed de inventario o variante)
      };
    } else {
      invMap[key].available_quantity += r.available_quantity ?? r.quantity ?? 0;
    }
  });

  const inventario = Object.values(invMap);
  console.log(`[inventario] ${inventario.length} registros de activos (${saltInactivos} filas de inactivos salteadas). Guardando...`);
  if (!inventario.length) return 0;
  let { error } = await supabase.from('inventario').upsert(inventario, { onConflict: 'product_id,size_id,store_name' });
  if (error && /sku|barcode|column/i.test(error.message)) {
    console.warn(`  ⚠️  columnas sku/barcode no existen aún, guardando sin ellas (${error.message})`);
    const reducido = inventario.map(({ sku, barcode, ...rest }) => rest);
    ({ error } = await supabase.from('inventario').upsert(reducido, { onConflict: 'product_id,size_id,store_name' }));
  }
  if (error) throw new Error(`Error guardando inventario: ${error.message}`);
  console.log(`[inventario] OK`);

  // Limpieza: el espejo de inventario debe reflejar exactamente lo que GN devuelve para
  // productos activos (= el set `inventario` recién armado). Cualquier fila del espejo que
  // no esté en ese set quedó colgada y fantasmea en Exhibición (que no filtra por activo):
  //   1) variante borrada en GN de un producto que sigue vivo (ej: un color),
  //   2) producto dado de baja (inactivo) con stock viejo,
  //   3) producto que GN ya no devuelve.
  // Seguro: fetchAllPages corta con error si GN falla (no hay descargas a medias), y hay un
  // tope del 30% como red de seguridad ante una respuesta rara de GN.
  try {
    const gnKeys = new Set(inventario.map(x => `${x.product_id}|${x.size_id}|${x.store_name}`));
    const espejo = [];
    for (let desde = 0; ; desde += 1000) { // paginado: la tabla supera el tope de 1000 filas
      const { data, error: e } = await supabase
        .from('inventario')
        .select('product_id,size_id,store_name')
        .range(desde, desde + 999);
      if (e) throw new Error(e.message);
      espejo.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const aBorrar = espejo.filter(r => !gnKeys.has(`${r.product_id}|${r.size_id}|${r.store_name}`));
    if (aBorrar.length > espejo.length * 0.3) {
      console.warn(`[inventario] limpieza ABORTADA por seguridad: borraría ${aBorrar.length}/${espejo.length} filas (>30%). Revisar a mano.`);
    } else {
      let borradas = 0;
      for (const r of aBorrar) {
        const { error: de } = await supabase
          .from('inventario')
          .delete()
          .match({ product_id: r.product_id, size_id: r.size_id, store_name: r.store_name });
        if (de) console.warn(`  ⚠️  no se pudo borrar ${r.product_id}|${r.size_id}|${r.store_name}: ${de.message}`);
        else borradas++;
      }
      console.log(`[inventario] limpieza: ${borradas} fila(s) que GN ya no tiene → borradas.`);
    }
  } catch (e) {
    console.warn(`[inventario] limpieza omitida por error: ${e.message}`);
    problemas.push(`limpieza de inventario: ${e.message}`);
  }

  return inventario.length;
}

async function syncVentas(fromDate) {
  const today = new Date().toISOString().substring(0, 10);

  // Mismo criterio que BDI: se releen SIEMPRE los últimos DIAS_REPASO días para que
  // estado, importe y renglones dejen de quedar congelados en la foto del primer día.
  const repasoDesde = fechaDesdeRepaso();
  const desde = fromDate < repasoDesde ? fromDate : repasoDesde;

  const basePath = `ventas/obtener?from=${desde}&to=${today}&include_details=1&per_page=50`;
  console.log(`\n[ventas] Descargando desde ${desde} hasta ${today} (repaso de ${DIAS_REPASO} días)...`);
  const rows = await fetchAllPages(basePath);

  // Mapeo y guardado compartidos con BDI (scripts/lib/ventas-espejo.mjs).
  // `completo: false` = solo las 9 columnas que la tabla de Zattia tiene hoy; le faltan
  // cliente, costo, ganancia y unidades, y por eso esta marca no tiene CRM ni márgenes.
  // Cuando se agreguen las columnas, esto pasa a `true` y hereda todo.
  const guardado = await guardarVentasBatch(supabase, rows, { completo: false });
  console.log(`[ventas] ${guardado.ventas} ventas (de ${rows.length} raw), ${guardado.detalles} detalles guardados.`);

  // Purga DESPUÉS del upsert (ver scripts/lib/purga-ventas.mjs: una venta que cambió de
  // fecha se vería como desaparecida si se mirara antes).
  const resultado = { ventas: guardado.ventas, detalles: guardado.detalles };
  try {
    const idsGN = new Set();
    const detallesPorVenta = new Map();
    for (const v of rows) {
      if ((v.date_sale || '') < repasoDesde) continue; // el tramo viejo no se recorrió entero
      idsGN.add(v.id);
      const set = detallesPorVenta.get(v.id) || new Set();
      for (const d of v.detalles || []) set.add(d.id);
      detallesPorVenta.set(v.id, set);
    }
    resultado.ventasBorradas   = await purgarVentas(supabase, idsGN, repasoDesde, today);
    resultado.detallesBorrados = await purgarDetalles(supabase, detallesPorVenta);
  } catch (e) {
    console.warn(`[ventas] purga omitida por error: ${e.message}`);
    problemas.push(`purga de ventas: ${e.message}`);
  }

  console.log(`[ventas] OK`);
  return resultado;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const today = new Date().toISOString().substring(0, 10);
  const lastSync = await leerEstado(supabase, SYNC_KEY);

  console.log('=== Sincronización diaria — Zattia ===');
  console.log(`Supabase:            ${SUPABASE_URL}`);
  console.log(`Fecha actual:        ${today}`);
  console.log(`Último sync ventas:  ${lastSync.ventasDate || 'nunca'}`);
  console.log(`Último sync prods:   ${lastSync.productosDate || 'nunca'}`);

  // Ventas: desde el último sync (o 2025-01-01 si nunca se corrió)
  const ventasFrom = lastSync.ventasDate || '2025-01-01';

  // Productos: se guardan TODOS los días. Antes había un candado de 7 días acá, y como el
  // inventario sí se escribía a diario, quedaban filas de stock cuyo producto no existía en la
  // tabla `productos` — y el Monitor las descartaba al cruzarlas. Sacar el candado NO suma
  // llamadas a Gestión Nube: los productos ya se descargaban todos los días
  // (`cargarProductos()` corre siempre); lo único frenado era el upsert a Supabase.

  try {
    const maps       = await cargarProductos();     // siempre (para completar barcode + saltear inactivos)
    const inventario = await syncInventario(maps);
    const ventas     = await syncVentas(ventasFrom);
    const productos  = await guardarProductos(maps.productos);

    if (!(await guardarEstado(supabase, SYNC_KEY, { ventasDate: today, productosDate: today }))) {
      problemas.push('no se pudo guardar sync_state');
    }

    // Zattia NO refrescaba las vistas: el paso no existía en este script, así que
    // Ventas mensuales de esta marca mostraba lo que hubiera quedado del último
    // refresco a mano. Ahora corre igual que BDI.
    console.log('\n[vistas] Refrescando vistas materializadas...');
    const vistas = await refrescarVistas(supabase);
    for (const f of vistas.fallaron) problemas.push(`vista ${f.vista}: ${f.error}`);

    console.log('\n=== Resultado ===');
    console.log(`Inventario:     ${inventario}`);
    console.log(`Ventas:         ${ventas.ventas} (${ventas.ventasBorradas ?? 0} borradas)`);
    console.log(`Venta detalles: ${ventas.detalles} (${ventas.detallesBorrados ?? 0} borrados)`);
    console.log(`Productos:      ${productos}`);
    console.log(`Vistas:         ${vistas.ok.length}/${vistas.ok.length + vistas.fallaron.length} al día${vistas.legacy ? ' (por refresh_all_views)' : ''}`);

    if (problemas.length) {
      console.error(`\n⚠️  Sincronización terminada CON PROBLEMAS (${problemas.length}):`);
      for (const p of problemas) console.error(`  - ${p}`);
      console.error('\nLos datos crudos se bajaron igual. Revisar lo de arriba.');
      process.exit(1);
    }

    console.log('\nSincronización completada.');
  } catch (e) {
    console.error('\nERROR:', e.message);
    process.exit(1);
  }
}

main();
