import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { leerEstado, guardarEstado } from './lib/sync-state.mjs';
import { DIAS_REPASO, fechaDesdeRepaso, purgarVentas, purgarDetalles } from './lib/purga-ventas.mjs';
import { guardarVentasBatch } from './lib/ventas-espejo.mjs';
import { refrescarVistas } from './lib/refrescar-vistas.mjs';
import { crearClienteGN } from './lib/gn-fetch.mjs';
import { revisarCostos, sinCostoSiNoSeVe } from './lib/costos-espejo.mjs';

/**
 * Lo que salió mal SIN frenar el sync (una purga, el refresco de vistas, el
 * estado). Al final decide el código de salida.
 *
 * POR QUÉ: estos pasos se escribían con `console.warn` y el proceso terminaba en
 * 0, así que el workflow de GitHub quedaba VERDE con el refresco de vistas roto
 * adentro. Estuvo así una semana. Si el job termina en rojo, el Monitor lo
 * muestra solo: el cartel de "última actualización" lee el `conclusion` del
 * último run (lib/datos.ts → fetchUltimoSync).
 */
const problemas = [];

// Identifica esta fila en sync_state. BDI y Zattia son bases distintas, así que
// alcanza con 'diario'; si algún día hay más de un sync por base, se distinguen acá.
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const GN_TOKEN    = process.env.GN_TOKEN;
if (!SUPABASE_URL || !SUPABASE_KEY || !GN_TOKEN) {
  console.error('Faltan variables de entorno: SUPABASE_URL, SUPABASE_KEY, GN_TOKEN');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────


// Cliente de GN compartido (scripts/lib/gn-fetch.mjs): esta era la copia BUENA —la única con
// reintento de errores de red— y es la que quedó como implementación única para las diez.
const { fetchAllPages, fetchAllPagesStreaming } = crearClienteGN({ token: GN_TOKEN, pausaPagina: 400 });

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
// productos no se guarden ese día): el inventario los necesita para completar el
// código de barras y para saber cuáles están activos.
async function cargarProductos() {
  console.log('\n[productos] Descargando (con variantes)...');
  const rows = await fetchAllPages('productos/obtener?include_variants=1&per_page=200');
  const gnIds = new Set(rows.map(p => p.id));
  // SOLO los explícitamente inactivos, mismo criterio que scripts/sync-inventario-solo.js:73.
  // Antes esto era al revés (un set de activos con `active === 1 || active === true`) y todo lo
  // que GN devolvía SIN el campo `active` — típicamente un producto recién cargado — perdía
  // también sus filas de inventario. Un producto nuevo no es un producto inactivo.
  const inactiveIds = new Set();
  const varBarcode = {};   // `${pid}|${sid}` -> barcode
  const prodSku = {};      // pid -> sku (respaldo)
  const productos = rows.map(p => {
    if (p.active === 0 || p.active === false) inactiveIds.add(p.id);
    if (p.sku || p.code) prodSku[p.id] = p.sku || p.code;
    (p.variantes || []).forEach(v => { if (v.barcode) varBarcode[`${p.id}|${v.size_id}`] = v.barcode; });
    return {
      id:               p.id,
      name:             p.name,
      sku:              p.sku || null,
      category:         p.category || null,
      retailer_price:   p.retailer_price ?? null,
      wholesaler_price: p.wholesaler_price ?? null,
      unit_cost:        p.unit_cost ?? null,
      active:           p.active ?? null,
      created_at:       p.created_at || null,
      updated_at:       p.updated_at || null,
    };
  });
  console.log(`[productos] ${productos.length} descargados (${inactiveIds.size} inactivos).`);

  // 🔴 El costo, antes de guardarlo. «No lo mandó NINGUNO» no es «estos productos no tienen costo»:
  // es un token sin `costs:read`, y `p.unit_cost ?? null` convertía una cosa en la otra sin un solo
  // error — 450 productos de BDI en NULL durante meses, con el job en VERDE. El detalle y el porqué
  // del criterio están en `scripts/lib/costos-espejo.mjs`.
  const costos = revisarCostos(rows);
  if (costos.problema) {
    console.error(`[productos] ⚠️  ${costos.problema}`);
    problemas.push(costos.problema);
  } else {
    console.log(`[productos] costo legible en ${costos.conCosto}/${costos.total}.`);
  }

  await desactivarBorrados(gnIds);
  return { inactiveIds, varBarcode, prodSku, productos: sinCostoSiNoSeVe(productos, costos.legible) };
}

async function guardarProductos(productos) {
  console.log('[productos] Guardando en Supabase...');
  if (!productos.length) return 0;
  const { error } = await supabase.from('productos').upsert(productos, { onConflict: 'id' });
  if (error) throw new Error(`Error guardando productos: ${error.message}`);
  console.log(`[productos] OK`);
  return productos.length;
}

async function syncInventario(maps) {
  const { inactiveIds, varBarcode, prodSku } = maps;
  console.log('\n[inventario] Descargando (siempre completo)...');
  const rows = await fetchAllPages('inventario/obtener?per_page=200');
  const seen = new Map();
  let saltInactivos = 0;
  for (const r of rows) {
    if (inactiveIds.has(r.product_id)) { saltInactivos++; continue; } // no cargar stock de inactivos
    const skey = `${r.product_id}|${r.size_id}`;
    const key = `${r.product_id}|${r.size_id}|${r.store_name || r.store || ''}`;
    seen.set(key, {
      product_id:         r.product_id,
      product_name:       r.product_name || null,
      size_id:            r.size_id,
      size_name:          r.size_name || null,
      store_name:         r.store_name || r.store || '',
      available_quantity: r.available_quantity ?? r.quantity ?? 0,
      sku:                r.sku || prodSku[r.product_id] || null,
      barcode:            r.barcode || varBarcode[skey] || null,
      observation:        r.observation ?? null,
    });
  }
  const inventario = Array.from(seen.values());
  console.log(`[inventario] ${inventario.length} registros de activos (${saltInactivos} filas de inactivos salteadas). Guardando...`);
  if (!inventario.length) return 0;
  let { error } = await supabase.from('inventario').upsert(inventario, { onConflict: 'product_id,size_id,store_name' });
  if (error && /sku|barcode|observation|column/i.test(error.message)) {
    console.warn(`  ⚠️  columnas opcionales no existen aún, guardando sin ellas (${error.message})`);
    const reducido = inventario.map(({ sku, barcode, observation, ...rest }) => rest);
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

// El mapeo, el dedupe y el guardado viven en scripts/lib/ventas-espejo.mjs: los
// compartimos con Zattia y con la purga histórica. Estaban copiados acá y la copia
// de Zattia se quedó atrás (9 columnas contra 19), que es por qué esa marca no tiene
// CRM ni márgenes.

async function syncVentas(fromDate) {
  const today = new Date().toISOString().substring(0, 10);

  // Se releen SIEMPRE los últimos DIAS_REPASO días, aunque el sync haya corrido ayer.
  // Sin esto, una venta entraba al espejo el día que se cargó y no se volvía a mirar:
  // el estado, el importe y el costo quedaban congelados en la foto del primer día, y
  // una venta anulada seguía sumando plata para siempre. Si el sync no corre por más
  // tiempo que la ventana, manda `fromDate` (el menor de los dos).
  const repasoDesde = fechaDesdeRepaso();
  const desde = fromDate < repasoDesde ? fromDate : repasoDesde;

  const basePath = `ventas/obtener?from=${desde}&to=${today}&include_details=1&per_page=50`;
  console.log(`\n[ventas] Descargando desde ${desde} hasta ${today} (repaso de ${DIAS_REPASO} días)...`);

  // Lo que GN devolvió, para poder borrar por diferencia una vez terminada la descarga.
  // Solo se guardan ids (livianos): con streaming las filas no quedan todas en memoria.
  const idsGN = new Set();
  const detallesPorVenta = new Map();

  const totales = { ventas: 0, detalles: 0, clientes: 0 };
  await fetchAllPagesStreaming(basePath, async (rows) => {
    for (const v of rows) {
      // Solo el tramo de repaso se purga; el tramo viejo (sync atrasado) se actualiza pero
      // no se borra, porque su rango no se recorrió entero.
      if ((v.date_sale || '') < repasoDesde) continue;
      idsGN.add(v.id);
      const set = detallesPorVenta.get(v.id) || new Set();
      for (const d of v.detalles || []) set.add(d.id);
      detallesPorVenta.set(v.id, set);
    }
    const r = await guardarVentasBatch(supabase, rows);
    console.log(`    ✓ ventas: ${r.ventas}, clientes: ${r.clientes}, detalles: ${r.detalles}`);
    totales.ventas   += r.ventas;
    totales.detalles += r.detalles;
    totales.clientes += r.clientes;
  });

  console.log(`[ventas] OK — total acumulado: ${totales.ventas} ventas, ${totales.detalles} detalles, ${totales.clientes} clientes`);

  // Purga DESPUÉS del upsert, nunca antes: si una venta cambió de fecha en GN, mirarla
  // antes la mostraría con la fecha vieja y la borraríamos por "desaparecida".
  try {
    totales.ventasBorradas   = await purgarVentas(supabase, idsGN, repasoDesde, today);
    totales.detallesBorrados = await purgarDetalles(supabase, detallesPorVenta);
  } catch (e) {
    console.warn(`[ventas] purga omitida por error: ${e.message}`);
    problemas.push(`purga de ventas: ${e.message}`);
  }

  return totales;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date().toISOString();
  const today = now.substring(0, 10);

  const lastSync = await leerEstado(supabase, SYNC_KEY);
  console.log('=== Sincronización diaria — Gestión Nube ===');
  console.log(`Fecha actual:        ${today}`);
  console.log(`Último sync ventas:  ${lastSync.ventasDate || 'nunca'}`);
  console.log(`Último sync prods:   ${lastSync.productosDate || 'nunca'}`);

  // Ventas: desde el último sync (o 2025-01-01 si nunca se corrió)
  const ventasFrom = lastSync.ventasDate || '2025-01-01';

  // Productos: se guardan TODOS los días. Antes había un candado de 7 días acá, y como el
  // inventario sí se escribía a diario, quedaban filas de stock cuyo producto no existía en la
  // tabla `productos` — y el Monitor las descartaba al cruzarlas. Un producto cargado en GN podía
  // tardar una semana en ser visible. Sacar el candado NO suma llamadas a Gestión Nube: los
  // productos ya se descargaban todos los días (`cargarProductos()` corre siempre); lo único que
  // estaba frenado era el upsert a Supabase.

  try {
    const maps       = await cargarProductos();     // siempre (para completar barcode + saltear inactivos)
    const inventario = await syncInventario(maps);
    const ventas     = await syncVentas(ventasFrom);
    const productos  = await guardarProductos(maps.productos);

    const newSync = {
      ventasDate:    today,
      productosDate: today,
    };
    if (!(await guardarEstado(supabase, SYNC_KEY, newSync))) {
      problemas.push('no se pudo guardar sync_state');
    }

    // Refrescar vistas materializadas: una llamada por vista (ver
    // scripts/lib/refrescar-vistas.mjs y sql/migrate-refresco-vistas.sql).
    console.log('\n[vistas] Refrescando vistas materializadas...');
    const vistas = await refrescarVistas(supabase);
    for (const f of vistas.fallaron) problemas.push(`vista ${f.vista}: ${f.error}`);

    console.log('\n=== Resultado ===');
    console.log(`Inventario:     ${inventario}`);
    console.log(`Ventas:         ${ventas.ventas} (${ventas.ventasBorradas ?? 0} borradas)`);
    console.log(`Venta detalles: ${ventas.detalles} (${ventas.detallesBorrados ?? 0} borrados)`);
    console.log(`Productos:      ${productos}`);
    console.log(`Vistas:         ${vistas.ok.length}/${vistas.ok.length + vistas.fallaron.length} al día${vistas.legacy ? ' (por refresh_all_views)' : ''}`);
    console.log(`\nSync guardado en sync_state (Supabase)`);

    // Los datos ya están bajados y guardados; lo que falló acá es accesorio. Pero
    // el job tiene que terminar en ROJO igual, o nadie se entera.
    if (problemas.length) {
      console.error(`\n⚠️  Sincronización terminada CON PROBLEMAS (${problemas.length}):`);
      for (const p of problemas) console.error(`  - ${p}`);
      console.error('\nLos datos crudos se bajaron igual. Revisar lo de arriba.');
      process.exit(1);
    }

    console.log('Sincronización diaria completada.');
  } catch (e) {
    console.error('\nERROR:', e.message);
    process.exit(1);
  }
}

main();
