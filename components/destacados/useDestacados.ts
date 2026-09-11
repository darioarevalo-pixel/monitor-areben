'use client'

/**
 * Los productos estrella de un alcance, para la fila.
 *
 * Vive en `components/destacados/` y ⛔ no adentro de `components/productos/` ni de
 * `components/liquidacion/` por la misma razón que `useClavados.ts` y `useCampaniaAbierta.ts`:
 * **`ProductosTable.tsx` es del repo compartido con Darío**, y desde allá esto entra en una línea.
 *
 * 🔑 **El alcance es el parámetro.** `liq = null` son las estrellas GENERALES del producto (las de
 * Análisis → Por producto); `liq = '<id>'` son las de esa campaña. Es el mismo hook para las dos
 * preguntas porque es la misma tabla y la misma UI; el porqué de que sean dos, en
 * `sql/migrate-destacados.sql`.
 *
 * La lista se pide **UNA vez por marca y alcance**: la fila sólo necesita saber si la suya está
 * adentro. Pedirla por fila serían 351 requests para 351 filas.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import type { Destacado } from '@/lib/destacados/tipos'

const API = '/api/datos?recurso=destacados'

export interface Destacados {
  /** producto_id → la estrella activa de ese producto en este alcance. */
  porProducto: Map<string, Destacado>
  cargando: boolean
  error: string | null
  /** Prende o apaga la estrella de un producto. Devuelve cuando el servidor contestó. */
  alternar: (p: { id: number | string; nombre?: string | null; sku?: string | null }) => Promise<void>
}

const VACIO = new Map<string, Destacado>()

export function useDestacados(marca: Marca | null, liq: string | null = null): Destacados {
  const [porProducto, setPorProducto] = useState<Map<string, Destacado>>(VACIO)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * Qué alcance es el que está pidiendo la pantalla AHORA. Va en un ref y ⛔ no en el estado: lo
   * único que hace es dejar que una respuesta vieja se reconozca como vieja, y meterlo en el estado
   * sería un render más por cada cambio de campaña.
   */
  const vigente = useRef(`${marca ?? ''}|${liq ?? ''}`)

  /**
   * 🔴 **La respuesta viaja PEGADA a su alcance, y la que no corresponde se DESCARTA.**
   *
   * Sin esto hay una carrera que se ve como *«las marqué y no las veo destacadas»*, y que es la que
   * reportó Bruno el 11-sep-2026. La pantalla de Precios pide dos veces seguidas —mientras viaja la
   * lista de campañas el alcance es `null` (la estrella GENERAL, que viene vacía) y después es la
   * campaña (que trae 13)— y ⛔ **nada garantizaba el orden de llegada**: si la vacía contestaba
   * segunda, `setPorProducto` pisaba las 13 con un mapa vacío y **todas las estrellas quedaban
   * apagadas teniendo las filas guardadas en la base**.
   *
   * Es intermitente por definición: depende de qué respuesta llega primero. Por eso «a veces anda».
   * Mismo modo de falla y mismo arreglo que `useResumenRonda` en Diseños, donde el resultado viaja
   * pegado a su marca. ⛔ Un `vivo` en el efecto ⛔ no alcanza: el pedido viejo sigue corriendo y su
   * `setState` es válido, sólo que contesta sobre otra pregunta.
   */
  const cargar = useCallback(async () => {
    if (!marca) return
    const pedido = `${marca}|${liq ?? ''}`
    try {
      const q = liq ? `&liq=${encodeURIComponent(liq)}` : ''
      const r = await apiFetch(`${API}&store=${marca}${q}&nc=${Date.now()}`)
      const j = await r.json()
      if (pedido !== vigente.current) return
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      const filas = (j.destacados as Destacado[]) || []
      setPorProducto(new Map(filas.map((d) => [String(d.producto_id), d])))
      setError(null)
    } catch (e) {
      if (pedido !== vigente.current) return
      setError(e instanceof Error ? e.message : 'No se pudieron leer los productos estrella.')
    } finally {
      if (pedido === vigente.current) setCargando(false)
    }
  }, [marca, liq])

  // `setCargando` va adentro del async y ⛔ no en el cuerpo del efecto: llamar a setState sincrónico
  // ahí es una cascada de renders sobre una tabla de cientos de filas (`react-hooks/set-state-in-effect`).
  useEffect(() => {
    // El sello se estampa ACÁ y ⛔ no en el render (React lo prohíbe, y con razón): este efecto es
    // el que dispara el pedido, así que cualquiera que siga en vuelo de antes ya quedó viejo.
    vigente.current = `${marca ?? ''}|${liq ?? ''}`
    let vivo = true
    void (async () => {
      if (!marca || !vivo) return
      setCargando(true)
      await cargar()
    })()
    return () => {
      vivo = false
    }
  }, [marca, liq, cargar])

  const alternar = useCallback(
    async (p: { id: number | string; nombre?: string | null; sku?: string | null }) => {
      if (!marca) return
      const pid = Number(p.id)
      const estaba = porProducto.has(String(pid))
      // 🔴 **Sin respuesta optimista, a propósito.** La estrella es del EQUIPO: cualquiera la pone y
      // cualquiera la saca, así que dos personas pueden estar mirando la misma lista. Pintarla
      // antes de que el servidor conteste muestra una decisión que puede no haber quedado guardada
      // — mismo criterio que el favorito de Meta Ads (`useBiblioteca.ts`).
      const r = await apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: marca, accion: estaba ? 'sacar' : 'marcar', producto_id: pid, liq,
          nombre: p.nombre ?? null, sku: p.sku ?? null,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      await cargar()
    },
    [marca, liq, porProducto, cargar],
  )

  return { porProducto, cargando, error, alternar }
}
