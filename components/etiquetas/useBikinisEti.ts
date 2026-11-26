'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import type { BikiniEti } from '@/lib/etiquetas/bikinis.core.js'
import type { Marca } from '@/lib/nav.datos'

/**
 * Las bikinis 2027 de Zattia (corpiño + bombacha) para que escanear una parte imprima la etiqueta de SU bikini, con el precio que
 * cobra la Caja (Bruno, 26-nov). Entra por la llave de Etiquetas (`?etiquetas=1&bikinis=1`). Ver `lib/etiquetas/bikinis.core.js`.
 * Sólo Zattia: es la única marca con bikinis armadas.
 */
export function useBikinisEti(marca: Marca) {
  const [bikinis, setBikinis] = useState<BikiniEti[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (marca !== 'zattia') {
        setBikinis([])
        setError(null)
        return
      }
      try {
        const r = await apiFetch(`/api/datos?recurso=liquidacion&store=${marca}&etiquetas=1&bikinis=1&nc=${Date.now()}`)
        const d = await r.json().catch(() => null)
        if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer las bikinis.')
        if (!vivo) return
        setBikinis(Array.isArray(d.bikinis) ? d.bikinis : [])
        setError(null)
      } catch (e) {
        if (!vivo) return
        setBikinis(null)
        setError(e instanceof Error ? e.message : 'No se pudieron leer las bikinis.')
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])
  return { bikinis, error }
}
