/**
 * Reportes («Ayuda / problemas», Bruno 12-oct): la validación de lo que se carga. JS plano porque la
 * usan el handler (`api/_reportes.js`) y la pantalla (`components/reportes/BotonReportes.tsx`).
 */

export const TIPOS_REPORTE = Object.freeze(['falta', 'problema']);
export const MAX_TEXTO_REPORTE = 4000;

/**
 * Lo que manda la pantalla, limpio. Lanza con el motivo si ⛔ sirve. El autor ⛔ viaja: sale de la sesión.
 * @param {any} b
 * @returns {{ tipo: 'falta' | 'problema', texto: string, seccion: string | null, url: string | null }}
 */
export function reporteValido(b) {
  if (!b || typeof b !== 'object') throw new Error('Falta el reporte');
  if (!TIPOS_REPORTE.includes(b.tipo)) throw new Error('Elegí si es un problema o una mejora');
  const texto = String(b.texto ?? '').trim();
  if (!texto) throw new Error('Contá qué pasó o qué falta');
  if (texto.length > MAX_TEXTO_REPORTE) throw new Error(`El texto pasa los ${MAX_TEXTO_REPORTE} caracteres`);
  const corto = (/** @type {unknown} */ x, /** @type {number} */ n) => (x == null || x === '' ? null : String(x).slice(0, n));
  return { tipo: b.tipo, texto, seccion: corto(b.seccion, 80), url: corto(b.url, 500) };
}
