'use client'

/**
 * Los clavados de una marca, para la fila del producto.
 *
 * Vive en `components/clavados/` y no en `components/productos/` por la misma razón que
 * `useCampaniaAbierta.ts`: **`ProductosTable.tsx` es del repo compartido con Darío**, y desde allá
 * esto entra en una línea.
 *
 * 🔑 **Por qué el marcar va en la fila del producto y no en una pantalla nueva.** Es la lección de
 * Faltantes, textual: *una lista nueva no existe hasta que entra donde se toma el trabajo*. El
 * momento en que alguien decide que un producto es un clavado es el momento en que lo está mirando
 * para bajarle el precio — y a esa fila es adonde apunta el «Ver productos» de la señal de capital
 * parado de Gerencial. Una pantalla aparte para marcar sería una pantalla que nadie abre.
 *
 * La lista se pide UNA vez por marca: son un puñado de productos y la fila sólo necesita saber si
 * el suyo está adentro. Pedirla por fila serían cien requests para cien filas.
 */

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import type { Clavado } from '@/lib/clavados/tipos'

const API = '/api/datos?recurso=clavados'

export interface Clavados {
  /** producto_id → la marca activa de ese producto. Sólo los ACTIVOS. */
  porProducto: Map<string, Clavado>
  puedeEscribir: boolean
  cargando: boolean
  error: string | null
  marcar: (p: { id: number; name?: string; sku?: string | null }) => Promise<void>
  sacar: (id: string) => Promise<void>
}

const VACIO = new Map<string, Clavado>()

export function useClavados(marca: Marca | null): Clavados {
  const [porProducto, setPorProducto] = useState<Map<string, Clavado>>(VACIO)
  const [puedeEscribir, setPuede] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!marca) return
    try {
      const r = await apiFetch(`${API}&store=${marca}&nc=${Date.now()}`)
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      // 🔴 Sólo los ACTIVOS entran al índice de la fila. Un clavado cerrado sigue en la tabla —y
      // sigue contando en el memo de la semana en que facturó— pero la fila del producto tiene que
      // poder volver a marcarlo: es un ciclo nuevo, con su propio recupero.
      const activos = (j.clavados as Clavado[]).filter((c) => !c.visto_en_cero)
      setPorProducto(new Map(activos.map((c) => [String(c.producto_id), c])))
      setPuede(Boolean(j.puede?.escribir))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer los clavados.')
    } finally {
      setCargando(false)
    }
  }, [marca])

  // `setCargando` va adentro del async y no en el cuerpo del efecto: llamar a setState sincrónico
  // ahí es una cascada de renders sobre una tabla de cientos de filas (`react-hooks/set-state-in-effect`).
  useEffect(() => {
    let vivo = true
    void (async () => {
      if (!marca || !vivo) return
      setCargando(true)
      setError(null)
      await cargar()
    })()
    return () => {
      vivo = false
    }
  }, [marca, cargar])

  const marcar = useCallback(
    async (p: { id: number; name?: string; sku?: string | null }) => {
      if (!marca) return
      const r = await apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: marca, accion: 'marcar', producto_id: p.id, nombre: p.name ?? null, sku: p.sku ?? null }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      await cargar()
    },
    [marca, cargar],
  )

  const sacar = useCallback(
    async (id: string) => {
      if (!marca) return
      // ⚠️ `sacar`, ⛔ nunca `borrar`: lo que ya recuperó sigue contando en la foto de las semanas
      // en que facturó, y borrarlo sería perder eso.
      const r = await apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: marca, accion: 'sacar', id }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      await cargar()
    },
    [marca, cargar],
  )

  return { porProducto, puedeEscribir, cargando, error, marcar, sacar }
}
