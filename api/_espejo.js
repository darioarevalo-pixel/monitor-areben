// El espejo de Gestión Nube servido con la clave de servicio. Nació en el escalón 4 de la Fase S
// con `inventario` y las tres vistas materializadas; el escalón 5 (16-ago-2026) le sumó `ventas`,
// `venta_detalles`, `productos` y `variante_color_manual`, que era todo lo que le quedaba por leer
// a la anon key. ⇒ **hoy el navegador no le pide una sola fila a Supabase con esa key.**
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
//    que no está no se consulta. `clientes` no entra por acá, y de `ventas`, `venta_detalles` y
//    `productos` entran sólo las columnas sin plata ni PII: lo que costaron los escalones 1, 2 y 3
//    —el padrón, la facturación por renglón y los costos— sigue saliendo por puertas con permiso.
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
// hay nada acá que justifique el riesgo: es catálogo, stock por local, unidades por mes y la
// cabecera de cada venta —fecha y canal, sin monto— sin costos, sin margen y sin datos de personas.
// El único precio que viaja es el de vidriera. El que entró al Monitor lo puede leer.
//
// 🔑 **Ese párrafo es el contrato del `CATALOGO`, no un comentario.** El día que una columna nueva
// lo vuelva falso, la salida no es agregarla igual: es que esa columna vaya por una puerta con
// nombre y con permiso, como hizo el CRM con `total_price` en el escalón 5.
import { exigirUsuario } from './_auth.js';

// Lo que se puede pedir, con sus columnas. Sacadas del esquema real de las dos bases (`select=*`
// con la anon key el 14-ago-2026; las del escalón 5, con `information_schema` el 16), no de memoria.
//
// ⛔ **Esta lista es un TECHO, no una descripción.** Una columna entra sólo si un lector del
// navegador la pide hoy. Del otro lado hay clave de SERVICIO: agregar una "por las dudas" es
// abrirla para cualquiera con sesión, sin permiso de por medio. Medido el 16-ago-2026, lo que se
// cierra gratis por no estar en ningún select: `ventas.number/store/payment_method/items_sold/
// sale_type_id` y `venta_detalles.product_name`.
//
// 🔴 **Y por eso la plata del CRM no está acá**: `ventas.total_price`, `client_id` y `sale_state`
// los lee sólo `lib/crm/datos.ts` y van por `api/_crm.js`, que sí pide el permiso de Clientes. Si
// entraran acá, cualquier usuario con sesión se bajaría la facturación entera.
//
// 📌 `retailer_price` sí entra: es el precio de vidriera, el mismo que ve cualquiera que abra la
// tienda. Cerrarlo no protege nada y rompe el picker, Liquidación y media analítica.
// 📌 Asimetrías entre marcas, a propósito: `fundas_por_modelo_mes` está vacía en Zattia (no vende
// fundas), `productos.proveedor` sólo existe en Zattia, `ventas.channel_id` sólo en BDI, y
// `variante_color_manual` no existe en BDI —su único lector ya la pide con `.catch(() => [])`—.
// Pedir una columna que no existe da 400 de PostgREST, que es lo que ya pasaba antes del desvío.
const CATALOGO = {
  inventario: ['product_id', 'product_name', 'size_id', 'size_name', 'store_name', 'available_quantity', 'sku', 'barcode', 'observation'],
  ventas_por_mes: ['mes', 'channel', 'cantidad_ventas', 'total_items', 'promedio_items_por_venta'],
  ventas_por_categoria_mes: ['mes', 'categoria', 'total_items'],
  fundas_por_modelo_mes: ['mes', 'modelo', 'product_id', 'product_name', 'product_created_at', 'total_items'],
  // ── Escalón 5: lo último que leía la anon key. ────────────────────────────────────────────────
  ventas: ['id', 'date_sale', 'channel', 'channel_id'],
  venta_detalles: ['sale_id', 'product_id', 'size_id', 'size', 'quantity'],
  productos: ['id', 'name', 'category', 'sku', 'proveedor', 'retailer_price', 'created_at', 'active'],
  variante_color_manual: ['product_name', 'color'],
  // 📌 El reloj de los syncs: dos o tres filas con una clave y una fecha, sin una sola columna de
  // negocio. Entra porque Reposición necesita poder decir «Actualizado: <hora del sync>» en vez de
  // la hora en que el navegador leyó, que es lo que hacía y por eso un espejo de ayer se veía
  // fresco. No tiene sentido darle puerta propia con permiso: es la misma fecha que ya se muestra
  // en Liquidación y en Ventas diarias, y quien la ve ya está adentro del Monitor.
  sync_state: ['clave', 'updated_at'],
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
