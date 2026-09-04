/**
 * Acceso REST a Supabase. Port de sbFetch / sbFetchWithCount / fetchAll
 * (index.html:1943-1985).
 *
 * Dos cambios de forma respecto del legacy, ninguno de comportamiento:
 *
 *  - La cuenta viaja por parámetro en vez de leerse del global `currentCuenta`.
 *    Era el acoplamiento principal de toda la capa de datos: con esto, cambiar de
 *    marca deja de ser mutar una variable que medio archivo lee de refilón.
 *  - `fetchAll` no llama a setStatus (que tocaba el DOM). Reporta por callback.
 *
 * **Ya no va contra Supabase desde el cliente.** Iba, con la anon key, y ése era el
 * plan desde el principio: el comentario viejo acá decía que moverlo a un route
 * handler no agregaba seguridad "hasta que exista RLS (Fase S)". RLS existe desde el
 * 13-ago-2026, los escalones 1 a 4 sacaron del navegador el padrón, la facturación
 * por renglón, los costos y el espejo de stock, y el **escalón 5** (16-ago-2026) se
 * llevó lo último que quedaba: `ventas`, `venta_detalles`, `productos` y
 * `variante_color_manual`. Todo pasa por `api/datos?recurso=espejo`.
 */

import type { Cuenta } from '../cuentas'
import { CUENTAS } from '../cuentas'
import { apiFetch } from '../api-fetch'

/**
 * Techo por página. Ninguna de estas consultas tenía uno.
 *
 * 🔑 **Sin timeout, una página que no vuelve nunca deja la pantalla en "cargando" para siempre.**
 * No es hipotético: la API de Supabase corta `ventas` por statement timeout de forma intermitente
 * (el CI tuvo que ponerle tres reintentos por eso, `ci.yml`) y ahí sí contesta — pero una conexión
 * que se cuelga a mitad, un túnel que muere o un celular que cambia de red no contestan nunca, y
 * `fetch` espera sin límite. El store se queda en `'cargando'` y no hay forma de salir salvo
 * recargar, sin ningún mensaje que diga qué pasó.
 *
 * 45 s es holgado a propósito: la página más pesada (`venta_detalles`, 1.000 filas) tarda unos
 * pocos segundos con la base sana, así que esto sólo se dispara cuando algo está roto de verdad.
 */
const TIMEOUT_MS = 45_000

/**
 * Lo que ya no se le pide a Supabase con la anon key: va por `api/datos?recurso=espejo`, con la
 * clave de servicio y sesión. Escalones 4 y 5 de la Fase S.
 *
 * 🔑 **El desvío vive acá y no en los lectores.** `inventario` solo lo leen once lugares —el ETL,
 * Exhibición, Ubicaciones, Reposición, Caducados, Canjes, Integraciones (dos), Reclamos y el picker
 * `BuscarArticuloGN`— cada uno con su select y su filtro. Poniéndolo en el embudo, ninguno cambia
 * una línea y no hay forma de que mañana alguien escriba el lector siguiente por el camino viejo:
 * el camino viejo ya no existe.
 *
 * 🔑 **Es un pase, no una consulta nueva.** `limit`, `offset` y `Content-Range` viajan tal cual, así
 * que `fetchAll` sigue paginando de a 1.000 exactamente igual y el servidor nunca junta más de una
 * página. Lo único que cambia es quién firma la consulta.
 *
 * 🔑 **Con el escalón 5 la lista pasó a ser TODA la capa de datos del navegador**, medido tabla por
 * tabla el 16-ago-2026. Por eso abajo el `else` es un throw y no un `fetch`: una tabla que no esté
 * acá no puede caer a la anon key en silencio y devolver `[]` en producción — falla de una, en la
 * primera corrida, diciendo qué falta. La lista blanca de verdad vive en `api/_espejo.js`
 * (`CATALOGO`); ésta es la que decide por dónde sale el request.
 */
const POR_EL_SERVIDOR = new Set([
  'inventario',
  'ventas_por_mes',
  'ventas_por_categoria_mes',
  'fundas_por_modelo_mes',
  'ventas',
  'venta_detalles',
  'productos',
  'variante_color_manual',
  'sync_state',
])

/** `bdi` | `zattia` a partir de la cuenta. Las secciones pasan `CUENTAS[marca]`, y dos de ellas una fija. */
function storeDe(cuenta: Cuenta): string {
  return cuenta.url === CUENTAS.zattia.url ? 'zattia' : 'bdi'
}

