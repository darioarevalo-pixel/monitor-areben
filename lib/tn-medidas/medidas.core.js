/**
 * El DICCIONARIO DE MEDIDAS: qué se le mide a cada prenda, con qué palabra y cómo.
 *
 * # De dónde salió
 *
 * De la **guía de toma de medidas de Bruno** (`TOMA DE MEDIDAS CON GUÍA.pdf`, 9 páginas, leída el
 * 1-sep-2026), ⛔ no de un manual de moda ni de las plantillas que había. Siete hojas de dibujo
 * técnico —la prenda apoyada y plana, con las flechas rotuladas— más dos hojas de bajada de línea,
 * una para prendas de arriba y otra para prendas de abajo.
 *
 * 🔴 **Y por eso esto NO es un ajuste de `lib/gen-talles/plantillas.ts`: es otro juego de medidas.**
 * Aquéllas piden `Contorno busto` («medir alrededor de la parte más ancha»), `Ancho de hombros`,
 * `Contorno cadera` y `Tiro`. La guía ⛔ no mide ninguna de las cuatro: mide **Ancho** de sisa a
 * sisa con la prenda apoyada, y el tiro sólo le sirve de referencia para saber dónde va el ancho.
 *
 * # La convención, que es una sola
 *
 * **Se mide siempre la prenda APOYADA Y PLANA.** Lo decidió Bruno el 1-sep-2026 —«media prenda
 * apoyada, es como mide el local»— y la guía lo confirma y agrega el cómo, textual:
 *
 *   «CONTORNO DE CINTURA: ESTE SE MIDE AGARRANDO LA CINTURA POR LA MITAD, Y MULTIPLICANDO POR 2
 *    LA CIFRA MEDIDA.»
 *
 * 🔑 **La multiplicación la hace el sistema, ⛔ nunca la persona** (`duplicar`). Medido contra las
 * tablas publicadas de Zattia el 1-sep-2026: de 69 fichas con cintura legible, **63 están en
 * contorno y 6 por debajo de 45 cm** — esas 6 son las veces que alguien se olvidó de multiplicar.
 * Con el ×2 del lado del sistema, ese olvido **deja de poder ocurrir**.
 *
 * # Lo que estira no se mide, y el largo se mide siempre
 *
 * La otra regla de Bruno (1-sep-2026): *«si elastiza mucho, no se mide la medida que elastiza… pero
 * se mide el largo por ejemplo»*. ⛔ Y `largo` **no puede** marcarse como que estira: `estira: false`
 * se lo saca de las opciones al que carga. Una regla que sólo está escrita no frena — ésta es la
 * misma que ya nos costó una vuelta con los bullets.
 *
 * 📌 Y ⛔ no es un caso de borde: **101 de los 316 publicados** de Zattia hablan de microfibra,
 * lycra, morley, ribb o elástico, y **60 de las 111 sin medidas** — más de la mitad de la cola.
 *
 * # Por qué es `.js` plano
 *
 * Lo va a importar el handler que compone el HTML que sale a la tienda, que corre en Node sin pasar
 * por el compilador de Next y ⛔ no puede importar TypeScript. Mismo motivo que
 * `lib/tn-desc/atributos.core.js`, `formato.core.js` y `permisos.core.js`.
 */

/* ---------------------------------------------------------------- el valor */

/**
 * «Esta medida no se toma porque la prenda estira ahí.»
 *
 * 🔑 Es un VALOR y no un casillero vacío, y ésa es toda la diferencia: en blanco, «no lo medimos
 * porque estira» y «nadie lo cargó todavía» se ven igual, y es justo la diferencia que dice si
 * queda trabajo. Además le explica al cliente por qué esa fila no está, en vez de dejarle una
 * tabla que parece incompleta.
 */
export const ESTIRA = 'estira';

/** Las telas que estiran: con una de éstas cargada, la pantalla avisa sobre el ancho. */
export const TELAS_QUE_ESTIRAN = ['microfibra', 'lycra', 'morley', 'ribb de algodón', 'red', 'bengalina', 'denim elastizado'];

/* -------------------------------------------------------------- el diccionario */

