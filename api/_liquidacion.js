// Liquidación — tablas `liquidaciones` y `liquidacion_items` (ver sql/migrate-liquidacion.sql).
//
//   GET  ?recurso=liquidacion&store=bdi|zattia            → las campañas, con sus conteos
//   GET  ?recurso=liquidacion&store=…&liq=<id>            → los ítems de una campaña
//   GET  ?recurso=liquidacion&store=…&liq=<id>&solo=pids  → qué pid ya está y en qué estado
//   GET  ?recurso=liquidacion&store=…&etiquetas=1         → las campañas con los precios PUESTOS
//   GET  ?recurso=liquidacion&store=…&etiquetas=1&liq=<id>→ los pid a etiquetar de esa campaña
//   GET  ?recurso=liquidacion&store=…&liq=<id>&bitacora=1 → la ida y vuelta de precios de la campaña
//   GET  ?recurso=liquidacion&store=…&vendido=1           → lo vendido CON la oferta puesta (Análisis)
//   POST { recurso:'liquidacion', store, action:'crear',       campania:{id,nombre,tipo,desde,hasta,nota} }
//   POST { recurso:'liquidacion', store, action:'renombrar',   id, nombre?, tipo?, desde?, hasta?, nota? }
//   POST { recurso:'liquidacion', store, action:'estado',      id, estado }
//   POST { recurso:'liquidacion', store, action:'sumar-items', id, items:[…] }
//   POST { recurso:'liquidacion', store, action:'guardar-item',id, item }
//   POST { recurso:'liquidacion', store, action:'estado-item', id, pid, estado }
//   POST { recurso:'liquidacion', store, action:'quitar-item', id, pid }
//   POST { recurso:'liquidacion', store, action:'sincronizar-ventas', id }
//   POST { recurso:'liquidacion', store, action:'ventas-campania', pids:[…], desde, hasta }
//   POST { recurso:'liquidacion', store, action:'borrar',      id }
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12 funciones
// por deploy y cada archivo de ruta cuenta una; hay 9 usadas y un archivo nuevo en `api/` frena
// todos los deploys **sin error visible**.
//
// ⚠️ **La lista de campañas NO baja los ítems.** Los conteos se arman con un `select` de dos
// columnas sobre `liquidacion_items` y se agrupan acá. Una campaña de cuarenta productos son
// cuarenta fotos congeladas con ventas, stock y costo: bajarlas todas para dibujar cinco renglones
// sería pagar el payload entero para mostrar un número.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { leerTodo } from '../lib/supabase/paginar.core.js';
import { esAdmin, puedeSub, puedeVerAlguna, SECCIONES_ANALISIS_VENTAS } from '../lib/permisos.core.js';
// El mapeo y el guardado del espejo de ventas, los MISMOS que usan los dos syncs diarios y la purga
// histórica. Se importa en vez de copiarse por lo que ya costó una vez: ese código vivía duplicado
// adentro de `sync-diario.js` y `sync-diario-zattia.js`, las copias se separaron, y de esa deriva
// salió que Zattia no tenga CRM ni márgenes (ver el encabezado de `ventas-espejo.mjs`).
// El `fetch` a GN, sus dos tokens y la pausa del rate limit. Salieron de acá el 18-ago-2026 porque
// los necesita también el botón de Ventas de Marketing; el porqué de que NO sea `crearClienteGN`
// está escrito allá.
import { dormir, GN_BASE, GN_TOKENS, gnFetch, PAUSA_GN } from './_gn.js';
import { traerVentasDeHoy } from './_ventas-hoy.js';
// La bitácora: qué precio se escribió en Gestión Nube y cuál se sacó. En `.core.js` porque este
// handler es el que la escribe y no puede importar TypeScript, y porque el backfill histórico
// (`scripts/backfill-liquidacion-bitacora.mjs`) arma la fila con el MISMO código que el registro
// vivo — si divergieran, la campaña de agosto quedaría anotada distinto que la de septiembre.
import { aEvento, filaBitacora, precioAnterior } from '../lib/liquidacion/bitacora.core.js';
// El cruce de la bitácora contra las ventas, para la marca de «vendido en sale» de Análisis. Mismo
// motivo de `.core.js` que arriba, y la MISMA implementación que usa la pantalla para no contar
// distinto de un lado y del otro.
import { lineasEnSale, primerDiaEnSale, ventanasDe } from '../lib/liquidacion/vendido.core.js';
// La cola de reetiquetado: la regla vive afuera para poder testearla y mutarla sin levantar el
// handler. Ver `lib/etiquetas/cola.core.js`.
import { armarCola } from '../lib/etiquetas/cola.core.js';
// El aviso de la portada: ofertas escritas en la tienda sin campaña viva que las justifique.
import { ofertasColgadas } from '../lib/liquidacion/colgadas.core.js';
// Qué clase de cambio de precio es la campaña: la lista de tipos válidos y su default.
import { TIPOS_CAMPANIA, tipoDe } from '../lib/liquidacion/tipo.core.js';

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

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS_CAMPANIA = ['borrador', 'en_curso', 'aplicada', 'cerrada'];
const ESTADOS_ITEM = ['pendiente', 'definido', 'confirmado', 'descartado', 'aplicado'];

// El tope de un "Mandar a liquidación". No es capricho: son N inserts en un request, y esta es la
// primera acción del módulo con costo O(N). Con la tabla de Análisis paginada de a 50, mandar 200
// productos de una es raro; el cartel lo dice en vez de recortar en silencio.
const TOPE_SUMAR = 200;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const txtOrNull = (v) => (v == null || v === '' ? null : String(v));

// ── Escribirle el precio a Gestión Nube ───────────────────────────────────────────────────────────
//
// El precio de liquidación rige en el local Y online, y **la conexión es GN → TN**: se escribe en
// Gestión Nube y GN lo propaga a Tienda Nube. Escribirlo derecho en TN es ir contra la corriente
// —el sync de GN lo pisa— aunque el token de TN pueda hacerlo.
// Cuántos productos por viaje. Lo fija el tope de GN, no el gusto: son 2 consultas por segundo, y
// con la pausa de 1200 ms cinco tardan ~7 s, que entra cómodo en el tiempo de una función. Espejo
// de `TOPE_APLICAR` en `lib/liquidacion/core.ts`.
const TOPE_APLICAR = 5;

// El masivo de precios no toca Gestión Nube —sólo escribe en nuestra base—, así que el tope no lo
// fija el rate limit sino el tamaño del payload: 50 ítems con su foto congelada.
const TOPE_MASIVO = 50;

// ── Traer las ventas de hoy al espejo ────────────────────────────────────────────────────────────
//

// Cuánto tiene que pasar entre dos sincronizadas de la misma campaña.
const ESPERA_SYNC_VENTAS = 60_000;

/** La fecha de Argentina (YYYY-MM-DD) de un instante dado. */
function fechaAR(ms) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

// El rango que se le pide a GN se mudó a `api/_ventas-hoy.js` junto con el bucle que lo usa. Se
// re-exporta para no romper a quien ya la importa de acá (`tests/liquidacion-sync-ventas.test.ts`).
export { ventanaVentasHoy } from './_ventas-hoy.js';

/**
 * Si el botón puede volver a correr. `ultimo` es el ISO de la sincronizada anterior.
 *
 * ⚠️ **El antirrebote es POR CAMPAÑA**, porque es donde vive el dato (`datos.ventasSync`): apretarlo
 * desde otra campaña de la misma marca no lo frena. Alcanza para lo que tiene que frenar —diez
 * toques seguidos al mismo botón— y decirlo acá es más honesto que insinuar un candado global que no
 * existe. Lo que sí queda afuera de todo candado es el `concurrency: gestion-nube` que comparten los
 * ocho workflows que hablan con GN: eso no lo puede ver una función de Vercel.
 *
 * Un `ultimo` ilegible deja pasar: el antirrebote es una comodidad, y trabar el botón por un dato
 * roto sería peor que sincronizar de más.
 */
export function puedeSincronizarVentas(ultimo, ahoraMs, esperaMs = ESPERA_SYNC_VENTAS) {
  if (!ultimo) return true;
  const t = Date.parse(ultimo);
  if (!Number.isFinite(t)) return true;
  return ahoraMs - t >= esperaMs;
}


/**
 * Cuántos ítems tiene cada campaña y en qué estado. **Una sola vez**: lo piden las dos ramas del
 * GET (la de Liquidación y la de Ventas de Marketing), y dos conteos del mismo hecho se despegan
 * en el estado que uno sume y el otro no — que es justo el número que dibuja la tarjeta.
 */
function conteosPorCampania(items) {
  const conteos = {};
  for (const it of items) {
    const k = conteos[it.liq_id] || (conteos[it.liq_id] = { total: 0, pendientes: 0, definidos: 0, confirmados: 0, descartados: 0, aplicados: 0 });
    k.total += 1;
    if (it.estado === 'pendiente') k.pendientes += 1;
    else if (it.estado === 'definido') k.definidos += 1;
    else if (it.estado === 'confirmado') k.confirmados += 1;
    else if (it.estado === 'descartado') k.descartados += 1;
    else if (it.estado === 'aplicado') k.aplicados += 1;
  }
  return conteos;
}

