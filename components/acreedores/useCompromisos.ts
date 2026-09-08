'use client'

import { useCallback, useEffect, useState } from 'react'
import { leerCompromisos, type PuedeCompromisos } from '@/lib/compromisos/cliente'
import type { Compromiso } from '@/lib/compromisos/core'

/**
 * Los compromisos de pago. Va en un hook aparte de `useAcreedores` a propósito: son dos fuentes
 * distintas —una es el dashboard, la otra la base del monitor— y si el dashboard no contesta, las
 * compromisos se tienen que seguir viendo igual.
 */
export function useCompromisos() {
  const [compromisos, setCompromisos] = useState<Compromiso[]>([])
  const [puede, setPuede] = useState<PuedeCompromisos>({ ver: false, prometer: false, confirmar: false })
  /**
   * 🔑 **`cargando` significa "todavía no tengo nada que mostrar", no "estoy pidiendo".**
   *
   * Se prendía en CADA recarga, y como la pantalla corta con esto para dibujar "Buscando…", cada
   * confirmar / cancelar / anotar borraba la pestaña entera —incluido el cartel de "Listo" que
   * acababa de aparecer— hasta que volviera la consulta. Y las recargas son el caso normal: cada
   * acción dispara una.
   *
   * Ahora la primera vez avisa, y los refrescos posteriores dejan los datos viejos en pantalla
   * hasta que llegan los nuevos. `recargando` queda por si alguna pantalla quiere mostrarlo suave.
   */
  const [cargando, setCargando] = useState(true)
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
        const r = await leerCompromisos()
        if (!vivo) return
        setCompromisos(r.compromisos)
        setPuede(r.puede)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudieron leer los compromisos.')
      } finally {
        if (vivo) { setCargando(false); setRecargando(false) }
      }
    })()
    return () => { vivo = false }
  }, [tick])

  return { compromisos, puede, cargando, recargando, error, recargar }
}
