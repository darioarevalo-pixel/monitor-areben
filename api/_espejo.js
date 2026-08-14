// El espejo de Gestión Nube servido con la clave de servicio: `inventario` y las tres vistas
// materializadas. Escalón 4 de la Fase S — lo último que quedaba abierto a la anon key.
//
//   POST { recurso:'espejo', store, tabla, params } → el cuerpo de PostgREST, tal cual
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO ES UN PASE Y NO UNA CONSULTA CON NOMBRE
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Las otras piezas de la Fase S (`_crm.js`, `_costos.js`) exponen una consulta concreta, porque
// tenían uno o dos lectores. Acá son **once**, medidos el 14-ago-2026: el ETL, Exhibición,
// Ubicaciones, Reposición, Caducados, Canjes, Integraciones (dos), Reclamos, el picker
// `BuscarArticuloGN` y el propio ETL para las vistas. Cada uno con su select y su filtro.
//
// 🔑 **Once handlers con nombre es once implementaciones que se van a desincronizar.** Como pase,
// los once siguen escribiendo su consulta donde ya la tenían y esto no vuelve a tocarse: el desvío
// vive en un solo lugar del lado del navegador (`pedir()` en `lib/supabase/rest.ts`), así que
// ninguno de los once call sites cambia una línea.
//
// 🔑 **Va página por página, igual que hoy.** `fetchAll` sigue paginando de a 1.000 con `limit` y
// `offset`, que viajan en `params` y se reenvían tal cual. El servidor nunca junta la tabla entera:
// `fundas_por_modelo_mes` son 2,28 MB y el techo de una respuesta de Vercel es 4,5 MB.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// LO QUE HACE QUE UN PASE SEA SEGURO
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Un pase con la clave de servicio es exactamente la forma que tenía `proxy.js`, que se borró el
// 13-ago-2026 por abierto (ver AGENTS.md). Tres candados lo separan de aquello:
//
// 1. **La tabla la elige el servidor, no el request.** `CATALOGO` es la lista blanca completa, y lo
//    que no está no se consulta. `ventas`, `clientes`, `productos` y `venta_detalles` —lo que
//    costó los escalones 1, 2 y 3— no entran por acá.
// 2. **`select` no puede tener paréntesis.** 🔴 Es el candado que importa: PostgREST trae tablas
//    vecinas con `select=sku,productos(unit_cost)`, y esa sintaxis **necesita** paréntesis. Sin
//    ellos, un select sólo puede nombrar columnas de la tabla pedida. La lista blanca de columnas
//    es el segundo cinturón, no el primero.
// 3. **Pide sesión.** `exigirUsuario` — que es todo el objetivo: hoy esto lo lee cualquiera sin
//    sesión, con la key que viaja en el bundle.
//
// 📌 **Sin gate por permiso, a propósito.** `allMonths` (`lib/etl/computar.ts:311`) se arma con los
// meses que traen las vistas, y lo leen Talles, Colores y Proveedores. Contestar vacío a quien no
// tiene el permiso de Ventas mensuales les borraría en silencio todo lo anterior a 16 meses. Y no
// hay nada acá que justifique el riesgo: es catálogo, stock por local y unidades por mes — sin
// plata y sin datos de personas. El que entró al Monitor lo puede leer.
import { exigirUsuario } from './_auth.js';

// Las cuatro cosas que se pueden pedir, con sus columnas. Sacadas del esquema real de las dos bases
// el 14-ago-2026 (`select=*` con la anon key), no de memoria.
//
// 📌 `fundas_por_modelo_mes` existe en las dos bases pero en Zattia está vacía: no vende fundas. El
// ETL ni la pide (`lib/datos.ts`), y si la pidiera devolvería 0 filas, no un error.
const CATALOGO = {
  inventario: ['product_id', 'product_name', 'size_id', 'size_name', 'store_name', 'available_quantity', 'sku', 'barcode', 'observation'],
  ventas_por_mes: ['mes', 'channel', 'cantidad_ventas', 'total_items', 'promedio_items_por_venta'],
  ventas_por_categoria_mes: ['mes', 'categoria', 'total_items'],
  fundas_por_modelo_mes: ['mes', 'modelo', 'product_id', 'product_name', 'product_created_at', 'total_items'],
};

