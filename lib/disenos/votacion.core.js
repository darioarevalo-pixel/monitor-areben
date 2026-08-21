/**
 * La votación de diseños por link: puntajes, promedios y la whitelist de lo que sale a internet.
 *
 * # Por qué es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/envios/portal.core.js`: lo importan `api/_disenos-votacion.js` y
 * `api/_disenos-rondas.js`, que corren en Node sin pasar por el compilador de Next. Y acá importa
 * de verdad, porque el archivo tiene las dos cosas que no pueden vivir sólo en la pantalla:
 * **qué sale al portal** y **qué se acepta de vuelta**.
 *
 * # Qué se defiende acá
 *
 *   1. `paraElVotante` — la salida se arma campo por campo: `id`, `name` y `url`, y nada más.
 *      Nunca `{...diseño}`. El documento del tablero trae `nota` ("Pros / contras"), `estado`
 *      y los 👍/👎 del equipo: son juicios internos y no viajan a un link abierto. Mismo criterio
 *      que `CAMPOS_PERSONA` en `api/_canje-portal.js`.
 *   2. `sanearPuntajes` — lo que entra del portal se filtra contra los ids de ESA ronda y contra
 *      la escala. Un control que sólo vive en la pantalla del votante no es un control.
 *
 * # La escala, y por qué el promedio puede ser `null`
 *
 * Es 1 a 5, entero. `promedio` devuelve **`null`** cuando nadie votó ese diseño, no `0`: en una
 * escala de 1 a 5 un 0 no es "sin datos", es una afirmación —y la peor de todas—. Quien pinta el
 * resultado tiene que decir "sin votos" con todas las letras.
 */

/** El tope de la escala. Cambiarlo acá lo cambia en el portal, en el resumen y en el servidor. */
export const MAX_PUNTAJE = 5;

/** Topes contra el que tenga el link. No son de la pantalla: los hace cumplir el handler. */
export const TOPE_NOMBRE = 60;
export const TOPE_PUNTAJES = 200;
export const TOPE_VOTANTES = 300;

/**
 * Lo único que ve quien abre el link. Se arma campo por campo a propósito: si mañana alguien suma
 * una columna al documento del diseño, no se filtra sola.
 *
 * @param {{ titulo?: string, disenos?: any[] }} ronda
 * @returns {{ titulo: string, disenos: { id: string, name: string, url: string }[] }}
 */
export function paraElVotante(ronda) {
  const lista = Array.isArray(ronda && ronda.disenos) ? ronda.disenos : [];
  return {
    titulo: String((ronda && ronda.titulo) || ''),
    disenos: lista
      .filter((d) => d && d.id != null)
      .map((d) => ({ id: String(d.id), name: String(d.name || ''), url: String(d.url || '') })),
  };
}

/**
 * El snapshot que se congela al crear la ronda. Es la MISMA whitelist que `paraElVotante`, y se
 * aplica ya en el momento de crear para que la `nota` no llegue ni siquiera a la base.
 *
 * @param {any[]} disenos  tal como vienen del tablero
 * @param {string[]} idsElegidos  los que el equipo tildó
 */
export function snapshotDeRonda(disenos, idsElegidos) {
  const quiero = new Set((idsElegidos || []).map(String));
  return (Array.isArray(disenos) ? disenos : [])
    .filter((d) => d && d.id != null && quiero.has(String(d.id)))
    .map((d) => ({ id: String(d.id), name: String(d.name || ''), url: String(d.url || '') }));
}

/**
 * Filtra lo que manda el portal: enteros de 1 a `MAX_PUNTAJE`, y sólo de diseños de ESTA ronda.
 * Lo que no pasa se descarta en silencio (no es un error del votante: es ruido o es un ataque).
 *
 * @param {unknown} entrada  `{ [idDiseño]: number }`
 * @param {Iterable<string>} idsValidos  **obligatorio**: los ids del snapshot de la ronda
 * @returns {Record<string, number>}
 */