async function pedir(cuenta: Cuenta, table: string, params: string): Promise<Response> {
  const corte = AbortSignal.timeout(TIMEOUT_MS)
  try {
    if (!POR_EL_SERVIDOR.has(table)) {
      // No es un caso posible con el código de hoy: es el guard que hace que deje de serlo mañana.
      // Sin él, la tabla nueva se pediría con la anon key, que desde el escalón 5 no tiene permiso
      // sobre nada — y eso llega como un `[]` con 200, o sea una pantalla vacía sin un error.
      throw new Error(
        `"${table}" no está en POR_EL_SERVIDOR (lib/supabase/rest.ts). Agregala ahí y al CATALOGO de api/_espejo.js: el navegador ya no lee Supabase directo.`,
      )
    }
    // No hace falta pedir el conteo: la puerta manda `count=exact` siempre y devuelve el
    // `Content-Range`, que es lo único que `sbFetchWithCount` mira.
    return await apiFetch('/api/datos?recurso=espejo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store: storeDe(cuenta), tabla: table, params }),
      signal: corte,
    })
  } catch (e) {
    // El error de un abort dice "The operation was aborted", que no le sirve a nadie. Se traduce
    // acá y no en la pantalla para que las ~30 secciones que muestran este mensaje digan lo mismo.
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new Error(`La consulta de ${table} tardó más de ${TIMEOUT_MS / 1000} segundos y se cortó. Probá recargar.`)
    }
    throw e
  }
}

export async function sbFetch<T = unknown>(cuenta: Cuenta, table: string, params: string): Promise<T[]> {
  const res = await pedir(cuenta, table, params)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Error ${res.status} en ${table}: ${text.substring(0, 150)}`)
  }
  return res.json()
}

export async function sbFetchWithCount<T = unknown>(
  cuenta: Cuenta,
  table: string,
  params: string,
): Promise<{ data: T[]; total: number }> {
  const res = await pedir(cuenta, table, params)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Error ${res.status} en ${table}: ${text.substring(0, 150)}`)
  }
  const range = res.headers.get('Content-Range') || ''
  const total = parseInt(range.split('/')[1] || '0', 10)
  const data = await res.json()
  return { data, total }
}

const BATCH_SIZE = 1000

/**
 * Cuántas páginas se piden a la vez.
 *
 * 🔑 **Es el techo que faltaba.** Hasta el 13-ago-2026 esto disparaba TODAS las páginas de una,
 * "igual que el legacy", con un comentario que decía: *"si algún día son cientos, acá va el
 * límite"*. Ese día llega solo, porque el piso de la ventana de ventas es un `'2025-01-01'` fijo
 * (`lib/datos.ts:67`) y el payload crece aunque no se venda más.
 *
 * Con ~100.000 filas de `venta_detalles` son 100 páginas. El browser igual encola de a ~6 por
 * host, así que el problema nunca fue la red: es que las 100 respuestas quedaban **todas vivas en
 * memoria** hasta el `concat` final, o sea un pico de ~2x el payload. Al triple de ventas eso son
 * ~90 MB de pico sólo para bajar, y Safari en iOS mata la pestaña bastante antes.
 *
 * De a 6 el pico deja de escalar con el total, y el tiempo de pared casi no cambia porque 6 es
 * más o menos lo que el navegador iba a dejar en vuelo de todos modos.
 */
const MAX_EN_VUELO = 6

/**
 * Trae una tabla entera paginando de a 1000.
 *
 * Pide la primera página con `count=exact` para saber el total y, si hace falta más de una, trae
 * el resto en tandas de `MAX_EN_VUELO`.
 */
export async function fetchAll<T = unknown>(
  cuenta: Cuenta,
  table: string,
  baseParams: string,
  onProgress?: (label: string) => void,
  label?: string,
): Promise<T[]> {
  const { data: first, total } = await sbFetchWithCount<T>(cuenta, table, `${baseParams}&limit=${BATCH_SIZE}&offset=0`)
  if (onProgress && label) onProgress(label)
  if (first.length >= total || first.length < BATCH_SIZE) return first

  const offsets: number[] = []
  for (let off = BATCH_SIZE; off < total; off += BATCH_SIZE) offsets.push(off)

  // Se acumula sobre el mismo array en vez de juntar un array de arrays y aplastarlo al final:
  // `first.concat(...pages)` con cientos de páginas además desarma el spread en argumentos.
  const out = first
  for (let i = 0; i < offsets.length; i += MAX_EN_VUELO) {
    const tanda = await Promise.all(
      offsets
        .slice(i, i + MAX_EN_VUELO)
        .map((off) => sbFetch<T>(cuenta, table, `${baseParams}&limit=${BATCH_SIZE}&offset=${off}`)),
    )
    for (const pagina of tanda) out.push(...pagina)
  }
  return out
}
