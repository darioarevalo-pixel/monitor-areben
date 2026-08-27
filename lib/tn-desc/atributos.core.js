/**
 * El DICCIONARIO DE PRENDAS: qué se le pregunta a cada familia y qué valores admite.
 *
 * # Qué problema resuelve
 *
 * Hasta el 27-ago-2026 los bullets de una descripción los escribía un modelo y los sostenía
 * `validarBorrador`: etiqueta de una lista cerrada, máximo 60 caracteres, sin repetir, sin
 * nombrar colores, sin inventar la tela. O sea que **ya eran una tabla escrita en prosa** — con
 * un validador haciendo de esquema y un reintento pagando cada vez que el modelo se salía.
 *
 * La decisión de Bruno (27-ago-2026) fue darlos vuelta: **los bullets son atributos, no
 * redacción**. Se cargan una vez, con una lista cerrada delante, y el bullet se compone solo.
 * Al modelo le queda **el párrafo**, que es lo único que realmente hay que escribir.
 *
 * 🔑 Y el motivo de fondo es más grande que las descripciones: con listas cerradas el catálogo
 * se puede SUMAR («qué escote se vendió más»), que es el dato que hoy no existe para decidir qué
 * producir. ⛔ Por eso los valores no pueden ser texto libre: un campo libre que después se
 * pretenda agregar es un campo que miente — cinco formas de escribir lo mismo son cinco filas.
 *
 * # De dónde salieron los valores
 *
 * De leer las 328 fichas publicadas de Zattia el 27-ago-2026, no de un manual de moda: la mayoría
 * de estos valores ya estaban escritos en la tienda (`microfibra` ×53, `entallado` ×44, `wide`
 * ×19, `mini` ×30, y las 41 menciones de `tiro`, que era el atributo más usado y el único que no
 * existía como etiqueta). Bruno corrigió la lista producto por producto: `buche` salió, `bandó`
 * y `volcado` entraron con su palabra, y `algodón` pasó a ser `jersey de algodón`.
 *
 * ⚠️ **El vocabulario es el del local, no el correcto.** El diccionario existe para que elijan
 * rápido; una palabra que en el local no se usa es una opción que nadie va a saber cuándo tocar.
 *
 * # Por qué es `.js` plano
 *
 * Lo importan `api/_tn-desc.js` (compone el HTML que sale a la tienda) y `api/_tn-desc-ia.js`
 * (le cuenta al modelo qué dicen ya los bullets, para que no los repita). Los handlers de `api/`
 * corren en Node sin pasar por el compilador de Next y **no pueden importar TypeScript** — el
 * mismo motivo de `formato.core.js` y `permisos.core.js`. `atributos.ts` es el re-export tipado.
 */

/* --------------------------------------------------------------- categorías */

/**
 * La categoría de TiendaNube, normalizada.
 *
 * 🔴 Las categorías vienen SUCIAS y hay que mirarlas antes de colgar nada de ellas. Medido el
 * 27-ago-2026 sobre los 328 publicados: conviven `SHORTS, MINIS y FALDAS` con
 * `SHORTS, MINIS Y FALDAS`, `BLAZER` con `BLAZERS`, y `DENIM ` viene **con un espacio al final**.
 * Si la familia se decidiera con el string crudo, tres familias quedarían partidas en dos.
 */
