'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'

/**
 * Las campañas de liquidación con los precios PUESTOS en la tienda, para etiquetar.
 *
 * 🔑 **Pide la vista `&etiquetas=1`, no la de Liquidación.** Esa vista se resuelve con el permiso de
 * *Etiquetas* y devuelve nada más que los pid: la gente del local no ve —ni tiene que ver— el costo
 * ni el margen que trae la foto congelada de cada producto. El precio de la etiqueta sale de Tienda
 * Nube, como en la pestaña Promo; la campaña sólo contesta *cuáles*.
 */

const API = '/api/datos?recurso=liquidacion'

export interface CampaniaEti {
  id: string
  nombre: string
  desde: string | null
  hasta: string | null
}

export interface EstadoLiquidacionEti {
  campanias: CampaniaEti[]
  elegida: CampaniaEti | null
  elegir: (id: string) => void
  /** Los productos de la campaña elegida. Vacío mientras carga. */
  pids: Set<string>
  cargando: boolean
  error: string | null
}

export function useLiquidacionEtiquetas(marca: Marca): EstadoLiquidacionEti {
  const [campanias, setCampanias] = useState<CampaniaEti[]>([])
  const [elegidaId, setElegidaId] = useState<string | null>(null)
  const [pids, setPids] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Las dos cargas van en un IIFE async: el CI marca el setState sincrónico adentro de un efecto.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      setError(null)
      setCampanias([])
      setElegidaId(null)
      setPids(new Set())
      try {
        const r = await apiFetch(`${API}&store=${marca}&etiquetas=1&nc=${Date.now()}`)
        const d = await r.json().catch(() => null)
        if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer las liquidaciones.')
        if (!vivo) return
        const lista = (d.campanias || []) as CampaniaEti[]
        setCampanias(lista)
        // Con una sola no hay nada que elegir: entra derecho. Con varias, la más nueva primero.
        setElegidaId(lista.length ? lista[0].id : null)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron leer las liquidaciones.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  useEffect(() => {
    if (!elegidaId) return
    let vivo = true
    ;(async () => {
      setCargando(true)
      setError(null)
      try {
        const r = await apiFetch(`${API}&store=${marca}&etiquetas=1&liq=${encodeURIComponent(elegidaId)}&nc=${Date.now()}`)
        const d = await r.json().catch(() => null)
        if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer los productos de la liquidación.')
        if (!vivo) return
        setPids(new Set((d.pids || []) as string[]))
      } catch (e) {
        if (vivo) {
          setPids(new Set())
          setError(e instanceof Error ? e.message : 'No se pudieron leer los productos de la liquidación.')
        }
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, elegidaId])

  const elegir = useCallback((id: string) => {
    setPids(new Set())
    setElegidaId(id)
  }, [])

  const elegida = useMemo(() => campanias.find((c) => c.id === elegidaId) || null, [campanias, elegidaId])

  return { campanias, elegida, elegir, pids, cargando, error }
}
