'use client'

import { useCallback, useEffect, useState } from 'react'
import { leerCuentas, type CuentaManual, type PuedeCuentas } from '@/lib/cuentas/cliente'

/**
 * Las cuentas manuales. Hook aparte de `useAcreedores` y de `useCompromisos` por el mismo motivo
 * que aquellos dos están separados entre sí: son tres fuentes distintas, y la que depende del
 * dashboard no puede arrastrar a las que no.
 *
 * 🔑 Éstas son justamente las que andan con el dashboard caído. Si se leyeran con los acreedores,
 * una caída del dashboard escondería la cuenta de la cuota del crédito, que es de acá y no tiene
 * nada que ver.
 */
export function useCuentas() {
  const [cuentas, setCuentas] = useState<CuentaManual[]>([])
  const [puede, setPuede] = useState<PuedeCuentas>({ ver: false, administrar: false })
  /** "Todavía no tengo nada que mostrar", no "estoy pidiendo" — igual que en `useCompromisos`. */
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let vivo = true
    void (async () => {
      setError(null)
      try {
        const r = await leerCuentas()
        if (!vivo) return
        setCuentas(r.cuentas)
        setPuede(r.puede)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudieron leer las cuentas.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [tick])

  return { cuentas, puede, cargando, error, recargar }
}
