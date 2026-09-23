'use client'

/**
 * El estado de Cobranzas. Molde de `useAcreedores`: la carga adentro de una IIFE con bandera `vivo`.
 *
 * 🔑 **Depende de la marca**: las órdenes son de la Tienda Nube de cada una. Por eso la respuesta
 * viaja PEGADA a la marca que la pidió y la vieja se descarta — cambiar de marca con un pedido en
 * vuelo mostraría las órdenes de BDI bajo el título de Zattia.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { leerCobranzas, type Respuesta } from '@/lib/cobranzas/cliente'

export function useCobranzas(marca: Marca) {
  const [datos, setDatos] = useState<{ marca: Marca; r: Respuesta } | null>(null)
  const [recargando, setRecargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let vivo = true
    void (async () => {
      setRecargando(true)
      setError(null)
      try {
        const r = await leerCobranzas(marca)
        if (vivo) setDatos({ marca, r })
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron leer las cobranzas.')
      } finally {
        if (vivo) setRecargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  const r = datos && datos.marca === marca ? datos.r : null
  return { r, cargando: !r && !error, recargando, error, recargar }
}
