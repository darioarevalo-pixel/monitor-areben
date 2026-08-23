'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Linea } from '@/lib/lineas'
import type { TnProducto } from '@/lib/tn'

/**
 * Baja el catálogo de TiendaNube (`tiendanube-audit`) para Marketing: la lista
 * cruda de productos + categorías + la fecha del snapshot. Port de
 * cargarMarketingTab (index.html:8776) y mktRefrescarFotos (8806).
 *
 * A diferencia de useTnImages (que cachea un índice de fotos y nunca refresca),
 * Marketing necesita **forzar** el bypass del caché del endpoint (`refresh=1`) tras
 * cargar fotos nuevas. Por eso `refrescar()` re-pega con refresh.
 *
 * Sigue el patrón de useTnImages para no romper el CI: el caché (y el error) viven a
 * nivel de módulo y se LEEN en el render; el effect solo dispara el fetch y fuerza un
 * re-render al terminar (nada de setState síncrono en el body del effect).
 *
 * 🔑 **La clave del caché es la LÍNEA, no la marca** (22-ago-2026). Stunned tiene **Tienda Nube
 * propia** —store 7516263, token propio, `stunned.com.ar`— aunque comparta la base de Zattia, así
 * que `?store=stunned` devuelve otro catálogo: medido, **28 productos**. Cachearlo bajo `zattia`
 * mostraría el catálogo de una línea con el rótulo de la otra.
 */

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

export type AuditData = { products: TnProducto[]; categories: Record<string, unknown>; cachedAt: number | null }

const cache: Partial<Record<Linea, AuditData>> = {}
const errores: Partial<Record<Linea, string>> = {}
const enVuelo: Partial<Record<Linea, Promise<void>>> = {}

async function pegar(linea: Linea, forzar: boolean): Promise<AuditData> {
  const url = `${AUDIT}?store=${linea}` + (forzar ? `&refresh=1&nc=${Math.random()}` : '')
  const r = await fetch(url)
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const d = await r.json()
  return {
    products: (d.products || []) as TnProducto[],
    categories: (d.categories || {}) as Record<string, unknown>,
    cachedAt: d.cached_at ? new Date(d.cached_at).getTime() : null,
  }
}

/** Baja el catálogo de la línea (una sola vez por línea, de-dup por enVuelo). No fuerza refresh. */
async function cargar(linea: Linea): Promise<void> {
  if (cache[linea]) return
  if (!enVuelo[linea]) {
    enVuelo[linea] = (async () => {
      try {
        cache[linea] = await pegar(linea, false)
        delete errores[linea]
      } catch (e) {
        errores[linea] = e instanceof Error ? e.message : String(e)
      } finally {
        enVuelo[linea] = undefined
      }
    })()
  }
  await enVuelo[linea]
}

export type EstadoMkt = {
  data: AuditData | null
  cargando: boolean
  error: string | null
  /** Fuerza el bypass del caché del endpoint (fotos recién cargadas). */
  refrescar: () => Promise<void>
}

export function useMarketing(linea: Linea): EstadoMkt {
  const data = cache[linea] ?? null
  const error = errores[linea] ?? null
  const [, forzar] = useState(0)
  const lineaRef = useRef(linea)
  useEffect(() => {
    lineaRef.current = linea
  }, [linea])

  useEffect(() => {
    if (cache[linea]) return
    let vivo = true
    cargar(linea).then(() => {
      if (vivo) forzar((n) => n + 1)
    })
    return () => {
      vivo = false
    }
  }, [linea])

  const refrescar = useCallback(async () => {
    const m = lineaRef.current
    try {
      cache[m] = await pegar(m, true)
      delete errores[m]
    } catch (e) {
      errores[m] = e instanceof Error ? e.message : String(e)
      forzar((n) => n + 1)
      throw e
    }
    forzar((n) => n + 1)
  }, [])

  return { data, error, cargando: !data && !error, refrescar }
}
