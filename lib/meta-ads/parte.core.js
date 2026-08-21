// El PARTE DE PAUTA: todo lo que hace falta para decidir presupuestos, en UN texto plano.
//
// 🔑 **Por qué existe, y por qué es TEXTO y no JSON.** Analizar un día de pauta costaba doce
// llamadas al navegador y una recorrida por Ads Manager: pedir la cuenta, pedir ayer, pedir la
// semana, agrupar los avisos por conjunto a mano, buscar el techo en otra pantalla, y volver a
// Ads Manager por lo que la API no proyectaba. Cada vuelta trae de vuelta el JSON entero —con
// miniaturas, permalinks y campos que nadie mira— y eso es lo que se paga. Este módulo arma **una
// sola respuesta, ya agregada por conjunto, ya comparada contra ayer y ya juzgada contra el techo**.
//
// 🔴 **Y los nombres se limpian a propósito.** Medido el 18-ago-2026: un `&` adentro del nombre de
// un aviso (`AD 1 - SWEATERS & FITS`) hace que el puente del navegador corte la respuesta ENTERA
// con «BLOCKED: Cookie/query string data» — no el campo, la respuesta. Un análisis se quedó sin
// seis filas por eso y no se notó hasta contarlas. Por eso `limpiar()` no es cosmética.
//
// Este archivo es PURO: recibe filas y devuelve un string. No sabe de Graph, de Supabase ni de
// permisos. Lo que habla con Meta vive en `api/meta-ads.js`; lo que se prueba, acá.

/**
 * Saca de un nombre los caracteres que rompen el transporte.
 *
 * `&`, `?` y `=` son los que disparan el filtro del puente. Se reemplaza en vez de borrar para que
 * el nombre siga siendo reconocible: `SWEATERS & FITS` tiene que seguir leyéndose, no volverse
 * `SWEATERS  FITS`. El `|` va aparte: es el separador de columnas y partiría la fila en dos.
 */
export function limpiar(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, ' y ')
    .replace(/[?=]/g, '-')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

const ent = (n) => Math.round(Number(n) || 0);
const dec = (n, d = 2) => (Number.isFinite(Number(n)) ? Number(n).toFixed(d) : '0.00');

/**
 * El veredicto de un conjunto contra el techo de su línea.
 *
 * 🔑 **`SIN-COMPRAS` no es «todavía no sé»: cuando lo gastado ya pasó el techo, es un ALTO probado.**
 * Un conjunto que lleva $12.000 sin una compra no está pendiente de medición —ya compró cero
 * compras a un precio infinito—. Distinguirlo de «gastó $800 y todavía no vendió» es la diferencia
 * entre una decisión y una corazonada, y era justo lo que se resolvía a ojo en cada informe.
 *
 * Sin techo (una línea sin fila guardada) devuelve `?`: ⛔ no se inventa un default, porque un
 * techo inventado se lee igual que uno medido y decide plata.
 */
export function veredicto(gasto, compras, techo) {
  if (!techo || techo <= 0) return '?';
  if (!gasto) return '-';
  if (!compras) return gasto > techo ? 'ALTO' : 'MIDIENDO';
  return gasto / compras > techo ? 'ALTO' : 'OK';
}

/** Suma un conjunto de filas de aviso. `reach` NO se suma (es dedup) y por eso no está. */
export function sumar(filas) {
  const t = { gasto: 0, compras: 0, revenue: 0, impresiones: 0, clics: 0, carritos: 0, checkouts: 0, lpv: 0 };
  for (const f of filas) {
    t.gasto += Number(f.gasto) || 0;
    t.compras += Number(f.compras) || 0;
    t.revenue += Number(f.revenue) || 0;
    t.impresiones += Number(f.impresiones) || 0;
    t.clics += Number(f.clics) || 0;
    t.carritos += Number(f.carritos) || 0;
    t.checkouts += Number(f.checkouts) || 0;
    t.lpv += Number(f.lpv) || 0;
  }
  return t;
}

