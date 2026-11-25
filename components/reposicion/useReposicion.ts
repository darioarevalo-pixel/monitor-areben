'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { leerRepoConfig } from '@/lib/reposicion/cfg'
import { guardarRepoConfig, leerReposicionErp } from '@/lib/reposicion/cliente'
import { cfgVentas } from '@/lib/reposicion/porVentas'
import { repoCfgDefault, type RepoCfg } from '@/lib/reposicion/tipos'
import type { FilaInvRepo } from '@/lib/reposicion/inventario'

/**
 * Carga y persistencia de Reposición. Read-only sobre stock: lee DIRECTO de Areben Gestión el inventario
 * (Local+Depósito) y las ventas del local (`leerReposicionErp`, 25-nov-2026), y la config COMPARTIDA de REPO_API
 * (la ven todos, se guarda con debounce). El armado de `repoInv` (con TN +
 * catsOff) lo hace el componente por `useMemo` (reactivo a tnIdx/catsOff).
 */

export type ShareStatus = { txt: string; color: string }

export type EstadoReposicion = {
  cfg: RepoCfg
  rawInv: FilaInvRepo[]
  s7: Record<string, number>
  /**
   * Zattia: ventas por variante, una bajada por cada ventana de días configurada (Zattia y Stunned
   * pueden mirar ventanas distintas; cada una divide por la suya). Vacío en BDI.
   */
  vvPorDias: Record<number, Record<string, number>>
  lastUpdate: Date | null
  cargando: boolean
  error: string | null
  shareStatus: ShareStatus
  guardarCfg: (cfg: RepoCfg) => void
  /** Vuelve a leer de Areben Gestión (unos segundos). */
  traer: () => Promise<void>
}

export function useReposicion(marca: Marca): EstadoReposicion {
  const [cfg, setCfg] = useState<RepoCfg>(() => repoCfgDefault())
  const [rawInv, setRawInv] = useState<FilaInvRepo[]>([])
  const [s7, setS7] = useState<Record<string, number>>({})
  const [vvPorDias, setVvPorDias] = useState<Record<number, Record<string, number>>>({})
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
    setError(null)
    setCargando(true)
    try {
      // La config primero: dice qué ventanas de días mirar (Zattia y Stunned pueden tener distintas).
      const config = await leerRepoConfig(marca)
      setCfg(config)
      const ventanas = marca === 'zattia' ? [cfgVentas(config, 'zattia').ventanaDias, cfgVentas(config, 'stunned').ventanaDias] : [cfgVentas(config, 'bdi').ventanaDias]
      // 🔑 DIRECTO de Areben Gestión (25-nov-2026): ⛔ hay copia ni foto guardada en la compu. Antes la pantalla leía el
      // espejo de GN, que desde el corte se llenaba una vez por día, y decidía si renovar la foto por `sync_state`, que ya
      // ⛔ se movía: mostraba el stock de la mañana con una hora vieja.
      const d = await leerReposicionErp(marca, [7, ...ventanas])
      setRawInv(d.inventario)
      setS7(d.ventas[7] || {})
      setVvPorDias(Object.fromEntries(ventanas.map((n) => [n, d.ventas[n] || {}])))
      // La hora en que el servidor leyó el libro: ES la del stock que se ve (⛔ la del navegador).
      setLastUpdate(d.leidoEn)
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

  return { cfg, rawInv, s7, vvPorDias, lastUpdate, cargando, error, shareStatus, guardarCfg, traer }
}
