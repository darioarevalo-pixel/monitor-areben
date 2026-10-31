/**
 * Los cortes (`erp_corte`) para la Caja, con caché por instancia. La regla vive en `lib/caja/corte-caja.core.js`.
 *
 * 🔑 Sin saber si la línea cortó ⛔ se elige camino (`api/_erp-corte.js`). Pero la cajera cobra en cada ticket y una caída
 * corta del motor no puede frenar el local: las filas de `erp_corte` son INMUTABLES (una por línea, sólo se agregan), así
 * que la última lectura buena sirve mientras la base ⛔ contesta. Sin ninguna lectura buena ⇒ TIRA.
 *
 * ⛔ Archivo `_`: NO es una ruta.
 */
import { conBase, cortesDe } from './_erp-corte.js'

/** Cada cuánto se vuelve a leer (el corte se escribe de noche, una vez por línea). */
export const CORTES_TTL_MS = 5 * 60_000
const TECHO_MS = 3000

/** @type {Record<string, { cortes: Record<string, string>, en: number }>} */
const cache = {}

/**
 * `{ linea: ISO }` de la base de `store`. Lee cada `CORTES_TTL_MS`; si la base falla, la última buena; si nunca hubo, TIRA.
 * @param {string} store @param {{ ahora?: number, leer?: (store: string) => Promise<Record<string, string>> }} [o]
 */
export async function cortesDeCaja(store, { ahora = Date.now(), leer = (s) => conBase(s, cortesDe, TECHO_MS) } = {}) {
  const c = cache[store]
  if (c && ahora - c.en < CORTES_TTL_MS) return c.cortes
  try {
    const cortes = await leer(store)
    cache[store] = { cortes, en: ahora }
    return cortes
  } catch (e) {
    if (c) {
      console.warn(`[caja] erp_corte de ${store} sin leer (${String((e && e.message) || e).slice(0, 120)}): sigue la lectura de hace ${Math.round((ahora - c.en) / 60000)} min`)
      return c.cortes
    }
    throw e
  }
}

/** Para los tests. */
export function olvidarCortes() {
  for (const k of Object.keys(cache)) delete cache[k]
}