/** Agrupa filas de aviso por conjunto, quedándose con la línea, la campaña y el estado. */
export function porConjunto(filas) {
  const m = new Map();
  for (const f of filas) {
    const k = f.conjunto || '(sin conjunto)';
    if (!m.has(k)) m.set(k, { conjunto: k, linea: f.linea, campania: f.campania, tipo: f.tipo, estado: f.estado, filas: [] });
    const g = m.get(k);
    g.filas.push(f);
    // 🔑 El estado del conjunto es el del aviso MÁS VIVO, no el del primero que llegó. Un conjunto
    // con un aviso activo y tres pausados está ACTIVE; leer el primero lo daría por muerto según
    // en qué orden vinieran, que es la clase de dato que cambia solo entre dos lecturas.
    if (f.estado === 'ACTIVE') g.estado = 'ACTIVE';
  }
  return [...m.values()].map((g) => ({ ...g, ...sumar(g.filas) })).sort((a, b) => b.gasto - a.gasto);
}


// ═══════════════════════════════════════════════════════════════════════════════════════════
// EL CRUCE CON LA CAJA — por qué el parte no puede terminar en los números de Meta
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 Medido el 20-ago-2026: **las dos series fueron en sentido contrario durante dos días.** Meta
// decía que el costo por compra había bajado de $5.759 a $3.802 (−34%); los pedidos reales de
// Tienda Nube decían que había subido de $2.303 a $3.380 (+47%). Ninguna de las dos mentía: el
// CAPI de `Comprar` arrancó el 18-ago y Meta pasó de explicar el 40% de los pedidos al 89%. La
// mejora era de ATRIBUCIÓN, y **ninguna de esas compras era nueva**.
//
// ⇒ 🔑 **El oráculo del escalado es `pedidos/día` de la tienda, ⛔ NO `purchases` de Meta.** Y la
// forma de que eso no se olvide no es un comentario en una nota: es que las dos columnas estén en
// la misma tabla, con la proporción entre ellas al lado. Un número que se puede leer solo se lee
// solo.

/**
 * Una fila por día con las dos versiones del mismo hecho, y la proporción entre ellas.
 *
 * `gasto` y `comprasMeta` salen de la pauta de UNA línea (no de la cuenta: adentro de la misma
 * cuenta publicitaria conviven BDI y Zattia, y dividir el gasto de las dos por los pedidos de una
 * da un costo por pedido que no existe). `pedidos` son los de la tienda de esa línea.
 *
 * ⚠️ **`atrib` puede pasar el 100%** y no es un error a tapar: Meta atribuye por ventana de 7 días
 * al clic, así que una compra de hoy puede corresponder a un clic de anteayer. Se muestra como
 * viene; recortarla a 100 escondería justo el día que hay que mirar.
 */
export function cruzarConLaCaja(serieLinea = [], pedidosPorDia = {}) {
  return serieLinea.map((d) => {
    const pedidos = Number(pedidosPorDia[d.fecha]) || 0;
    const comprasMeta = Number(d.compras) || 0;
    const gasto = Number(d.gasto) || 0;
    return {
      fecha: d.fecha,
      pedidos,
      gasto,
      costoPedidoReal: pedidos ? gasto / pedidos : 0,
      comprasMeta,
      costoCompraMeta: comprasMeta ? gasto / comprasMeta : 0,
      // `null` y no 0: sin pedidos reales ese día la proporción no es «0%», es «no se puede saber».
      // Un 0% en la columna se lee como «Meta no vio nada», que es una afirmación distinta.
      atrib: pedidos ? (comprasMeta / pedidos) * 100 : null,
    };
  });
}

/**
 * El costo MARGINAL: cuánto costó el pedido que se sumó, no el pedido promedio.
 *
 * Compara dos ventanas contiguas de `dias` días cada una —las últimas dos— y devuelve
 * `(Δgasto ÷ Δpedidos)`. Es el número que decide si conviene seguir escalando, porque el promedio
 * arrastra los pedidos baratos de antes de escalar y **siempre se ve mejor de lo que el peso
 * siguiente va a rendir**.
 *
 * 🔴 **Devuelve `null` con un motivo cuando no se puede calcular, y eso es la mitad de la función.**
 * Si los pedidos no subieron, la división da un número negativo o infinito que se lee perfecto y
 * miente: con Δpedidos negativo el marginal sale negativo, y un costo negativo en una tabla de
 * costos se lee como «cada pedido nuevo te devuelve plata».
 */
