'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import { indexarTn, type IndiceTn, type TnProducto } from '@/lib/tn'

/**
 * Baja el catálogo de TiendaNube para los precios de las etiquetas de Local/Promo.
 * Port de _etiTNFetch (index.html:6658): si la marca es ZATTIA, trae TAMBIÉN la TN
 * de STUNNED (tienda propia) y las fusiona, para que los productos STUNNED tomen su
 * precio/promo de su propia tienda. Caché por marca a nivel de módulo; `refrescar`
 * saltea la caché (botón "🔄 Actualizar precios").
 */

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

const cache: Partial<Record<Marca, TnProducto[]>> = {}
const enVuelo: Partial<Record<Marca, Promise<void>>> = {}

async function bajar(marca: Marca, refresh = false): Promise<void> {
  if (cache[marca] && !refresh) return
  if (!enVuelo[marca] || refresh) {
    enVuelo[marca] = (async () => {
      const stores: string[] = marca === 'zattia' ? ['zattia', 'stunned'] : [marca]
      const q = refresh ? `&refresh=1&nc=${Date.now()}` : ''
      try {
        const results = await Promise.all(stores.map((s) => fetch(`${AUDIT}?store=${s}${q}`).then((r) => r.json()).catch(() => ({}))))
        let products: TnProducto[] = []
        results.forEach((d) => {
          if (d && Array.isArray(d.products)) products = products.concat(d.products)
        })
        cache[marca] = products
      } catch {
        cache[marca] = cache[marca] || []
      } finally {
        enVuelo[marca] = undefined
      }
    })()
  }
  await enVuelo[marca]
}

export type EstadoEtiquetasTn = {
  tnProducts: TnProducto[]
  tnIdx: IndiceTn
  cargando: boolean
  refrescar: () => Promise<void>
}

export function useEtiquetasTn(marca: Marca): EstadoEtiquetasTn {
  const [tnProducts, setTnProducts] = useState<TnProducto[]>(cache[marca] ?? [])
  const [cargando, setCargando] = useState(!cache[marca])

  // setState en un IIFE async (no sincrónico en el effect: lo marca el CI).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(!cache[marca])
      setTnProducts(cache[marca] ?? [])
      await bajar(marca)
      if (!vivo) return
      setTnProducts(cache[marca] ?? [])
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const refrescar = useCallback(async () => {
    await bajar(marca, true)
    setTnProducts(cache[marca] ?? [])
  }, [marca])

  const tnIdx = indexarTn(tnProducts)
  return { tnProducts, tnIdx, cargando, refrescar }
}
