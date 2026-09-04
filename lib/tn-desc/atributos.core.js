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

/**
 * «No aplica»: vale para CUALQUIER atributo cerrado, se guarda y NO sale a la ficha.
 *
 * Lo pidió Bruno el 1-sep-2026 usando la pantalla. Es la misma forma que `TELA_SIN_IDENTIFICAR` y
 * por el mismo motivo: **«esta prenda no tiene eso» es distinto de «nadie lo cargó todavía»**, y
 * esa diferencia es la única que dice si hay que volver a mirar la prenda. Sin él, el contador de
 * la fila se queda en `4/5` para siempre y nadie sabe si falta trabajo o no.
 *
 * ⛔ NO se le ofrece a `tela`: ahí la pregunta ya la contesta «no identifico», y toda prenda tiene
 * una tela. Dos maneras de decir lo mismo en la misma lista es lo que hace que después no se pueda
 * sumar.
 */
export const NO_APLICA = 'no aplica';

/* --------------------------------------------------- la palabra propuesta */

/** El largo máximo de una palabra propuesta. Es una etiqueta, no una descripción. */
export const MAX_PROPUESTA = 24;

/**
 * ¿Tiene FORMA de palabra del diccionario?
 *
 * ⛔ Esto ⛔ no dice que la palabra sea buena: dice que es una palabra. La decisión de si entra a
 * la lista la toma Bruno — acá sólo se impide que el escape se convierta en un campo de texto
 * libre por la puerta de atrás («top negro con ballenas y encaje» ⛔ no es un valor de escote).
 */
export function esPalabraPropuesta(valor) {
  const v = String(valor == null ? '' : valor).trim();
  if (v.length < 2 || v.length > MAX_PROPUESTA) return false;
  // Letras (con acentos), números, espacios y guiones. ⛔ Nada de HTML ni puntuación: esto termina
  // pegado en la descripción de un producto el día que se apruebe.
  if (!/^[\p{L}\p{N} /-]+$/u.test(v)) return false;
  // Una etiqueta de tres palabras ya es una frase.
  return v.split(/\s+/).length <= 3;
}

/**
 * Normaliza la palabra antes de guardarla: minúsculas y un solo espacio.
 *
 * 🔑 Sin esto, «Wide Leg» y «wide leg » serían **dos filas distintas** en el `group by` — que es
 * exactamente lo que la lista cerrada existe para impedir. El escape ⛔ no puede traer de vuelta
 * el problema que evita la lista.
 */
