'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import { guardarCupones, leerCupones } from '@/lib/kv/cliente'
import type { Cupon } from '@/lib/cupones/tipos'

/**
 * Carga y persistencia de los cupones. Mismo patrón que useSolicitudesInternas
 * (misma familia de datos `{cupones}` en el KV compartido con el iframe): `cargado`
 * hacia afuera + **merge por-cupón** re-leyendo la lista fresca y re-aplicando la
 * mutación, así una empleada marcando "usado" no pisa un cupón que un admin creó
 * mientras tanto. Port de cuponesInit/cuponesGuardar (index.html:10677/10684).
 */

const NO_LEIDO =
  'No se pudo leer los cupones, así que no se guarda nada: guardar ahora borraría los que hay. Recargá y probá de nuevo.'

export type EstadoCupones = {
  cargando: boolean
  error: string | null
  data: Cupon[] | null
  cargado: boolean
  recargar: () => void
  /** Aplica una mutación pura (lista → lista) optimista y la persiste con merge por-cupón. */
  persistir: (mutar: (l: Cupon[]) => Cupon[]) => Promise<boolean>
}

export function useCupones(marca: Marca): EstadoCupones {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Cupon[] | null>(null)
  const [cargado, setCargado] = useState(false)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((t) => t + 1), [])
  const marcaRef = useRef(marca)
  useEffect(() => {
    marcaRef.current = marca
  }, [marca])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      setError(null)
      setData(null)
      setCargado(false)
      const lista = await leerCupones<Cupon>(marca)
      if (!vivo) return
      if (lista.ok) {
        setData(lista.dato)
        setCargado(true)
      } else {
        setData(null)
        setCargado(false)
        setError(lista.motivo)
      }
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  const persistir = useCallback(
    async (mutar: (l: Cupon[]) => Cupon[]): Promise<boolean> => {
      if (!cargado) {
        alert(NO_LEIDO)
        return false
      }
      const marcaAlGuardar = marcaRef.current
      setData((prev) => (prev ? mutar(prev) : prev)) // optimista
      const fresca = await leerCupones<Cupon>(marcaAlGuardar)
      if (!fresca.ok) {
        alert('No se pudo re-leer los cupones para guardar sin pisar cambios de otros: ' + fresca.motivo)
        return false
      }
      const merged = mutar(fresca.dato)
      const r = await guardarCupones({ store: marcaAlGuardar, cupones: merged, cargado: true })
      if (!r.ok) {
        alert('No se pudo guardar: ' + r.motivo)
        return false
      }
      if (marcaRef.current === marcaAlGuardar) setData(merged)
      return true
    },
    [cargado],
  )

  return { cargando, error, data, cargado, recargar, persistir }
}