/**
 * El ítem sin la plata de costo, para la llave de Ventas de Marketing.
 *
 * 🔑 **Borra en vez de elegir qué copiar.** Una lista blanca de campos deja afuera lo que alguien
 * agregue después —la pantalla pierde un dato y nadie sabe por qué—; una lista negra deja pasar de
 * más sólo si alguien agrega un campo de costo NUEVO, que es un cambio que se nota al escribirlo.
 * ⚠️ Si aparece uno, va acá: `costo` es el motivo por el que esta sección era de Dirección.
 *
 * `sinCosto` se va con `costo` a propósito: es «el costo no vino de Gestión Nube», o sea información
 * sobre el costo. Y `margen`/`markup` porque se derivan de él.
 *
 * Se exporta para que el test la ejerza: es la única garantía de que el costo no sale por esa
 * puerta, y una garantía que sólo existe en un comentario ya se cayó una vez en este handler.
 */
export function sinPlataDeCosto(item) {
  const it = item || {};
  const { costo, sinCosto, ...foto } = it.foto || {};
  const { margen, markup, ...decision } = it.decision || {};
  return { ...it, foto, decision };
}

/** La fila de la base → la campaña que espera el cliente. `conteo` lo pega el llamador. */
function aCampania(row, conteo) {
  const d = row.datos || {};
  return {
    id: row.id,
    nombre: row.nombre,
    estado: row.estado,
    tipo: tipoDe(d),
    desde: d.desde || null,
    hasta: d.hasta || null,
    nota: d.nota || null,
    creadoPor: d.creadoPor || null,
    creado: d.creado || null,
    // Cuándo se trajeron por última vez las ventas del día al espejo, desde el botón de Resultado.
    // `null` es lo normal: la campaña se mide contra el sync diario y nadie apretó nada.
    ventasSync: d.ventasSync || null,
    conteo: conteo || { total: 0, pendientes: 0, definidos: 0, confirmados: 0, descartados: 0, aplicados: 0 },
  };
}

// ── La vista de Etiquetas ────────────────────────────────────────────────────────────────────────
//
// El local etiqueta el sale y no sabe qué prendas entran: la única lista de la campaña vive acá, en
// una sección de Análisis cuya foto congelada trae **costo, margen y ventas**. Por eso esta vista es
// de SOLO LECTURA y devuelve **nada más que el pid**: el precio de la etiqueta sale de Tienda Nube,
// igual que antes, así que la campaña sólo tiene que contestar *cuáles*.

// ⛔ **Sólo las campañas con los precios PUESTOS en la tienda.** Una en `borrador` tiene precios
// decididos que todavía no rigen: etiquetar desde ahí cuelga en la percha un precio que no existe.
// Una `cerrada` es un sale que terminó.
export const ESTADOS_CAMPANIA_VIVA = ['en_curso', 'aplicada'];

/**
 * Qué ítems se etiquetan. `aplicado` significa «su precio está puesto en GN **ahora**», que es
 * exactamente la pregunta que hace el local. Se le suman los `confirmado` cuando la campaña fue
 * marcada `aplicada`: ese es el caso de los precios cargados a mano en GN, donde el ítem nunca pasa
 * por el aplicador y quien los cargó es el único que puede decir que están puestos.
 */
export function pidsAEtiquetar(items, estadoCampania) {
  const vale = estadoCampania === 'aplicada'
    ? (e) => e === 'aplicado' || e === 'confirmado'
    : (e) => e === 'aplicado';
  return (items || []).filter((i) => vale(i.estado)).map((i) => i.pid);
}

/**
 * Normaliza un ítem que llega del cliente.
 *
 * ⛔ **Es lista blanca a propósito.** Guardar `req.body.item` tal cual deja que el navegador
 * escriba cualquier cosa en `datos jsonb` —incluido un `estado` que la pantalla nunca muestra— y
 * hace imposible saber qué hay adentro dentro de seis meses. Un campo nuevo se agrega acá o **no
 * viaja**, y eso se nota al primer intento en vez de perderse en silencio.
 */
function itemDelBody(raw) {
  if (!raw || !raw.pid) return null;
  const f = raw.foto || {};
  const d = raw.decision || {};
  const a = raw.aplicacion || {};
  const r = raw.revision || {};
  const estado = ESTADOS_ITEM.includes(raw.estado) ? raw.estado : 'pendiente';
  return {
    pid: String(raw.pid),
    estado,
    foto: {
      nombre: String(f.nombre || ''),
      sku: txtOrNull(f.sku),
      costo: num(f.costo),
      sinCosto: !!f.sinCosto,
      precioNormal: num(f.precioNormal),
      promoPrevia: f.promoPrevia == null ? null : num(f.promoPrevia),
      stock: num(f.stock),
      ventas7: num(f.ventas7),
      ventas30: num(f.ventas30),
      ventas90: num(f.ventas90),
      vidaUtil: f.vidaUtil == null ? null : num(f.vidaUtil),
      ultimaVenta: txtOrNull(f.ultimaVenta),
      diasSinVender: num(f.diasSinVender),
      imagen: txtOrNull(f.imagen),
    },
    decision: {
      precioSale: d.precioSale == null ? null : num(d.precioSale),
      pctDesc: d.pctDesc == null ? null : num(d.pctDesc),
      markup: d.markup == null ? null : num(d.markup),
      margen: d.margen == null ? null : num(d.margen),
      nota: txtOrNull(d.nota),
      porQuien: txtOrNull(d.porQuien),
      cuando: d.cuando == null ? null : num(d.cuando),
    },
    revision: {
      porQuien: txtOrNull(r.porQuien),
      cuando: r.cuando == null ? null : num(r.cuando),
      objecion: txtOrNull(r.objecion),
      precioAnterior: r.precioAnterior == null ? null : num(r.precioAnterior),
    },
    aplicacion: {
      aplicadoEn: a.aplicadoEn == null ? null : num(a.aplicadoEn),
      precioEscrito: a.precioEscrito == null ? null : num(a.precioEscrito),
      variantesEscritas: a.variantesEscritas == null ? null : num(a.variantesEscritas),
      categoriaSaleAgregada: !!a.categoriaSaleAgregada,
    },
  };
}

/**
 * Las ofertas que siguen escritas en Gestión Nube sin campaña viva que las justifique.
 *
 * La regla está afuera, en `lib/liquidacion/colgadas.core.js`, con el porqué de los tres motivos.
 * Acá va lo que hay que ir a buscar para poder aplicarla.
 *
 * 🔑 **El inventario se pide sólo por los pid que tienen una oferta escrita**, que son los de la
 * bitácora y no el catálogo: son un par de cientos, y la tabla entera son miles de filas por marca.
 *
 * 🔑 **La fecha es la de Argentina.** Vercel corre en UTC: con `toISOString()`, a las 21 de Buenos
 * Aires la vigencia de una campaña que termina hoy ya figuraría vencida.
 *
 * Que no se pueda leer esto no rompe la pantalla de campañas: se devuelve `null` y el aviso no sale.
 * Es un aviso arriba de la lista, no la lista.
 */
