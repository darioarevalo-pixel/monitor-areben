/**
 * Re-export tipado de `modelos.core.js` (que es `.js` para que `api/_atencion.js` pueda importarlo),
 * más la semilla de respaldo.
 *
 * Mismo arreglo que `permisos.ts` sobre `permisos.core.js`: una sola implementación, dos mundos.
 */

import type { ModeloTienda } from './tipos'
import { modelosDelMenu as _modelosDelMenu, nombreDesdeSlug as _nombreDesdeSlug } from './modelos.core.js'

export const modelosDelMenu: (html: string, base: string) => ModeloTienda[] = _modelosDelMenu
export const nombreDesdeSlug: (slug: string) => string = _nombreDesdeSlug

/**
 * Los modelos de BDI al 9-ago-2026, en el orden del menú. **Es una red, no la fuente**: sólo se usa
 * si la tienda no contesta, para que quien está atendiendo a alguien no se quede con la pantalla
 * vacía justo en ese momento.
 *
 * Zattia no tiene esta estructura de categorías (no vende fundas), así que ahí no hay semilla: si
 * el menú no trae nada, la lista queda vacía y la pantalla lo dice.
 */
export const SEMILLA_BDI: readonly string[] = [
  'iphone-17-pro-max', 'iphone-17-pro', 'iphone-17', 'iphone-air',
  'iphone-16-pro-max', 'iphone-16-pro', 'iphone-16', 'iphone-16-e', 'iphone-16-plus',
  'iphone-15-pro-max', 'iphone-15-pro', 'iphone-15', 'iphone-15-plus',
  'iphone-14-pro-max', 'iphone-14-pro', 'iphone-14', 'iphone-14-plus',
  'iphone-13-pro-max', 'iphone-13-pro', 'iphone-13',
  'iphone-12-pro-max', 'iphone-12-pro', 'iphone-12', 'iphone-12-mini',
  'iphone-11-pro-max', 'iphone-11-pro', 'iphone-11',
]

/** La semilla convertida en modelos, con las URLs armadas sobre el dominio de la tienda. */
export function semillaDe(base: string): ModeloTienda[] {
  const raiz = base.replace(/\/+$/, '')
  return SEMILLA_BDI.map((slug) => ({
    slug,
    nombre: nombreDesdeSlug(slug),
    url: `${raiz}/fundas/modelo-de-iphone/${slug}/`,
  }))
}
