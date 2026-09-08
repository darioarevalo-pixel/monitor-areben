/**
 * ⭐ **Qué se puede borrar del Blob y qué no.** Es la regla del inventario, y vive acá —en el
 * núcleo, en JS plano— porque la usan los dos lados y tienen que decir lo mismo: la pantalla para
 * dibujar cada fila y el servidor para decidir si acepta un borrado en lote. Escrita sólo en el
 * componente, el día que el botón se equivoque el servidor lo obedece igual.
 *
 * # Los cuatro estados, y por qué son cuatro y no dos
 *
 *  - `usado` — alguien lo nombra: una evidencia de canje, un diseño, una pieza de Meta, la foto de
 *    un reclamo, la galería de Ingresos. ⛔ No se ofrece borrarlo.
 *  - `reciente` — nadie lo nombra **todavía**, y subió hace menos de {@link GRACIA_HORAS} horas.
 *    🔴 Este estado es el que evita el peor error posible acá: un archivo llega al Blob y su fila se
 *    escribe **después** (así funciona la subida de la creadora: primero suben los bytes, después
 *    se registra la URL). Barrer «lo que nadie nombra» sin esta ventana borra el video que se está
 *    subiendo en este momento.
 *  - `sin-dueno` — nadie lo nombra y ya pasó la ventana. Es lo que se puede borrar en lote.
 *  - `copia-en-meta` — una pieza que Meta **ya tiene subida** (el paso quedó hecho, con su id de
 *    allá). La fila del plan la nombra, así que sin este estado quedaría «en uso» para siempre —y
 *    son los archivos más pesados del store—. Lo que hay acá es una copia de algo que ya vive en
 *    Meta: se puede eliminar, y por eso también entra en el lote.
 *  - `no-verificable` — su carpeta no se pudo cruzar (la consulta falló, o la fuente vive en otro
 *    lado, como la galería de Ingresos en el KV). 🔴 **⛔ NO es «sin dueño»**: es «no sé», y se
 *    muestra como tal. Un detector que ante la duda contesta «sobra» borra lo que estaba vivo.
 *
 * `no-verificable` gana sobre `sin-dueno` y `usado` gana sobre todo: si algo lo nombra, no importa
 * que además la carpeta esté a medio verificar.
 */

/** Las carpetas del store, con el nombre que la pantalla les pone y quién las escribe. */
export const CARPETAS = {
  canjes: { label: 'Canjes', quien: 'Lo que suben las creadoras desde su link' },
  piezas: { label: 'Piezas de Meta', quien: 'Los videos e imágenes que se suben a Meta Ads' },
  ingresos: { label: 'Ingresos proyectados', quien: 'La galería de lo que manda la proveedora' },
  disenos: { label: 'Diseños', quien: 'Las miniaturas de la sección Diseños' },
  reclamos: { label: 'Reclamos', quien: 'Las fotos que manda el cliente en un reclamo' },
  fundas: { label: 'Fundas', quien: 'Miniaturas de Fundas por modelo' },
  manuales: { label: 'Manuales', quien: 'Las imágenes de los manuales' },
  prm: { label: 'Proveedores', quien: 'Fotos de las visitas a proveedores' },
};

/**
 * Cuánto se espera antes de llamar huérfano a un archivo que nadie nombra.
 *
 * 24 horas y no una: la subida de un video de 200 MB por la red de un celular puede tardar mucho, y
 * la fila recién se escribe cuando terminó. Una ventana corta convierte este inventario en una
 * forma elegante de perder el entregable de alguien.
 */
export const GRACIA_HORAS = 24;

/**
 * El `pathname` de una URL del Blob, decodificado — la clave con la que se cruza contra el
 * inventario.
 *
 * 🔴 **Decodificado a propósito.** La misma URL puede estar guardada con los espacios escritos
 * `%20` o tal cual —los nombres de las piezas de Meta tienen espacios—, y comparando texto contra
 * texto ese archivo saldría «sin dueño» y se borraría. El `pathname` decodificado es lo único que
 * coincide siempre.
 */
export function claveDeUrl(url) {
  try {
    const u = new URL(String(url || ''));
    if (!/\.blob\.vercel-storage\.com$/i.test(u.hostname)) return null;
    return decodeURIComponent(u.pathname).replace(/^\/+/, '') || null;
  } catch {
    return null;
  }
}