/**
 * Las medidas, con la palabra y el «cómo se mide» de la guía.
 *
 * ⚠️ Los textos son **los de la guía**, ⛔ no una mejora nuestra: son los que van al lado del
 * dibujo que el cliente mira, y cambiarlos deja el texto diciendo una cosa y la flecha otra.
 */
export const MEDIDAS = {
  ancho: {
    label: 'Ancho',
    orden: 1,
    comoMedir: 'De sisa a sisa, con la prenda apoyada.',
    estira: true,
    duplicar: false,
  },
  anchoBajoBusto: {
    label: 'Ancho bajo busto',
    orden: 2,
    comoMedir: 'A lo ancho, justo debajo del busto, con la prenda apoyada.',
    estira: true,
    duplicar: false,
  },
  contornoCintura: {
    label: 'Contorno de cintura',
    orden: 3,
    comoMedir: 'Se mide agarrando la cintura por la mitad; la cifra se multiplica por 2.',
    estira: true,
    // 🔴 La única medida que se publica distinta de como se carga. Ver `paraPublicar`.
    duplicar: true,
  },
  anchoPierna: {
    label: 'Ancho de pierna',
    orden: 4,
    comoMedir: 'Desde donde termina el tiro delantero hasta el lateral.',
    estira: true,
    duplicar: false,
  },
  largo: {
    label: 'Largo',
    orden: 5,
    comoMedir: 'Del punto más alto del hombro hasta abajo. En prendas de abajo, en el lateral desde la cintura hasta el ruedo.',
    // 🔴 `false` A PROPÓSITO, y es la regla de Bruno hecha imposible de romper: el largo ⛔ no
    // estira, así que el que carga no tiene manera de saltearlo marcando que estira.
    estira: false,
    duplicar: false,
  },
  largoManga: {
    label: 'Largo de manga',
    orden: 6,
    comoMedir: 'Del punto más alto del hombro hasta el final de la manga.',
    estira: false,
    duplicar: false,
  },
};

/** Las medidas que pueden marcarse «estira». El largo ⛔ nunca. */
export const MEDIDAS_QUE_ESTIRAN = Object.keys(MEDIDAS).filter((k) => MEDIDAS[k].estira);

/* ---------------------------------------------------------------- familias */

/**
 * Qué se le mide a cada familia, y con qué hoja de la guía se dibuja.
 *
 * Las familias son **las mismas de `lib/tn-desc/atributos.core.js`** y ⛔ no un mapa paralelo: dos
 * mapas que contestan «de qué prenda se trata» es lo que se desincroniza. Las hojas de la guía y su
 * familia:
 *
 * | hoja | prendas | familia |
 * |---|---|---|
 * | 1 | buzos, sweaters, camperas, blazers, remeras y tops CON mangas | `abrigo` · `tops` |
 * | 2 | tops sin mangas, musculosas, chalecos, corsets | `tops` |
 * | 3 | jeans, pantalones, shorts, bermudas | `pantalon` |
 * | 4 | monos | `vestidos` |
 * | 5 | minis, polleras largas | `faldas` |
 * | 6 | vestidos cortos y largos | `vestidos` |
 * | 7 | bodys | `tops` |
 */
export const MEDIDAS_POR_FAMILIA = {
  tops: ['ancho', 'largo', 'largoManga'],
  abrigo: ['ancho', 'largo', 'largoManga'],
  faldas: ['contornoCintura', 'largo', 'ancho'],
  pantalon: ['contornoCintura', 'anchoPierna', 'largo'],
  vestidos: ['anchoBajoBusto', 'contornoCintura', 'ancho', 'largo', 'largoManga'],
};

/** Los valores de `manga` con los que la prenda ⛔ no tiene manga que medir. */
const SIN_MANGA = new Set(['breteles', 'musculosa', 'sin mangas']);

/**
 * Las medidas que se le piden a un producto, en el orden canónico.
 *
 * 🔑 **La ficha ya contesta si hay manga que medir**, y por eso `ficha` entra acá: la guía separa
 * las prendas de arriba en dos hojas —con y sin mangas— y `manga` es un campo que el local ya
 * cargó antes de llegar a las medidas (es el atributo de orden 6, y las medidas van después).
 * Volver a preguntarlo sería pedirle a una persona un dato que el sistema tiene.
 */
