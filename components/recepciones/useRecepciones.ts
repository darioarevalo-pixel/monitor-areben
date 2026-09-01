'use client'

/**
 * El estado de "Ingresos" (ex "Lo que entró"). Molde de `usePedidosClientes`: una lista, un contador de recargas y
 * la carga adentro de una IIFE con bandera `vivo` —el patrón del repo—, porque llamar a `setState`
 * derecho en el cuerpo de un efecto encadena renders y el lint lo rechaza.
 *
 * 🔴 **Al cambiar de marca la lista se VACÍA antes de pedir la nueva.** Lo que se muestra son
 * números agregados —cumplimiento, unidades que faltaron— y unos números viejos abajo del rótulo de
 * la otra marca no se leen como "está cargando": se leen como los de esta marca.
 */

import { useCallback, useEffect, useState } from 'react'
import { leerRecepciones, type Eventos, type Puede } from '@/lib/recepciones/cliente'
import type { Recepcion } from '@/lib/recepciones/core'

export function useRecepciones(marca: string | null, dias: number) {
  const [recepciones, setRecepciones] = useState<Recepcion[]>([])
  const [eventos, setEventos] = useState<Eventos>({ rotos: [], ultimo: null })
  // 🔑 Arranca en `false`: hasta que el servidor conteste, no se dibuja nada de proveedores. Al
  // revés se vería el panel un instante y desaparecería, que es peor que no verlo nunca.
  const [puede, setPuede] = useState<Puede>({ proveedores: false })
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
      setRecepciones([])
      setEventos({ rotos: [], ultimo: null })
      try {
        const r = await leerRecepciones(marca, dias)
        if (!vivo) return
        setRecepciones(r.recepciones)
        setEventos(r.eventos)
        setPuede(r.puede)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudieron leer las recepciones.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, dias, tick])

  return { recepciones, eventos, puede, cargando, error, recargar }
}
