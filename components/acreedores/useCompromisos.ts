'use client'

import { useCallback, useEffect, useState } from 'react'
import { leerCompromisos, type PuedeCompromisos } from '@/lib/compromisos/cliente'
import type { Compromiso } from '@/lib/compromisos/core'

/**
 * Las promesas de pago. Va en un hook aparte de `useAcreedores` a propósito: son dos fuentes
 * distintas —una es el dashboard, la otra la base del monitor— y si el dashboard no contesta, las
 * promesas se tienen que seguir viendo igual.
 */
export function useCompromisos() {
  const [compromisos, setCompromisos] = useState<Compromiso[]>([])
  const [puede, setPuede] = useState<PuedeCompromisos>({ ver: false, prometer: false, confirmar: false })
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
        const r = await leerCompromisos()
        if (!vivo) return
        setCompromisos(r.compromisos)
        setPuede(r.puede)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudieron leer las promesas.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [tick])

  return { compromisos, puede, cargando, error, recargar }
}
