'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import { leerInventarioVivo } from '@/lib/inventario-vivo/cliente'
import { realMap } from '@/lib/inventario-vivo/core'
import { agruparVivo, ultimosPorProducto } from '@/lib/conteo-estandar/core'
import { leerHistorial } from '@/lib/conteo-deposito/cliente'
import type { CeProducto, CeState, Linea } from '@/lib/conteo-estandar/tipos'

/**
 * Carga y persistencia del Conteo estándar del Local. Port de ceInit/_ceSave/_ceLoad/
 * _ceCargarUltimos (index.html:12067-12132). El feed del Local es compartido por las
 * dos líneas (zattia/stunned), así que se cachea a nivel de módulo: cambiar de línea
 * (que en el shell es cambiar de ruta y remontar) NO re-baja el stock. El conteo en
 * progreso vive en localStorage con la MISMA clave del legacy (`monitor_conteoest_<marca>`,
 * un solo blob para ambas líneas, filtrado por `p.linea` en runtime).
 */

const key = (m: Marca) => `monitor_conteoest_${m}`
const feedCache: Partial<Record<Marca, { products: CeProducto[]; byBc: Record<string, string> }>> = {}

type Guardado = { inicio?: number | null; stockTime?: number | null; prods?: CeState }
function cargarLs(m: Marca): Guardado {
  try {
    const s = JSON.parse(localStorage.getItem(key(m)) || '{}')
    return s && typeof s === 'object' ? s : {}
  } catch {
    return {}
  }
}

export type EstadoConteoEst = {
  products: CeProducto[]
  byBc: Record<string, string>
  state: CeState
  inicio: number | null
  stockTime: number | null
  lastCount: Record<string, number>
  cargando: boolean
  error: string | null
  traerStock: (reset?: boolean) => Promise<void>
  aplicar: (next: CeState) => void
  setInicio: (v: number | null) => void
  reset: () => void
  /** Relee el historial y recomputa las fechas de último conteo (tras guardar). */
  refrescarUltimos: () => Promise<void>
}

export function useConteoEstandar(marca: Marca, linea: Linea): EstadoConteoEst {
  const [products, setProducts] = useState<CeProducto[]>(feedCache[marca]?.products ?? [])
  const [byBc, setByBc] = useState<Record<string, string>>(feedCache[marca]?.byBc ?? {})
  const [state, setState] = useState<CeState>({})
  const [inicio, setInicio] = useState<number | null>(null)
  const [stockTime, setStockTime] = useState<number | null>(null)
  const [lastCount, setLastCount] = useState<Record<string, number>>({})
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidratado, setHidratado] = useState(false)

  useEffect(() => {
    if (!hidratado) return
    try {
      localStorage.setItem(key(marca), JSON.stringify({ inicio, stockTime, prods: state }))
    } catch {
      /* cuota llena */
    }
  }, [state, inicio, stockTime, marca, hidratado])

  const traerStock = useCallback(
    async (reset = false) => {
      setCargando(true)
      setError(null)
      try {
        let feed = feedCache[marca]
        if (!feed || reset) {
          const d = await leerInventarioVivo(marca, 'local')
          feed = agruparVivo(realMap(d.rows || []))
          feedCache[marca] = feed
        }
        const saved = cargarLs(marca)
        const savedState = saved.prods || {}
        const hayConteo = Object.values(savedState).some((s) => Object.keys(s.exhibido || {}).length || Object.keys(s.deposito || {}).length)
        const st = reset || !saved.stockTime || !hayConteo ? Date.now() : saved.stockTime
        setProducts(feed.products)
        setByBc(feed.byBc)
        setState(savedState)
        setInicio(saved.inicio ?? null)
        setStockTime(st)
        setHidratado(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setCargando(false)
      }
    },
    [marca],
  )

  useEffect(() => {
    void (async () => {
      await traerStock()
    })()
  }, [traerStock])

  // Fechas del último conteo de ESTA línea. Se recalcula al montar/cambiar de
  // línea y también a mano tras guardar un conteo (para que la fecha aparezca sin
  // recargar la página).
  const refrescarUltimos = useCallback(async () => {
    if (!products.length) return
    try {
      const conteos = await leerHistorial(marca)
      setLastCount(ultimosPorProducto(conteos, products, linea))
    } catch {
      /* si falla, no muestra fechas */
    }
  }, [products, marca, linea])

  useEffect(() => {
    if (!products.length) return
    let vivo = true
    void (async () => {
      try {
        const conteos = await leerHistorial(marca)
        if (vivo) setLastCount(ultimosPorProducto(conteos, products, linea))
      } catch {
        /* si falla, no muestra fechas */
      }
    })()
    return () => {
      vivo = false
    }
  }, [products, marca, linea])

  const aplicar = useCallback((next: CeState) => setState(next), [])
  const reset = useCallback(() => {
    setState({})
    setInicio(null)
    setStockTime(null)
  }, [])

  return { products, byBc, state, inicio, stockTime, lastCount, cargando, error, traerStock, aplicar, setInicio, reset, refrescarUltimos }
}