export function normalizarPropuesta(valor) {
  return String(valor == null ? '' : valor).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Las palabras que alguien propuso para este producto: las que ⛔ no están en ninguna lista.
 *
 * 🔑 **⛔ No hace falta una columna que las marque.** Una palabra es propuesta si `esValor` la
 * rechaza, y eso es una consecuencia de la lista, ⛔ no un dato aparte que alguien podría olvidarse
 * de escribir. Y tiene el efecto que se busca: **el día que Bruno aprueba la palabra y entra al
 * diccionario, deja de ser propuesta sola**, en todos los productos donde se cargó, sin migrar
 * nada.
 */
export function propuestasDe(familia, cargados) {
  const out = [];
  for (const a of [...atributosDe(familia), ...atributosExtra(familia)]) {
    if (a.libre) continue;
    const valor = String((cargados || {})[a.key] || '').trim();
    if (!valor || valor === NO_APLICA) continue;
    if (!esValor(familia, a.key, valor)) out.push({ atributo: a.key, label: a.label, valor });
  }
  return out;
}

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

/**
 * Los valores PROPIOS de un atributo en una familia — los que esa prenda elige primero. Vacío si
 * la familia no pide ese atributo.
 *
 * ⚠️ Sin `NO_APLICA`: se suma en `opcionesDe`, que es lo que dibuja la pantalla. Acá no, porque
 * esta lista es también la que contesta «qué valores tiene esta familia» y «no aplica» no es uno.
 */
export function valoresDe(familia, atributo) {
  const fam = FAMILIAS[familia];
  const attr = ATRIBUTOS[atributo];
  if (!fam || !attr || !fam.atributos.includes(atributo)) return [];
  if (attr.libre) return [];
  return (fam.valores && fam.valores[atributo]) || attr.valores || [];
}

/** Los valores que ese atributo tiene en las OTRAS familias, sin repetir los propios. */
export function valoresPrestados(familia, atributo) {
  const attr = ATRIBUTOS[atributo];
  if (!attr || attr.libre) return [];
  const propios = new Set(valoresDe(familia, atributo));
  const out = [];
  for (const otra of Object.keys(FAMILIAS)) {
    if (otra === familia) continue;
    for (const v of valoresDe(otra, atributo)) {
      if (!propios.has(v) && !out.includes(v)) out.push(v);
    }
  }
  // Un atributo que NINGUNA familia pide igual tiene su lista en `ATRIBUTOS`.
  if (!out.length && !propios.size) return (attr.valores || []).slice();
  return out;
}

/**
 * Lo que ofrece el desplegable: los propios, los prestados de otras prendas y «no aplica».
 *
 * 🔑 **Prestar un valor NO abre la lista.** Lo pidió Bruno el 1-sep-2026 —«poder sumar alguna
 * información de otra categoría»— mirando un short de ecocuero que cae en la familia `faldas`,
 * cuyo `calce` ofrece palabras de pollera (`al cuerpo`, `recta`, `con vuelo`, `plisada`) y ninguna
 * le sirve. El valor sigue saliendo de una lista cerrada, así que el catálogo se sigue pudiendo
 * SUMAR: lo único que se aflojó es de cuál de las listas sale.
 */
export function opcionesDe(familia, atributo) {
  const attr = ATRIBUTOS[atributo];
  if (!attr || attr.libre) return { propios: [], prestados: [], noAplica: false };
  return {
    propios: valoresDe(familia, atributo),
    prestados: valoresPrestados(familia, atributo),
    noAplica: atributo !== 'tela',
  };
}

/**
 * Los atributos que esta familia NO pide, para el «+ agregar un dato».
 *
 * 🔑 El caso que lo pidió es el mismo short: `faldas` no pregunta `silueta`, y un short de ecocuero
 * puede ser oversize. ⛔ La alternativa —agrandar `FAMILIAS[x].atributos` cada vez que aparece un
 * caso— termina preguntándole a toda la familia algo que le sirve a un producto.
 */
export function atributosExtra(familia) {
  const fam = FAMILIAS[familia];
  if (!fam) return [];
  return Object.keys(ATRIBUTOS)
    .filter((k) => !fam.atributos.includes(k))
    .map((k) => ({ key: k, label: ATRIBUTOS[k].label, libre: !!ATRIBUTOS[k].libre, orden: ATRIBUTOS[k].orden, valores: valoresPrestados(familia, k) }))
    .sort((a, b) => a.orden - b.orden);
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
 *
 * 🔴 **Se aflojó el 1-sep-2026, y lo que se aflojó es DE CUÁL LISTA sale el valor — nunca que
 * pueda no salir de ninguna.** Hasta ese día el chequeo era «el atributo tiene que ser de la
 * familia Y el valor de esa familia»; eso dejaba a un short de la familia `faldas` sin manera de
 * decir que es recto, y sin manera de declarar su silueta. Hoy vale cualquier valor que ese
 * atributo tenga en ALGUNA familia, más «no aplica». Un valor inventado sigue rechazado, que es
 * lo único que la lista cerrada existía para impedir: con texto libre el catálogo deja de poder
 * SUMARSE, y ése era el motivo de fondo del 27-ago.
 */
export function esValor(familia, atributo, valor) {
  const attr = ATRIBUTOS[atributo];
  if (!attr) return false;
  if (!FAMILIAS[familia]) return false;
  if (attr.libre) return true;
  const v = String(valor);
  if (v === NO_APLICA) return atributo !== 'tela';
  return valoresDe(familia, atributo).includes(v) || valoresPrestados(familia, atributo).includes(v);
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
 * El bullet no GRITA: un valor escrito TODO en mayúsculas sale en minúscula.
 *
 * Muerde en `detalle`, que es el único campo libre y se tipea en el local con la prenda en la
 * mano — «DETALLE EN EL BOLSILLO», «CON LENTEJUELAS», «TRANSPARENTE» son lo que hay cargado hoy.
 * Los demás atributos salen de listas cerradas y ya vienen en minúscula, así que para ellos esto
 * no hace nada.
 *
 * 🔑 Se baja al COMPONER y no al guardar: el valor sigue siendo la palabra que tipeó el local, y
 * el día que alguien quiera leerlo crudo está intacto. Es la misma razón por la que el bullet
 * saca la etiqueta repetida acá y no en la lista.
 *
 * ⛔ Y sólo si NO tiene ninguna minúscula. Un valor con mezcla («argolla plateada», «cuello V»)
 * está escrito a propósito y bajarlo entero le comería la mayúscula que alguien puso.
 */
function sinGritar(v) {
  return /[a-záéíóúüñ]/.test(v) ? v : v.toLocaleLowerCase('es');
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
  if (!et || !v.toLowerCase().startsWith(et + ' ')) return sinGritar(v);
  return sinGritar(v.slice(et.length + 1).trim());
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
  // 🔑 Los EXTRAS también salen. Si el «+ agregar un dato» guardara algo que después no se dibuja,
  // el gesto no haría nada y la pantalla estaría mintiendo — y el orden lo sigue decidiendo la
  // lista canónica, no el orden en que alguien los cargó.
  const campos = [...atributosDe(familia), ...atributosExtra(familia)]
    .filter((a) => String((cargados || {})[a.key] || '').trim())
    .sort((a, b) => a.orden - b.orden);
  for (const a of campos) {
    const valor = String((cargados || {})[a.key] || '').trim();
    if (a.key === 'tela' && valor === TELA_SIN_IDENTIFICAR) continue;
    // ⛔ «No aplica» se guarda y no sale: es un dato de carga, igual que «no identifico».
    if (valor === NO_APLICA) continue;
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
