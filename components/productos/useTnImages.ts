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
const cacheIdx: Partial<Record<Marca, IndiceTn>> = {}
const cacheProducts: Partial<Record<Marca, unknown[]>> = {}
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
        cacheProducts[marca] = products
        cacheIdx[marca] = indexarTn(products, { soloConImagenes: true })
      } catch {
        cacheProducts[marca] = []
        cacheIdx[marca] = indexarTn([])
      } finally {
        enVuelo[marca] = undefined
      }
    })()
  }
  await enVuelo[marca]
}

export function useTnImages(marca: Marca): IndiceTn | null {
  // El índice se lee del caché EN el render (no en un effect), así el cache-hit no
  // necesita un setState — evita `react-hooks/set-state-in-effect`, que rompe el CI.
  // El effect sólo dispara el fetch cuando falta y fuerza un re-render al terminar.
  const cached = cacheIdx[marca] ?? null
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
  }, [marca, cached])

  return cached
}
