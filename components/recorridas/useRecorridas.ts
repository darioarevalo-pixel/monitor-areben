'use client'

/**
 * El estado de Recorridas: el padrón de locales y la lista de viajes.
 *
 * Molde de `useRecepciones`: la carga adentro de una IIFE con bandera `vivo` —el patrón del repo—,
 * porque llamar a `setState` derecho en el cuerpo de un efecto encadena renders y el lint lo rechaza.
 *
 * ⚠️ **La lista NO se vacía al cambiar de marca**, al revés que en Recepciones. Acá el dato no tiene
 * marca: un local de Avellaneda me vende para la que sea, y vaciar la lista al tocar el selector
 * haría parpadear una pantalla que muestra exactamente lo mismo.
 */
import { useCallback, useEffect, useState } from 'react'
import { leerPadron, leerRecorridas, type LocalConResumen } from '@/lib/prm/cliente'
import type { Recorrida } from '@/lib/prm/tipos'

export function useRecorridas(marca: string | null) {
  const [locales, setLocales] = useState<LocalConResumen[]>([])
  const [recorridas, setRecorridas] = useState<Recorrida[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!marca) return
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      try {
        const [p, r] = await Promise.all([leerPadron(marca), leerRecorridas(marca)])
        if (!vivo) return
        setLocales(p)
        setRecorridas(r)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo leer el padrón.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  return { locales, recorridas, cargando, error, recargar }
}
