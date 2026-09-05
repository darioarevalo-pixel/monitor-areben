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

/**
 * Cuánto ruido tiene un costo por compra calculado sobre `n` compras, como FRACCIÓN.
 *
 * MIDE y ⛔ no decide: devuelve la magnitud y el corte lo aplica quien llama. Un `caro: boolean`
 * acá adentro sería la firma que invita al bug — el día que alguien quiera otro corte lo escribe
 * al lado en vez de moverlo, y quedan dos.
 *
 * Con `n` compras la tasa tiene un error relativo del orden de `1/√n`: 2 compras son ±71%, 6 son
 * ±41%, 25 son ±20%. Sin `n` (cero compras) devuelve `null`, ⛔ nunca 0: «no hay tasa» ⛔ no es
 * «la tasa es exacta».
 */
export function ruidoDeTasa(n) {
  const k = Number(n);
  if (!Number.isFinite(k) || k <= 0) return null;
  return 1 / Math.sqrt(k);
}

/**
 * **El único lugar donde se decide «esta pauta está cara».** Lo llaman la zona de Rendimiento y el
 * detector `costo-alto` de las automatizaciones, para que ⛔ no puedan contestar distinto sobre el
 * mismo conjunto.
 *
 * # 🔴 Por qué existe (5-sep-2026)
 *
 * `veredicto()` corta en 1,0× el techo, sin tolerancia y **sin mirar cuántas compras sostienen ese
 * costo**. Medido contra producción ese día: de 11 pautas de BDI que entregaban, **8 salían
 * `pausar`**, y cuatro de las ocho se apoyaban en **2 o 3 compras**. Bruno lo leyó como *«parece
 * que están todas quemando plata, raro raro»*, y tenía razón: el total de la cuenta estaba en el
 * 94% del techo mientras la pantalla mandaba a apagar el 73% de lo que gastaba.
 *
 * 🔑 **La misma familia que la fatiga de 7 días**: una medición más chica que el fenómeno ⛔ no da
 * «poca señal», da **ruido con cara de veredicto**. Ver `compararCtr`.
 *
 * # 🔴 El ruido se toma como fracción del TECHO, ⛔ no del CPA
 *
 * El error estándar formalmente correcto sería `cpa/√n`, y con eso el umbral para 2 compras daría
 * **341%** y para 6, **169%** ⇒ **ninguna pauta de la cuenta propondría nada nunca**, que es el
 * modo de falla opuesto y peor (una pantalla que no dice nada se apaga sola). Contra el techo el
 * umbral queda acotado y monótono: 2 compras ⇒ 171%, 6 ⇒ 141%, 25 ⇒ 120%.
 * ⇒ **Esto es un piso de MAGNITUD calibrado sobre el ruido, ⛔ no un test de hipótesis**, y hay que
 * leerlo así: contesta *«¿el exceso es más grande que lo que la muestra puede inventar?»*.
 *
 * # ⛔ Lo que este corte NO toca
 *
 * - **Cero compras con el gasto arriba del techo sigue siendo ALTO probado.** No hay tasa, así que
 *   no hay ruido que valga: `ruidoDeTasa(0)` es `null` y esta rama ⛔ no lo mira.
 * - **`veredicto()` se queda SIN banda, a propósito**, porque de él cuelgan
 *   `diasSeguidosBajoElTecho()` y `hayRacha()`: si un día caro dejara de cortar la racha por
 *   «ruidoso», una pauta que gotea días malos acumularía racha y terminaría con una propuesta de
 *   **subirle plata**. Unificarlos «de paso» en un refactor es el error caro de este archivo.
 *
 * Devuelve la medición entera para que la pantalla pueda decir el porqué con números:
 * `estado` · `cpa` · `pct` (del techo) · `n` · `ruido` · `umbralPct` · `excedente`.
 */
