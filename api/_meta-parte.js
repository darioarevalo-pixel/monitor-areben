// EL PARTE DE PAUTA: todo lo que hace falta para decidir presupuestos, en UNA llamada.
//
//   GET /api/meta-ads?recurso=parte&account=<id>[&linea=bdi]
//
// ⚠️ Archivo `_`: no es una ruta y no cuenta contra las 12 funciones del plan Hobby.
//
// # Por qué existe
//
// Analizar un día de pauta costaba ~12 llamadas al navegador y una recorrida por Ads Manager, y
// cada vuelta traía el JSON entero de Meta —miniaturas, permalinks, campos que nadie mira—. Este
// handler arma **una sola respuesta, ya agregada por conjunto, ya comparada contra ayer, ya juzgada
// contra el techo y ya cruzada contra la caja**, en texto plano listo para copiar. El armado del
// texto vive en `lib/meta-ads/parte.core.js`, que es puro y se prueba; acá vive la conversación.
//
// # 🔑 Cinco llamadas a Graph, no veintisiete
//
// Pedir el detalle de cuenta (`?account=&preset=`) tres veces —hoy, ayer y la serie— son 9 llamadas
// cada vez, y el cupo de la Marketing API es un PORCENTAJE que se agota. Acá se pide exactamente lo
// que el parte imprime y nada más, todo en un solo `Promise.all` junto con las tres lecturas de la
// base.
//
// # 🔴 Los días los decide META, no nosotros
//
// La zona horaria es de la CUENTA y **Vercel corre en UTC** (esta máquina no): calcular «hoy» con
// `new Date()` del lado del servidor ya falló dos veces en este repo, en el sufijo de las copias.
// Por eso `hoy` y `ayer` se piden con `date_preset=today` / `yesterday`, que Meta resuelve en la
// zona de la cuenta, y **la fecha que se imprime en la cabecera sale del `date_start` que Meta
// devuelve**, no de un cálculo nuestro.
//
// # ⚠️ Sin `filtering=spend>0`
//
// En una ventana corta ese filtro esconde justo lo que se quiere mirar: a la mañana un aviso que
// todavía no gastó desaparece y «hoy» se ve vacío aunque esté entregando. Es la misma decisión que
// ya está tomada y comentada en `api/meta-ads.js` para los rangos cortos.
import { lineasQueVe } from '../lib/meta-ads/acciones.core.js';
import { graph, insightsTodas } from '../lib/meta-ads/graph.core.js';
import { accion, COMPRA, TIPO_FUNNEL } from '../lib/meta-ads/metricas.core.js';
import { cruzarConLaCaja, renderParte } from '../lib/meta-ads/parte.core.js';
import { calcularRentabilidad, normalizar } from '../lib/meta-ads/rentabilidad.core.js';
import { clienteBdi, leerAsignaciones } from './_meta-lineas.js';

/** Cuántos días de serie se piden a Meta. Fijo: un parámetro que la UI no puede pedir mal es el
 *  que nadie prueba, y ya mordió con `?dias=N` fuera de {30,90} devolviendo 30 en silencio. */
const DIAS_SERIE = 21;
/** El objetivo contra el que se mide el escalado. Ver `project_bdi_escalado_100_ventas`. */
const OBJETIVO_PEDIDOS_DIA = 100;

const CAMPOS_AD =
  'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,ctr,cpm,actions,action_values';
/** La misma ventana de atribución que usa el resto de la sección: sin esto los números del parte no
 *  serían comparables con los de la pantalla de al lado. */
const ATTR = 'action_attribution_windows=["7d_click","1d_view"]';