// `select`, `order`, `limit`, `offset`, `or`, `and` y `not` tienen su propia revisión más abajo.
// **Todo lo demás tiene que ser una columna de la tabla**, y por eso `productos.unit_cost=gt.0` —la
// forma de filtrar por una tabla vecina— no llega nunca: el punto no entra en un nombre de columna.
const NOMBRE = /^[a-z_][a-z0-9_]*$/;

/**
 * Valida `params` contra la tabla. Devuelve el motivo del rechazo, o `null` si pasa.
 *
 * 🔑 **Se exporta para poder atacarla desde los tests sin levantar un handler.** Los casos que
 * cubre `tests/espejo-servidor.test.ts` son los reales: traer una tabla vecina, nombrar una tabla
 * que no está en el catálogo, y colar un `select` con paréntesis.
 */
export function revisarParams(tabla, params) {
  const columnas = CATALOGO[tabla];
  if (!columnas) return `tabla fuera del catálogo (usá ${Object.keys(CATALOGO).join(', ')})`;

  let q;
  try {
    q = new URLSearchParams(params || '');
  } catch {
    return 'params ilegible';
  }

  for (const [clave, valor] of q.entries()) {
    if (clave === 'select') {
      // 🔴 El candado principal. Un paréntesis en el select es, siempre, una tabla vecina.
      if (/[()]/.test(valor)) return 'select con paréntesis: no se traen tablas vecinas por acá';
      for (const bruto of valor.split(',')) {
        // `columna:alias` y `columna.op` no se usan en este repo; se rechazan por no estar.
        const col = bruto.trim();
        if (!NOMBRE.test(col)) return `select con una columna rara: ${col.slice(0, 40)}`;
        if (!columnas.includes(col)) return `columna fuera de ${tabla}: ${col}`;
      }
      continue;
    }

    if (clave === 'order') {
      for (const bruto of valor.split(',')) {
        const col = bruto.trim().split('.')[0];
        if (!columnas.includes(col)) return `order por una columna fuera de ${tabla}: ${col.slice(0, 40)}`;
      }
      continue;
    }

    if (clave === 'limit' || clave === 'offset') {
      if (!/^\d+$/.test(valor)) return `${clave} tiene que ser un número`;
      continue;
    }

    if (clave === 'or' || clave === 'and' || clave === 'not') {
      // `or=(sku.ilike.*x*,product_name.ilike.*x*)`: los paréntesis de afuera son la sintaxis; los
      // de adentro serían una tabla vecina.
      const adentro = valor.trim().replace(/^\(/, '').replace(/\)$/, '');
      if (/[()]/.test(adentro)) return `${clave} anidado: no se acepta`;
      for (const clausula of adentro.split(',')) {
        const col = clausula.trim().split('.')[0];
        if (!columnas.includes(col)) return `${clave} sobre una columna fuera de ${tabla}: ${col.slice(0, 40)}`;
      }
      continue;
    }

    // Lo que queda es un filtro por columna (`store_name=eq.Local`). El punto en la clave es la
    // forma de filtrar por una tabla vecina, y `NOMBRE` no lo deja pasar.
    if (!NOMBRE.test(clave) || !columnas.includes(clave)) return `filtro por una columna fuera de ${tabla}: ${clave.slice(0, 40)}`;
  }

  return null;
}

function cfgFor(store) {
  if (store === 'zattia') {
    return {
      url: process.env.ZATTIA_SUPABASE_URL,
      key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY,
    };
  }
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const b = req.body || {};
  const store = String(b.store || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  const tabla = String(b.tabla || '');
  const params = String(b.params || '');
  const mal = revisarParams(tabla, params);
  if (mal) return res.status(400).json({ error: mal });

  const cfg = cfgFor(store);
  if (!cfg.key) return res.status(500).json({ error: `Falta la clave de Supabase de ${store} en el entorno.` });

  try {
    const r = await fetch(`${cfg.url}/rest/v1/${tabla}?${params}`, {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        // El total lo pide siempre `sbFetchWithCount`, que es la primera página de cada `fetchAll`.
        // Pedirlo de más no cuesta: PostgREST lo devuelve en el mismo viaje.
        Prefer: 'count=exact',
      },
    });
    const texto = await r.text();

    // El cuerpo va **tal cual**, sin volver a parsearlo: quien llama es `sbFetch`, que espera lo
    // que devuelve PostgREST. Parsear y re-serializar un MB acá no agrega nada y cuesta.
    const rango = r.headers.get('content-range');
    if (rango) res.setHeader('Content-Range', rango);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(r.status).send(texto);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