export function veredictoDeCosto(gasto, compras, techo) {
  const g = Number(gasto) || 0;
  const n = Number(compras) || 0;
  const t = Number(techo) || 0;
  const vacio = { cpa: null, pct: null, n: n || null, ruido: null, umbralPct: null, excedente: null };

  if (t <= 0) return { estado: '?', ...vacio };
  if (!g) return { estado: '-', ...vacio };

  const excedente = g - n * t;
  if (!n) return { estado: g > t ? 'SIN-COMPRAS-ALTO' : 'MIDIENDO', ...vacio, excedente };

  const cpa = g / n;
  const pct = (cpa / t) * 100;
  const ruido = ruidoDeTasa(n);
  const umbralPct = 100 * (1 + ruido);
  const base = { cpa, pct, n, ruido, umbralPct, excedente };

  if (pct > umbralPct) return { estado: 'ALTO', ...base };
  if (pct > 100) return { estado: 'SIN-PRUEBA', ...base };
  return { estado: 'OK', ...base };
}

/**
 * Cuántas compras harían falta para que un exceso de `pct`% supere su propio ruido.
 *
 * Se despeja de `pct > 100(1 + 1/√n)`: `n > (100/(pct−100))²`. Sirve para que el gris ⛔ no sea
 * mudo — una pauta al 112% necesita ~70 compras, y decirlo convierte «no se sabe» en «esto ⛔ no se
 * va a poder probar mirando esta pauta». `null` cuando ya está probado o cuando no hay exceso.
 */