/** Una fila de insights de aviso, normalizada a lo que `parte.core.js` sabe leer. */
function filaDe(row, lineaDe) {
  return {
    aviso: row.ad_name || '(sin nombre)',
    conjunto: row.adset_name || '(sin conjunto)',
    campania: row.campaign_name || '(sin campaña)',
    campaniaId: String(row.campaign_id || ''),
    linea: lineaDe(row.campaign_id) || 'sin-linea',
    estado: '',
    tipo: '',
    gasto: Number(row.spend) || 0,
    impresiones: Number(row.impressions) || 0,
    clics: Number(row.clicks) || 0,
    ctr: Number(row.ctr) || 0,
    cpm: Number(row.cpm) || 0,
    compras: accion(row.actions, COMPRA),
    revenue: accion(row.action_values, COMPRA),
    // Los tres pasos de ANTES de la compra. Los `action_type` salen de `TIPO_FUNNEL`, la MISMA
    // lista de la que sale el embudo de cuenta: si fueran dos listas, el embudo de la pantalla y la
    // suma de los avisos del parte dejarían de dar lo mismo sin que nada falle.
    lpv: accion(row.actions, TIPO_FUNNEL.landing_page_view),
    carritos: accion(row.actions, TIPO_FUNNEL.add_to_cart),
    checkouts: accion(row.actions, TIPO_FUNNEL.initiate_checkout),
  };
}

/**
 * Los pedidos REALES de la tienda, por día.
 *
 * 🔑 **Es el oráculo del escalado, y no son las compras de Meta.** El 20-ago-2026 quedó medido que
 * las dos series pueden ir en sentido contrario durante días enteros porque el CAPI cambia la
 * ATRIBUCIÓN sin cambiar la venta.
 *
 * ⛔ **No se filtra por estado de la venta**: una venta anulada se ELIMINA en Gestión Nube, no se
 * marca, así que filtrar por estado fabrica un derrumbe falso. Está escrito en
 * `scripts/medir-economia-bdi.mjs` y en `lib/crm/metricas.ts`.
 * ⛔ **PostgREST corta en 1000 filas sin avisar**: paginar no es opcional.
 *
 * 🔑 **Exportada porque la usa también la zona de Rendimiento** (`_meta-rendimiento.js`). Es el
 * mismo oráculo contestando la misma pregunta: si cada pantalla contara los pedidos con su propio
 * filtro, dos pantallas del mismo módulo dirían dos costos por pedido distintos y no habría forma
 * de saber cuál mirar.
 */
export async function pedidosPorDia(sb, desde) {
  const porDia = {};
  let ultimo = null;
  for (let pagina = 0; pagina < 20; pagina++) {
    const { data, error } = await sb
      .from('ventas')
      .select('id, date_sale, channel')
      .gte('date_sale', desde)
      .eq('channel', 'Tienda Nube')
      .order('id')
      .range(pagina * 1000, pagina * 1000 + 999);
    if (error) return { error: error.message };
    for (const v of data || []) {
      const f = String(v.date_sale || '').slice(0, 10);
      if (!f) continue;
      porDia[f] = (porDia[f] || 0) + 1;
      if (!ultimo || f > ultimo) ultimo = f;
    }
    if (!data || data.length < 1000) break;
  }
  return { porDia, ultimo };
}

/** El techo por compra de cada línea, desde la fila guardada. Sin fila, la línea NO entra: el parte
 *  contesta `?` y no inventa un default, porque un techo inventado decide plata igual que uno medido. */
export async function techosPorLinea(sb) {
  const { data, error } = await sb.from('meta_ads_rentabilidad').select('linea, supuestos');
  if (error) return { error: error.message };
  const techos = {};
  for (const f of data || []) {
    try {
      techos[f.linea] = calcularRentabilidad(normalizar(f.supuestos || {})).costoMax;
    } catch {
      /* una fila ilegible es una línea sin techo, no un 500 */
    }
  }
  return { techos };
}

