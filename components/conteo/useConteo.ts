'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import { leerRepoConfig } from '@/lib/reposicion/cfg'
import { construirVars } from '@/lib/conteo/core'
import { leerInventarioLocal } from '@/lib/conteo/cliente'
import type { ConteoCount, ConteoVar } from '@/lib/conteo/tipos'

/**
 * Carga y persistencia del Conteo de local. Port de conteoInit/_conteoGuardar/
 * _conteoGuardarG (index.html:11368-11398). El inventario del Local viene del espejo
 * Supabase (`fetchAll`), cruzado con los productos activos del store; el conteo y los
 * grupos marcados viven en localStorage con las MISMAS claves del legacy
 * (`monitor_conteo_<marca>`, `monitor_conteo_grupos_<marca>`).
 */

const keyC = (m: Marca) => `monitor_conteo_${m}`
const keyG = (m: Marca) => `monitor_conteo_grupos_${m}`

function lsGet<T>(key: string, fallback: T): T {
  try {
    const r = localStorage.getItem(key)
    return r ? (JSON.parse(r) as T) : fallback
  } catch {
    return fallback
  }
}

export type EstadoConteo = {
  vars: ConteoVar[]
  byBc: Record<string, string>
  count: ConteoCount
  gruposListos: string[]
  cargando: boolean
  error: string | null
  traer: () => Promise<void>
  escanear: (vid: string) => void
  setCount: (vid: string, val: string) => void
  toggleGrupo: (g: string) => void
  reset: () => void
  limpiarGrupos: (grupos: string[]) => void
}

export function useConteo(marca: Marca, prodById: Record<string, { category?: string | null }>): EstadoConteo {
  const [vars, setVars] = useState<ConteoVar[]>([])
  const [byBc, setByBc] = useState<Record<string, string>>({})
  const [count, setCountState] = useState<ConteoCount>({})
  const [gruposListos, setGruposListos] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    if (!cargado) return
    try {
      localStorage.setItem(keyC(marca), JSON.stringify(count))
    } catch {
      /* cuota */
    }
  }, [count, marca, cargado])
  useEffect(() => {
    if (!cargado) return
    try {
      localStorage.setItem(keyG(marca), JSON.stringify(gruposListos))
    } catch {
      /* cuota */
    }
  }, [gruposListos, marca, cargado])

  const traer = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [cfg, inv] = await Promise.all([leerRepoConfig(marca), leerInventarioLocal(marca)])
      const { vars: vs, byBc: bc } = construirVars(inv, prodById, cfg.catsOff)
      setVars(vs)
      setByBc(bc)
      setCountState(lsGet(keyC(marca), {}))
      setGruposListos(lsGet(keyG(marca), []))
      setCargado(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }, [marca, prodById])

  useEffect(() => {
    void (async () => {
      await traer()
    })()
  }, [traer])

  const escanear = useCallback((vid: string) => setCountState((c) => ({ ...c, [vid]: (c[vid] || 0) + 1 })), [])
  const setCount = useCallback((vid: string, val: string) => {
    const n = Math.max(0, parseInt(val, 10) || 0)
    setCountState((c) => {
      const next = { ...c }
      if (n === 0) delete next[vid]
      else next[vid] = n
      return next
    })
  }, [])
  const toggleGrupo = useCallback((g: string) => setGruposListos((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g])), [])
  const reset = useCallback(() => {
    setCountState({})
    setGruposListos([])
  }, [])
  const limpiarGrupos = useCallback(
    (grupos: string[]) => {
      const set = new Set(grupos)
      setCountState((c) => {
        const next: ConteoCount = {}
        vars.forEach((v) => {
          if (!set.has(v.grupo) && c[v.vid] != null) next[v.vid] = c[v.vid]
        })
        return next
      })
      setGruposListos([])
    },
    [vars],
  )

  return { vars, byBc, count, gruposListos, cargando, error, traer, escanear, setCount, toggleGrupo, reset, limpiarGrupos }
}
