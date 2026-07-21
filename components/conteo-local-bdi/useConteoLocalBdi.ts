'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import { leerInventarioVivo } from '@/lib/inventario-vivo/cliente'
import { realMap } from '@/lib/inventario-vivo/core'
import { agruparFundas, ultimosPorModelo } from '@/lib/conteo-local-bdi/core'
import { leerHistorial } from '@/lib/conteo-deposito/cliente'
import type { FundaVar, FundasState, ModeloGrupo } from '@/lib/conteo-local-bdi/tipos'

/**
 * Carga y persistencia del Conteo de Fundas de BDI. Lee el vivo del Local
 * (`leerInventarioVivo(marca,'local')`), aplana a variantes de funda agrupadas por
 * modelo, y guarda el conteo en progreso en localStorage (`monitor_conteofundas_<marca>`,
 * clave propia para no pisar los otros conteos). El historial (fecha por modelo) sale
 * de `conteos_deposito` filtrando `modo==='local-bdi'`.
 */

const key = (m: Marca) => `monitor_conteofundas_${m}`

type Guardado = { stockTime?: number | null; prods?: FundasState }
function cargarLs(m: Marca): Guardado {
  try {
    const s = JSON.parse(localStorage.getItem(key(m)) || '{}')
    return s && typeof s === 'object' ? s : {}
  } catch {
    return {}
  }
}

export type EstadoConteoFundas = {
  modelos: ModeloGrupo[]
  byBc: Record<string, string>
  varByVid: Record<string, FundaVar>
  state: FundasState
  stockTime: number | null
  store: string | null
  ubicacion: string | null
  ultimos: Record<string, number>
  cargando: boolean
  error: string | null
  traerStock: (reset?: boolean) => Promise<void>
  aplicar: (next: FundasState) => void
  refrescarUltimos: () => Promise<void>
}

export function useConteoLocalBdi(marca: Marca): EstadoConteoFundas {
  const [modelos, setModelos] = useState<ModeloGrupo[]>([])
  const [byBc, setByBc] = useState<Record<string, string>>({})
  const [varByVid, setVarByVid] = useState<Record<string, FundaVar>>({})
  const [state, setState] = useState<FundasState>({})
  const [stockTime, setStockTime] = useState<number | null>(null)
  const [store, setStore] = useState<string | null>(null)
  const [ubicacion, setUbicacion] = useState<string | null>(null)
  const [ultimos, setUltimos] = useState<Record<string, number>>({})
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidratado, setHidratado] = useState(false)

  // Persistir el conteo en progreso en localStorage (gateado por `hidratado` para
  // no pisar lo guardado con el estado vacío del primer render).
  useEffect(() => {
    if (!hidratado) return
    try {
      localStorage.setItem(key(marca), JSON.stringify({ stockTime, prods: state }))
    } catch {
      /* cuota llena */
    }
  }, [state, stockTime, marca, hidratado])

  const traerStock = useCallback(
    async (reset = false) => {
      setCargando(true)
      setError(null)
      try {
        const d = await leerInventarioVivo(marca, 'local')
        const { modelos, byBc, varByVid } = agruparFundas(realMap(d.rows || []))
        const saved = cargarLs(marca)
        const savedState = saved.prods || {}
        const hayConteo = Object.keys(savedState).length > 0
        const st = reset || !saved.stockTime || !hayConteo ? Date.now() : saved.stockTime
        setModelos(modelos)
        setByBc(byBc)
        setVarByVid(varByVid)
        setState(reset ? {} : savedState)
        setStockTime(st)
        setStore(d.store ?? String(marca))
        setUbicacion(d.store_name ?? 'Local')
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

  // Fechas del último conteo por modelo (async, no bloquea). Se recalcula al montar
  // y a mano tras cerrar un conteo (para que la fecha aparezca sin recargar).
  const refrescarUltimos = useCallback(async () => {
    try {
      const conteos = await leerHistorial(marca)
      setUltimos(ultimosPorModelo(conteos))
    } catch {
      /* si falla, la lista no muestra fechas */
    }
  }, [marca])

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const conteos = await leerHistorial(marca)
        if (vivo) setUltimos(ultimosPorModelo(conteos))
      } catch {
        /* si falla, no muestra fechas */
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const aplicar = useCallback((next: FundasState) => setState(next), [])

  return { modelos, byBc, varByVid, state, stockTime, store, ubicacion, ultimos, cargando, error, traerStock, aplicar, refrescarUltimos }
}
