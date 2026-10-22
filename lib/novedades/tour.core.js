/**
 * El «Ver cambios» de una novedad: a qué pantalla lleva y qué pasos del tour recorre.
 *
 * Vive en `datos.tour` de la fila (`{ seccion: 'envios', cambio: '2026-10-22' }`), la columna jsonb
 * que la tabla tenía libre desde el principio: no hizo falta migración. `cambio` es el mismo
 * `AAAA-MM-DD` que llevan los pasos en `PasoGuia.cambio` — ver `pasosDelCambio` en `lib/guia/core.ts`.
 *
 * En `.js` plano porque lo usa el handler (`api/_sistema.js`), que no puede importar TypeScript.
 */

const SECCION = /^[a-z0-9-]+(\/[a-z0-9-]+)?$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * El tour en algo válido, o `null` si no hay. Lo que no se entiende se descarta entero: un botón
 * que lleva a `/<cualquier cosa>` es peor que no tener botón.
 */
export function normalizarTour(t) {
  if (!t || typeof t !== 'object') return null;
  const seccion = typeof t.seccion === 'string' ? t.seccion.trim() : '';
  const cambio = typeof t.cambio === 'string' ? t.cambio.trim() : '';
  if (!SECCION.test(seccion) || !DIA.test(cambio)) return null;
  return { seccion, cambio };
}

/** `datos` listo para escribir: lo que ya tenía la fila, con el tour puesto o sacado. */
export function datosConTour(previos, tour) {
  const base = previos && typeof previos === 'object' ? { ...previos } : {};
  const t = normalizarTour(tour);
  if (t) base.tour = t;
  else delete base.tour;
  return base;
}
