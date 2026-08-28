'use client'

/**
 * El estado de Insumos. Molde de `useRecepciones`: la carga adentro de una IIFE con bandera `vivo`
 * —el patrón del repo—, porque llamar a `setState` derecho en el cuerpo de un efecto encadena
 * renders y el lint lo rechaza.
 *
 * ⚠️ **Al cambiar de marca la lista NO se vacía**, al revés que en Recepciones. Acá el catálogo es
 * uno solo para la empresa: vaciarlo haría parpadear una lista que no cambia. Lo que sí depende de
 * la marca es el permiso, y eso lo contesta el 403 del handler.
 */

import { useCallback, useEffect, useState } from 'react'
import { leerInsumos, type DatosInsumos } from '@/lib/insumos/cliente'

const VACIO: DatosInsumos = { insumos: [], movimientos: [], comprasPorMarca: {}, sinRitmo: [] }

export function useInsumos(marca: string | null) {
  const [datos, setDatos] = useState<DatosInsumos>(VACIO)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(async () => {
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!marca) return
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      try {
        const d = await leerInsumos(marca)
        if (!vivo) return
        setDatos(d)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudieron leer los insumos.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  return { ...datos, cargando, error, recargar }
}
