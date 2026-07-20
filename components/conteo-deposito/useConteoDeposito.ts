'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import { leerInventarioVivo } from '@/lib/inventario-vivo/cliente'
import { realMap } from '@/lib/inventario-vivo/core'
import { agruparVivo, ultimosPorProducto } from '@/lib/conteo-deposito/core'
import { leerHistorial } from '@/lib/conteo-deposito/cliente'
import type { CdepProducto, CdepState } from '@/lib/conteo-deposito/tipos'

/**
 * Carga y persistencia del Conteo de Depósito. Port de conteoDepInit/_cdepSave/
 * _cdepLoad/_cdepCargarUltimos (index.html:11640-11673). El stock viene VIVO de GN
 * (`/api/inventario-vivo`); el conteo en progreso vive en localStorage con la MISMA
 * clave del legacy (`monitor_conteodep_<marca>`) → el flip no pierde lo cargado.
 */

const key = (m: Marca) => `monitor_conteodep_${m}`

type Guardado = { inicio?: number | null; stockTime?: number | null; prods?: CdepState }
function cargarLs(m: Marca): Guardado {
  try {
    const s = JSON.parse(localStorage.getItem(key(m)) || '{}')
    return s && typeof s === 'object' ? s : {}
  } catch {
    return {}
  }
}

export type EstadoConteoDep = {
  products: CdepProducto[]
  state: CdepState
  inicio: number | null
  stockTime: number | null
  lastCount: Record<string, number>
  cargando: boolean
  error: string | null
  feedStore: string | null
  traerStock: (reset?: boolean) => Promise<void>
  aplicar: (next: CdepState) => void
  setInicio: (v: number | null) => void
  reset: () => void
  /** Relee el historial y recomputa las fechas de último conteo (tras guardar). */
  refrescarUltimos: () => Promise<void>
}

export function useConteoDeposito(marca: Marca): EstadoConteoDep {
  const [products, setProducts] = useState<CdepProducto[]>([])
  const [state, setState] = useState<CdepState>({})
  const [inicio, setInicio] = useState<number | null>(null)
  const [stockTime, setStockTime] = useState<number | null>(null)
  const [lastCount, setLastCount] = useState<Record<string, number>>({})
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedStore, setFeedStore] = useState<string | null>(null)
  const [hidratado, setHidratado] = useState(false)

  // Escribir en localStorage ES el efecto (sincronizar con un sistema externo).
  useEffect(() => {
    if (!hidratado) return
    try {
      localStorage.setItem(key(marca), JSON.stringify({ inicio, stockTime, prods: state }))
    } catch {
      /* cuota llena */
    }
  }, [state, inicio, stockTime, marca, hidratado])

  // Trae el stock vivo + rehidrata el conteo guardado. setState dentro de la async fn
  // (no sincrónico en el effect: lo marca el CI).
  const traerStock = useCallback(
    async (reset = false) => {
      setCargando(true)
      setError(null)
      try {
        const d = await leerInventarioVivo(marca)
        const prods = agruparVivo(realMap(d.rows || []))
        const saved = cargarLs(marca)
        const savedState = saved.prods || {}
        const hayConteo = Object.values(savedState).some((s) => s.contado && Object.keys(s.contado).length)
        const st = reset || !saved.stockTime || !hayConteo ? Date.now() : saved.stockTime
        setProducts(prods)
        setState(savedState)
        setInicio(saved.inicio ?? null)
        setStockTime(st)
        setFeedStore(d.store ?? null)
        setHidratado(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setCargando(false)
      }
    },
    [marca],
  )

  // Al montar / cambiar de marca: traer el stock. La llamada va en un IIFE async
  // para que el setState de traerStock no cuente como sincrónico en el effect (CI).
  useEffect(() => {
    void (async () => {
      await traerStock()
    })()
  }, [traerStock])

  // Relee el historial y recomputa las fechas de último conteo. Se llama a mano
  // tras guardar un conteo (para que la fecha aparezca sin recargar la página).
  const refrescarUltimos = useCallback(async () => {
    if (!products.length) return
    try {
      const conteos = await leerHistorial(marca)
      setLastCount(ultimosPorProducto(conteos, products))
    } catch {
      /* si falla, la lista no muestra fechas */
    }
  }, [products, marca])

  // Cuando hay productos, traer las fechas del último conteo (async, no bloquea).
  useEffect(() => {
    if (!products.length) return
    let vivo = true
    ;(async () => {
      try {
        const conteos = await leerHistorial(marca)
        if (vivo) setLastCount(ultimosPorProducto(conteos, products))
      } catch {
        /* si falla, la lista no muestra fechas */
      }
    })()
    return () => {
      vivo = false
    }
  }, [products, marca])

  const aplicar = useCallback((next: CdepState) => setState(next), [])
  const reset = useCallback(() => {
    setState({})
    setInicio(null)
    setStockTime(null)
  }, [])

  return { products, state, inicio, stockTime, lastCount, cargando, error, feedStore, traerStock, aplicar, setInicio, reset, refrescarUltimos }
}
