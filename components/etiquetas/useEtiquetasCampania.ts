'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'

/**
 * LOS PRECIOS DE UNA CAMPAÑA, PARA ETIQUETAR ANTES DE APLICARLOS.
 *
 * 🔴 **Por qué existe, si Etiquetas ya sabe precios.** Las otras pestañas sacan el número de Tienda
 * Nube, y eso supone que el precio ya está puesto. **En la feria del local no lo está y ⛔ no lo va
 * a estar**: los productos se OCULTAN en Tienda Nube para que el precio de remate no se publique
 * online. ⇒ preguntarle a TN devuelve el precio del sale anterior, o nada.
 *
 * 🔑 **Y eso es lo que desata el etiquetado del día de aplicar.** El orden del switch —sacar el sale,
 * ocultar en TN, aplicar— es de un día. Etiquetar 1.282 prendas ⛔ no entra en un día. Con el precio
 * saliendo de la campaña, la etiqueta se imprime cuando haya gente, y aplicar sigue siendo del
 * domingo.
 *
 * 🔑 **Entra por la llave de Etiquetas** (`&etiquetas=1`), no por la de Liquidación: se resuelve con
 * el permiso que el local ya tiene y lo que viaja es una lista blanca de cuatro campos — pid,
 * nombre, precio y si el precio es firme. ⛔ No trae costo, ni margen, ni ventas.
 */

const API = '/api/datos?recurso=liquidacion'

/** Un producto de la campaña, tal como sale de `preciosAEtiquetar`. */
export type PrecioCampania = { pid: string; nombre: string; precio: number; firme: boolean }

export type CampaniaEti = { id: string; nombre: string; desde: string | null; hasta: string | null }

export interface EstadoCampania {
  campanias: CampaniaEti[]
  /** pid → precio de campaña. El mapa es lo que consume el escaneo. */
  porPid: Record<string, PrecioCampania>
  /** Cuántos hay de cada precio: es el recuento por MESA, que es como se piensa una feria. */
  porPrecio: { precio: number; modelos: number; firmes: number }[]
  cargando: boolean
  error: string | null
  /**
   * La campaña que se está leyendo de verdad. Con UNA sola campaña viva no hay nada que elegir, así
   * que se entra directo a escanear. 🔑 Se **deriva**, ⛔ no se guarda con un efecto: un `setState`
   * dentro de un `useEffect` es una cascada de renders y el CI lo frena.
   */
  liqEfectivo: string
}

export function useEtiquetasCampania(marca: Marca, liq: string, activo = true): EstadoCampania {
  const [campanias, setCampanias] = useState<CampaniaEti[]>([])
  const [items, setItems] = useState<PrecioCampania[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const traerLista = useCallback(async () => {
    if (!activo) return
    try {
      const r = await apiFetch(`${API}&store=${marca}&etiquetas=1`)
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer las campañas.')
      setCampanias(d.campanias || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer las campañas.')
    }
  }, [marca, activo])

  const liqEfectivo = liq || (campanias.length === 1 ? campanias[0].id : '')

  const traerItems = useCallback(async () => {
    if (!activo || !liqEfectivo) {
      setItems([])
      return
    }
    setCargando(true)
    setError(null)
    try {
      const r = await apiFetch(`${API}&store=${marca}&etiquetas=1&precios=1&liq=${encodeURIComponent(liqEfectivo)}&nc=${Date.now()}`)
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer los precios de la campaña.')
      setItems(d.items || [])
    } catch (e) {
      // 🔑 La lista se vacía al fallar, igual que la cola: seguir escaneando contra un mapa viejo
      // imprime precios que ya no son los de la campaña, y eso no se ve hasta que está en la percha.
      setItems([])
      setError(e instanceof Error ? e.message : 'No se pudieron leer los precios de la campaña.')
    } finally {
      setCargando(false)
    }
  }, [marca, liqEfectivo, activo])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      await traerLista()
      if (!vivo) return
    })()
    return () => {
      vivo = false
    }
  }, [traerLista])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      await traerItems()
      if (!vivo) return
    })()
    return () => {
      vivo = false
    }
  }, [traerItems])

  const porPid = useMemo(() => Object.fromEntries(items.map((i) => [i.pid, i])) as Record<string, PrecioCampania>, [items])

  const porPrecio = useMemo(() => {
    const m = new Map<number, { precio: number; modelos: number; firmes: number }>()
    for (const i of items) {
      const o = m.get(i.precio) || { precio: i.precio, modelos: 0, firmes: 0 }
      o.modelos++
      if (i.firme) o.firmes++
      m.set(i.precio, o)
    }
    return [...m.values()].sort((a, b) => a.precio - b.precio)
  }, [items])

  return { campanias, porPid, porPrecio, cargando, error, liqEfectivo }
}
