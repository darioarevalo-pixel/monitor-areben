'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { indexarTn, type IndiceTn, type TnProducto } from '@/lib/tn'

/**
 * Baja el catálogo de TiendaNube para los precios de las etiquetas de Local/Promo.
 * Port de _etiTNFetch (index.html:6658): si la marca es ZATTIA, trae TAMBIÉN la TN
 * de STUNNED (tienda propia) y las fusiona, para que los productos STUNNED tomen su
 * precio/promo de su propia tienda. Caché por marca a nivel de módulo; `refrescar`
 * saltea la caché (botón "🔄 Actualizar precios").
 */

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

/**
 * Cuánto vale un precio bajado, antes de volver a pedirlo.
 *
 * 🔴 **Antes no vencía nunca**: el caché vivía lo que viviera la pestaña, así que quien dejaba
 * Etiquetas abierta imprimía toda la tarde el precio de la mañana **sin que nada lo dijera**. Desde
 * que todos los descuentos se cargan desde el Monitor eso pasó de rareza a caso normal: se cambia un
 * precio en Liquidación y la pestaña de al lado sigue con el viejo.
 *
 * ⚠️ **Media hora no quiere decir que el precio tenga media hora.** El audit tiene su propio caché de
 * **1 hora** del lado del servidor, así que la antigüedad real es ésta más aquélla. El único camino
 * a un precio del momento es «🔄 Actualizar precios», que manda `refresh=1` y saltea las dos. Por eso
 * la pantalla muestra **cuándo se leyó**, y no promete frescura que no puede garantizar.
 */
export const TTL_PRECIOS_MS = 30 * 60_000

const cache: Partial<Record<Marca, TnProducto[]>> = {}
const bajadoEn: Partial<Record<Marca, number>> = {}
const enVuelo: Partial<Record<Marca, Promise<void>>> = {}

/** `true` si lo que hay en el caché ya no sirve (o no hay nada). */
function vencido(marca: Marca): boolean {
  if (!cache[marca]) return true
  const t = bajadoEn[marca]
  return t == null || Date.now() - t > TTL_PRECIOS_MS
}

async function bajar(marca: Marca, refresh = false): Promise<void> {
  if (!vencido(marca) && !refresh) return
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
        // Sólo se sella cuando algo entró. Si las dos tiendas fallaron y quedó vacío, sellarlo
        // congelaría media hora una lista sin un solo precio, y la pantalla diría que está al día.
        if (products.length) bajadoEn[marca] = Date.now()
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
  /** Cuándo se leyeron estos precios (epoch ms), o `null` si todavía no entró ninguno. */
  leidoEn: number | null
  refrescar: () => Promise<void>
}

export function useEtiquetasTn(marca: Marca): EstadoEtiquetasTn {
  const [tnProducts, setTnProducts] = useState<TnProducto[]>(cache[marca] ?? [])
  const [leidoEn, setLeidoEn] = useState<number | null>(bajadoEn[marca] ?? null)
  const [cargando, setCargando] = useState(vencido(marca))

  // setState en un IIFE async (no sincrónico en el effect: lo marca el CI).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(vencido(marca))
      setTnProducts(cache[marca] ?? [])
      setLeidoEn(bajadoEn[marca] ?? null)
      await bajar(marca)
      if (!vivo) return
      setTnProducts(cache[marca] ?? [])
      setLeidoEn(bajadoEn[marca] ?? null)
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const refrescar = useCallback(async () => {
    await bajar(marca, true)
    setTnProducts(cache[marca] ?? [])
    setLeidoEn(bajadoEn[marca] ?? null)
  }, [marca])

  const tnIdx = indexarTn(tnProducts)
  return { tnProducts, tnIdx, cargando, leidoEn, refrescar }
}
