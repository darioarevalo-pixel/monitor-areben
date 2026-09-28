'use client'

/**
 * Los adelantos de sueldo: a quién se le puede adelantar y cuánto ya entró en un sueldo. Mismo
 * molde que `useAcreedores` (IIFE con bandera `vivo`, `cargando` sólo hasta el primer dato).
 */

import { useCallback, useEffect, useState } from 'react'
import { leerAdelantos, type RespuestaAdelantos } from '@/lib/adelantos/cliente'

export function useAdelantos() {
  const [datos, setDatos] = useState<RespuestaAdelantos>({ empleados: [], aplicados: null, aviso: null })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let vivo = true
    void (async () => {
      setError(null)
      try {
        const r = await leerAdelantos()
        if (vivo) setDatos(r)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron leer los adelantos.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [tick])

  return { ...datos, cargando, error, recargar }
}
