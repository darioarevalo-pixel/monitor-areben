'use client'

/** El estado del PRM: el padrón con su resumen, y los nombres para los dos desplegables de enganche. */
import { useCallback, useEffect, useState } from 'react'
import { leerOpciones, leerPadron, type LocalConResumen, type Opciones } from '@/lib/prm/cliente'

const SIN_OPCIONES: Opciones = { deIngresos: [], deGn: [], gnDisponible: false }

export function usePRM(marca: string | null) {
  const [locales, setLocales] = useState<LocalConResumen[]>([])
  const [opciones, setOpciones] = useState<Opciones>(SIN_OPCIONES)
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
        const [p, o] = await Promise.all([leerPadron(marca), leerOpciones(marca)])
        if (!vivo) return
        setLocales(p)
        setOpciones(o)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo leer el PRM.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  return { locales, opciones, cargando, error, recargar }
}
