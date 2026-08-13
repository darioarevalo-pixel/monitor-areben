/**
 * Qué marcas de Canjes ve cada perfil. **Una sola implementación, para los dos lados.**
 *
 * Antes esto vivía dos veces —`veMarcaCanjes` en TS para el navegador y `marcasVisibles` en
 * `api/_canjes.js` para el servidor— y se despegaron:
 *
 *   - El servidor decidía mirando **sólo `perfil.cuenta`**, sin leer `acceso`. Pero `cuenta` es la
 *     *cuenta fija*, y sólo la tiene quien está clavado a una marca. Para todo el que puede cambiar
 *     de marca (`cuenta: null`, o sea casi todos) la lista quedaba **vacía** y el handler cortaba
 *     con 403 la sección entera, padrón incluido. Tildar permisos en Config no cambiaba nada.
 *   - El cliente, en ese mismo caso, caía a `[marcaActiva]` — nunca vacío. Por eso la pantalla se
 *     dibujaba entera y el rechazo llegaba recién al pedir los datos: se veía como "no carga", no
 *     como "no tenés permiso".
 *
 * Va en `.js` plano porque `api/*.js` no puede importar TypeScript. `lib/canjes/permisos.ts` la
 * envuelve para el lado tipado, y `tests/permisos-espejo.test.ts` corre los dos lados sobre la
 * misma matriz de perfiles.
 */

import { marcasConAcceso, marcaDePermisos } from '../permisos.core.js'

/** Las tres del selector de Canjes. Espejo de `CANJE_STORES` en `tipos.ts`. */
export const CANJE_STORES = ['bdi', 'zattia', 'stunned']

/** Las marcas del monitor, de las que cuelgan los permisos. Son dos: Stunned no es una. */
const MARCAS_MONITOR = ['bdi', 'zattia']

/**
 * De qué marca del monitor cuelgan los permisos de esta `store`.
 *
 * 📌 **La implementación se mudó a `lib/permisos.core.js`** el 13-ago-2026 y acá quedó el
 * re-export, para no tocar a los que ya importan de este archivo. No era una regla de Canjes: el
 * sync de Tienda Nube, el mapa de SKU y los conteos se hacen la misma pregunta, y una decisión de
 * permisos vive en un solo lado o se despega — que es lo que este mismo archivo cuenta arriba.
 */
export { marcaDePermisos }

/**
 * Las marcas cuyos canjes ve **enteros**. Los demás llegan ciegos (marca, fecha y estado), y llegan
 * ciegos desde el servidor: filtrar plata en la UI significa que la plata ya viajó al browser.
 *
 * Quien ve Zattia ve Stunned — el mismo criterio con el que `api/sku-map.js` rutea sus costos.
 *
 * ⚠️ El **padrón de personas no se filtra por acá**: es transversal a las marcas a propósito. Si
 * marketing de Zattia no pudiera ver que esa creadora ya laburó con BDI, el padrón compartido no
 * serviría de nada — que es exactamente el dato que el módulo existe para no perder.
 */
export function marcasVisiblesCanjes(perfil) {
  const out = new Set()
  for (const m of marcasConAcceso(perfil, 'canjes', MARCAS_MONITOR)) {
    out.add(m)
    if (m === 'zattia') out.add('stunned')
  }
  return CANJE_STORES.filter((s) => out.has(s))
}