/** La carpeta de un `pathname` (`canjes/62/foto.jpg` → `canjes`). `''` si está en la raíz. */
export function carpetaDe(pathname) {
  const s = String(pathname || '').replace(/^\/+/, '');
  return s.includes('/') ? s.split('/')[0] : '';
}

/** El rótulo de una carpeta, o la carpeta misma si es una que todavía no conocemos. */
export function rotuloDeCarpeta(carpeta) {
  return (CARPETAS[carpeta] && CARPETAS[carpeta].label) || carpeta || 'Suelto en la raíz';
}

/**
 * El estado de un archivo.
 *
 * @param archivo `{ pathname, subidoEn }` — `subidoEn` en ISO; si falta, el archivo ⛔ **no** se da
 *   por viejo: sin fecha no se puede saber si está en la ventana de gracia, así que se lo trata
 *   como reciente. Callarse acá borraría de más.
 * @param ctx `{ usadas: Map<pathname, quien>, sinVerificar: string[], ahora: number }`
 */
export function estadoDeArchivo(archivo, ctx) {
  const clave = String((archivo && archivo.pathname) || '').replace(/^\/+/, '');
  const usadas = (ctx && ctx.usadas) || new Map();
  // 🔑 Va ANTES de `usadas` a propósito: la fila del plan la nombra, y por eso una pieza ya subida
  // caería en «en uso» y no se ofrecería nunca. Quien la puso acá ya comprobó que ningún paso
  // pendiente la necesita (ver `piezasYaEnMeta`).
  const enMeta = (ctx && ctx.enMeta) || new Map();
  if (enMeta.has(clave)) return 'copia-en-meta';
  if (usadas.has(clave)) return 'usado';

  const carpeta = carpetaDe(clave);
  if (((ctx && ctx.sinVerificar) || []).includes(carpeta)) return 'no-verificable';

  const subido = archivo && archivo.subidoEn ? Date.parse(archivo.subidoEn) : NaN;
  if (!Number.isFinite(subido)) return 'reciente';
  const ahora = (ctx && ctx.ahora) || Date.now();
  return ahora - subido < GRACIA_HORAS * 3600 * 1000 ? 'reciente' : 'sin-dueno';
}

/** Los que se pueden eliminar en lote: los que no tienen dueño y las copias que Meta ya se llevó. */
export function sePuedeEliminarEnLote(estado) {
  return estado === 'sin-dueno' || estado === 'copia-en-meta';
}

/**
 * El inventario agrupado por carpeta, que es como se mira: nadie decide sobre 500 archivos sueltos.
 *
 * Cada carpeta trae su peso total y **cuánto pesa lo que se puede borrar**, que es el único número
 * que contesta la pregunta con la que se entra a esta pantalla: «¿cuánto lugar recupero?».
 */
export function agrupar(archivos, ctx) {
  const porCarpeta = new Map();
  for (const a of archivos || []) {
    const carpeta = carpetaDe(a.pathname);
    if (!porCarpeta.has(carpeta)) {
      porCarpeta.set(carpeta, {
        carpeta,
        label: rotuloDeCarpeta(carpeta),
        quien: (CARPETAS[carpeta] && CARPETAS[carpeta].quien) || null,
        archivos: [],
        bytes: 0,
        bytesEliminables: 0,
        eliminables: 0,
        sinVerificar: false,
      });
    }
    const g = porCarpeta.get(carpeta);
    const estado = estadoDeArchivo(a, ctx);
    const bytes = Number(a.size) || 0;
    g.archivos.push({ ...a, estado });
    g.bytes += bytes;
    if (estado === 'no-verificable') g.sinVerificar = true;
    if (sePuedeEliminarEnLote(estado)) {
      g.eliminables += 1;
      g.bytesEliminables += bytes;
    }
  }
  for (const g of porCarpeta.values()) {
    // Lo más pesado arriba: es el orden en el que se decide qué borrar.
    g.archivos.sort((x, y) => (Number(y.size) || 0) - (Number(x.size) || 0));
  }
  return [...porCarpeta.values()].sort((a, b) => b.bytes - a.bytes);
}

/** El total del store, para el cartel de arriba. */
export function totalDe(archivos) {
  let bytes = 0;
  for (const a of archivos || []) bytes += Number(a.size) || 0;
  return { archivos: (archivos || []).length, bytes };
}
