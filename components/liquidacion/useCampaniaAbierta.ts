'use client'

/**
 * El "modo campaña" de Análisis → Por producto: con una campaña activa, la tabla sabe qué
 * productos ya mandó y cuáles no.
 *
 * **El problema que resuelve.** Una campaña de sale no se arma de una sentada: son varias vueltas
 * con filtros distintos, a veces en días distintos. Al mandar, la selección se limpia — y en la
 * vuelta siguiente la tabla se ve idéntica a la primera. Lo único que decía algo era el toast
 * *después* de mandar («M ya estaban»), o sea cuando ya no servía para decidir.
 *
 * Vive en `components/liquidacion/` y no en `components/productos/` por la misma razón que
 * `MandarALiquidacion.tsx`: `ProductosTable.tsx` es del repo compartido con Darío y desde allá
 * esto entra en una línea.
 *
 * 🔑 **La campaña activa vive en la URL** (`/productos?liq=<id>`). Es lo que hace que el botón
 * «Agregar productos» de una campaña sea una navegación y nada más, y lo que hace que recargar la
 * página no te saque del modo en la mitad de armar el sale.
 */

import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import type { EstadoItem, Liquidacion as Campania } from '@/lib/liquidacion'
import { leerCampanias, leerPidsCampania, type PidsCampania } from '@/lib/liquidacion/persistencia'

export interface CampaniaAbierta {
  /** Id de la campaña activa, o `''` si no hay modo campaña. */
  liq: string
  /** Nombre y estado de la activa. `null` mientras baja o si no hay ninguna. */
  campania: PidsCampania['campania'] | null
  /** Qué pid ya está en la campaña y en qué estado quedó. Vacío si no hay campaña activa. */
  yaEstan: Record<string, EstadoItem>
  /** Las campañas a las que se les puede sumar. `null` = todavía no se pidieron (carga perezosa). */
  abiertas: Campania[] | null
  error: string | null
  entrar: (id: string) => void
  salir: () => void
  /** Pide la lista de campañas para el selector. Idempotente: sólo la primera vez hace el request. */
  pedirAbiertas: () => void
  /** Vuelve a leer los pid de la activa — después de mandar productos, sin recargar la página. */
  recargar: () => void
}

const VACIO: Record<string, EstadoItem> = {}

export function useCampaniaAbierta(marca: Marca): CampaniaAbierta {
  /**
   * Es `useFiltroUrl` con una diferencia que importa: el valor inicial se lee de
   * `useSearchParams()` y no de `window.location.search`.
   *
   * A esta pantalla se llega con un `router.push('/productos?liq=…')` desde la campaña, y el
   * `pushState` del History no está garantizado que haya corrido cuando la sección nueva monta —
   * leyendo la URL a mano, el botón «Agregar productos» caería en Análisis sin campaña, a veces.
   * `useSearchParams()` es lo que el router ya resolvió para este render.
   *
   * Se escribe igual que `useFiltroUrl`, con `history.replaceState`: entrar o salir del modo no
   * tiene por qué hacer navegar a Next y volver a montar la tabla entera.
   */
  const sp = useSearchParams()
  const [liq, setLiqState] = useState<string>(() => sp.get('liq') || '')
  const setLiq = useCallback((v: string) => {
    setLiqState(v)
    const url = new URL(window.location.href)
    if (v) url.searchParams.set('liq', v)
    else url.searchParams.delete('liq')
    window.history.replaceState(null, '', url)
  }, [])

  const [datos, setDatos] = useState<PidsCampania | null>(null)
  const [abiertasRaw, setAbiertas] = useState<{ marca: Marca; lista: Campania[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Cambia para forzar una relectura sin tocar `liq`.
  const [tick, setTick] = useState(0)

  // Igual que en `Liquidacion.tsx`: todo el setState va adentro del async, porque el lint del repo
  // prohíbe el setState sincrónico dentro de un efecto.
  useEffect(() => {
    let vivo = true
    void (async () => {
      if (!liq) {
        setDatos(null)
        return
      }
      try {
        const d = await leerPidsCampania(marca, liq)
        if (!vivo) return
        setDatos(d)
        setError(null)
      } catch (e) {
        if (!vivo) return
        // Una campaña que no existe (la borraron, cambiaste de marca, el link es viejo) saca del
        // modo en vez de dejar la tabla marcando contra nada. El error NO se limpia acá: sacar el
        // modo vuelve a disparar este efecto, y limpiarlo en la rama de arriba borraría el cartel
        // antes de que se llegue a leer.
        setDatos(null)
        setLiq('')
        setError(e instanceof Error ? e.message : 'No se pudo leer la campaña.')
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, liq, tick, setLiq])

  // Perezoso a propósito: la mayoría de las visitas a "Por producto" no van a liquidar nada, y la
  // lista se pide recién cuando alguien toca el selector (mismo criterio que `MandarALiquidacion`).
  // La marca viaja adentro del estado en vez de resetearse con un efecto: las campañas son por
  // marca, y un efecto que la limpia sería un setState sincrónico de los que el lint prohíbe.
  const pedidaRef = useRef<Marca | null>(null)
  const pedirAbiertas = useCallback(() => {
    if (pedidaRef.current === marca) return
    pedidaRef.current = marca
    void (async () => {
      try {
        const d = await leerCampanias(marca)
        // Las cerradas y las aplicadas no se ofrecen: sus precios ya están escritos.
        setAbiertas({ marca, lista: d.campanias.filter((c) => c.estado === 'borrador' || c.estado === 'en_curso') })
      } catch {
        setAbiertas({ marca, lista: [] })
      }
    })()
  }, [marca])

  const entrar = useCallback(
    (id: string) => {
      setLiq(id)
      setDatos(null)
      setError(null)
    },
    [setLiq],
  )

  const salir = useCallback(() => entrar(''), [entrar])

  const abiertas = abiertasRaw && abiertasRaw.marca === marca ? abiertasRaw.lista : null

  return useMemo(
    () => ({
      liq,
      campania: datos?.campania ?? null,
      yaEstan: datos?.pids ?? VACIO,
      abiertas,
      error,
      entrar,
      salir,
      pedirAbiertas,
      recargar: () => setTick((t) => t + 1),
    }),
    [liq, datos, abiertas, error, entrar, salir, pedirAbiertas],
  )
}
