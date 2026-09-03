'use client'

/** El estado de Modelos: el padrón entero. Es una sola lectura — la tabla es chica y no se pagina. */
import { useCallback, useEffect, useState } from 'react'
import { leerModelos } from '@/lib/modelos/cliente'
import type { Modelo } from '@/lib/modelos/tipos'

export function useModelos(marca: string | null) {
  const [modelos, setModelos] = useState<Modelo[]>([])
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
        const p = await leerModelos(marca)
        if (!vivo) return
        setModelos(p)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo leer el padrón de modelos.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  return { modelos, cargando, error, recargar }
}
