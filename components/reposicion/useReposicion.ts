'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import { leerRepoConfig } from '@/lib/reposicion/cfg'
import { guardarRepoConfig, leerInventario, ventasLocal7d } from '@/lib/reposicion/cliente'
import { repoCfgDefault, type RepoCfg } from '@/lib/reposicion/tipos'
import type { FilaInvRepo } from '@/lib/reposicion/inventario'

/**
 * Carga y persistencia de Reposición. Port de repoInit/repoCargarInventario/
 * repoCfgLoad/repoCfgSave (index.html:12499-12547). Read-only sobre stock: baja el
 * inventario (Local+Depósito) y las ventas 7d de Supabase, y la config COMPARTIDA de
 * REPO_API (la ven todos, se guarda con debounce). El armado de `repoInv` (con TN +
 * catsOff) lo hace el componente por `useMemo` (reactivo a tnIdx/catsOff).
 */

export type ShareStatus = { txt: string; color: string }

export type EstadoReposicion = {
  cfg: RepoCfg
  rawInv: FilaInvRepo[]
  s7: Record<string, number>
  lastUpdate: Date | null
  cargando: boolean
  error: string | null
  shareStatus: ShareStatus
  guardarCfg: (cfg: RepoCfg) => void
  traer: () => Promise<void>
}

export function useReposicion(marca: Marca): EstadoReposicion {
  const [cfg, setCfg] = useState<RepoCfg>(() => repoCfgDefault())
  const [rawInv, setRawInv] = useState<FilaInvRepo[]>([])
  const [s7, setS7] = useState<Record<string, number>>({})
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<ShareStatus>({ txt: '', color: '#6B7280' })
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const marcaRef = useRef(marca)
  useEffect(() => {
    marcaRef.current = marca
  }, [marca])

  const traer = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [config, inv, ventas] = await Promise.all([leerRepoConfig(marca), leerInventario(marca), ventasLocal7d(marca)])
      setCfg(config)
      setRawInv(inv)
      setS7(ventas)
      setLastUpdate(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }, [marca])

  useEffect(() => {
    void (async () => {
      await traer()
    })()
  }, [traer])

  const guardarCfg = useCallback(
    (next: RepoCfg) => {
      setCfg(next)
      setShareStatus({ txt: 'Guardando…', color: '#6B7280' })
      if (saveT.current) clearTimeout(saveT.current)
      saveT.current = setTimeout(async () => {
        const r = await guardarRepoConfig(marca, next)
        if (marcaRef.current !== marca) return
        setShareStatus(r.ok ? { txt: '✓ Guardado (lo ven todos)', color: '#16A34A' } : { txt: 'Error: ' + (r.error || ''), color: '#DC2626' })
      }, 700)
    },
    [marca],
  )

  return { cfg, rawInv, s7, lastUpdate, cargando, error, shareStatus, guardarCfg, traer }
}
