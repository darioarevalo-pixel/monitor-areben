'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import type { Cola, FilaCola, RotuloCola, SelloEtiqueta } from '@/lib/etiquetas/cola'
import type { FpCaja } from '@/lib/etiquetas/fpCaja'
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
  /** liqNombre → el rótulo que imprime esa campaña (sólo las de etiqueta por prenda). */
  rotulos: Record<string, RotuloCola>
  /** El stock de hoy por producto, tal como lo vio el servidor. */
  stock: Record<string, number>
  /**
   * Los % de efectivo y transferencia con los que la Caja cobra HOY (Bruno, 10-nov): de acá sale la
   * etiqueta de formas de pago de la cola. `null` con `fpCajaError` = ⛔ se pudo leer la Caja.
   */
  fpCaja: FpCaja | null
  fpCajaError: string | null
  recargar: () => Promise<void>
  /**
   * Da por hecha la etiqueta de estos productos. `ya_estaba` = se sacó a mano, no se imprimió.
   * `precios` guarda **qué número decía cada etiqueta**, que es lo que después caza un precio de
   * lista cambiado a mano en Gestión Nube.
   */
  marcar: (pids: string[], modo?: 'impresa' | 'ya_estaba', precios?: Record<string, PrecioImpreso>) => Promise<void>
}

/**
 * @param activo Si es `false` no se pide nada y la cola queda vacía. Lo usa el chequeo de
 *   exhibición, que consume la derivación de «no exhibido» pero **puede abrirlo alguien sin el
 *   permiso de Etiquetas**: sin esto, esa persona se comería un 403 y un cartel de error rojo en
 *   una pantalla que no tiene nada que ver.
 */
export function useColaReetiquetado(marca: Marca, activo = true): EstadoCola {
  const [cola, setCola] = useState<Cola>(VACIA)
  const [sellos, setSellos] = useState<Record<string, SelloEtiqueta>>({})
  const [rotulos, setRotulos] = useState<Record<string, RotuloCola>>({})
  const [stock, setStock] = useState<Record<string, number>>({})
  const [fpCaja, setFpCaja] = useState<FpCaja | null>(null)
  const [fpCajaError, setFpCajaError] = useState<string | null>(null)
  const [leidoEn, setLeidoEn] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const traer = useCallback(async () => {
    if (!activo) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)
    try {
      const r = await apiFetch(`${API}&store=${marca}&etiquetas=1&cola=1&nc=${Date.now()}`)
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer qué hay para reetiquetar.')
      setCola({ pendientes: d.pendientes || [], hechas: d.hechas || [], sinStock: d.sinStock || [] })
      setSellos(d.sellos || {})
      setRotulos(d.rotulos || {})
      setStock(d.stock || {})
      setFpCaja(d.fpCaja || null)
      // Un servidor viejo ⛔ manda ninguno de los dos: eso también es «no se sabe qué cobra la Caja».
      setFpCajaError(d.fpCaja ? null : d.fpCajaError || 'No se pudieron leer los descuentos de la Caja.')
      setLeidoEn(d.leidoEn || null)
    } catch (e) {
      // 🔑 La cola se vacía al fallar, y el error queda a la vista. Dejar la lista vieja con un
      // cartel chico es peor: se sigue etiquetando contra datos que ya no se están leyendo.
      setCola(VACIA)
      setSellos({})
      setRotulos({})
      setStock({})
      setFpCaja(null)
      setFpCajaError(null)
      setLeidoEn(null)
      setError(e instanceof Error ? e.message : 'No se pudo leer qué hay para reetiquetar.')
    } finally {
      setCargando(false)
    }
  }, [marca, activo])

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

  return { ...cola, sellos, rotulos, stock, fpCaja, fpCajaError, leidoEn, cargando, error, campanias, recargar: traer, marcar }
}

/** Los pid de una lista de filas, que es lo que la tabla usa para acotar las variantes. */
export function pidsDe(filas: FilaCola[]): Set<string> {
  return new Set(filas.map((f) => f.pid))
}
