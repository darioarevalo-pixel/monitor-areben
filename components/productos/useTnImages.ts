'use client'

import { useEffect, useState } from 'react'
import { indexarTn, type IndiceTn } from '@/lib/tn'
import type { Marca } from '@/lib/nav'

/**
 * Baja el catálogo de TiendaNube (`tiendanube-audit`) y devuelve el índice de fotos
 * de la marca, o `null` mientras carga. Port del lazy-load de cargarImagenesTN
 * (index.html:12847): fetch por marca, cacheado a nivel de módulo para que cambiar
 * de sección y volver no vuelva a pegar. Si TN falla, índice vacío (la tabla queda
 * con "Sin foto", como el legacy).
 *
 * Se indexa `soloConImagenes` para replicar el mapa de fotos del legacy (los
 * productos sin imagen no entran al índice). El precio promo (P3) usará otro índice
 * sobre el mismo payload, por eso se guarda `products` crudo también.
 */
const cacheIdx: Partial<Record<Marca, IndiceTn>> = {} // fotos (solo con imagen)
const cachePromo: Partial<Record<Marca, IndiceTn>> = {} // precio promo (todos los productos)
const enVuelo: Partial<Record<Marca, Promise<void>>> = {}

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

async function cargar(marca: Marca): Promise<void> {
  if (cacheIdx[marca]) return
  if (!enVuelo[marca]) {
    enVuelo[marca] = (async () => {
      try {
        const r = await fetch(`${AUDIT}?store=${marca}`)
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const d = await r.json()
        const products = d.products || []
        cacheIdx[marca] = indexarTn(products, { soloConImagenes: true })
        cachePromo[marca] = indexarTn(products) // todos, para el precio promo (P3)
      } catch {
        cacheIdx[marca] = indexarTn([])
        cachePromo[marca] = indexarTn([])
      } finally {
        enVuelo[marca] = undefined
      }
    })()
  }
  await enVuelo[marca]
}

/**
 * Asegura que el catálogo TN de la marca esté bajado y devuelve el índice de precio
 * promo (todos los productos). Lo usa el reporte de sale, que necesita el promo en
 * el momento del click aunque las fotos ya estén cacheadas. Una sola bajada del
 * endpoint sirve a fotos y a promo.
 */
export async function asegurarTnPromo(marca: Marca): Promise<IndiceTn> {
  await cargar(marca)
  return cachePromo[marca] ?? indexarTn([])
}

/**
 * Hook genérico: devuelve el índice `sel(marca)` del caché, disparando el fetch si
 * falta. Lee el caché EN el render (no setState en effect) para no romper el CI; el
 * effect sólo fuerza un re-render cuando la bajada termina.
 */
function useIndice(marca: Marca, sel: (m: Marca) => IndiceTn | undefined): IndiceTn | null {
  const cached = sel(marca) ?? null
  const [, forzar] = useState(0)

  useEffect(() => {
    if (cached) return
    let vivo = true
    cargar(marca).then(() => {
      if (vivo) forzar((n) => n + 1)
    })
    return () => {
      vivo = false
    }
  }, [marca, cached, sel])

  return cached
}

/** Índice de fotos (sólo productos con imagen), o null mientras carga. */
export function useTnImages(marca: Marca): IndiceTn | null {
  return useIndice(marca, (m) => cacheIdx[m])
}

/**
 * Índice completo de TN (todos los productos, con fotos Y precio promo), o null
 * mientras carga. Lo usa márgenes (necesita `promo_price` + `images` en un solo
 * match). Misma bajada que las fotos.
 */
export function useTnPromo(marca: Marca): IndiceTn | null {
  return useIndice(marca, (m) => cachePromo[m])
}
