'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { leerRepoConfig } from '@/lib/reposicion/cfg'
import { almacenActivo } from '@/lib/almacen'
import { guardarRepoConfig, huellaDatos, leerInventario, ultimaSincronizacion, ventasLocal, ventasLocal7d } from '@/lib/reposicion/cliente'
import { cfgVentas, hoyAR } from '@/lib/reposicion/porVentas'
import { repoCfgDefault, type RepoCfg } from '@/lib/reposicion/tipos'
import type { FilaInvRepo } from '@/lib/reposicion/inventario'

/**
 * Carga y persistencia de Reposición. Port de repoInit/repoCargarInventario/
 * repoCfgLoad/repoCfgSave (index.html:12499-12547). Read-only sobre stock: baja el
 * inventario (Local+Depósito), las ventas 7d y la hora del último sync de Supabase, y la config
 * COMPARTIDA de REPO_API (la ven todos, se guarda con debounce). El armado de `repoInv` (con TN +
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
  /** Vuelve a leer. Con `forzar`, baja todo aunque la foto guardada esté al día («Recargar»). */
  traer: (opts?: { forzar?: boolean }) => Promise<void>
}

/** Lo que se guarda en la compu: la foto de stock y ventas, con su huella. La config no: es chica y la cambian otros. */
type FotoRepo = { huella: string; rawInv: FilaInvRepo[]; s7: Record<string, number>; vvPorDias: Record<number, Record<string, number>>; lastUpdate: number | null }
const claveFoto = (marca: Marca) => `reposicion_foto_${marca}`

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

  const traer = useCallback(
    async (opts?: { forzar?: boolean }) => {
      setError(null)
      try {
        // 1) Lo chico, siempre: la config (la pueden cambiar otros) y la huella de los datos.
        const [config, huella] = await Promise.all([leerRepoConfig(marca), huellaDatos(marca, hoyAR())])
        setCfg(config)
        const ventanas = marca === 'zattia' ? [...new Set([cfgVentas(config, 'zattia').ventanaDias, cfgVentas(config, 'stunned').ventanaDias])] : [cfgVentas(config, 'bdi').ventanaDias]

        // 2) 🔑 Si la foto guardada tiene la misma huella, el stock y las ventas no cambiaron: se
        // muestra al instante, sin volver a bajar 1,3 MB. La huella cambia con CADA sync (el de la
        // mañana, «Actualizar stock», la transferencia de un armado) y con el día.
        if (!opts?.forzar && huella) {
          const foto = await almacenActivo().leer<FotoRepo>(claveFoto(marca)).catch(() => null)
          if (foto && foto.huella === huella && ventanas.every((d) => foto.vvPorDias[d])) {
            setRawInv(foto.rawInv)
            setS7(foto.s7)
            setVvPorDias(foto.vvPorDias)
            setLastUpdate(foto.lastUpdate ? new Date(foto.lastUpdate) : null)
            setCargando(false)
            return
          }
        }

        // 3) Hay que bajar: stock, ventas y la hora del sync, TODO a la vez (antes las ventas de
        // 60 días esperaban a la config).
        setCargando(true)
        const [inv, ventas, sincro, mapas] = await Promise.all([
          leerInventario(marca),
          ventasLocal7d(marca),
          ultimaSincronizacion(marca),
          Promise.all(ventanas.map((d) => ventasLocal(marca, d))),
        ])
        const vv = Object.fromEntries(ventanas.map((d, i) => [d, mapas[i]]))
        setVvPorDias(vv)
        setRawInv(inv)
        setS7(ventas)
        // 🔑 **La hora del SYNC, no la de la lectura.** Acá había un `new Date()`, y por eso la
        // pantalla nunca podía estar desactualizada: cada vez que leía el espejo —aunque el espejo
        // fuera de ayer— se sellaba con la hora de recién. `ultimaSincronizacion` devuelve `null`
        // mientras ningún sync haya pasado desde que esto existe, y ahí la pantalla dice «—».
        setLastUpdate(sincro)
        if (huella) {
          const foto: FotoRepo = { huella, rawInv: inv, s7: ventas, vvPorDias: vv, lastUpdate: sincro ? sincro.getTime() : null }
          // Que no se pueda guardar no frena nada: la próxima vez baja todo, como siempre.
          await almacenActivo().guardar(claveFoto(marca), foto).catch(() => {})
        }
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
