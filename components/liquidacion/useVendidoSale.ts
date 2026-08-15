'use client'

import { useEffect, useState } from 'react'
import { traerVendidoSale, vendidoSaleCacheado, type VendidoSale } from '@/lib/liquidacion/vendido'
import type { Marca } from '@/lib/nav'

/**
 * Lo vendido **con la oferta puesta** de la marca, o `null` mientras carga.
 *
 * Se pide al montar y no al tocar un control, a diferencia de la lista de campañas del selector de
 * liquidación: eso es una acción que casi nadie va a hacer, y esto **cambia lo que dice la tabla**.
 * Una columna de ventas que a veces avisa que fueron de sale y a veces no, según si alguien apretó
 * algo, es peor que no tenerla.
 *
 * Misma forma que `useTnImages`, y por el mismo motivo: el caché se lee **en el render** y la
 * bajada sólo fuerza un re-render cuando termina. Un `setState` sincrónico adentro del efecto lo
 * rechaza el lint, que es lo que deja el CI en rojo. Se baja una vez por marca mientras vive la
 * pestaña, así que las tres pantallas de Análisis comparten la misma bajada; si el servidor falla
 * devuelve el vacío y la tabla se dibuja igual, sin marca.
 */
export function useVendidoSale(marca: Marca): VendidoSale | null {
  const cacheado = vendidoSaleCacheado(marca)
  const [, forzar] = useState(0)

  useEffect(() => {
    if (cacheado) return
    let vivo = true
    void traerVendidoSale(marca).then(() => {
      if (vivo) forzar((n) => n + 1)
    })
    return () => {
      vivo = false
    }
  }, [marca, cacheado])

  return cacheado
}