export function normalizarCategoria(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/**
 * Las categorías que NO dicen de qué prenda se trata: son de campaña, no de producto.
 * Un producto en «NEW IN» sigue siendo un top o un jean, y la familia sale de la otra.
 */
const CATEGORIAS_SIN_PRENDA = new Set(['NEW IN', 'SALE', 'WINTER SALE', 'OUTLET', 'BEST SELLERS']);

/* ---------------------------------------------------------------- atributos */

/**
 * Los atributos, con su ORDEN CANÓNICO.
 *
 * 🔑 **El orden vive acá y no en quien escribe.** Es la tercera regla de Bruno: «el cliente que
 * mira 5 productos encuentra Calce siempre en el mismo lugar». Medido contra la corrida del
 * 27-ago, el modelo devolvió los bullets en tres órdenes distintos para tres productos. Ordenar
 * en el render y no validarlo hace que el problema **deje de poder ocurrir** en vez de pasar a
 * ser un rechazo que hay que corregir.
 *
 * `valores: null` = la lista depende de la familia y vive en `FAMILIAS[x].valores`.
 */
export const ATRIBUTOS = {
  tela: {
    label: 'Tela',
    orden: 1,
    // 🔑 El único atributo que la FOTO no puede contestar, y por eso el único que necesita a una
    // persona. Una foto de estudio no distingue una gasa de un voile, y una tela mal puesta
    // termina en un cambio o una devolución.
    valores: [
      'microfibra',
      'jersey de algodón',
      'ribb de algodón',
      'encaje',
      'microtul',
      'ecocuero',
      'morley',
      'red',
      'frisa',
      'lycra',
      'corderoy',
      'bengalina',
      'lino',
      'satén',
      'crepe',
      'piel',
      'lurex',
      'batista',
      'gasa',
      'lanilla',
      // Partido en dos a propósito: es la pregunta que más hace la clienta de un jean y ninguna
      // de las 328 fichas la contestaba.
      'denim rígido',
      'denim elastizado',
      'no identifico',
    ],
  },
  calce: { label: 'Calce', orden: 2, valores: null },
  // 🔑 Silueta es un atributo APARTE de Calce, y no un valor más de su lista. Lo dio vuelta Bruno:
  // «entallado» y «oversize» no son alternativas — un sweater puede ser entallado y oversize a la
  // vez. Metidos en una sola lista, esa prenda tendría que elegir cuál de las dos cosas es.
  silueta: { label: 'Silueta', orden: 3, valores: ['regular', 'oversize'] },
  tiro: { label: 'Tiro', orden: 4, valores: ['tiro alto', 'tiro medio', 'tiro bajo'] },
  // 🔑 Escote y cuello son UN campo y no dos, porque una prenda tiene un solo remate arriba y
  // preguntar las dos cosas obliga a dejar una vacía siempre. La ETIQUETA del bullet sí sale
  // partida —«Cuello: polera», «Escote: en V»— y la decide el valor: ver `etiquetaDeBullet`.
  escote: {
    label: 'Escote / cuello',
    orden: 5,
    valores: [
      'polera',
      'redondo',
      'solapa',
      'camisa',
      'capucha',
      'mao',
      'bote',
      'volcado',
      'en V',
      'strapless',
      'halter',
      'asimétrico',
      'cuadrado',
      'bandó',
      'corazón',
      'palabra de honor',
      'sin espalda',
    ],
  },
  manga: {
    label: 'Manga',
    orden: 6,
    valores: [
      'breteles',
      'musculosa',
      'sin mangas',
      'manga corta',
      'manga 3/4',
      'manga larga',
      'manga princesa',
      'acampanada',
      'murciélago',
      'oxford',
    ],
  },
  largo: { label: 'Largo', orden: 7, valores: null },
  /**
   * El escape, y el único campo libre.
   *
   * ⛔ **Queda FUERA de todo análisis, a propósito.** Es para lo que no entra en ninguna lista
   * («argolla plateada en el medio», «flecos en el frente»). Sumarlo sería sumar cinco maneras de
   * escribir lo mismo. Va último en el bullet por la misma razón: es lo menos comparable.
   */
  detalle: { label: 'Detalle', orden: 99, valores: null, libre: true },
};

/** Los que se eligen de una lista: todos menos el libre. */
export const ATRIBUTOS_CERRADOS = Object.keys(ATRIBUTOS).filter((k) => !ATRIBUTOS[k].libre);

/** El valor de Tela que significa «no sé»: se carga igual, y NO sale a la ficha. */
export const TELA_SIN_IDENTIFICAR = 'no identifico';

/* ----------------------------------------------------------------- familias */

/**
 * Las seis familias, con las categorías de TiendaNube que las alimentan.
 *
 * Medido el 27-ago-2026: este mapa cubre **326 de los 328 publicados**. Los dos que quedan afuera
 * —`BERMUDA HAYDEN` y `BERMUDA TIDE`— están cargados en TiendaNube **sólo como «NEW IN»**: no es
 * un agujero del mapa, es que nadie les puso categoría. Ver `familiaDe`, que los deja pasar sin
 * romper para que la pantalla pueda decirlo.
 */
export const FAMILIAS = {
  tops: {
    label: 'Tops y bodies',
    categorias: ['TOPS Y BODIES', 'REMERAS', 'BLUSAS', 'BLUSAS Y CAMISAS', 'CORSETS'],
    atributos: ['tela', 'calce', 'silueta', 'escote', 'manga', 'largo', 'detalle'],
    valores: {
      calce: ['entallado', 'holgado'],
      largo: ['crop', 'a la cintura', 'a la cadera', 'corto', 'largo'],
    },
  },
  abrigo: {
    label: 'Abrigo',
    categorias: ['SWEATERS', 'BUZOS', 'CAMPERAS', 'BLAZER', 'BLAZERS'],
    atributos: ['tela', 'calce', 'silueta', 'escote', 'manga', 'largo', 'detalle'],
    valores: {
      calce: ['entallado', 'holgado'],
      largo: ['corto', 'a la cadera', 'largo'],
    },
  },
  faldas: {
    label: 'Short, mini y falda',
    categorias: ['SHORTS, MINIS Y FALDAS', 'SHORTS'],
    atributos: ['tela', 'calce', 'tiro', 'largo', 'detalle'],
    valores: {
      calce: ['al cuerpo', 'recta', 'con vuelo', 'plisada'],
      largo: ['mini', 'a la rodilla', 'midi', 'maxi'],
    },
  },
  pantalon: {
    label: 'Pantalón y jean',
    categorias: ['JEANS', 'PANTALONES', 'DENIM'],
    atributos: ['tela', 'calce', 'tiro', 'largo', 'detalle'],
    valores: {
      calce: ['wide leg', 'baggy', 'oxford', 'cargo', 'recto', 'mom'],
      largo: ['capri', 'al tobillo', 'al piso'],
    },
  },
  vestidos: {
    label: 'Vestidos y monos',
    categorias: ['VESTIDOS Y MONOS', 'VESTIDOS'],
    atributos: ['tela', 'calce', 'silueta', 'escote', 'manga', 'largo', 'detalle'],
    valores: {
      calce: ['entallado', 'holgado'],
      largo: ['corto', 'midi', 'largo', 'al piso'],
    },
  },
};

/**
 * ⛔ Accesorios y bags quedan AFUERA (11 productos el 27-ago-2026). No comparten un solo atributo
 * con una prenda —no tienen calce, ni escote, ni manga— así que meterlos sería inventarles una
 * ficha vacía. El día que entren necesitan lista propia (material y medidas), y entra como una
 * familia más acá: agregar una es una entrada de este objeto.
 */
export const CATEGORIAS_FUERA_DE_ALCANCE = ['ACCESORIOS', 'BAGS'];

/* ----------------------------------------------------------------- consulta */

const POR_CATEGORIA = new Map();
for (const [fam, cfg] of Object.entries(FAMILIAS)) {
  for (const c of cfg.categorias) POR_CATEGORIA.set(normalizarCategoria(c), fam);
}

/**
 * La familia de un producto, a partir de sus categorías de TiendaNube.
 *
 * Devuelve `null` cuando ninguna categoría dice de qué prenda se trata — y eso **no es un error
 * que haya que tapar**: es un producto al que le falta la categoría en la tienda, y la pantalla
 * tiene que decirlo en vez de pedirle atributos que no le corresponden.
 */
export function familiaDe(categorias) {
  for (const c of categorias || []) {
    const n = normalizarCategoria(c);
    if (!n || CATEGORIAS_SIN_PRENDA.has(n)) continue;
    const fam = POR_CATEGORIA.get(n);
    if (fam) return fam;
  }
  return null;
}

/** ¿La categoría es de una prenda que decidimos no fichar (accesorios)? */
export function fueraDeAlcance(categorias) {
  const fuera = new Set(CATEGORIAS_FUERA_DE_ALCANCE.map(normalizarCategoria));
  return (categorias || []).some((c) => fuera.has(normalizarCategoria(c)));
}

/** Los valores admitidos de un atributo en una familia. Vacío si no aplica. */
export function valoresDe(familia, atributo) {
  const fam = FAMILIAS[familia];
  const attr = ATRIBUTOS[atributo];
  if (!fam || !attr || !fam.atributos.includes(atributo)) return [];
  if (attr.libre) return [];
  return (fam.valores && fam.valores[atributo]) || attr.valores || [];
}

/**
 * Los atributos que se le piden a una familia, **en el orden canónico**, listos para dibujar.
 * Cada uno con su lista ya resuelta: la pantalla no tiene que saber si el valor era del atributo
 * o de la familia.
 */
export function atributosDe(familia) {
  const fam = FAMILIAS[familia];
  if (!fam) return [];
  return fam.atributos
    .map((k) => ({ key: k, label: ATRIBUTOS[k].label, libre: !!ATRIBUTOS[k].libre, orden: ATRIBUTOS[k].orden, valores: valoresDe(familia, k) }))
    .sort((a, b) => a.orden - b.orden);
}

/**
 * ¿`valor` es admitido para ese atributo en esa familia?
 *
 * 🔴 Lo pregunta el SERVIDOR antes de guardar, no sólo el `<select>`. Un desplegable es una
 * comodidad del que carga, no un candado: el día que alguien mande el valor por otro camino, lo
 * único que separa la lista cerrada de un campo de texto es este chequeo.
 */
export function esValor(familia, atributo, valor) {
  const attr = ATRIBUTOS[atributo];
  if (!attr) return false;
  const fam = FAMILIAS[familia];
  if (!fam || !fam.atributos.includes(atributo)) return false;
  if (attr.libre) return true;
  return valoresDe(familia, atributo).includes(String(valor));
}

/* ------------------------------------------------------------------ bullets */

/** Los valores que son un CUELLO; el resto de la lista de `escote` son escotes. */
const SON_CUELLO = new Set(['polera', 'redondo', 'solapa', 'camisa', 'capucha', 'mao', 'bote', 'volcado']);

/**
 * La etiqueta con la que sale el bullet.
 *
 * 🔑 Se carga un campo y salen dos etiquetas distintas: «Cuello: polera» y «Escote: en V». Quien
 * carga contesta UNA pregunta —qué tiene arriba— y la clienta lee la palabra que corresponde.
 */
export function etiquetaDeBullet(atributo, valor) {
  if (atributo === 'escote') return SON_CUELLO.has(String(valor)) ? 'Cuello' : 'Escote';
  return (ATRIBUTOS[atributo] || {}).label || '';
}

/**
 * El texto del bullet: el valor sin repetir la etiqueta que ya está adelante.
 *
 * Los valores guardan **la palabra del local** («manga larga», «tiro alto») porque es la que se
 * elige en la pantalla y la que se va a agrupar después. Pero el bullet ya dice «Manga:», así que
 * imprimirlo entero daría «Manga: manga larga». Se saca acá y no en la lista para no tener que
 * elegir entre un desplegable claro y una ficha bien escrita.
 */
export function textoDeBullet(atributo, valor) {
  const v = String(valor || '').trim();
  const et = String((ATRIBUTOS[atributo] || {}).label || '').toLowerCase();
  if (!et || !v.toLowerCase().startsWith(et + ' ')) return v;
  return v.slice(et.length + 1).trim();
}

/**
 * Los bullets de un producto: deterministas, ordenados y sin nada que validar.
 *
 * `cargados` es `{atributo: valor}`. Lo que no esté cargado no sale — no hay bullet vacío ni
 * «(sin datos)»: una ficha a medias se ve corta, no rota.
 *
 * ⛔ `tela: 'no identifico'` NO sale a la ficha. Es un valor de carga, no de venta: significa
 * «alguien lo miró y no supo», que es distinto de «nadie lo cargó todavía» y por eso se guarda.
 */
export function bulletsDe(familia, cargados) {
  const out = [];
  for (const a of atributosDe(familia)) {
    const valor = String((cargados || {})[a.key] || '').trim();
    if (!valor) continue;
    if (a.key === 'tela' && valor === TELA_SIN_IDENTIFICAR) continue;
    if (!a.libre && !esValor(familia, a.key, valor)) continue;
    out.push({ etiqueta: etiquetaDeBullet(a.key, valor), texto: textoDeBullet(a.key, valor) });
  }
  return out;
}

/** Cuántos atributos de la familia tienen valor. Es el `4/6` que ve el local en la fila. */
export function cargadosDe(familia, cargados) {
  const total = atributosDe(familia).length;
  const con = atributosDe(familia).filter((a) => String((cargados || {})[a.key] || '').trim()).length;
  return { con, total };
}
