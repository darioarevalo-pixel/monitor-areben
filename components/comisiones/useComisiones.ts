'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import { canales, comDefault, comNormalizar } from '@/lib/comisiones/core'
import { guardarConfigCompartida, leerConfigCompartida } from '@/lib/comisiones/kv'
import type { ComCfg, ItemSale } from '@/lib/comisiones/tipos'

/**
 * Config de Comisiones + lista de sale. La config se guarda LOCAL (por cuenta) y,
 * si sos admin, también en el KV COMPARTIDO (todos ven lo mismo). Port de comLoad/
 * comCargarCompartida/comSave/comGuardarCompartida + saleLoad/saleSave
 * (index.html:6023-6062 / 6301-6321). Mismas claves de localStorage que el legacy.
 */

const keyCfg = (marca: Marca) => `monitor_comisiones_${marca}`
const keySale = (marca: Marca) => `monitor_sale_${marca}`

function lsGet<T>(key: string, fallback: T): T {
  try {
    const r = localStorage.getItem(key)
    return r ? (JSON.parse(r) as T) : fallback
  } catch {
    return fallback
  }
}
function lsSet(key: string, val: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(val))
    return true
  } catch {
    return false
  }
}

export type ShareStatus = { txt: string; color: string }

export type EstadoComisiones = {
  cfg: ComCfg
  /** Guarda la config: localStorage siempre; KV compartido si `esAdmin`. */
  guardar: (cfg: ComCfg) => void
  shareStatus: ShareStatus
  saleList: ItemSale[]
  agregarSale: (item: ItemSale) => void
  quitarSale: (pid: string) => void
  vaciarSale: () => void
}

export function useComisiones(marca: Marca, esAdmin: boolean, cred: { user: string; obtenerPass: () => string }): EstadoComisiones {
  const cans = canales(marca === 'zattia')
  const [cfg, setCfg] = useState<ComCfg>(() => comDefault(cans))
  const [saleList, setSaleList] = useState<ItemSale[]>([])
  const [shareStatus, setShareStatus] = useState<ShareStatus>({ txt: '', color: '#6B7280' })
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const marcaRef = useRef(marca)
  useEffect(() => {
    marcaRef.current = marca
  }, [marca])

  // Carga: local/default inmediato + compartida del KV (re-aplica si existe). En un
  // IIFE async para no hacer setState sincrónico en el effect (lo marca el CI).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const local = lsGet<ComCfg | null>(keyCfg(marca), null)
      const base = local ? comNormalizar(local, canales(marca === 'zattia')) : comDefault(canales(marca === 'zattia'))
      const sale = lsGet<ItemSale[]>(keySale(marca), [])
      if (!vivo) return
      setCfg(base)
      setSaleList(sale)
      const compartida = await leerConfigCompartida(marca)
      if (!vivo || marcaRef.current !== marca) return
      if (compartida) {
        const norm = comNormalizar(compartida, canales(marca === 'zattia'))
        setCfg(norm)
        lsSet(keyCfg(marca), norm)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const guardar = useCallback(
    (next: ComCfg) => {
      setCfg(next)
      lsSet(keyCfg(marca), next)
      if (!esAdmin) {
        setShareStatus({ txt: '', color: '#6B7280' })
        return
      }
      setShareStatus({ txt: 'Guardando…', color: '#6B7280' })
      if (saveT.current) clearTimeout(saveT.current)
      saveT.current = setTimeout(async () => {
        const r = await guardarConfigCompartida(marca, next, cred.user, cred.obtenerPass())
        if (marcaRef.current !== marca) return
        setShareStatus(r.ok ? { txt: '✓ Guardado (lo ve tu socio)', color: '#16A34A' } : { txt: 'Error: ' + (r.error || ''), color: '#DC2626' })
      }, 600)
    },
    [marca, esAdmin, cred],
  )

  const agregarSale = useCallback(
    (item: ItemSale) => {
      setSaleList((prev) => {
        const i = prev.findIndex((x) => String(x.pid) === String(item.pid))
        const next = i >= 0 ? prev.map((x, idx) => (idx === i ? item : x)) : [...prev, item]
        lsSet(keySale(marca), next)
        return next
      })
    },
    [marca],
  )
  const quitarSale = useCallback(
    (pid: string) => {
      setSaleList((prev) => {
        const next = prev.filter((x) => String(x.pid) !== String(pid))
        lsSet(keySale(marca), next)
        return next
      })
    },
    [marca],
  )
  const vaciarSale = useCallback(() => {
    setSaleList([])
    lsSet(keySale(marca), [])
  }, [marca])

  return { cfg, guardar, shareStatus, saleList, agregarSale, quitarSale, vaciarSale }
}
