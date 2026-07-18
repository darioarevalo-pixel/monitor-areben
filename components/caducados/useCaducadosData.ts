'use client'

import { useCallback, useEffect, useState } from 'react'
import { cargarDatosCaducados } from '@/components/caducados/datosCaducados'
import type { StockPorDeposito, UltimaVenta } from '@/lib/caducados'
import type { Marca } from '@/lib/nav'

/**
 * Baja el stock por depósito + la última venta de la marca (fetches propios de
 * caducados) y los cachea a nivel de módulo. Lee el caché EN el render (no setState
 * en effect) para no romper el CI, igual que `useTnImages`. `recargar()` fuerza una
 * bajada nueva (lo usa el botón "Traer stock de GN" después de disparar el sync).
 */
type Datos = { stock: StockPorDeposito; ultimaVenta: UltimaVenta }

const cache: Partial<Record<Marca, Datos>> = {}
const enVuelo: Partial<Record<Marca, Promise<void>>> = {}

async function cargar(marca: Marca, forzar = false): Promise<void> {
  if (forzar) delete cache[marca]
  if (cache[marca]) return
  if (!enVuelo[marca]) {
    enVuelo[marca] = cargarDatosCaducados(marca)
      .then((d) => {
        cache[marca] = d
      })
      .finally(() => {
        enVuelo[marca] = undefined
      })
  }
  await enVuelo[marca]
}

export function useCaducadosData(marca: Marca) {
  const cached = cache[marca] ?? null
  const [, forzarRender] = useState(0)

  useEffect(() => {
    if (cached) return
    let vivo = true
    cargar(marca).then(() => {
      if (vivo) forzarRender((n) => n + 1)
    })
    return () => {
      vivo = false
    }
  }, [marca, cached])

  const recargar = useCallback(async () => {
    await cargar(marca, true)
    forzarRender((n) => n + 1)
  }, [marca])

  return { datos: cached, cargando: !cached, recargar }
}
