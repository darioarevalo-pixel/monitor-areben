'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import type { MinoristaErp } from '@/lib/etiquetas/core'
import type { Marca } from '@/lib/nav.datos'

/**
 * El precio Minorista de Areben Gestión de las líneas ya cortadas (BDI, Stunned), para que la etiqueta diga lo que cobra
 * la Caja (Bruno, 18-nov). Entra por la misma llave de Etiquetas (`?etiquetas=1&minorista=1`): sólo `pid`, `local` y
 * `online`, ⛔ costo. Ver `conPreciosDelErp` (`lib/etiquetas/core.ts`) y `minoristaDelErp` (`api/_liquidacion-erp.js`).
 */
export function useMinoristaErp(marca: Marca) {
  const [filas, setFilas] = useState<MinoristaErp[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await apiFetch(`/api/datos?recurso=liquidacion&store=${marca}&etiquetas=1&minorista=1&nc=${Date.now()}`)
        const d = await r.json().catch(() => null)
        if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer el precio de Areben Gestión.')
        if (!vivo) return
        setFilas(Array.isArray(d.precios) ? d.precios : [])
        setError(null)
      } catch (e) {
        if (!vivo) return
        setFilas(null)
        setError(e instanceof Error ? e.message : 'No se pudo leer el precio de Areben Gestión.')
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])
  return { filas, error }
}
