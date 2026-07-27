'use client'

import { useEffect, useState } from 'react'
import { asegurarIndices, indicesCacheados } from '@/lib/tn-audit'
import type { IndiceTn } from '@/lib/tn'
import type { Marca } from '@/lib/nav'

/**
 * Los índices del catálogo de TiendaNube para la marca, o `null` mientras carga. Port del
 * lazy-load de cargarImagenesTN (index.html:12847).
 *
 * La bajada y el caché ya no viven acá: los tiene `lib/tn-audit.ts`, que es el único camino al
 * endpoint. Este archivo es lo que queda, que es la parte de React: leer el caché EN el render
 * (no `setState` en effect) para no romper el CI, y forzar un re-render cuando la bajada
 * termina. Si TN falla, índices vacíos y la tabla queda con "Sin foto", como el legacy.
 */

/**
 * Asegura que el catálogo esté bajado y devuelve el índice de precio promo (todos los
 * productos). Lo usa el reporte de sale, que necesita el promo en el momento del click aunque
 * las fotos ya estén cacheadas.
 */
export async function asegurarTnPromo(marca: Marca): Promise<IndiceTn> {
  return (await asegurarIndices(marca)).promo
}

/** Hook genérico: devuelve el índice `sel` del caché, disparando la bajada si falta. */
function useIndice(marca: Marca, cual: 'fotos' | 'promo'): IndiceTn | null {
  const cached = indicesCacheados(marca)?.[cual] ?? null
  const [, forzar] = useState(0)

  useEffect(() => {
    if (cached) return
    let vivo = true
    asegurarIndices(marca).then(() => {
      if (vivo) forzar((n) => n + 1)
    })
    return () => {
      vivo = false
    }
  }, [marca, cached])

  return cached
}

/** Índice de fotos (sólo productos con imagen), o null mientras carga. */
export function useTnImages(marca: Marca): IndiceTn | null {
  return useIndice(marca, 'fotos')
}

/**
 * Índice completo de TN (todos los productos, con fotos Y precio promo), o null mientras
 * carga. Lo usa márgenes (necesita `promo_price` + `images` en un solo match). Misma bajada
 * que las fotos.
 */
export function useTnPromo(marca: Marca): IndiceTn | null {
  return useIndice(marca, 'promo')
}
