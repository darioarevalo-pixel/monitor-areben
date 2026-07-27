/**
 * Una sola bajada del catálogo de TiendaNube, compartida por toda la app.
 *
 * `tiendanube-audit` devuelve la tienda entera y lo consumen cinco secciones (Márgenes,
 * Comisiones, Reposición, Productos, Gerencial) más las cinco cards de tncat. Hasta acá había
 * **dos caminos separados** al mismo endpoint: el caché por marca de `useTnImages` (que pedía
 * el payload liviano) y las funciones sueltas de `lib/tncat/cliente.ts` (que no cacheaban
 * nada). En `/tncat/fotos` eso significaba bajar la tienda dos veces —y una de ellas es la
 * versión `?variantes=1`, que pesa el doble.
 *
 * El dato que hace que se pueda unificar: `mapProduct` del endpoint arma el MISMO objeto en
 * los dos modos y con `?variantes=1` solo le agrega `imagenes` y `variantes`. O sea que el
 * payload rico es un **superset** del liviano, y quien pidió el liviano puede servirse del
 * rico si ya está bajado (o esperar al que está en vuelo) en vez de pedir el suyo.
 *
 * **El caché vive mientras vive la pestaña** (igual que el de `useTnImages`, al que reemplaza).
 * Del otro lado hay otro caché, en KV, con TTL de una hora. Las acciones que escriben en la
 * tienda llaman a `bustAudit`, que refresca el de allá e invalida el de acá.
 *
 * Todo sale por `apiFetch`: manda la credencial de quien está usando el Monitor. Antes el
 * camino de `useTnImages` iba con `fetch` pelado, sin credencial — el único que quedaba así.
 */

import { apiFetch } from './api-fetch'
import { indexarTn, type IndiceTn, type TnProducto } from './tn'
import type { Marca } from './nav'

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

/** `variantes` trae además el detalle por variante (color, foto propia, sku, stock). Pesa el doble. */
type Nivel = 'liviano' | 'variantes'
const clave = (marca: Marca, nivel: Nivel) => `${marca}|${nivel}`

const cache = new Map<string, unknown[]>()
const enVuelo = new Map<string, Promise<unknown[]>>()

async function bajar(marca: Marca, nivel: Nivel, refrescar: boolean): Promise<unknown[]> {
  const url =
    `${AUDIT}?store=${marca}` +
    (nivel === 'variantes' ? '&variantes=1' : '') +
    (refrescar ? `&refresh=1&nc=${Math.random()}` : '')
  const r = await apiFetch(url)
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const d = await r.json()
  return (d && d.products ? d.products : []) as unknown[]
}

/**
 * El catálogo de la marca. `T` es la vista que le interesa al llamador (`TnProducto`,
 * `ProductoFchk`, `ProductoCat`): todos son subconjuntos del mismo objeto del endpoint.
 *
 * Con `refrescar` se pide de nuevo salteando los dos cachés, el de acá y el de allá.
 */
export async function traerAudit<T>(
  marca: Marca,
  opts: { variantes?: boolean; refrescar?: boolean } = {},
): Promise<T[]> {
  const nivel: Nivel = opts.variantes ? 'variantes' : 'liviano'
  const k = clave(marca, nivel)

  if (opts.refrescar) {
    invalidarAudit(marca) // el otro nivel también quedó viejo
  } else {
    const propio = cache.get(k)
    if (propio) return propio as T[]

    if (nivel === 'liviano') {
      // El rico sirve al liviano: es el mismo objeto con dos campos de más.
      const rico = cache.get(clave(marca, 'variantes'))
      if (rico) return rico as T[]
      const ricoEnVuelo = enVuelo.get(clave(marca, 'variantes'))
      if (ricoEnVuelo) {
        try {
          return (await ricoEnVuelo) as T[]
        } catch {
          /* si el rico se cayó, el liviano se baja igual: sigue abajo */
        }
      }
    }

    const yendo = enVuelo.get(k)
    if (yendo) return yendo as Promise<T[]>
  }

  const p = bajar(marca, nivel, !!opts.refrescar)
    .then((filas) => {
      cache.set(k, filas)
      return filas
    })
    .finally(() => {
      if (enVuelo.get(k) === p) enVuelo.delete(k)
    })
  enVuelo.set(k, p)
  return p as Promise<T[]>
}

/** Tira lo cacheado de la marca (los dos niveles y los índices derivados). */
export function invalidarAudit(marca: Marca): void {
  cache.delete(clave(marca, 'liviano'))
  cache.delete(clave(marca, 'variantes'))
}

/**
 * Los dos índices que usa el cruce con Gestión Nube, derivados del payload: `fotos` solo con
 * los productos que tienen imagen (replica el mapa del legacy) y `promo` con todos.
 *
 * Memoizados por identidad del array, en un WeakMap: mientras el payload sea el mismo objeto
 * —o sea, mientras no se haya invalidado— indexar sale gratis. Indexar la tienda entera dos
 * veces por cada card que lo pide no era gratis.
 */
const indices = new WeakMap<object, { fotos: IndiceTn; promo: IndiceTn }>()

export function indicesDe(products: TnProducto[]): { fotos: IndiceTn; promo: IndiceTn } {
  const ya = indices.get(products)
  if (ya) return ya
  const par = { fotos: indexarTn(products, { soloConImagenes: true }), promo: indexarTn(products) }
  indices.set(products, par)
  return par
}

/** Los índices de la marca si el catálogo ya está bajado; `undefined` si todavía no. Síncrono. */
export function indicesCacheados(marca: Marca): { fotos: IndiceTn; promo: IndiceTn } | undefined {
  const p = (cache.get(clave(marca, 'variantes')) ?? cache.get(clave(marca, 'liviano'))) as TnProducto[] | undefined
  return p ? indicesDe(p) : undefined
}

/** Los índices de la marca, bajando el catálogo si hace falta. Si TN falla, índices vacíos. */
export async function asegurarIndices(marca: Marca): Promise<{ fotos: IndiceTn; promo: IndiceTn }> {
  try {
    return indicesDe(await traerAudit<TnProducto>(marca))
  } catch {
    // Igual que el legacy: la tabla queda con "Sin foto" en vez de romperse.
    return { fotos: indexarTn([]), promo: indexarTn([]) }
  }
}
