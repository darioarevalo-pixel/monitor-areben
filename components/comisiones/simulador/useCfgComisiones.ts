'use client'

/**
 * La config de Comisiones — impuestos, formas de pago y la matriz de comisiones por canal — para
 * quien sólo la quiere **leer**.
 *
 * Existe porque el simulador dejó de ser exclusivo de Comisiones: el modal de Liquidación calcula
 * el margen con los mismos números, pero no los edita. `useComisiones` (que sí edita, guarda en el
 * KV compartido y lleva la lista de sale) carga la config con este mismo hook, así **la clave de
 * localStorage y el orden local→compartida viven en un solo lugar**.
 *
 * El orden importa: primero lo que haya en el navegador (o el default) para dibujar sin esperar, y
 * después la del KV, que es la del equipo y pisa a la local. Una config a medio bajar mostraría
 * márgenes calculados con comisiones en cero.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { canales, comDefault, comNormalizar } from '@/lib/comisiones/core'
import { leerConfigCompartida } from '@/lib/comisiones/kv'
import type { ComCfg } from '@/lib/comisiones/tipos'
import type { Marca } from '@/lib/nav.datos'

export const keyCfgComisiones = (marca: Marca) => `monitor_comisiones_${marca}`

/** localStorage sin explotar: si el JSON está roto o el navegador lo bloquea, se sigue igual. */
export function lsGet<T>(key: string, fallback: T): T {
  try {
    const r = localStorage.getItem(key)
    return r ? (JSON.parse(r) as T) : fallback
  } catch {
    return fallback
  }
}

export function lsSet(key: string, val: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(val))
    return true
  } catch {
    return false
  }
}

export type EstadoCfg = {
  cfg: ComCfg
  /** Deja la config en memoria y en el navegador. Guardarla para el equipo es de `useComisiones`. */
  setCfgLocal: (cfg: ComCfg) => void
  /** `false` mientras no volvió el KV: la config que se ve puede ser la vieja de este navegador. */
  listo: boolean
}

export function useCfgComisiones(marca: Marca): EstadoCfg {
  const [cfg, setCfg] = useState<ComCfg>(() => comDefault(canales(marca === 'zattia')))
  const [listo, setListo] = useState(false)
  const marcaRef = useRef(marca)
  useEffect(() => {
    marcaRef.current = marca
  }, [marca])

  // Todo adentro del IIFE async: el lint del repo prohíbe el setState sincrónico en un efecto.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const cans = canales(marca === 'zattia')
      const local = lsGet<ComCfg | null>(keyCfgComisiones(marca), null)
      if (!vivo) return
      setListo(false)
      setCfg(local ? comNormalizar(local, cans) : comDefault(cans))
      const compartida = await leerConfigCompartida(marca)
      if (!vivo || marcaRef.current !== marca) return
      if (compartida) {
        const norm = comNormalizar(compartida, cans)
        setCfg(norm)
        lsSet(keyCfgComisiones(marca), norm)
      }
      setListo(true)
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const setCfgLocal = useCallback(
    (next: ComCfg) => {
      setCfg(next)
      lsSet(keyCfgComisiones(marca), next)
    },
    [marca],
  )

  return { cfg, setCfgLocal, listo }
}