async function leerColgadas(supabase, store, campanias, items) {
  try {
    const filas = await leerTodo(supabase, 'liquidacion_bitacora', (q) =>
      q.select('pid, producto, sku, liq_id, liq_nombre, precio_a, cuando')
        .eq('store', store).order('cuando', { ascending: false }));

    // Uno por producto: el más nuevo. Lo que la tienda tiene puesto hoy es lo que dejó el último
    // movimiento, sin importar de qué campaña vino.
    const ultimo = new Map();
    for (const r of filas) if (!ultimo.has(String(r.pid))) ultimo.set(String(r.pid), r);

    const eventos = [...ultimo.values()]
      .filter((r) => r.precio_a != null)
      .map((r) => ({
        pid: String(r.pid),
        producto: String(r.producto || ''),
        sku: r.sku == null ? null : String(r.sku),
        liqId: String(r.liq_id),
        liqNombre: String(r.liq_nombre || ''),
        precioA: Number(r.precio_a),
        cuando: typeof r.cuando === 'string' ? r.cuando : new Date(r.cuando).toISOString(),
      }));
    if (!eventos.length) return { colgadas: [], conStock: 0, sinStock: 0 };

    const porId = {};
    for (const r of campanias) {
      porId[r.id] = { nombre: r.nombre, estado: r.estado, hasta: (r.datos || {}).hasta || null };
    }
    const aplicadosHoy = {};
    for (const it of items) if (it.estado === 'aplicado') aplicadosHoy[String(it.pid)] = true;

    const pids = eventos.map((e) => Number(e.pid)).filter((n) => Number.isInteger(n) && n > 0);
    const inv = await leerTodo(supabase, 'inventario', (q) =>
      q.select('product_id, available_quantity').in('product_id', pids).order('product_id'));
    const stock = {};
    for (const r of inv) {
      const k = String(r.product_id);
      stock[k] = (stock[k] || 0) + Number(r.available_quantity || 0);
    }

    return ofertasColgadas(eventos, porId, aplicadosHoy, stock, fechaAR(Date.now()));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const b = req.method === 'POST' ? (req.body || {}) : {};
  const store = String((req.method === 'POST' ? b.store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // El chequeo vive acá arriba y no se copia adentro de ningún `if`: duplicarlo es lo que dejó al
  // equipo sin ver el padrón de Canjes. `liquidacion.aplicar` es aparte y lo mira la tanda 3.
  //
  // 🔑 **La vista de Etiquetas abre esta puerta con OTRA llave, y sigue siendo un solo `puedeVer`.**
  // La sección que hay que poder ver se elige *antes* del chequeo, no con un segundo `if` que lo
  // saltee. Y exige `GET`, así que ninguna `action` del POST se alcanza jamás con el permiso de
  // Etiquetas: abajo, la rama corta con `return` antes de mirar el método.
  //
  // 🔑 **`puedeVerAlguna` y no `puedeVer` pelado**, que es lo que había acá: `puedeVer` no aplica
  // la cuenta fija. En el cliente no se nota —quien está clavado a una marca no la puede cambiar
  // en el header, así que nunca pregunta por la otra—, pero acá la `store` viene en el request:
  // con `puedeVer` alcanzaba con pedir `?store=bdi` desde una cuenta clavada a Zattia para leerse
  // los precios de sale de BDI. Medido en el padrón el 13-ago-2026: **cero usuarios** cambian de
  // alcance con esto (los 7 con cuenta fija no tienen `liquidacion` ni `etiquetas` en la otra
  // marca), así que cierra la puerta sin sacarle la pantalla a nadie.
  //
  // 🔑 **La tercera llave es la de Análisis, y por eso NO devuelve un solo precio.** La marca de
  // «vendido en sale» la mira quien está en Por producto, Variantes o Ventas mensuales, que no
  // tienen por qué tener Liquidación (Bruno la pidió justamente para el que analiza, no para el que
  // arma el sale). Pedirle el permiso de Liquidación sería o dejar la marca sin ver, o abrirle a
  // esa gente los precios de sale contra el costo. Lo que contesta esa rama son **unidades y
  // fechas**: ni el precio que se puso, ni el de lista, ni el descuento.
  //
  // 🔴 **La cuarta llave es la ÚNICA escritura que abre el permiso de Etiquetas, y por eso pide DOS
  // condiciones a la vez**: `?etiquetas=1` en la query **y** `action:'etiquetado'` en el body. Marcar
  // una prenda como etiquetada es un POST y no hay forma de que no lo sea —deja una fila—, así que
  // acá se cae la garantía cómoda de «Etiquetas es sólo GET». Lo que la reemplaza es que la rama
  // corta con `return` antes de que se mire ninguna otra `action`: con la llave de Etiquetas se
  // llega a `etiquetado` y a nada más. Un POST con `?etiquetas=1` y `action:'aplicar'` no entra por
  // acá —`escribeEtiquetado` es false— y cae en la rama de siempre, que pide Liquidación.
  //
  // 🔴 **La QUINTA llave es la de Ventas de Marketing (`mkt-ventas`), y son DOS caminos.** Marketing
  // arma las campañas sobre el resultado del sale, así que tiene que poder ver **qué se vendió de lo
  // liquidado** — decisión de Bruno, 18-ago-2026. Lo que NO puede ver es lo que hace a esta sección
  // sensible: el costo, el margen y el markup. Por eso son dos condiciones distintas:
  //
  //   1. `?resultado=1` en un **GET**: contesta la lista de campañas y los ítems **pasados por
  //      `sinPlataDeCosto()`**, que borra `foto.costo`, `foto.sinCosto`, `decision.margen` y
  //      `decision.markup`. Medido antes de escribirlo: `lib/liquidacion/resultado.ts` y
  //      `components/liquidacion/Resultado.tsx` **no leen ninguno de los cuatro** (grep en las dos
  //      puntas da cero), así que la pantalla sale idéntica y el payload deja de llevar el costo.
  //   2. `ventas-campania` y `stock-campania` en un **POST**. ⚠️ Van por el nombre de la `action` y
  //      no por un flag de query, al revés que `etiquetado`, y la diferencia es que **son lecturas**:
  //      `etiquetado` necesitaba las dos condiciones porque escribe una fila. Acá el nombre de la
  //      action ya identifica el camino, y cualquier OTRA action con la llave de Marketing cae en la
  //      rama de siempre —que pide Liquidación— y contesta 403.
  const vistaEtiquetas = req.method === 'GET' && String(req.query.etiquetas || '') === '1';
  const escribeEtiquetado = req.method === 'POST' && String(req.query.etiquetas || '') === '1' && b.action === 'etiquetado';
  const vistaVendido = req.method === 'GET' && String(req.query.vendido || '') === '1';
  const conLlaveEtiquetas = vistaEtiquetas || escribeEtiquetado;
  const vistaResultado = req.method === 'GET' && String(req.query.resultado || '') === '1';
  const leeVentasDeProductos = req.method === 'POST' && (b.action === 'ventas-campania' || b.action === 'stock-campania');
  const conLlaveResultado = vistaResultado || leeVentasDeProductos;
  const secciones = conLlaveEtiquetas
    ? ['etiquetas']
    : conLlaveResultado
      ? ['liquidacion', 'mkt-ventas']
      : vistaVendido
        ? SECCIONES_ANALISIS_VENTAS
        : ['liquidacion'];
  if (!puedeVerAlguna(perfil, store, secciones)) {
    const que = conLlaveEtiquetas ? 'Etiquetas' : conLlaveResultado ? 'Liquidación ni a Ventas de Marketing' : vistaVendido ? 'Análisis' : 'Liquidación';
    return res.status(403).json({ error: `No tenés acceso a ${que} en esta marca.` });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  const yo = perfil.name || null;
  const ahora = new Date().toISOString();
  const puede = { aplicar: puedeSub(perfil, store, 'liquidacion', 'aplicar'), admin: esAdmin(perfil) };

  try {
    // Corta acá: lo único que contesta con el permiso de Etiquetas. Sin `puede`, sin fotos, sin
    // precios — el pid y el nombre de la campaña, nada más.
    // ── La cola de reetiquetado. ───────────────────────────────────────────────────────────────
    //
    // 🔑 **No lee campañas: lee la bitácora.** La pregunta es «¿a qué prenda le cambió el precio
    // después de la última vez que la dimos por etiquetada?», que no nombra la liquidación y por eso
    // cubre los cuatro casos: se puso el sale, **se levantó**, una promo puntual y un ajuste suelto.
    //
    // El stock sale de `inventario` sumando los dos depósitos: una prenda que está sólo en Depósito
    // igual hay que etiquetarla cuando salga al salón, y quién la tiene es otra pregunta.
    if (vistaEtiquetas && String(req.query.cola || '') === '1') {
      const [ev, im, inv] = await Promise.all([
        supabase.from('liquidacion_bitacora')
          .select('pid, producto, sku, cuando, precio_a, precio_lista, liq_nombre, modo')
          .eq('store', store).order('cuando', { ascending: false }),
        supabase.from('etiquetas_impresas').select('pid, cuando, modo, precio, precio_lista').eq('store', store),
        supabase.from('inventario').select('product_id, available_quantity'),
      ]);
      if (ev.error) throw new Error(ev.error.message);
      if (im.error) throw new Error(im.error.message);
      if (inv.error) throw new Error(inv.error.message);

      // Uno por producto: el más nuevo. 🔑 **Se cuenta por el ÚLTIMO movimiento y no por evento**
      // —la etiqueta es de la prenda, no del cambio de precio—: tres cambios en una tarde son UNA
      // etiqueta, y guardarlo por evento haría que imprimir una vez dejara dos sin tildar.
      const ultimo = new Map();
      for (const r of ev.data || []) if (!ultimo.has(r.pid)) ultimo.set(r.pid, r);

      const impresas = {};
      for (const r of im.data || []) impresas[r.pid] = r.cuando;
      const stock = {};
      for (const r of inv.data || []) {
        const k = String(r.product_id);
        stock[k] = (stock[k] || 0) + Number(r.available_quantity || 0);
      }

      const eventos = [...ultimo.values()].map((r) => ({
        pid: String(r.pid),
        producto: r.producto,
        sku: r.sku,
        cuando: r.cuando,
        precioA: r.precio_a == null ? null : Number(r.precio_a),
        precioLista: r.precio_lista == null ? null : Number(r.precio_lista),
        liqNombre: r.liq_nombre || null,
        modo: r.modo,
      }));
      const cola = armarCola(eventos, impresas, stock);
      // Los sellos con su número van enteros: la comparación «¿la etiqueta dice lo que se paga
      // hoy?» se hace en el navegador, que es donde están los precios de Tienda Nube. El servidor
      // no los tiene y traerlos acá sería una consulta externa por request.
      const sellos = {};
      for (const r of im.data || []) {
        sellos[r.pid] = {
          cuando: r.cuando,
          modo: r.modo,
          precio: r.precio == null ? null : Number(r.precio),
          precioLista: r.precio_lista == null ? null : Number(r.precio_lista),
        };
      }
      // 🔑 **`leidoEn` va SIEMPRE**: sin él, una cola vacía porque está todo hecho se ve igual que
      // una cola vacía porque la consulta se rompió.
      return res.status(200).json({ ok: true, ...cola, sellos, stock, leidoEn: ahora });
    }

    if (vistaEtiquetas) {
      const liq = String(req.query.liq || '');

      if (!liq) {
        const { data, error } = await supabase.from('liquidaciones').select('id, nombre, datos')
          .eq('store', store).in('estado', ESTADOS_CAMPANIA_VIVA).order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return res.status(200).json({
          ok: true,
          campanias: (data || []).map((r) => ({
            id: r.id,
            nombre: r.nombre,
            desde: (r.datos || {}).desde || null,
            hasta: (r.datos || {}).hasta || null,
          })),
        });
      }

      const [c, i] = await Promise.all([
        supabase.from('liquidaciones').select('id, nombre, estado').eq('store', store).eq('id', liq).maybeSingle(),
        supabase.from('liquidacion_items').select('pid, estado').eq('store', store).eq('liq_id', liq),
      ]);
      if (c.error) throw new Error(c.error.message);
      if (i.error) throw new Error(i.error.message);
      // El estado se revalida acá y no sólo en la lista: un id de una campaña en borrador, tipeado
      // a mano en la URL, no puede devolver los productos de un sale que no está en la tienda.
      if (!c.data || !ESTADOS_CAMPANIA_VIVA.includes(c.data.estado)) {
        return res.status(404).json({ error: 'La campaña no existe o todavía no tiene los precios puestos.' });
      }
      return res.status(200).json({
        ok: true,
        campania: { id: c.data.id, nombre: c.data.nombre },
        pids: pidsAEtiquetar(i.data, c.data.estado),
      });
    }

    // ── Dar por hecha la etiqueta de N productos. La ÚNICA escritura del permiso de Etiquetas. ──
    //
    // 🔑 **Se pisa, no se acumula.** Un renglón por producto: lo que importa es *hasta cuándo* está
    // al día su etiqueta, no cuántas veces se imprimió. Por eso reimprimir es gratis y no avisa nada
    // —lo pidió Bruno para el caso «se trabó la impresora»—: vuelve a sellar la misma fila.
    //
    // `modo` separa el que se imprimió del que se sacó a mano con «ya está» (la prenda está en el
    // depósito, o se decidió no etiquetarla). Decir «impresa» sobre algo que nadie imprimió es una
    // mentira que después no se puede deshacer.
    if (escribeEtiquetado) {
      const pids = (Array.isArray(b.pids) ? b.pids : []).map(String).filter(Boolean);
      if (!pids.length) return res.status(400).json({ error: 'no vino ningún producto' });
      const modo = b.modo === 'ya_estaba' ? 'ya_estaba' : 'impresa';
      // 🔑 **Qué NÚMERO decía la etiqueta.** Sin esto la cola sólo sabe comparar fechas contra la
      // bitácora, y la bitácora sólo tiene lo que escribe el Monitor ⇒ un precio de LISTA corregido
      // a mano en Gestión Nube dejaba la etiqueta mal y ninguna pantalla lo decía.
      //
      // Viene del cliente, y está bien que venga: no es una decisión ni plata que se le cobre a
      // nadie, es **el testimonio de qué se imprimió**, y el único que lo sabe es el que imprimió.
      // Lo peor que puede hacer un número falso acá es dejar una prenda de más o de menos en una
      // lista de tareas.
      const precios = (b.precios && typeof b.precios === 'object') ? b.precios : {};
      const num = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Number(x));
      const filas = pids.map((pid) => ({
        store,
        pid,
        cuando: ahora,
        modo,
        por_quien: yo,
        precio: num((precios[pid] || {}).precio),
        precio_lista: num((precios[pid] || {}).precioLista),
      }));
      const { error } = await supabase.from('etiquetas_impresas').upsert(filas, { onConflict: 'store,pid' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, marcados: filas.length, cuando: ahora });
    }

    // ── Lo vendido CON la oferta puesta, para la marca de Análisis. ────────────────────────────
    //
    // Corta acá igual que Etiquetas: es GET y devuelve antes de mirar ninguna `action`.
    //
    // 🔑 **Se devuelven las líneas con su fecha, no los totales de 7/30/90 días.** El corte de esas
    // ventanas lo hizo el ETL en el navegador con la fecha del navegador; rehacerlo acá con el
    // reloj del servidor (UTC, otra hora) dejaría marcas de «9 de 8» — ver `cortesDeVentas`.
    //
    // El costo está acotado por la bitácora, no por el catálogo: sólo se piden las ventas desde el
    // día del primer `poner` y sólo de los productos que alguna vez tuvieron una oferta escrita.
    // Sin eso esto sería bajar `venta_detalles`, que es la tabla más grande de la base.
    if (vistaVendido) {
      const eventos = await leerTodo(supabase, 'liquidacion_bitacora', (q) =>
        q.select('pid, modo, cuando').eq('store', store).order('cuando'));
      const ventanas = ventanasDe(eventos);
      const primerDia = primerDiaEnSale(ventanas);
      // Los pid van adentro de un `in.(…)`: enteros o nada, aunque vengan de nuestra propia tabla.
      const pids = [...ventanas.keys()].map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (!pids.length || !primerDia) return res.status(200).json({ ok: true, lineas: [], pids: [] });

      // Nunca más atrás de los 16 meses que dibuja Ventas mensuales: más historia que esa no la
      // muestra ninguna de las tres pantallas, y sería payload que nadie mira.
      const tope = new Date();
      tope.setMonth(tope.getMonth() - 16);
      const desde = primerDia > tope.toISOString().slice(0, 10) ? primerDia : tope.toISOString().slice(0, 10);

      const ventas = await leerTodo(supabase, 'ventas', (q) =>
        q.select('id, date_sale').gte('date_sale', desde).order('id'));
      if (!ventas.length) return res.status(200).json({ ok: true, lineas: [], pids: pids.map(String) });

      // El sale_id es el único puente con `venta_detalles`, que no tiene fecha propia (mismo cruce
      // que `ventas-campania`). El rango incluye ventas de otras fechas, así que la fecha sale del
      // mapa y no del rango.
      const min = ventas[0].id;
      const max = ventas[ventas.length - 1].id;
      const detalles = [];
      for (let i = 0; i < pids.length; i += 200) {
        const grupo = pids.slice(i, i + 200);
        detalles.push(...await leerTodo(supabase, 'venta_detalles', (q) =>
          q.select('sale_id, product_id, size_id, quantity')
            .in('product_id', grupo).gte('sale_id', min).lte('sale_id', max).order('sale_id')));
      }

      const fechaDe = new Map(ventas.map((v) => [String(v.id), String(v.date_sale || '').slice(0, 10)]));
      const lineas = lineasEnSale(
        detalles.map((d) => ({
          pid: d.product_id,
          sid: d.size_id,
          fecha: fechaDe.get(String(d.sale_id)) || '',
          q: d.quantity,
        })),
        ventanas,
      );
      return res.status(200).json({ ok: true, lineas, pids: pids.map(String) });
    }

    // ── El resultado del sale para Ventas de Marketing: lo mismo, SIN el costo. ────────────────
    //
    // Es una rama aparte y no un `if` adentro del GET de abajo porque lo que cambia no es el dato
    // sino **el contrato de lo que puede salir**: acá todo lo que se devuelve pasa por el filtro, y
    // eso se lee de un vistazo. Un flag suelto adentro del otro camino obligaría a revisar cada
    // `return` de esa rama cada vez que se le agrega un campo.
    if (vistaResultado) {
      const liq = String(req.query.liq || '');
      if (liq) {
        const { data, error } = await supabase.from('liquidacion_items')
          .select('datos').eq('store', store).eq('liq_id', liq);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, items: (data || []).map((r) => sinPlataDeCosto(r.datos)), puede });
      }
      const [c, i] = await Promise.all([
        supabase.from('liquidaciones').select('id, nombre, estado, datos')
          .eq('store', store).order('created_at', { ascending: false }),
        supabase.from('liquidacion_items').select('liq_id, pid, estado').eq('store', store),
      ]);
      if (c.error) throw new Error(c.error.message);
      if (i.error) throw new Error(i.error.message);
      const conteos = conteosPorCampania(i.data || []);
      return res.status(200).json({ ok: true, campanias: (c.data || []).map((r) => aCampania(r, conteos[r.id])), puede });
    }

    if (req.method === 'GET') {
      const liq = String(req.query.liq || '');

      // ── La bitácora de la campaña: qué precio se puso y cuál se sacó, del más nuevo al más viejo.
      //
      // ⚠️ **Se filtra por `liq_id`, no por los ítems que la campaña tiene HOY.** Un producto que se
      // quitó de la lista igual tuvo su precio escrito en la tienda, y esa es justamente la clase de
      // movimiento que la bitácora existe para no perder. Por eso tampoco se joinea con
      // `liquidacion_items`: el evento se lee solo, con el nombre del producto copiado adentro.
      if (liq && String(req.query.bitacora || '') === '1') {
        const filas = await leerTodo(supabase, 'liquidacion_bitacora', (q) =>
          q.select('*').eq('store', store).eq('liq_id', liq).order('cuando', { ascending: false }));
        return res.status(200).json({ ok: true, eventos: filas.map(aEvento), puede });
      }

      // Análisis pregunta "de estos productos, ¿cuáles ya mandé a esta campaña?". La respuesta son
      // dos columnas por ítem, no la foto congelada entera: la tabla de productos sólo necesita
      // atenuar la fila y decir en qué estado quedó. Mismo criterio que los conteos de acá abajo.
      if (liq && String(req.query.solo || '') === 'pids') {
        const [c, i] = await Promise.all([
          supabase.from('liquidaciones').select('id, nombre, estado')
            .eq('store', store).eq('id', liq).maybeSingle(),
          supabase.from('liquidacion_items').select('pid, estado').eq('store', store).eq('liq_id', liq),
        ]);
        if (c.error) throw new Error(c.error.message);
        if (i.error) throw new Error(i.error.message);
        if (!c.data) return res.status(404).json({ error: 'La campaña no existe.' });
        const pids = {};
        for (const it of i.data || []) pids[it.pid] = it.estado;
        return res.status(200).json({ ok: true, campania: c.data, pids, puede });
      }

      if (liq) {
        const { data, error } = await supabase.from('liquidacion_items')
          .select('datos').eq('store', store).eq('liq_id', liq);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, items: (data || []).map((r) => r.datos), puede });
      }

      const [c, i] = await Promise.all([
        supabase.from('liquidaciones').select('id, nombre, estado, datos')
          .eq('store', store).order('created_at', { ascending: false }),
        supabase.from('liquidacion_items').select('liq_id, pid, estado').eq('store', store),
      ]);
      if (c.error) throw new Error(c.error.message);
      if (i.error) throw new Error(i.error.message);

      const conteos = conteosPorCampania(i.data || []);

      return res.status(200).json({
        ok: true,
        campanias: (c.data || []).map((r) => aCampania(r, conteos[r.id])),
        colgadas: await leerColgadas(supabase, store, c.data || [], i.data || []),
        puede,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    // ── Crear una campaña. ─────────────────────────────────────────────────────────────────────
    if (b.action === 'crear') {
      const c = b.campania || {};
      const id = String(c.id || '');
      const nombre = String(c.nombre || '').trim();
      if (!id) return res.status(400).json({ error: 'falta el id de la campaña' });
      if (!nombre) return res.status(400).json({ error: 'la campaña necesita un nombre' });
      for (const [k, v] of [['desde', c.desde], ['hasta', c.hasta]]) {
        if (v && !ES_FECHA.test(String(v))) return res.status(400).json({ error: `"${k}" va como YYYY-MM-DD` });
      }
      // Al revés no es un detalle: con las fechas dadas vuelta, la campaña nunca está vigente y el
      // día que la tanda 3 las mande a GN como vigencia, el precio no toma nunca.
      if (c.desde && c.hasta && String(c.hasta) < String(c.desde)) {
        return res.status(400).json({ error: 'la fecha de fin es anterior a la de inicio' });
      }

      if (c.tipo != null && !TIPOS_CAMPANIA.includes(String(c.tipo))) {
        return res.status(400).json({ error: `"tipo" tiene que ser uno de: ${TIPOS_CAMPANIA.join(', ')}` });
      }

      const datos = {
        // Sin `tipo` es una liquidación, que es lo que fueron todas hasta agosto de 2026.
        tipo: tipoDe(c),
        desde: c.desde ? String(c.desde) : null,
        hasta: c.hasta ? String(c.hasta) : null,
        nota: txtOrNull(c.nota),
        creadoPor: yo,
        creado: Date.now(),
      };
      const { error } = await supabase.from('liquidaciones')
        .insert([{ id, store, nombre, estado: 'borrador', datos, updated_at: ahora }]);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, campania: aCampania({ id, nombre, estado: 'borrador', datos }) });
    }

    // ── Qué se vendió de los productos de la campaña, y a qué precio salió cada unidad. ────────
    //
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // POR QUÉ ESTO ESTÁ ACÁ Y NO EN EL NAVEGADOR (escalón 3 de la Fase S)
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    //
    // La pregunta que contesta Resultado —*¿el precio de sale llegó a estar puesto?*— sólo se puede
    // responder con `venta_detalles.unit_price` y `total`. Hasta acá eso lo leía el navegador con
    // la anon key, y esa key **entrega la tabla entera**: medido el 14-ago-2026 desde afuera,
    // 122.952 líneas en BDI y 35.426 en Zattia, con lo cobrado en cada renglón. Mudar esta
    // consulta —y la del modal del CRM, que es la otra— es lo que permite revocarle la tabla a
    // `anon` (`sql/migrate-venta-detalles-servidor.sql`).
    //
    // El gate ya está puesto arriba y es el de la sección: quien no puede ver Liquidación en esta
    // marca no llega hasta acá. Es exactamente lo que la anon key no sabía hacer.
    //
    // 🔑 **Las dos consultas van juntas del lado del servidor.** `venta_detalles` no tiene fecha
    // propia: el `sale_id` es el único puente con `ventas`, así que el rango de ids sale de la
    // primera. Hacerlo en dos viajes desde el navegador era el camino viejo; acá es uno.
    //
    // El cruce final y el reparto de la plata siguen en `lib/liquidacion/ventas.ts`, que es donde
    // estaban: esto devuelve las filas crudas y no decide nada.
    //
    // 🔴 **Va ARRIBA del `const id` de abajo y no es un capricho de orden.** Esta acción no toca
    // `liquidaciones` ni `liquidacion_items`: pregunta por unos productos entre dos fechas. Puesta
    // debajo del guard, contestaba `400 falta el id de la campaña` a un request perfectamente
    // válido — y el mensaje mandaba a buscar el problema al lado equivocado.
    if (b.action === 'ventas-campania') {
      const desde = String(b.desde || '');
      const hasta = String(b.hasta || '');
      // Sólo dígitos y guiones, y en formato de fecha: van concatenados en el filtro de PostgREST.
      const fechaOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
      if (!fechaOk(desde) || !fechaOk(hasta) || hasta < desde) {
        return res.status(400).json({ error: 'rango inválido (desde/hasta en YYYY-MM-DD)' });
      }
      // Los pid de Gestión Nube son enteros. Filtrar por tipo no es prolijidad: estos valores
      // terminan adentro de un `in.(…)`, y ahí lo que no es número es una inyección.
      const pids = [...new Set((Array.isArray(b.pids) ? b.pids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
      if (!pids.length) return res.status(200).json({ ok: true, ventas: [], detalles: [] });

      const ventas = await leerTodo(supabase, 'ventas', (q) =>
        q.select('id, date_sale, channel').gte('date_sale', desde).lte('date_sale', hasta).order('id'));
      if (!ventas.length) return res.status(200).json({ ok: true, ventas: [], detalles: [] });

      const min = ventas[0].id;
      const max = ventas[ventas.length - 1].id;
      const detalles = await leerTodo(supabase, 'venta_detalles', (q) =>
        q.select('sale_id, product_id, quantity, unit_price, total')
          .in('product_id', pids).gte('sale_id', min).lte('sale_id', max).order('sale_id'));

      return res.status(200).json({ ok: true, ventas, detalles });
    }

    // ── El stock de HOY de los productos de la campaña. ────────────────────────────────────────
    //
    // Es lo que le falta a la foto congelada para poder preguntar *«el sistema dice que este
    // producto está agotado: ¿la cuenta cierra?»*. Va como acción aparte y no pegada a
    // `ventas-campania` porque es otra pregunta: aquélla tiene rango de fechas y ésta no —el
    // inventario es de ahora—. La pantalla las pide en paralelo.
    //
    // El stock se suma sobre los dos depósitos (`Local` y `Deposito`): la pregunta es si la prenda
    // está en algún lado, no en cuál.
    //
    // 🔑 **`leidoEn` es del ESPEJO, no del request.** `inventario` no tiene fecha propia y el sync
    // corre una vez por día: contestar la hora del servidor diría «recién» sobre un número de ayer a
    // la mañana, y la pantalla manda a alguien a caminar por eso. Sale de `sync_state`, que es lo
    // que escribe el sync recién cuando termina. Si no está, va `null` y la pantalla lo dice.
    //
    // 🔴 **Va ARRIBA del `const id` de abajo**, por lo mismo que `ventas-campania`: pregunta por unos
    // productos, no por una campaña. Debajo del guard contestaría «falta el id» a un request válido.
    if (b.action === 'stock-campania') {
      const pids = [...new Set((Array.isArray(b.pids) ? b.pids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
      if (!pids.length) return res.status(200).json({ ok: true, stock: {}, leidoEn: null });

      const [inv, sync] = await Promise.all([
        leerTodo(supabase, 'inventario', (q) =>
          q.select('product_id, available_quantity').in('product_id', pids).order('product_id')),
        supabase.from('sync_state').select('updated_at').eq('clave', 'diario').maybeSingle(),
      ]);

      const stock = {};
      for (const r of inv) {
        const k = String(r.product_id);
        stock[k] = (stock[k] || 0) + Number(r.available_quantity || 0);
      }
      // Que no se pueda leer de cuándo son los números no invalida los números: se contesta igual,
      // sin fecha, y la pantalla dice que no la sabe.
      const leidoEn = (!sync.error && sync.data && sync.data.updated_at) || null;
      return res.status(200).json({ ok: true, stock, leidoEn });
    }

    // A partir de acá todo pide id de campaña. Se valida una sola vez.
    const id = String(b.id || '');
    if (!id) return res.status(400).json({ error: 'falta el id de la campaña' });

    // ── Cambiar nombre, fechas o nota. ─────────────────────────────────────────────────────────
    if (b.action === 'renombrar') {
      const { data: previo, error: e0 } = await supabase.from('liquidaciones')
        .select('nombre, estado, datos').eq('store', store).eq('id', id).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!previo) return res.status(404).json({ error: 'esa campaña no existe' });

      const nombre = b.nombre === undefined ? previo.nombre : String(b.nombre || '').trim();
      if (!nombre) return res.status(400).json({ error: 'la campaña necesita un nombre' });
      const d = previo.datos || {};
      const desde = b.desde === undefined ? d.desde || null : (b.desde ? String(b.desde) : null);
      const hasta = b.hasta === undefined ? d.hasta || null : (b.hasta ? String(b.hasta) : null);
      for (const [k, v] of [['desde', desde], ['hasta', hasta]]) {
        if (v && !ES_FECHA.test(v)) return res.status(400).json({ error: `"${k}" va como YYYY-MM-DD` });
      }
      if (desde && hasta && hasta < desde) return res.status(400).json({ error: 'la fecha de fin es anterior a la de inicio' });

      if (b.tipo !== undefined && !TIPOS_CAMPANIA.includes(String(b.tipo))) {
        return res.status(400).json({ error: `"tipo" tiene que ser uno de: ${TIPOS_CAMPANIA.join(', ')}` });
      }

      const datos = {
        ...d,
        // No mandar el tipo deja el que tenía; una campaña vieja sin campo queda como liquidación.
        tipo: b.tipo === undefined ? tipoDe(d) : String(b.tipo),
        desde,
        hasta,
        nota: b.nota === undefined ? d.nota || null : txtOrNull(b.nota),
      };
      const { error } = await supabase.from('liquidaciones')
        .update({ nombre, datos, updated_at: ahora }).eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, campania: aCampania({ id, nombre, estado: previo.estado, datos }) });
    }

    // ── Mover el estado de la campaña. ─────────────────────────────────────────────────────────
    if (b.action === 'estado') {
      const estado = String(b.estado || '');
      if (!ESTADOS_CAMPANIA.includes(estado)) {
        return res.status(400).json({ error: `estado inválido (usá ${ESTADOS_CAMPANIA.join(', ')})` });
      }
      // 🔑 **`aplicada` la marca una persona, y es un cambio de criterio respecto de la tanda 1.**
      // Nació rechazada acá: la iba a poner el aplicador al terminar de escribir en Gestión Nube, y
      // marcarla a mano habría dicho que los precios están puestos cuando no lo están. Pero ese
      // aplicador no existe — `PATCH /api/v1/productos/{id}` contesta 403 «Invalid ability provided»
      // con el token del Monitor, así que los precios se cargan a mano. Si nadie más lo va a
      // escribir, el único que puede decirlo es quien lo cargó.
      //
      // Lo que sostiene la honestidad del dato ya no es esta guarda sino la pestaña Resultado, que
      // contrasta la marca contra `venta_detalles.unit_price`: si se vendió a precio de lista, la
      // pantalla lo dice aunque la campaña figure aplicada. Por eso pide el sub-permiso `aplicar` —
      // es una afirmación sobre Gestión Nube, no un rótulo cosmético.
      if (estado === 'aplicada' && !puede.aplicar) {
        return res.status(403).json({ error: 'Marcar los precios como cargados pide el permiso «Puede escribir los precios en Gestión Nube».' });
      }
      // 🔑 **La revisión frena acá, no sólo en el botón.** Deshabilitar el botón es una comodidad;
      // la puerta tiene que estar del lado del servidor o alcanza con recargar en otro estado para
      // saltearla. Es una consulta de una columna y sólo en esta acción, que se aprieta una vez por
      // campaña. Los objetados también son `definido`: siguen sin resolverse.
      if (estado === 'aplicada') {
        const { data: sinRevisar, error: e0 } = await supabase.from('liquidacion_items')
          .select('pid').eq('store', store).eq('liq_id', id).eq('estado', 'definido');
        if (e0) throw new Error(e0.message);
        const n = (sinRevisar || []).length;
        if (n > 0) {
          return res.status(400).json({
            error: `Faltan revisar ${n} ${n === 1 ? 'precio' : 'precios'}. Miralos en la pestaña Revisión antes de marcarla como cargada.`,
          });
        }
      }
      const { error } = await supabase.from('liquidaciones')
        .update({ estado, updated_at: ahora }).eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── Sumar productos (desde Análisis). ──────────────────────────────────────────────────────
    //
    // Los que ya están **no se pisan**: la selección de Análisis sobrevive a filtros y páginas, así
    // que mandar dos veces el mismo producto es lo normal, y pisarlo le borraría el precio que
    // alguien ya decidió. Por eso se leen los pid existentes y se insertan sólo los nuevos, en vez
    // de un upsert.
    if (b.action === 'sumar-items') {
      const crudos = Array.isArray(b.items) ? b.items : [];
      if (!crudos.length) return res.status(400).json({ error: 'no vino ningún producto' });
      if (crudos.length > TOPE_SUMAR) {
        return res.status(400).json({ error: `Son ${crudos.length} productos y el tope por vez es ${TOPE_SUMAR}. Mandalos en dos tandas.` });
      }
      const { data: existe, error: e0 } = await supabase.from('liquidaciones')
        .select('id').eq('store', store).eq('id', id).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!existe) return res.status(404).json({ error: 'esa campaña no existe' });

      const items = crudos.map(itemDelBody).filter(Boolean);
      if (!items.length) return res.status(400).json({ error: 'ninguno de los productos traía id' });

      const { data: ya, error: e1 } = await supabase.from('liquidacion_items')
        .select('pid').eq('store', store).eq('liq_id', id);
      if (e1) throw new Error(e1.message);
      const tengo = new Set((ya || []).map((r) => r.pid));

      // Un mismo pid repetido dentro del propio pedido rompería el insert por PK duplicada.
      const nuevos = [];
      for (const i of items) {
        if (tengo.has(i.pid)) continue;
        tengo.add(i.pid);
        nuevos.push(i);
      }

      if (nuevos.length) {
        const { error } = await supabase.from('liquidacion_items').insert(
          nuevos.map((i) => ({ liq_id: id, store, pid: i.pid, estado: i.estado, datos: i, updated_at: ahora })),
        );
        if (error) throw new Error(error.message);
      }
      return res.status(200).json({ ok: true, sumados: nuevos.length, yaEstaban: items.length - nuevos.length });
    }

    // ── Guardar un ítem (cada "Definir" toca UNA fila). ────────────────────────────────────────
    if (b.action === 'guardar-item') {
      const item = itemDelBody(b.item);
      if (!item) return res.status(400).json({ error: 'falta el producto (o no tiene id)' });
      // `aplicado` lo escribe el aplicador contra Gestión Nube, nunca la pantalla: que un ítem diga
      // que su precio está puesto sin que nadie lo haya escrito es la mentira más cara del módulo.
      if (item.estado === 'aplicado') {
        return res.status(400).json({ error: 'Un producto pasa a "aplicado" solo, cuando se le escribe el precio.' });
      }
      // 🔴 **`confirmado` NO entra por acá, y es la guarda que sostiene toda la revisión.** Este
      // handler lo puede llamar cualquiera con acceso a la sección; si el estado viajara en el body,
      // el que pone el precio se confirma a sí mismo y la segunda mirada deja de existir sin que
      // nada falle. Se confirma por `action:'revisar'`, que pide admin.
      if (item.estado === 'confirmado') {
        return res.status(400).json({ error: 'Confirmar un precio va por la pestaña Revisión.' });
      }
      const { error } = await supabase.from('liquidacion_items').upsert(
        [{ liq_id: id, store, pid: item.pid, estado: item.estado, datos: item, updated_at: ahora }],
        { onConflict: 'store,liq_id,pid' },
      );
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, item });
    }

    // ── Sólo el estado de un ítem (descartar, volver a la pila). ───────────────────────────────
    if (b.action === 'estado-item') {
      const pid = String(b.pid || '');
      const estado = String(b.estado || '');
      if (!pid) return res.status(400).json({ error: 'falta el producto' });
      // `aplicado` y `confirmado` no se ponen a mano desde acá: el primero lo escribe el aplicador,
      // el segundo va por `action:'revisar'` porque pide admin (ver la guarda de `guardar-item`).
      const A_MANO = ESTADOS_ITEM.filter((e) => e !== 'aplicado' && e !== 'confirmado');
      if (!A_MANO.includes(estado)) {
        return res.status(400).json({ error: `estado inválido (usá ${A_MANO.join(', ')})` });
      }
      const { data: previo, error: e0 } = await supabase.from('liquidacion_items')
        .select('datos').eq('store', store).eq('liq_id', id).eq('pid', pid).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!previo) return res.status(404).json({ error: 'ese producto no está en la campaña' });

      const datos = { ...previo.datos, estado };
      const { error } = await supabase.from('liquidacion_items')
        .update({ estado, datos, updated_at: ahora }).eq('store', store).eq('liq_id', id).eq('pid', pid);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── La segunda mirada: confirmar u objetar un precio. Sólo admin. ──────────────────────────
    //
    // Va aparte de `guardar-item` justamente por el permiso: aquel lo puede llamar cualquiera con
    // acceso a la sección, y si `confirmado` pudiera viajar en ese body, quien pone el precio se
    // confirmaría a sí mismo. El ítem llega armado por `confirmarItem`/`objetarItem` (mismo patrón
    // que el resto del módulo: la lógica pura vive en `lib/liquidacion/core.ts` y se testea sola).
    if (b.action === 'revisar') {
      if (!puede.admin) {
        return res.status(403).json({ error: 'Confirmar u objetar un precio lo puede hacer un admin.' });
      }
      const item = itemDelBody(b.item);
      if (!item) return res.status(400).json({ error: 'falta el producto (o no tiene id)' });
      if (item.estado !== 'confirmado' && item.estado !== 'definido') {
        return res.status(400).json({ error: 'una revisión deja el producto en "confirmado" o en "definido"' });
      }
      // Objetar sin motivo es lo mismo que no contestar: el que puso el precio ve que volvió y no
      // sabe por qué. El cliente lo exige y acá se vuelve a exigir, que es donde no se puede saltear.
      if (item.estado === 'definido' && !item.revision.objecion) {
        return res.status(400).json({ error: 'devolver un precio pide un motivo' });
      }
      const { data: previo, error: e0 } = await supabase.from('liquidacion_items')
        .select('pid').eq('store', store).eq('liq_id', id).eq('pid', item.pid).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!previo) return res.status(404).json({ error: 'ese producto no está en la campaña' });

      const { error } = await supabase.from('liquidacion_items')
        .update({ estado: item.estado, datos: item, updated_at: ahora })
        .eq('store', store).eq('liq_id', id).eq('pid', item.pid);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, item });
    }

    // ── Sacar un producto de la campaña. ⚠️ Distinto de descartarlo. ───────────────────────────
    if (b.action === 'quitar-item') {
      const pid = String(b.pid || '');
      if (!pid) return res.status(400).json({ error: 'falta el producto' });
      const { error } = await supabase.from('liquidacion_items')
        .delete().eq('store', store).eq('liq_id', id).eq('pid', pid);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── Escribir (o borrar) el precio de sale en Gestión Nube. ─────────────────────────────────
    //
    // 🔑 **El cliente manda pids, no precios.** El precio se relee de la base acá adentro: uno que
    // viaje desde el navegador es un precio que se puede alterar, y este handler escribe en la
    // tienda de verdad. Por lo mismo sólo entran los `confirmado` — los que pasaron por la segunda
    // mirada— y el estado se pone acá, no lo dice el cliente.
    //
    // 🔑 **Va de a cinco y el bucle vive en el cliente.** Una campaña de 260 productos son ~6
    // minutos contra el tope de GN: no entra en el tiempo de una función. De paso se gana la
    // reanudación —lo aplicado sale de la lista— y una barra de progreso en vez de una espera muda.
    // ── Cambiarle el precio a muchos ítems de una. ─────────────────────────────────────────────
    //
    // 🔑 **Es `guardar-item` de a muchos, y por eso el precio SÍ viene del cliente** — al revés que
    // en `aplicar`. La diferencia no es de confianza sino de destino: acá se guarda una decisión en
    // nuestra base (lo mismo que hace cada "Definir"), allá se le escribe a la tienda. Además el
    // redondeo a 90 vive en `lib/comisiones/core.ts`, que este handler no puede importar (es TS), y
    // copiarlo acá sería tener dos reglas de plata que pueden discrepar.
    //
    // Los ítems entran por `itemDelBody`, la misma lista blanca de siempre: un campo que no esté ahí
    // no viaja.
    if (b.action === 'decidir-masivo') {
      const crudos = Array.isArray(b.items) ? b.items : [];
      if (!crudos.length) return res.status(400).json({ error: 'no vino ningún producto' });
      if (crudos.length > TOPE_MASIVO) {
        return res.status(400).json({ error: `Son ${crudos.length} y el tope por vez es ${TOPE_MASIVO}.` });
      }
      const items = crudos.map(itemDelBody).filter(Boolean);
      if (!items.length) return res.status(400).json({ error: 'ningún producto válido' });
      const ahora = new Date().toISOString();
      const { error } = await supabase.from('liquidacion_items').upsert(
        items.map((i) => ({ liq_id: id, store, pid: i.pid, estado: i.estado, datos: i, updated_at: ahora })),
        { onConflict: 'store,liq_id,pid' },
      );
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, guardados: items.length });
    }

    // ── Traer las ventas de hoy al espejo. Sólo admin. ─────────────────────────────────────────
    //
    // 🔑 **Resultado no le pregunta nada a Gestión Nube: lee el espejo de Supabase**, y el espejo lo
    // llena el sync diario a las 6 UTC (3 de la mañana en Argentina). Una campaña que arrancó hoy se
    // mira, entonces, contra un espejo de ayer, y la pantalla contesta «no vendió» de todo — que es
    // lo contrario de lo que está pasando. Pasó de verdad el 13-ago-2026, el día que el WINTER SALE
    // empezó a vender: cero ventas del 13 en el espejo de Zattia, con el local vendiendo.
    //
    // Es el mismo trabajo que hace `scripts/sync-ventas-hoy.js` —el workflow «Sync ventas
    // recientes», que sólo se dispara a mano desde GitHub—, pero adentro de este handler porque
    // **todo lo que necesita ya estaba acá**: los dos tokens de GN y los dos Supabase con service
    // key. No hizo falta ni una función nueva de Vercel (quedan 5 de 12) ni un secret nuevo.
    //
    // 🔑 **Entra cómodo en el tiempo de una función: 1,2 segundos medidos** en el run del 13-ago
    // (una página, 31 ventas, 82 renglones). Los ~40 s del workflow son casi todos `npm ci`.
    if (b.action === 'sincronizar-ventas') {
      // Liquidación hoy la ven sólo admins, así que la puerta se pone donde está la fuerza: esto
      // escribe en las tablas `ventas`, `venta_detalles` y `clientes` del espejo de producción.
      if (!puede.admin) {
        return res.status(403).json({ error: 'Traer las ventas de hoy al espejo lo puede hacer un admin.' });
      }
      const { data: previo, error: e0 } = await supabase.from('liquidaciones')
        .select('datos').eq('store', store).eq('id', id).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!previo) return res.status(404).json({ error: 'esa campaña no existe' });

      const d = previo.datos || {};
      const ahoraMs = Date.parse(ahora);
      // Recién sincronizado: se contesta `ok` con `salteado`, no un error. Apretar dos veces no es
      // una equivocación de nadie y no tiene por qué pintarse de rojo.
      if (!puedeSincronizarVentas(d.ventasSync, ahoraMs)) {
        return res.status(200).json({ ok: true, salteado: true, ventasSync: d.ventasSync, ventas: 0, detalles: 0 });
      }

      // El bucle de páginas y el guardado viven en `api/_ventas-hoy.js`: los comparte con el botón
      // de Ventas de Marketing. Lo que NO se comparte es el antirrebote de arriba, que es por
      // campaña — el porqué está allá.
      const traido = await traerVentasDeHoy(supabase, store, ahoraMs);
      if (!traido.ok) return res.status(traido.status).json({ error: traido.error });
      const { truncado, ...conteo } = traido;

      const { error } = await supabase.from('liquidaciones')
        .update({ datos: { ...d, ventasSync: ahora }, updated_at: ahora }).eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);

      return res.status(200).json({ ok: true, ventasSync: ahora, truncado, ventas: conteo.ventas, detalles: conteo.detalles, clientes: conteo.clientes });
    }

    if (b.action === 'aplicar') {
      const modo = b.modo === 'sacar' ? 'sacar' : 'poner';
      // A dónde vuelve el precio al sacar. `lista` le saca la oferta; `previa` le devuelve la que
      // tenía cuando entró a la campaña (44 de los 261 de agosto ya estaban en oferta, y dejarlos a
      // precio de lista les subiría el precio MÁS de lo que estaba antes del sale).
      const destino = b.destino === 'previa' ? 'previa' : 'lista';
      // Es una escritura sobre precios en producción: el mismo permiso que marcar la campaña como
      // cargada. La puerta va en el handler porque deshabilitar el botón no impide nada.
      if (!puede.aplicar) {
        return res.status(403).json({ error: 'Escribir los precios en Gestión Nube pide el permiso «Puede escribir los precios en Gestión Nube».' });
      }
      const token = GN_TOKENS[store];
      if (!token) return res.status(500).json({ error: `Falta el token de Gestión Nube de ${store} en el servidor.` });

      const pids = (Array.isArray(b.pids) ? b.pids : []).map(String).filter(Boolean);
      if (!pids.length) return res.status(400).json({ error: 'no vino ningún producto' });
      if (pids.length > TOPE_APLICAR) {
        return res.status(400).json({ error: `Son ${pids.length} productos y el tope por vez es ${TOPE_APLICAR}.` });
      }

      const { data: filas, error: e0 } = await supabase.from('liquidacion_items')
        .select('pid, estado, datos').eq('store', store).eq('liq_id', id).in('pid', pids);
      if (e0) throw new Error(e0.message);

      // El nombre de la campaña se copia en cada evento: la bitácora tiene que poder leerse cuando
      // la campaña ya no existe (`borrar` no la toca a propósito).
      const { data: cab, error: eC } = await supabase.from('liquidaciones')
        .select('nombre').eq('store', store).eq('id', id).maybeSingle();
      if (eC) throw new Error(eC.message);
      const liqNombre = (cab && cab.nombre) || '';

      // El último movimiento de cada uno de estos productos, para saber qué había puesto antes.
      // 🔑 **Se busca por `store` + `pid`, sin acotar a esta campaña**: lo que la tienda tenía antes
      // de esta escritura es lo que dejó la escritura anterior, la haya hecho esta campaña o la de
      // julio. Acotarlo a `liq_id` haría que el primer renglón de cada campaña se invente un "antes".
      const { data: previos, error: eB } = await supabase.from('liquidacion_bitacora')
        .select('pid, precio_a, cuando').eq('store', store).in('pid', pids)
        .order('cuando', { ascending: false });
      if (eB) throw new Error(eB.message);
      const ultimoDe = new Map();
      for (const f of previos || []) if (!ultimoDe.has(f.pid)) ultimoDe.set(f.pid, { precioA: f.precio_a });

      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
      const ahoraMs = Date.now();
      const resultados = [];

      for (const pid of pids) {
        const fila = (filas || []).find((f) => String(f.pid) === pid);
        if (!fila) { resultados.push({ pid, ok: false, error: 'no está en la campaña' }); continue; }
        const item = itemDelBody({ ...(fila.datos || {}), pid, estado: fila.estado });
        const precio = item.decision.precioSale;

        // El estado que corresponde a cada modo. `aplicado` quiere decir "su precio está puesto en
        // GN **ahora**": por eso sacar la oferta lo devuelve a `confirmado` en vez de dejarlo
        // aplicado, que sería la pantalla afirmando que hay un precio puesto que ya no está.
        if (modo === 'poner') {
          if (fila.estado !== 'confirmado') { resultados.push({ pid, ok: false, error: `está en «${fila.estado}», no confirmado` }); continue; }
          if (!(precio > 0)) { resultados.push({ pid, ok: false, error: 'no tiene precio de sale' }); continue; }
        } else if (fila.estado !== 'aplicado') {
          resultados.push({ pid, ok: false, error: `está en «${fila.estado}», no aplicado` }); continue;
        }

        // Al sacar con destino `previa`, el valor es la oferta congelada — y si el producto no
        // tenía ninguna, queda a precio de lista, que ES su estado anterior.
        const previa = item.foto.promoPrevia;
        const valor = modo === 'poner'
          ? precio
          : (destino === 'previa' && previa > 0 ? previa : null);
        let r;
        try {
          r = await gnFetch(`${GN_BASE}/productos/${encodeURIComponent(pid)}`, {
            method: 'PATCH', headers, body: JSON.stringify({ tiendanube_promotional_price: valor }),
          });
        } catch (err) {
          resultados.push({ pid, ok: false, error: `no se pudo hablar con Gestión Nube: ${err.message}` });
          await dormir(PAUSA_GN);
          continue;
        }
        const cuerpo = await r.text();
        if (!r.ok) {
          resultados.push({ pid, ok: false, error: `Gestión Nube contestó ${r.status}: ${cuerpo.slice(0, 120)}` });
          await dormir(PAUSA_GN);
          continue;
        }

        // 🔑 **No alcanza con el 200: se mira el valor que devuelve el propio PATCH.** GN contesta
        // con el producto actualizado, así que la confirmación es gratis y no cuesta una relectura
        // por producto (que duplicaría las consultas contra un tope de 60 por minuto). Un 200 que
        // no movió el precio es el modo de falla clásico de esta integración: "lo cargué y se
        // revirtió solo".
        let escrito;
        try { escrito = (JSON.parse(cuerpo).data || {}).tiendanube_promotional_price; } catch { escrito = undefined; }
        const quedoBien = valor == null
          ? escrito == null
          : Math.round(num(escrito)) === Math.round(valor);
        if (!quedoBien) {
          resultados.push({ pid, ok: false, error: `Gestión Nube aceptó pero devolvió ${JSON.stringify(escrito)}` });
          await dormir(PAUSA_GN);
          continue;
        }

        // ── La bitácora, acá y no antes. ──────────────────────────────────────────────────────
        //
        // 🔑 **Este es el único punto del módulo donde consta que el precio se movió de verdad**:
        // arriba ya se comparó lo que devolvió el PATCH contra lo que se quiso escribir. Anotar el
        // evento antes sería registrar la intención, y una bitácora que diga que el cliente vio un
        // precio que nunca estuvo puesto es peor que no tenerla.
        //
        // 🔴 **Y va antes de tocar el ítem, porque el ítem PIERDE el dato.** El renglón de abajo
        // deja `aplicadoEn` y `precioEscrito` en `null` cuando se saca la oferta — que es correcto
        // (`aplicado` quiere decir "está puesto AHORA") pero borra la única huella de que ese precio
        // existió. La bitácora es lo que lo conserva.
        const cuandoISO = new Date().toISOString();
        const deAntes = precioAnterior(ultimoDe.get(pid), item.foto.promoPrevia);
        const { error: eL } = await supabase.from('liquidacion_bitacora').insert([
          filaBitacora({ store, liqId: id, liqNombre, item, modo, precioDe: deAntes, precioA: valor, porQuien: yo, cuando: cuandoISO }),
        ]);
        // Que el evento quede en memoria aunque la inserción falle mantiene coherente al resto de la
        // tanda: sin esto, el próximo movimiento de este mismo producto leería un "antes" viejo.
        ultimoDe.set(pid, { precioA: valor });

        const nuevo = {
          ...item,
          estado: modo === 'poner' ? 'aplicado' : 'confirmado',
          aplicacion: modo === 'poner'
            ? { ...item.aplicacion, aplicadoEn: ahoraMs, precioEscrito: precio }
            : { ...item.aplicacion, aplicadoEn: null, precioEscrito: null },
        };
        const { error: eU } = await supabase.from('liquidacion_items')
          .update({ estado: nuevo.estado, datos: nuevo, updated_at: new Date().toISOString() })
          .eq('store', store).eq('liq_id', id).eq('pid', pid);
        // El precio YA está escrito en Gestión Nube: si falla el guardado nuestro, lo que quedó mal
        // es el registro, no la tienda. Se dice cuál de los dos falló en vez de un "no se pudo".
        if (eU) { resultados.push({ pid, ok: false, error: `se escribió en Gestión Nube pero no se pudo anotar acá: ${eU.message}` }); }
        // Una bitácora que no entró NO invalida la operación —el precio está puesto y el ítem quedó
        // bien— pero tampoco se calla: es el registro que después se lee para saber qué pasó.
        else if (eL) { resultados.push({ pid, ok: true, precio: valor, avisoBitacora: `no se pudo anotar en la bitácora: ${eL.message}` }); }
        else { resultados.push({ pid, ok: true, precio: valor }); }

        await dormir(PAUSA_GN);
      }

      return res.status(200).json({ ok: true, modo, resultados });
    }

    // ── Borrar la campaña entera. ──────────────────────────────────────────────────────────────
    //
    // Los ítems se borran a mano: no hay FK con `on delete cascade` porque las dos tablas viven en
    // dos bases distintas por marca y la convención del repo es `store` + PK compuesta, sin
    // relaciones declaradas. Van primero, para que una falla en el medio deje la campaña visible y
    // no cuarenta filas huérfanas que nadie ve ni puede borrar.
    //
    // ⛔ **`liquidacion_bitacora` NO se borra acá, y no es un olvido.** Que alguien borre la campaña
    // no deshace los precios que estuvieron puestos en la tienda de verdad. Por eso el evento lleva
    // copiados el nombre de la campaña y el del producto: se lee solo, sin nadie a quien apuntar.
    if (b.action === 'borrar') {
      const { data: previo, error: e0 } = await supabase.from('liquidaciones')
        .select('estado, datos').eq('store', store).eq('id', id).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!previo) return res.status(200).json({ ok: true });
      if (previo.estado === 'aplicada' && !esAdmin(perfil)) {
        return res.status(403).json({ error: 'Esta campaña ya tiene precios escritos en Gestión Nube: pedile a un admin que la borre.' });
      }
      if (!esAdmin(perfil) && String(previo.datos?.creadoPor || '') !== String(yo || '')) {
        return res.status(403).json({ error: 'Esa campaña la armó otra persona: pedile a un admin que la borre.' });
      }
      const { error: e1 } = await supabase.from('liquidacion_items').delete().eq('store', store).eq('liq_id', id);
      if (e1) throw new Error(e1.message);
      const { error } = await supabase.from('liquidaciones').delete().eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `acción desconocida: ${b.action || '(ninguna)'}` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
