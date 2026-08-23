'use client'

/**
 * El estado del buzón. Molde de `useAtencion`: una lista, un contador de recargas, y la carga
 * adentro de una IIFE con bandera `vivo` —el patrón del repo— porque llamar a `setState` derecho en
 * el cuerpo de un efecto encadena renders y el lint lo rechaza.
 */

import { useCallback, useEffect, useState } from 'react'
import { leerMensajes } from '@/lib/buzon/cliente'
import type { MensajeBuzon } from '@/lib/buzon/tipos'

export function useBuzon(soloAbiertos = false) {
  const [mensajes, setMensajes] = useState<MensajeBuzon[]>([])
  /**
   * El "ahora" contra el que se cuenta la espera de cada mensaje. Se sella **cuando la lista llega**
   * y no en cada render: `Date.now()` adentro del render es impuro (el lint lo rechaza) y además
   * haría que dos filas de la misma pantalla se midan contra relojes distintos.
   */
  const [ahora, setAhora] = useState(() => Date.now())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(async () => {
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      try {
        const lista = await leerMensajes(soloAbiertos)
        if (!vivo) return
        setMensajes(lista)
        setAhora(Date.now())
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudieron leer los mensajes.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [soloAbiertos, tick])

  return { mensajes, ahora, cargando, error, recargar }
}
