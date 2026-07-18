'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav'
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
 */

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

export type AuditData = { products: TnProducto[]; categories: Record<string, unknown>; cachedAt: number | null }

const cache: Partial<Record<Marca, AuditData>> = {}
const errores: Partial<Record<Marca, string>> = {}
const enVuelo: Partial<Record<Marca, Promise<void>>> = {}

async function pegar(marca: Marca, forzar: boolean): Promise<AuditData> {
  const url = `${AUDIT}?store=${marca}` + (forzar ? `&refresh=1&nc=${Math.random()}` : '')
  const r = await fetch(url)
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const d = await r.json()
  return {
    products: (d.products || []) as TnProducto[],
    categories: (d.categories || {}) as Record<string, unknown>,
    cachedAt: d.cached_at ? new Date(d.cached_at).getTime() : null,
  }
}

/** Baja la marca (una sola vez por marca, de-dup por enVuelo). No fuerza refresh. */
async function cargar(marca: Marca): Promise<void> {
  if (cache[marca]) return
  if (!enVuelo[marca]) {
    enVuelo[marca] = (async () => {
      try {
        cache[marca] = await pegar(marca, false)
        delete errores[marca]
      } catch (e) {
        errores[marca] = e instanceof Error ? e.message : String(e)
      } finally {
        enVuelo[marca] = undefined
      }
    })()
  }
  await enVuelo[marca]
}

export type EstadoMkt = {
  data: AuditData | null
  cargando: boolean
  error: string | null
  /** Fuerza el bypass del caché del endpoint (fotos recién cargadas). */
  refrescar: () => Promise<void>
}

export function useMarketing(marca: Marca): EstadoMkt {
  const data = cache[marca] ?? null
  const error = errores[marca] ?? null
  const [, forzar] = useState(0)
  const marcaRef = useRef(marca)
  useEffect(() => {
    marcaRef.current = marca
  }, [marca])

  useEffect(() => {
    if (cache[marca]) return
    let vivo = true
    cargar(marca).then(() => {
      if (vivo) forzar((n) => n + 1)
    })
    return () => {
      vivo = false
    }
  }, [marca])

  const refrescar = useCallback(async () => {
    const m = marcaRef.current
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