export function marginalEntreVentanas(cruce = [], dias = 7) {
  const orden = [...cruce].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  if (orden.length < dias * 2) {
    return { a: null, b: null, marginal: null, motivo: `hacen falta ${dias * 2} dias y hay ${orden.length}` };
  }
  const corte = (filas) => {
    const gasto = filas.reduce((t, f) => t + (Number(f.gasto) || 0), 0);
    const pedidos = filas.reduce((t, f) => t + (Number(f.pedidos) || 0), 0);
    return {
      desde: filas[0].fecha, hasta: filas[filas.length - 1].fecha, dias: filas.length,
      gasto, pedidos, gastoDia: gasto / filas.length, pedidosDia: pedidos / filas.length,
      costoPedido: pedidos ? gasto / pedidos : 0,
    };
  };
  const b = corte(orden.slice(-dias));
  const a = corte(orden.slice(-dias * 2, -dias));
  const dPedidos = b.pedidos - a.pedidos;
  const dGasto = b.gasto - a.gasto;
  if (dPedidos <= 0) {
    return { a, b, marginal: null, motivo: `los pedidos no subieron (${a.pedidos} -> ${b.pedidos})` };
  }
  if (dGasto <= 0) {
    return { a, b, marginal: null, motivo: `el gasto no subio (${ent(a.gasto)} -> ${ent(b.gasto)}): no hay escalon que medir` };
  }
  return { a, b, marginal: dGasto / dPedidos, motivo: '' };
}

const costo = (gasto, n) => (n ? gasto / n : 0);

/**
 * Arma el parte entero.
 *
 * `hoy` y `ayer` son arrays de filas de aviso ya normalizadas; `serie` es la diaria; `techos` es
 * `{ linea: costoMax }`. `meta` lleva lo que el lector necesita para NO confundirse de ventana.
 *
 * ⚠️ **La cabecera dice que HOY es el día en curso a propósito.** Un conjunto creado hoy aparece
 * con su primer día parcial, y leerlo como «no usa el techo» da el diagnóstico dado vuelta. El
 * parte no puede impedir esa lectura, pero sí puede no colaborar con ella.
 */