export function comprasParaAfirmar(pct) {
  const p = Number(pct);
  if (!Number.isFinite(p) || p <= 100) return null;
  return Math.ceil((100 / (p - 100)) ** 2);
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

/**
 * Agrupa filas de aviso por conjunto, quedándose con la línea, la campaña y el estado.
 *
 * 🔑 **La clave es el ID y el nombre es el respaldo.** Dos conjuntos de campañas distintas se pueden
 * llamar igual, y con el nombre de clave se sumarían en una fila sola: la prosa mostraría un gasto
 * que no es de ninguno de los dos, y la zona de Rendimiento no podría empalmar la fila con su celda.
 * El respaldo queda porque una fila sin `adset_id` —que Graph no debería dar— no se puede perder.
 */
export function porConjunto(filas) {
  const m = new Map();
  for (const f of filas) {
    const k = f.conjuntoId || f.conjunto || '(sin conjunto)';
    if (!m.has(k)) m.set(k, { conjunto: f.conjunto || '(sin conjunto)', conjuntoId: f.conjuntoId || '', linea: f.linea, campania: f.campania, tipo: f.tipo, estado: f.estado, filas: [] });
    const g = m.get(k);
    g.filas.push(f);
    // 🔑 El estado del conjunto es el del aviso MÁS VIVO, no el del primero que llegó. Un conjunto
    // con un aviso activo y tres pausados está ACTIVE; leer el primero lo daría por muerto según
    // en qué orden vinieran, que es la clase de dato que cambia solo entre dos lecturas.
    if (f.estado === 'ACTIVE') g.estado = 'ACTIVE';
  }
  return [...m.values()].map((g) => ({ ...g, ...sumar(g.filas) })).sort((a, b) => b.gasto - a.gasto);
}


/**
 * Un grupo de `porConjunto()` con la forma que la **zona de Rendimiento** sabe empalmar.
 *
 * 🔴 **El CTR y el CPM se RECALCULAN sobre el agregado, ⛔ no se promedian ni se suman.** Sumar los
 * `ctr` de cinco avisos da un número que puede pasar el 100% y promediarlos le da el mismo peso al
 * aviso de $200 que al de $20.000. Es la misma trampa que ya tiene su nota en `snapshot.core.js`.
 *
 * ⚠️ Sin impresiones se devuelve **0 y ⛔ no `null`**: acá el cero es real —no hubo entrega— y la
 * columna de la tabla ya distingue el «—» por su cuenta cuando falta el denominador de un costo.
 */
export function aCeldaViva(grupo, diarioPorId = {}) {
  const g = grupo || {};
  const imp = Number(g.impresiones) || 0;
  const clics = Number(g.clics) || 0;
  const gasto = Number(g.gasto) || 0;
  const compras = Number(g.compras) || 0;
  const id = g.conjuntoId || '';
  const diario = Object.prototype.hasOwnProperty.call(diarioPorId, id) ? diarioPorId[id] : null;
  return {
    id,
    nombre: g.conjunto || '(sin conjunto)',
    linea: g.linea || 'sin-linea',
    campania: g.campania || '',
    estado: g.estado || null,
    diario,
    spend: gasto,
    impresiones: imp,
    clicks: clics,
    compras,
    revenue: Number(g.revenue) || 0,
    ctr: imp ? (clics / imp) * 100 : 0,
    cpm: imp ? (gasto / imp) * 1000 : 0,
    carritos: Number(g.carritos) || 0,
    checkouts: Number(g.checkouts) || 0,
    lpv: Number(g.lpv) || 0,
    costo: compras ? gasto / compras : 0,
  };
}

/**
 * Dos días de celdas vivas sumados en uno, para «Hoy y ayer».
 *
 * 🔴 **El CTR y el CPM se vuelven a derivar del total y ⛔ no se promedian.** Es el mismo cuidado que
 * `aCeldaViva`, y acá muerde más: un día de 100 impresiones y otro de 100.000 promediados dan un CTR
 * que no le pasó a nadie.
 *
 * ⚠️ **El `diario` se toma del día MÁS NUEVO** y ⛔ no se suma: es una configuración, no una medición.
 * Sumarlo diría que el conjunto tiene el doble de caja de la que tiene, que es justo el número con el
 * que se decide si subirle el presupuesto.
 */
export function sumarVivas(...dias) {
  const m = new Map();
  // Se recorre del más VIEJO al más nuevo para que el último `diario` y el último `estado` ganen.
  for (const lista of dias) {
    for (const v of lista || []) {
      const k = String(v.id || v.nombre || '');
      const a = m.get(k);
      if (!a) { m.set(k, { ...v }); continue; }
      a.spend += Number(v.spend) || 0;
      a.impresiones += Number(v.impresiones) || 0;
      a.clicks += Number(v.clicks) || 0;
      a.compras += Number(v.compras) || 0;
      a.revenue += Number(v.revenue) || 0;
      a.carritos += Number(v.carritos) || 0;
      a.checkouts += Number(v.checkouts) || 0;
      a.lpv += Number(v.lpv) || 0;
      a.nombre = v.nombre || a.nombre;
      a.estado = v.estado || a.estado;
      if (v.diario != null) a.diario = v.diario;
    }
  }
  return [...m.values()].map((a) => ({
    ...a,
    ctr: a.impresiones ? (a.clicks / a.impresiones) * 100 : 0,
    cpm: a.impresiones ? (a.spend / a.impresiones) * 1000 : 0,
    costo: a.compras ? a.spend / a.compras : 0,
  })).sort((a, b) => b.spend - a.spend);
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
 *
 * 🔴 **`hasta` es el último día CERRADO y no es opcional en la práctica.** Medido el 21-ago-2026
 * corriendo esto contra la pauta real: el día en curso entra con **medio día de gasto y medio día de
 * pedidos** y arrastra para abajo el promedio de la última ventana, que es justo la que se compara
 * contra la anterior para sacar el marginal. Es el mismo defecto que ya tiene su función en
 * `escalado.core.js` (`ultimoDiaCerrado`), donde la foto del día en curso cortaba toda racha en
 * cero. ⛔ Cortar «donde la tienda tenga datos» NO alcanza: hoy a las 17 h la tienda ya tiene
 * pedidos cargados, así que ese corte deja pasar el día parcial.
 */
export function cruzarConLaCaja(serieLinea = [], pedidosPorDia = {}, hasta = '') {
  return serieLinea.filter((d) => !hasta || String(d.fecha) <= hasta).map((d) => {
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
 * Un costo para imprimir: **vacío cuando no hay denominador, nunca `0`.**
 *
 * 🔴 Salió de correr el parte contra la pauta real el 21-ago-2026: los días sin compras atribuidas
 * salían con `costo_compra_meta` en **0**, y un 0 en una columna de costos se lee como «ese día las
 * compras salieron gratis». No es un detalle de formato: es la diferencia entre «no costó nada» y
 * «no hay con qué dividir». Misma familia que el `atrib` que devuelve `null` en vez de 0.
 */
const costoTxt = (gasto, n) => (n ? ent(gasto / n) : '');

/**
 * La hora que va en curso, **leída del dato y no de un reloj**.
 *
 * 🔴 **El problema que resuelve.** Comparar el día en curso contra el día de ayer ENTERO da −50% a
 * media tarde en casi todas las filas, y eso se lee como un derrumbe cuando lo único que dice es
 * que el día va por la mitad. Para comparar contra «ayer a esta hora» hace falta saber qué hora es
 * **en la zona de la cuenta publicitaria** — y ⛔ eso no se puede calcular acá: Vercel corre en UTC
 * y esta máquina no, y calcular la hora del lado del servidor ya falló dos veces en este repo.
 *
 * 🔑 **La salida es la misma que usó `ultimoDiaCerrado()`: derivarla del dato.** El desglose horario
 * de HOY que contesta Meta ya viene en la zona de la cuenta ⇒ **el balde más alto que tiene entrega
 * ES la hora en curso**, sin que nadie tenga que saber en qué huso vive la cuenta.
 *
 * Conservador a propósito: si en la hora en curso todavía no entregó nadie, devuelve la anterior.
 * Una hora de menos compara dos ventanas más cortas pero IGUALES entre sí, que es lo único que
 * importa; una hora de más compararía media hora contra una entera.
 */
export function horaEnCurso(filasHoy) {
  let mejor = null;
  for (const f of Array.isArray(filasHoy) ? filasHoy : []) {
    if (!f || !Number.isInteger(f.hora)) continue;
    // «Entregó» es haber mostrado o haber gastado. Una hora con impresiones y $0 existe.
    if (!(Number(f.impresiones) > 0 || Number(f.gasto) > 0)) continue;
    if (mejor === null || f.hora > mejor) mejor = f.hora;
  }
  return mejor;
}

/**
 * Suma las horas de un día **hasta la hora `corte`, incluida**.
 *
 * ⚠️ El corte va sobre el número de hora y ⛔ no sobre el orden del array: Meta devuelve los baldes
 * agrupados por campaña, así que vienen intercalados y confiar en el orden daría una suma parcial
 * distinta en cada llamada.
 */
export function sumarHasta(filas, corte) {
  const t = { gasto: 0, compras: 0, revenue: 0, impresiones: 0 };
  if (!Number.isInteger(corte)) return t;
  for (const f of Array.isArray(filas) ? filas : []) {
    if (!f || !Number.isInteger(f.hora) || f.hora > corte) continue;
    t.gasto += Number(f.gasto) || 0;
    t.compras += Number(f.compras) || 0;
    t.revenue += Number(f.revenue) || 0;
    t.impresiones += Number(f.impresiones) || 0;
  }
  return t;
}

/**
 * El tope diario de lo que ESTÁ ENTREGANDO hoy en una línea, y si ese número es exacto o un piso.
 *
 * 🔴 **Puede ser un piso, y por eso lo dice.** Una campaña con presupuesto a nivel campaña (CBO)
 * reparte sola entre sus conjuntos y sus conjuntos **no tienen `daily_budget` propio**: Meta no
 * devuelve nada para ellos. Sumar sólo los que tienen tope da un número más chico que el real, y
 * dividir el gasto por ese número da un porcentaje **por encima del verdadero** — el peor error
 * posible acá, porque exagera lo consumido justo en la pantalla con la que se decide soltar plata.
 *
 * ⇒ Se cuenta cuántos conjuntos que entregan quedaron sin tope propio (`sinTope`). Con uno solo,
 * el consumidor **no dibuja el porcentaje**: muestra el tope como un piso. ⛔ Un porcentaje que se
 * sabe inflado no se redondea, no se muestra.
 */
export function topeQueEntrega(filasHoy, techosDiarios = {}, estados = {}, linea = '') {
  const vistos = new Set();
  let tope = 0;
  let sinTope = 0;
  for (const f of Array.isArray(filasHoy) ? filasHoy : []) {
    if (!f || !f.conjunto) continue;
    if (linea && f.linea !== linea) continue;
    if (vistos.has(f.conjunto)) continue;
    vistos.add(f.conjunto);
    // Un conjunto pausado a media tarde gastó hoy pero ya no puede gastar más: no suma tope.
    if (estados[f.conjunto] && estados[f.conjunto] !== 'ACTIVE') continue;
    const t = Number(techosDiarios[f.conjunto]) || 0;
    if (t > 0) tope += t;
    else sinTope += 1;
  }
  return { tope, sinTope, conjuntos: vistos.size };
}

/**
 * La banda de HOY: los números del día en curso, ya juzgados, para DIBUJAR.
 *
 * 🔑 **Existe porque el parte ya traía todo esto y lo tiraba a un texto.** Las cinco llamadas a
 * Graph son las mismas; lo único que cambia es que la respuesta deja de ser sólo prosa.
 *
 * 🔑 **Y lo que la justifica no es repetir Ads Manager** —eso ya lo hace Ads Manager mejor— sino
 * poner al lado las tres columnas que Meta nunca va a tener: el techo por compra que sale de la
 * ficha de rentabilidad, el veredicto contra ese techo, y el cruce contra los pedidos reales.
 *
 * `aEstaHora` es `null` cuando Meta no contestó el desglose horario, y entonces `motivoSinHora`
 * dice por qué. ⛔ **Nunca se cae a comparar contra el día entero**: ese es el número que existe y
 * no significa, y es justo el que esta función viene a sacar del medio.
 */
export function bandaDeHoy({
  hoy = [], ayer = [], horasHoy = [], horasAyer = [],
  techos = {}, techosDiarios = {}, estados = {}, linea = '',
}) {
  const dela = (f) => !linea || f.linea === linea;
  const h = sumar(hoy.filter(dela));
  const a = sumar(ayer.filter(dela));
  const techo = Number(techos[linea]) || 0;
  const costo = h.compras ? h.gasto / h.compras : null;

  const hora = horaEnCurso(horasHoy.filter(dela));
  const previo = hora === null ? null : sumarHasta(horasAyer.filter(dela), hora);
  // Con el desglose pedido pero sin una sola hora de ayer, comparar sería dividir por un día que no
  // se leyó. Se dice, igual que se dice cualquier otro faltante.
  const hayPrevio = previo !== null && previo.impresiones > 0;

  return {
    linea,
    hoy: {
      gasto: h.gasto,
      compras: h.compras,
      costo,
      revenue: h.revenue,
      roas: h.gasto ? h.revenue / h.gasto : null,
      carritos: h.carritos,
      checkouts: h.checkouts,
      clics: h.clics,
    },
    techo,
    // Sin techo guardado ⛔ no se inventa un porcentaje: `veredicto()` ya contesta `?` y la pantalla
    // manda a cargar la ficha en vez de dibujar un número que decide plata sin haberse medido.
    pctTecho: techo && costo ? (costo / techo) * 100 : null,
    veredicto: veredicto(h.gasto, h.compras, techo),
    ...topeQueEntrega(hoy, techosDiarios, estados, linea),
    hora,
    aEstaHora: hayPrevio
      ? { gasto: previo.gasto, compras: previo.compras, costo: previo.compras ? previo.gasto / previo.compras : null }
      : null,
    motivoSinHora: hayPrevio
      ? null
      : hora === null
        ? 'Meta todavía no devolvió ninguna hora con entrega de hoy.'
        : 'Meta no devolvió el desglose por hora de ayer.',
    // El día entero de ayer va aparte y ROTULADO como entero: sirve para saber dónde cerró, ⛔ no
    // para compararlo contra medio día.
    ayerEntero: { gasto: a.gasto, compras: a.compras, costo: a.compras ? a.gasto / a.compras : null },
  };
}

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
      d.fecha, d.pedidos, ent(d.gasto), costoTxt(d.gasto, d.pedidos),
      d.comprasMeta, costoTxt(d.gasto, d.comprasMeta),
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