export function sanearPuntajes(entrada, idsValidos) {
  const validos = new Set([...idsValidos].map(String));
  const salida = {};
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return salida;
  for (const [id, bruto] of Object.entries(entrada)) {
    if (!validos.has(String(id))) continue;
    // `Number('3')` da 3, pero `'3'` desde un JSON no debería llegar: se acepta igual porque el
    // riesgo es cero y rechazarlo dejaría un voto perdido sin que nadie se entere.
    const n = typeof bruto === 'number' ? bruto : typeof bruto === 'string' ? Number(bruto) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > MAX_PUNTAJE) continue;
    salida[String(id)] = n;
    if (Object.keys(salida).length >= TOPE_PUNTAJES) break;
  }
  return salida;
}

/**
 * El promedio de una lista de puntajes. **`null` si la lista está vacía** — ver el encabezado.
 * @param {number[]} puntajes
 * @returns {number | null}
 */
export function promedio(puntajes) {
  const arr = (puntajes || []).filter((n) => Number.isFinite(n));
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * @typedef {{ id: string, name: string, url: string, n: number, promedio: number | null,
 *             distribucion: number[] }} ResumenDeDiseno
 */

/**
 * El resumen por diseño de una ronda: cuántos votaron, el promedio y cómo se repartieron.
 *
 * `distribucion` tiene `MAX_PUNTAJE` casilleros (índice 0 = un punto). Sirve para ver la diferencia
 * entre "a todos les gustó tibiamente" y "la mitad lo ama y la mitad lo odia", que con el promedio
 * solo son el mismo número.
 *
 * @param {{ disenos?: any[] }} ronda
 * @param {{ nombre?: string, puntajes?: Record<string, number> }[]} boletas
 * @returns {ResumenDeDiseno[]}
 */
export function resumen(ronda, boletas) {
  const items = paraElVotante(ronda).disenos;
  const porId = new Map(items.map((d) => [d.id, []]));
  for (const b of boletas || []) {
    for (const [id, n] of Object.entries((b && b.puntajes) || {})) {
      const caja = porId.get(String(id));
      if (caja && Number.isFinite(n)) caja.push(n);
    }
  }
  return items.map((d) => {
    const puntajes = porId.get(d.id) || [];
    const distribucion = Array.from({ length: MAX_PUNTAJE }, () => 0);
    for (const n of puntajes) if (n >= 1 && n <= MAX_PUNTAJE) distribucion[n - 1]++;
    return { ...d, n: puntajes.length, promedio: promedio(puntajes), distribucion };
  });
}

/**
 * Ordena el resumen de mejor a peor. Los que **nadie votó van al final**, siempre: no compiten con
 * un promedio inventado. Desempata por cantidad de votos (un 4,5 con nueve votos vale más que un
 * 4,5 con uno) y después por nombre, para que el orden no baile entre recargas.
 *
 * @param {ResumenDeDiseno[]} res
 * @returns {ResumenDeDiseno[]}
 */
export function ranking(res) {
  return (res || []).slice().sort((a, b) => {
    if ((a.promedio == null) !== (b.promedio == null)) return a.promedio == null ? 1 : -1;
    if (a.promedio != null && b.promedio != null && a.promedio !== b.promedio) return b.promedio - a.promedio;
    if (a.n !== b.n) return b.n - a.n;
    return (a.name || '').localeCompare(b.name || '', 'es');
  });
}

/**
 * Cuántos de los diseños de la ronda no tiene ni un voto. Se muestra en el encabezado del resultado
 * porque un tablero de 14 con 3 sin votar no es lo mismo que uno con 14 votados, y el promedio
 * ordenado no lo deja ver.
 *
 * @param {ResumenDeDiseno[]} res
 * @returns {number}
 */
export function sinNingunVoto(res) {
  return (res || []).filter((d) => !d.n).length;
}

/**
 * Los nombres de quienes votaron, sin repetir y ordenados. Vacío es vacío: no se rellena.
 * @param {{ nombre?: string }[]} boletas
 * @returns {string[]}
 */
export function quienesVotaron(boletas) {
  const vistos = new Set();
  for (const b of boletas || []) {
    const n = String((b && b.nombre) || '').trim();
    if (n) vistos.add(n);
  }
  return [...vistos].sort((a, b) => a.localeCompare(b, 'es'));
}