export function renderParte({
  hoy = [], ayer = [], serie = [], techos = {}, meta = {},
  caja = [], techosDiarios = {}, lineaCaja = 'bdi', objetivoPedidos = 100,
}) {
  const L = [];
  const P = (s) => L.push(s);

  P(`PARTE DE PAUTA · cuenta ${meta.cuenta || '?'} · leido ${meta.leido || '?'}`);
  P(`HOY = ${meta.hoy || '?'} (DIA EN CURSO, parcial) · AYER = ${meta.ayer || '?'} (dia cerrado) · zona ${meta.zona || '?'}`);
  P(`Techos por compra: ${Object.entries(techos).map(([k, v]) => `${k} ${ent(v)}`).join(' · ') || 'ninguno guardado'}`);
  P('');

  // ── Por línea ────────────────────────────────────────────────────────────────────────────────
  const lineas = [...new Set([...hoy, ...ayer].map((f) => f.linea || 'sin-linea'))].sort();
  P('## LINEAS');
  P('linea|techo|gasto|compras|costo|sem|roas|carritos|costo_carrito|gasto_ay|compras_ay|costo_ay');
  for (const ln of lineas) {
    const h = sumar(hoy.filter((f) => (f.linea || 'sin-linea') === ln));
    const a = sumar(ayer.filter((f) => (f.linea || 'sin-linea') === ln));
    const techo = techos[ln] || 0;
    P([
      ln, ent(techo), ent(h.gasto), h.compras, ent(costo(h.gasto, h.compras)),
      veredicto(h.gasto, h.compras, techo), dec(h.gasto ? h.revenue / h.gasto : 0),
      h.carritos, ent(costo(h.gasto, h.carritos)),
      ent(a.gasto), a.compras, ent(costo(a.gasto, a.compras)),
    ].join('|'));
  }
  P('');

  // ── Por conjunto, hoy contra ayer ────────────────────────────────────────────────────────────
  // 🔑 El delta de gasto va en la MISMA fila que el gasto. La canibalización de un conjunto nuevo
  // no se ve en su propia fila —se ve en que los demás bajaron sin que nadie tocara un techo—, y
  // eso sólo se lee si las dos columnas están una al lado de la otra.
  const ayerPorConj = new Map(porConjunto(ayer).map((g) => [g.conjunto, g]));
  P('## CONJUNTOS (orden por gasto de hoy)');
  // 🔑 `techo_dia` y `%techo` distinguen las dos cosas que se confunden todo el tiempo: un conjunto
  // que no gasta porque no le alcanza la caja, y uno que no la usa. Está medido que Meta se permite
  // 1,25x del diario (un conjunto cerró al 113%) y que **subirle el techo a uno que gasta el 74% no
  // le manda un peso**. Sin esta columna las dos se ven igual: gasto bajo.
  P('linea|tipo|conjunto|estado|gasto|compras|costo|sem|carritos|costo_carrito|roas|techo_dia|%techo|gasto_ay|compras_ay|costo_ay|delta%');
  for (const g of porConjunto(hoy)) {
    const a = ayerPorConj.get(g.conjunto) || { gasto: 0, compras: 0 };
    const techo = techos[g.linea] || 0;
    // ⚠️ Indexado por NOMBRE de conjunto, que es la única llave que traen las filas de insights ya
    // agregadas. Dos conjuntos homónimos en campañas distintas compartirían fila; no pasa hoy y se
    // vería como un %techo imposible, no como un número plausible.
    const td = Number(techosDiarios[g.conjunto]) || 0;
    const delta = a.gasto ? Math.round(((g.gasto - a.gasto) / a.gasto) * 100) : '';
    P([
      g.linea || 'sin-linea', g.tipo || '?', limpiar(g.conjunto), g.estado || '?',
      ent(g.gasto), g.compras, ent(costo(g.gasto, g.compras)), veredicto(g.gasto, g.compras, techo),
      g.carritos, ent(costo(g.gasto, g.carritos)), dec(g.gasto ? g.revenue / g.gasto : 0),
      td ? ent(td) : '', td ? Math.round((g.gasto / td) * 100) : '',
      ent(a.gasto), a.compras, ent(costo(a.gasto, a.compras)), delta === '' ? '' : `${delta}`,
    ].join('|'));
  }
  // Los que gastaron ayer y hoy no aparecen: sin esta línea, un conjunto que se apagó anoche
  // simplemente no está, y «no está» se lee como «no existe» en vez de como «dejó de entregar».
  const apagados = porConjunto(ayer).filter((g) => !porConjunto(hoy).some((x) => x.conjunto === g.conjunto));
  for (const g of apagados) {
    const td = Number(techosDiarios[g.conjunto]) || 0;
    P([g.linea || 'sin-linea', g.tipo || '?', limpiar(g.conjunto), 'SIN-ENTREGA-HOY', 0, 0, 0, '-', 0, 0, '0.00', td ? ent(td) : '', td ? 0 : '', ent(g.gasto), g.compras, ent(costo(g.gasto, g.compras)), '-100'].join('|'));
  }
  P('');

  // ── Por aviso ────────────────────────────────────────────────────────────────────────────────
  // 🔑 El costo por CARRITO por aviso es el dato que no existía en ningún lado: Meta lo manda en la
  // misma llamada que las compras y la proyección lo tiraba. Es lo que deja comparar dos piezas
  // que todavía no vendieron —que son casi todas, casi siempre—.
  P('## AVISOS DE HOY (solo los que gastaron)');
  P('conjunto|aviso|estado|gasto|compras|costo|carritos|costo_carrito|checkouts|ctr|cpm');
  for (const f of hoy.filter((x) => (Number(x.gasto) || 0) > 0).sort((a, b) => b.gasto - a.gasto)) {
    P([
      limpiar(f.conjunto), limpiar(f.aviso), f.estado || '?',
      ent(f.gasto), f.compras, ent(costo(f.gasto, f.compras)),
      f.carritos, ent(costo(f.gasto, f.carritos)), f.checkouts,
      dec(f.ctr), ent(f.cpm),
    ].join('|'));
  }
  P('');

  // ── Embudo ───────────────────────────────────────────────────────────────────────────────────
  // Se suma de las filas de aviso en vez de pedirle a Meta una llamada aparte. Sale lo mismo y es
  // una llamada menos, que es la mitad de por qué existe este parte.
  P('## EMBUDO (sumado de los avisos)');
  P('paso|hoy|costo_hoy|ayer|costo_ayer');
  const th = sumar(hoy);
  const ta = sumar(ayer);
  for (const [label, kh] of [['clic', 'clics'], ['visita_web', 'lpv'], ['carrito', 'carritos'], ['checkout', 'checkouts'], ['compra', 'compras']]) {
    P([label, th[kh], ent(costo(th.gasto, th[kh])), ta[kh], ent(costo(ta.gasto, ta[kh]))].join('|'));
  }
  P('');

  // ── Serie diaria ─────────────────────────────────────────────────────────────────────────────
  P('## SERIE DIARIA (la CUENTA entera: todas las lineas juntas)');
  P('fecha|gasto|compras|costo|roas');
  for (const d of serie) {
    P([d.fecha, ent(d.gasto), d.compras, ent(costo(d.gasto, d.compras)), dec(d.gasto ? d.revenue / d.gasto : 0)].join('|'));
  }
  P('');

  // ── El cruce con la caja ─────────────────────────────────────────────────────────────────────
  P(`## PEDIDOS REALES vs META · linea ${lineaCaja} (EL ORACULO DEL ESCALADO)`);
  P('⚠ el gasto de este bloque es SOLO el de la linea, no el de la cuenta');
  P('⚠ el DIA EN CURSO no figura: el espejo de la tienda lo llena el sync de las 3 AM');
  P('fecha|pedidos_tn|gasto_linea|costo_pedido_REAL|compras_meta|costo_compra_meta|atrib%');
  for (const d of caja) {
    P([
      d.fecha, d.pedidos, ent(d.gasto), ent(d.costoPedidoReal),
      d.comprasMeta, ent(d.costoCompraMeta),
      d.atrib == null ? '' : Math.round(d.atrib),
    ].join('|'));
  }
  P('# atrib% = compras que Meta se atribuye / pedidos reales. 🔴 Si SUBE mientras el costo por');
  P('# compra de Meta BAJA, la mejora es de ATRIBUCION y no hay una sola venta nueva.');
  P('');

  // ── Hacia el objetivo ────────────────────────────────────────────────────────────────────────
  const m = marginalEntreVentanas(caja, 7);
  const techoLinea = techos[lineaCaja] || 0;
  P(`## HACIA ${objetivoPedidos} PEDIDOS/DIA · linea ${lineaCaja}`);
  P('ventana|desde|hasta|dias|gasto_dia|pedidos_dia|costo_pedido');
  for (const [rot, v] of [['anterior', m.a], ['ultima', m.b]]) {
    if (!v) continue;
    P([rot, v.desde, v.hasta, v.dias, ent(v.gastoDia), dec(v.pedidosDia, 1), ent(v.costoPedido)].join('|'));
  }
  if (m.marginal) {
    // 🔑 El marginal va SIEMPRE con sus dos ventanas arriba y sus dos `dias` a la vista. Es una
    // resta entre dos promedios: solo, se lee como un precio medido.
    P(`marginal entre las dos ventanas: ${ent(m.marginal)} por pedido incremental`);
    if (techoLinea) {
      const aire = m.marginal ? techoLinea / m.marginal : 0;
      P(`techo por compra: ${ent(techoLinea)} · aire sobre el marginal: ${dec(aire)}x` +
        (m.marginal > techoLinea ? '  🔴 EL PEDIDO SIGUIENTE CUESTA MAS DE LO QUE VALE' : ''));
    } else {
      P('techo por compra: NO HAY FILA GUARDADA para esta linea ⇒ no se puede juzgar el marginal');
    }
    if (m.b) {
      const faltan = objetivoPedidos - m.b.pedidosDia;
      if (faltan > 0) {
        P(`faltan ${dec(faltan, 1)} pedidos/dia para el objetivo`);
        P(`# ⛔ NO multiplicar los que faltan por el marginal: el marginal SUBE en cada escalon.`);
        P(`# Extrapolar una curva que sube como si fuera plana es el error a no cometer.`);
      } else {
        P(`objetivo CUMPLIDO: ${dec(m.b.pedidosDia, 1)} pedidos/dia`);
      }
    }
  } else {
    // ⛔ No se imprime un número: con Δpedidos <= 0 la división da un costo negativo, que se lee
    // como «cada pedido nuevo devuelve plata».
    P(`marginal: NO SE PUEDE CALCULAR — ${m.motivo}`);
  }

  return L.join('\n');
}
