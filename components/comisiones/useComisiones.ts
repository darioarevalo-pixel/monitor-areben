'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { guardarConfigCompartida } from '@/lib/comisiones/kv'
import type { ComCfg, ItemSale } from '@/lib/comisiones/tipos'
import type { ObtenerCred } from '@/lib/sesion'
import { lsGet, lsSet, useCfgComisiones } from './simulador/useCfgComisiones'

/**
 * Config de Comisiones + lista de sale. La config se guarda LOCAL (por cuenta) y,
 * si sos admin, también en el KV COMPARTIDO (todos ven lo mismo). Port de comLoad/
 * comCargarCompartida/comSave/comGuardarCompartida + saleLoad/saleSave
 * (index.html:6023-6062 / 6301-6321). Mismas claves de localStorage que el legacy.
 *
 * **Leer** la config es de `useCfgComisiones` (al lado del simulador): el modal de Liquidación
 * calcula con los mismos números y no los edita. Acá queda lo que escribe.
 */

const keySale = (marca: Marca) => `monitor_sale_${marca}`

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

export function useComisiones(marca: Marca, esAdmin: boolean, obtenerCred: ObtenerCred): EstadoComisiones {
  const { cfg, setCfgLocal } = useCfgComisiones(marca)
  const [saleList, setSaleList] = useState<ItemSale[]>([])
  const [shareStatus, setShareStatus] = useState<ShareStatus>({ txt: '', color: '#6B7280' })
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const marcaRef = useRef(marca)
  useEffect(() => {
    marcaRef.current = marca
  }, [marca])

  // La lista de sale sí vive sólo acá (y sólo en este navegador). En un IIFE async para no hacer
  // setState sincrónico en el effect (lo marca el CI).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const sale = lsGet<ItemSale[]>(keySale(marca), [])
      if (!vivo) return
      setSaleList(sale)
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const guardar = useCallback(
    (next: ComCfg) => {
      setCfgLocal(next)
      if (!esAdmin) {
        setShareStatus({ txt: '', color: '#6B7280' })
        return
      }
      setShareStatus({ txt: 'Guardando…', color: '#6B7280' })
      if (saveT.current) clearTimeout(saveT.current)
      saveT.current = setTimeout(async () => {
        const r = await guardarConfigCompartida(marca, next, await obtenerCred())
        if (marcaRef.current !== marca) return
        setShareStatus(r.ok ? { txt: '✓ Guardado (lo ve tu socio)', color: '#16A34A' } : { txt: 'Error: ' + (r.error || ''), color: '#DC2626' })
      }, 600)
    },
    [marca, esAdmin, obtenerCred, setCfgLocal],
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
