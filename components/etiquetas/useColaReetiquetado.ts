'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import type { Cola, FilaCola, SelloEtiqueta } from '@/lib/etiquetas/cola'
import type { Marca } from '@/lib/nav.datos'

/**
 * La cola de reetiquetado: qué prenda hay que volver a etiquetar porque le cambió el precio.
 *
 * 🔑 **Reemplaza a la pestaña que leía campañas.** La lista de «qué etiquetar» la daba una campaña
 * de liquidación, y eso dejaba afuera todo lo que no fuera un sale —una promo puntual, un ajuste
 * suelto— y, sobre todo, **el día que se levanta el sale**: ahí los ítems vuelven de `aplicado` a
 * `confirmado` y la pantalla mostraba CERO justo cuando hay cientos de prendas para rehacer a precio
 * de lista. Acá la pregunta no nombra la liquidación.
 *
 * 🔑 **Pide la vista `&etiquetas=1`, no la de Liquidación**, así que se resuelve con el permiso de
 * *Etiquetas* y no trae costo ni margen. El precio de la etiqueta sigue saliendo de Tienda Nube.
 *
 * La campaña no desapareció: viaja en cada fila (`liqNombre`) y sirve de **filtro**, sin una
 * consulta más.
 */

const API = '/api/datos?recurso=liquidacion'
const VACIA: Cola = { pendientes: [], hechas: [], sinStock: [] }

/** Lo que decía la etiqueta de un producto, para poder guardarlo al marcarla como hecha. */
export type PrecioImpreso = { precio: number | null; precioLista: number | null }

export interface EstadoCola extends Cola {
  /** ISO de cuándo se leyó. Va a la pantalla: una cola vacía sana se ve igual que una rota. */
  leidoEn: string | null
  cargando: boolean
  error: string | null
  /** Las campañas que aparecen en la cola, para filtrar. Sin consulta extra. */
  campanias: string[]
  /** Lo que dice la etiqueta de cada producto, para comparar contra el precio de hoy. */
  sellos: Record<string, SelloEtiqueta>
  /** El stock de hoy por producto, tal como lo vio el servidor. */
  stock: Record<string, number>
  recargar: () => Promise<void>
  /**
   * Da por hecha la etiqueta de estos productos. `ya_estaba` = se sacó a mano, no se imprimió.
   * `precios` guarda **qué número decía cada etiqueta**, que es lo que después caza un precio de
   * lista cambiado a mano en Gestión Nube.
   */
  marcar: (pids: string[], modo?: 'impresa' | 'ya_estaba', precios?: Record<string, PrecioImpreso>) => Promise<void>
}

export function useColaReetiquetado(marca: Marca): EstadoCola {
  const [cola, setCola] = useState<Cola>(VACIA)
  const [sellos, setSellos] = useState<Record<string, SelloEtiqueta>>({})
  const [stock, setStock] = useState<Record<string, number>>({})
  const [leidoEn, setLeidoEn] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const traer = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const r = await apiFetch(`${API}&store=${marca}&etiquetas=1&cola=1&nc=${Date.now()}`)
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer qué hay para reetiquetar.')
      setCola({ pendientes: d.pendientes || [], hechas: d.hechas || [], sinStock: d.sinStock || [] })
      setSellos(d.sellos || {})
      setStock(d.stock || {})
      setLeidoEn(d.leidoEn || null)
    } catch (e) {
      // 🔑 La cola se vacía al fallar, y el error queda a la vista. Dejar la lista vieja con un
      // cartel chico es peor: se sigue etiquetando contra datos que ya no se están leyendo.
      setCola(VACIA)
      setSellos({})
      setStock({})
      setLeidoEn(null)
      setError(e instanceof Error ? e.message : 'No se pudo leer qué hay para reetiquetar.')
    } finally {
      setCargando(false)
    }
  }, [marca])

  // setState en un IIFE async: el CI marca el setState sincrónico adentro de un efecto.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      await traer()
      if (!vivo) return
    })()
    return () => {
      vivo = false
    }
  }, [traer])

  const marcar = useCallback(
    async (pids: string[], modo: 'impresa' | 'ya_estaba' = 'impresa', precios: Record<string, PrecioImpreso> = {}) => {
      const limpios = [...new Set(pids.filter(Boolean))]
      if (!limpios.length) return
      const r = await apiFetch(`${API}&store=${marca}&etiquetas=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: marca, action: 'etiquetado', pids: limpios, modo, precios }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo anotar la etiqueta como hecha.')
      await traer()
    },
    [marca, traer],
  )

  const campanias = useMemo(() => {
    const vistas = new Set<string>()
    for (const p of cola.pendientes) if (p.liqNombre) vistas.add(p.liqNombre)
    return [...vistas].sort((a, b) => a.localeCompare(b, 'es'))
  }, [cola.pendientes])

  return { ...cola, sellos, stock, leidoEn, cargando, error, campanias, recargar: traer, marcar }
}

/** Los pid de una lista de filas, que es lo que la tabla usa para acotar las variantes. */
export function pidsDe(filas: FilaCola[]): Set<string> {
  return new Set(filas.map((f) => f.pid))
}