export function medidasDe(familia, ficha) {
  const base = MEDIDAS_POR_FAMILIA[familia];
  if (!base) return [];
  const manga = String((ficha || {}).manga || '').trim();
  return base
    .filter((k) => !(k === 'largoManga' && manga && SIN_MANGA.has(manga)))
    .map((k) => ({ key: k, ...MEDIDAS[k] }))
    .sort((a, b) => a.orden - b.orden);
}

/** ¿Esa medida se le pide a esa familia? Lo pregunta el servidor antes de guardar. */
export function esMedida(familia, medida, ficha) {
  return medidasDe(familia, ficha).some((m) => m.key === medida);
}

/**
 * ¿Vale ese valor para esa medida?
 *
 * Números en centímetros, con coma o punto. ⛔ Nada de texto libre: una medida es un número o es
 * `ESTIRA`, y cualquier otra cosa hace que la columna deje de poder compararse.
 */
export function esValorDeMedida(medida, valor) {
  const m = MEDIDAS[medida];
  if (!m) return false;
  const v = String(valor == null ? '' : valor).trim();
  if (!v) return false;
  if (v === ESTIRA) return m.estira === true;
  if (!/^[0-9]{1,3}([.,][0-9])?$/.test(v)) return false;
  return Number(v.replace(',', '.')) > 0;
}

/**
 * El número que se PUBLICA, a partir del que se cargó.
 *
 * 🔴 Es donde vive el ×2 de la cintura, y vive en un solo lugar a propósito: el día que esté
 * también en la pantalla, las dos cuentas se van a separar y nadie va a ver cuál manda.
 * `null` = esta fila ⛔ no se publica (vacía o «estira»).
 */
export function paraPublicar(medida, valor) {
  const m = MEDIDAS[medida];
  if (!m) return null;
  const v = String(valor == null ? '' : valor).trim();
  if (!v || v === ESTIRA) return null;
  if (!esValorDeMedida(medida, v)) return null;
  const n = Number(v.replace(',', '.')) * (m.duplicar ? 2 : 1);
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

/**
 * Las filas de la tabla que se publica: una por medida, con su valor por talle.
 *
 * `cargadas` es `{ [talle]: { [medida]: valor } }`. Un producto sin talles usa la clave `''`.
 *
 * 🔴 **Una fila sin un solo número ⛔ NO se publica.** Medido el 1-sep-2026: hay **5 productos
 * publicados** —VESTIDO SOLANA, VERONA, MALIA, AMBAR y MONO TIARE— con la tabla en la tienda
 * diciendo «CINTURA (CONTORNO TOTAL) CM», sin número, y **63 tablas con celdas en «-»**. Es el
 * final del camino de «no supe qué poner y lo publiqué igual»: el cliente lee un CM huérfano y
 * deja de creerle al resto de la tabla.
 *
 * 🔑 Y la tabla parcial ⛔ no es la excepción, es la norma: de las 205 tablas publicadas de Zattia,
 * **107 tienen 2 medidas o menos** y 23 tienen una sola.
 */
export function filasDe(familia, ficha, talles, cargadas) {
  const cols = talles && talles.length ? talles : [''];
  const out = [];
  for (const m of medidasDe(familia, ficha)) {
    const valores = cols.map((t) => paraPublicar(m.key, ((cargadas || {})[t] || {})[m.key]));
    if (valores.every((v) => v === null)) continue;
    out.push({ key: m.key, label: m.label, comoMedir: m.comoMedir, valores });
  }
  return out;
}

/** Cuántas medidas de las que se piden están contestadas — el `3/3` que ve el local. */
export function contestadasDe(familia, ficha, talles, cargadas) {
  const cols = talles && talles.length ? talles : [''];
  const pedidas = medidasDe(familia, ficha);
  const con = pedidas.filter((m) => cols.some((t) => {
    const v = String((((cargadas || {})[t] || {})[m.key]) || '').trim();
    return v === ESTIRA || esValorDeMedida(m.key, v);
  })).length;
  return { con, total: pedidas.length };
}
