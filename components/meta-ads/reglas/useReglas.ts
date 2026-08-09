'use client'

/**
 * El estado de las automatizaciones: las reglas, los umbrales, el contexto medido y los hallazgos.
 *
 * Vive en un hook y no adentro de la pantalla por la misma razón por la que existe `useCampanias`:
 * **dos pantallas lo necesitan**. Automatizaciones dibuja las reglas y el Panel dibuja los
 * hallazgos, y si cada una tuviera su propio efecto, «resolver un hallazgo» tendría dos
 * implementaciones — o sea dos criterios sobre cuándo un renglón deja de estar pendiente.
 *
 * 🔴 **Todo lo que lee esto sale de la base, nunca de Graph.** Las reglas miran la foto diaria, así
 * que la pantalla abre aunque Meta esté caído o el token vencido. Lo único que necesita a Meta es
 * ACCIONAR un hallazgo, y eso se dice cuando pasa.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { traerHallazgos, traerReglas } from '@/lib/meta-ads/cliente'
import type { Hallazgo, RespuestaReglas } from '@/lib/meta-ads/reglas'

export type Cargable<T> = { fase: 'cargando' } | { fase: 'error'; motivo: string } | { fase: 'ok'; data: T }

export type Reglas = {
  estado: Cargable<RespuestaReglas>
  hallazgos: Hallazgo[]
  cargandoHallazgos: boolean
  recargar: () => void
  /** Saca un hallazgo de la lista sin volver a pedir todo: lo que se accionó deja de estar pendiente. */
  quitar: (id: number) => void
}

export function useReglas(): Reglas {
  /**
   * `pedido` es lo que hace recargable a la lista: pedir de nuevo tiene que ser un cambio de
   * DEPENDENCIA del efecto, no un borrado del resultado. Vaciar el estado pinta «cargando» sin que
   * salga ningún fetch — eso es lo que dejaba el panel de Etapas colgado para siempre.
   *
   * ⚠️ Y el resultado viaja **con su `key`** en vez de haber un `setCargando(true)` arriba del
   * efecto: `react-hooks/set-state-in-effect` lo prohíbe en este repo con razón —un efecto que
   * corrige el estado después de renderizar deja un cuadro intermedio con el dato viejo—. «Está
   * cargando» se DERIVA de que la key del resultado no sea la del pedido. Mismo patrón que
   * `ContextoMeta`.
   */
  const [pedido, setPedido] = useState(0)
  const [r, setR] = useState<{ key: number; e: Cargable<RespuestaReglas> } | null>(null)
  const [hs, setHs] = useState<{ key: number; lista: Hallazgo[] } | null>(null)

  useEffect(() => {
    let vivo = true
    void traerReglas().then((res) => {
      if (!vivo) return
      setR({ key: pedido, e: res.ok ? { fase: 'ok', data: res.dato } : { fase: 'error', motivo: res.motivo } })
    })
    return () => { vivo = false }
  }, [pedido])

  useEffect(() => {
    let vivo = true
    void traerHallazgos('nuevo').then((res) => {
      if (!vivo) return
      // Un fallo al leer los hallazgos deja la lista vacía y no rompe la pantalla: el Panel tiene
      // otras cuatro cosas que mostrar, y un error de este pedido no puede tapar el diagnóstico.
      setHs({ key: pedido, lista: res.ok ? res.dato.hallazgos : [] })
    })
    return () => { vivo = false }
  }, [pedido])

  // El `useMemo` no es de rendimiento: sin él, `{ fase: 'cargando' }` es un objeto nuevo en cada
  // render y arrastra a todo lo que cuelga de él a recalcularse siempre.
  const estado: Cargable<RespuestaReglas> = useMemo(
    () => (!r || r.key !== pedido ? { fase: 'cargando' } : r.e),
    [r, pedido],
  )
  const hallazgos = useMemo(() => (hs && hs.key === pedido ? hs.lista : []), [hs, pedido])
  const cargandoHallazgos = !hs || hs.key !== pedido

  const recargar = useCallback(() => setPedido((n) => n + 1), [])
  // Quitar uno de la lista sin volver a pedir todo. Toca el `hs` vigente y respeta la key: si la
  // recarga ya salió, lo que se quite es de una lista que está por ser reemplazada igual.
  const quitar = useCallback(
    (id: number) => setHs((s) => (s ? { ...s, lista: s.lista.filter((h) => h.id !== id) } : s)),
    [],
  )

  return { estado, hallazgos, cargandoHallazgos, recargar, quitar }
}
