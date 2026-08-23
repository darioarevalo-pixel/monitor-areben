'use client'

import { useEffect, useState } from 'react'
import { asegurarIndices, indicesCacheados } from '@/lib/tn-audit'
import type { IndiceTn } from '@/lib/tn'
import type { Linea } from '@/lib/lineas'

/**
 * Los índices del catálogo de TiendaNube de una **LÍNEA**, o `null` mientras carga. Port del
 * lazy-load de cargarImagenesTN (index.html:12847).
 *
 * La bajada y el caché ya no viven acá: los tiene `lib/tn-audit.ts`, que es el único camino al
 * endpoint. Este archivo es lo que queda, que es la parte de React: leer el caché EN el render
 * (no `setState` en effect) para no romper el CI, y forzar un re-render cuando la bajada
 * termina. Si TN falla, índices vacíos y la tabla queda con "Sin foto", como el legacy.
 *
 * # 🔴 Por qué el parámetro es `Linea` y no `Marca` (23-ago-2026)
 *
 * `lib/tn-audit.ts` ya bajaba por línea desde el 22-ago —Stunned tiene **su propia Tienda Nube**
 * (store 7516263)—, pero estas tres firmas seguían pidiendo una `Marca`, así que las pantallas con
 * selector le pasaban `zattia` estando en Stunned: **`matchTn` no engancha nunca** y `lib/margenes.ts`
 * cae al `else` con `foto = null` y `precio = retailer_price`. Medido en prod: Márgenes con Stunned
 * daba **24 de 24 «sin foto»** contra 3 de 28 en Marketing (que sí cruzaba por línea).
 *
 * 🔴 **Lo grave no era la foto, era el markup**: 304 de 449 tarjetas de Zattia (68 %) valoran con el
 * precio de **promo** y las de Stunned lo hacían con el de **lista** ⇒ el «markup promedio 180 %» de
 * Stunned al lado del «88 %» de Zattia **no era la misma medición**, y el rótulo de línea lo hacía
 * leer como que Stunned rinde el doble.
 *
 * ⚠️ **`Marca` sigue entrando**, y a propósito: es un subconjunto de `Linea`. Las pantallas de
 * mercadería ENTERA —Comisiones, Reposición, Gerencial, Liquidación, las cards de tncat— le siguen
 * pasando la marca, que es lo correcto para ellas. Lo que cambia es que ahora **pueden** pasar la
 * línea las cinco que tienen selector. `tests/lineas-tn-por-linea.test.ts` amarra cuáles.
 */

/**
 * Asegura que el catálogo esté bajado y devuelve el índice de precio promo (todos los
 * productos). Lo usa el reporte de sale, que necesita el promo en el momento del click aunque
 * las fotos ya estén cacheadas.
 */
export async function asegurarTnPromo(linea: Linea): Promise<IndiceTn> {
  return (await asegurarIndices(linea)).promo
}

/** Hook genérico: devuelve el índice `sel` del caché, disparando la bajada si falta. */
function useIndice(linea: Linea, cual: 'fotos' | 'promo'): IndiceTn | null {
  const cached = indicesCacheados(linea)?.[cual] ?? null
  const [, forzar] = useState(0)

  useEffect(() => {
    if (cached) return
    let vivo = true
    asegurarIndices(linea).then(() => {
      if (vivo) forzar((n) => n + 1)
    })
    return () => {
      vivo = false
    }
  }, [linea, cached])

  return cached
}

/** Índice de fotos (sólo productos con imagen), o null mientras carga. */
export function useTnImages(linea: Linea): IndiceTn | null {
  return useIndice(linea, 'fotos')
}

/**
 * Índice completo de TN (todos los productos, con fotos Y precio promo), o null mientras
 * carga. Lo usa márgenes (necesita `promo_price` + `images` en un solo match). Misma bajada
 * que las fotos.
 */
export function useTnPromo(linea: Linea): IndiceTn | null {
  return useIndice(linea, 'promo')
}
