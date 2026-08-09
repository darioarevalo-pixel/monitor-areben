'use client'

/**
 * «Cómo viene»: la comparación contra el período anterior, para el Panel.
 *
 * 🔴 **Sale de la foto diaria, nunca de Graph.** Por eso viaja aparte de `useCampanias` en vez de
 * colgarse de su respuesta: el censo se cae con el token y esto no, y son justo los días en que la
 * pregunta «¿venimos mejor o peor?» sigue teniendo respuesta.
 *
 * La ventana la manda el Panel (30 o 90, el mismo selector del censo) y el servidor puede
 * **devolverla recortada**: si la foto no llega a cubrir el período anterior, contesta el par más
 * largo que sí banca. La pantalla dibuja lo que volvió, no lo que pidió.
 */

import { useEffect, useMemo, useState } from 'react'
import { traerTendencia } from '@/lib/meta-ads/cliente'
import type { RespuestaTendencia } from '@/lib/meta-ads/tendencia'
import type { Cargable } from '@/components/meta-ads/reglas/useReglas'

export function useTendencia(dias: number): Cargable<RespuestaTendencia> {
  // Mismo patrón que `useReglas`: el resultado viaja con la `key` de su pedido y «está cargando» se
  // DERIVA de que no coincidan. Un `setCargando(true)` arriba del efecto deja un cuadro intermedio
  // con el dato viejo, y `react-hooks/set-state-in-effect` lo prohíbe en este repo.
  const [r, setR] = useState<{ key: number; e: Cargable<RespuestaTendencia> } | null>(null)

  useEffect(() => {
    let vivo = true
    void traerTendencia(dias).then((res) => {
      if (!vivo) return
      setR({ key: dias, e: res.ok ? { fase: 'ok', data: res.dato } : { fase: 'error', motivo: res.motivo } })
    })
    return () => { vivo = false }
  }, [dias])

  // Sin el memo, `{ fase: 'cargando' }` es un objeto nuevo por render y arrastra a recalcular todo
  // lo que cuelga de él.
  return useMemo(() => (!r || r.key !== dias ? { fase: 'cargando' } : r.e), [r, dias])
}
