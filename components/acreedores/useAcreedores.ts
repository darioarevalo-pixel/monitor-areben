'use client'

/**
 * El estado de "A quién le debemos". Molde de `useRecepciones`: la carga adentro de una IIFE con
 * bandera `vivo`, que es el patrón del repo.
 *
 * 🔑 **No depende de la marca.** Lo que se le debe al contador no es de BDI ni de Zattia: es de la
 * empresa. Por eso no se recarga al cambiar de marca en el sidebar — sería pedir dos veces lo
 * mismo y hacer parpadear números que no cambian.
 */

import { useCallback, useEffect, useState } from 'react'
import { leerAcreedores, type Acreedor } from '@/lib/acreedores/cliente'

export function useAcreedores() {
  const [acreedores, setAcreedores] = useState<Acreedor[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      try {
        const r = await leerAcreedores()
        if (!vivo) return
        setAcreedores(r.acreedores)
        setAviso(r.aviso)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo leer a quién le debemos.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [tick])

  return { acreedores, aviso, cargando, error, recargar }
}