export default async function parteGet(res, perfil, q) {
  const visibles = lineasQueVe(perfil);
  if (!visibles.length) return res.status(403).json({ error: 'No tenés acceso a la pauta de ninguna marca.' });

  const account = String(q.account || '').trim();
  if (!/^\d+$/.test(account)) return res.status(400).json({ error: 'Falta `account` (el id de la cuenta publicitaria).' });

  // La línea del bloque de caja: la que tiene tienda y objetivo. Se acepta pedir otra, pero sólo
  // una que el perfil pueda ver — si no, el parte sería una puerta lateral a la plata de otra marca.
  const lineaCaja = visibles.includes(String(q.linea || 'bdi')) ? String(q.linea || 'bdi') : visibles[0];

  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });

  const act = `act_${account}`;
  // El `since` de la serie se calcula en UTC a propósito: es un LÍMITE INFERIOR generoso, no una
  // fecha que se imprima. Meta recorta a los días que existen y las fechas que se muestran salen
  // siempre de lo que Meta devuelve.
  const desdeSerie = new Date(Date.now() - DIAS_SERIE * 86400000).toISOString().slice(0, 10);
  const hastaSerie = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const rangoSerie = `time_range={"since":"${desdeSerie}","until":"${hastaSerie}"}`;

  const [hoyRes, ayerRes, serieRes, campRes, adsetRes, asign, techoRes, ventasRes] = await Promise.all([
    insightsTodas(`${act}/insights?level=ad&fields=${CAMPOS_AD}&date_preset=today&${ATTR}&limit=500`),
    insightsTodas(`${act}/insights?level=ad&fields=${CAMPOS_AD}&date_preset=yesterday&${ATTR}&limit=500`),
    // Por CAMPAÑA y no por cuenta: adentro de la misma cuenta publicitaria conviven BDI y Zattia, y
    // el costo por pedido de una línea calculado con el gasto de las dos es un número que no existe.
    insightsTodas(
      `${act}/insights?level=campaign&fields=campaign_id,spend,actions,action_values&time_increment=1&${rangoSerie}&${ATTR}&limit=500`,
    ),
    graph(`${act}/campaigns?fields=id,objective&limit=500`),
    // El techo DIARIO de cada conjunto: es lo que distingue «no le alcanza la caja» de «no la usa».
    graph(`${act}/adsets?fields=id,name,daily_budget,effective_status&limit=500`),
    leerAsignaciones(),
    techosPorLinea(sb),
    pedidosPorDia(sb, desdeSerie),
  ]);

  if (!hoyRes.ok) return res.status(502).json({ error: 'No se pudieron traer los avisos de hoy.', detalle: hoyRes.error });
  if (!ayerRes.ok) return res.status(502).json({ error: 'No se pudieron traer los avisos de ayer.', detalle: ayerRes.error });

  const mapaLinea = asign.mapa || new Map();
  const lineaDe = (campaignId) => {
    const r = mapaLinea.get(String(campaignId));
    return r ? r.linea : '';
  };

  // 🔑 El corte por permiso se hace ACÁ, sobre las filas, y no pidiéndole a Meta menos: la cuenta es
  // una sola y Graph no sabe de líneas. Lo que no se ve, no se imprime.
  const puedeVerla = (f) => visibles.includes(f.linea) || f.linea === 'sin-linea';
  const hoy = (hoyRes.rows || []).map((r) => filaDe(r, lineaDe)).filter(puedeVerla);
  const ayer = (ayerRes.rows || []).map((r) => filaDe(r, lineaDe)).filter(puedeVerla);

  // El objetivo de cada campaña dice si es de VENTA o de TRÁFICO. Enriquecimiento aislado: si falla,
  // la columna `tipo` queda vacía y el resto del parte sale igual.
  const objetivoDe = new Map(((campRes.ok && campRes.data && campRes.data.data) || []).map((c) => [String(c.id), c.objective || '']));
  for (const f of [...hoy, ...ayer]) f.tipo = objetivoDe.get(f.campaniaId) || '';

  // El estado del conjunto sale de `/adsets` y no de insights: una fila de insights no dice si el
  // objeto está prendido, sólo que entregó. Un conjunto apagado hace tres horas gastó igual hoy.
  const techosDiarios = {};
  const estadoConj = {};
  for (const a of ((adsetRes.ok && adsetRes.data && adsetRes.data.data) || [])) {
    // `daily_budget` viene en la unidad MENOR de la moneda. El `/100` no se escribe a mano en
    // ningún lado del módulo: acá se hace una vez y se dice.
    if (a.daily_budget != null) techosDiarios[a.name] = Number(a.daily_budget) / 100;
    if (a.effective_status) estadoConj[a.name] = a.effective_status;
  }
  for (const f of [...hoy, ...ayer]) f.estado = estadoConj[f.conjunto] || '';

  // La serie: por día, ya cortada a las líneas que el perfil ve, y aparte la de la línea de caja.
  const porFecha = new Map();
  const porFechaLinea = new Map();
  for (const r of serieRes.rows || []) {
    const f = String(r.date_start || '').slice(0, 10);
    if (!f) continue;
    const ln = lineaDe(r.campaign_id) || 'sin-linea';
    const d = { gasto: Number(r.spend) || 0, compras: accion(r.actions, COMPRA), revenue: accion(r.action_values, COMPRA) };
    if (visibles.includes(ln) || ln === 'sin-linea') {
      const t = porFecha.get(f) || { fecha: f, gasto: 0, compras: 0, revenue: 0 };
      t.gasto += d.gasto; t.compras += d.compras; t.revenue += d.revenue;
      porFecha.set(f, t);
    }
    if (ln === lineaCaja) {
      const t = porFechaLinea.get(f) || { fecha: f, gasto: 0, compras: 0, revenue: 0 };
      t.gasto += d.gasto; t.compras += d.compras; t.revenue += d.revenue;
      porFechaLinea.set(f, t);
    }
  }
  const orden = (m) => [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Las fechas salen de lo que META devolvió, no de un cálculo nuestro: la zona es de la cuenta y
  // Vercel corre en UTC.
  const fechaDe = (rows) => String((rows && rows[0] && rows[0].date_start) || '').slice(0, 10);

  // 🔴 **El cruce se corta en el último día CERRADO, que es el `ayer` que contestó Meta.**
  // Dos motivos distintos, y hacen falta los dos:
  //   1. El espejo de la tienda lo llena el sync de las 3 AM, así que el día en curso puede estar
  //      vacío ⇒ una fila con gasto y cero pedidos se lee como un día catastrófico.
  //   2. 🔴 Y aunque NO esté vacío —a las 17 h ya hay pedidos cargados— sigue siendo medio día de
  //      gasto contra medio día de pedidos, y arrastra para abajo el promedio de la última ventana,
  //      que es justo la que se resta contra la anterior para sacar el marginal. Medido el 21-ago
  //      corriendo esto contra la pauta real: el día en curso entraba con 4 pedidos y $4.983.
  // ⛔ Cortar «donde la tienda tenga datos» sólo tapa el caso 1, y es el menos peligroso.
  const ultimoCerrado = fechaDe(ayerRes.rows) || ventasRes.ultimo || '';
  const caja = cruzarConLaCaja(orden(porFechaLinea), ventasRes.porDia || {}, ultimoCerrado);

  const texto = renderParte({
    hoy,
    ayer,
    serie: orden(porFecha),
    techos: techoRes.techos || {},
    techosDiarios,
    caja,
    lineaCaja,
    objetivoPedidos: OBJETIVO_PEDIDOS_DIA,
    meta: {
      cuenta: account,
      leido: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
      hoy: fechaDe(hoyRes.rows),
      ayer: fechaDe(ayerRes.rows),
      zona: 'la de la cuenta (los dias los resolvio Meta)',
    },
  });

  return res.status(200).json({
    ok: true,
    texto,
    // Lo que no se pudo leer se DICE, no se omite: un bloque vacío por una falla se ve igual que un
    // bloque vacío porque no hubo nada.
    faltantes: [
      serieRes.ok ? null : `serie diaria: ${serieRes.error || 'no se pudo leer'}`,
      adsetRes.ok ? null : 'techos diarios de los conjuntos',
      campRes.ok ? null : 'objetivo de las campañas',
      asign.error ? `lineas de las campañas: ${asign.error}` : null,
      techoRes.error ? `techos por compra: ${techoRes.error}` : null,
      ventasRes.error ? `pedidos de la tienda: ${ventasRes.error}` : null,
    ].filter(Boolean),
  });
}
