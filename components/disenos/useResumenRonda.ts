'use client'

/**
 * El resumen de la última ronda de votación, para el ★ de cada tarjeta del tablero.
 *
 * 🔑 **Por qué es un hook aparte y no un campo del diseño.** El resultado de la votación es
 * derivado: vive en `disenos_votos` y se calcula al leer. Si se volcara sobre el documento del
 * diseño volvería el defecto de la votación vieja —el "traer votos" pisaba lo que el equipo había
 * puesto a mano— y, de paso, el tablero entero con las fotos viajaría a la base en cada refresco,
 * porque el efecto de persistencia manda todo lo que cambió. Teniéndolo en un estado propio, el ★
 * **no puede** entrar nunca al diff de `ultimo.current`.
 *
 * Se pide por `vista=resumen`, que devuelve `{n, promedio}` y ni una foto: son ~1,8 KB contra los
 * ~273 KB del snapshot de la misma ronda (medido el 24-ago-2026 sobre «Ingreso BDI Diciembre», que
 * tiene 9 diseños con la foto en base64 adentro). Eso es lo que hace que el ★ pueda estar siempre
 * en pantalla y no atrás de dos clics.
 *
 * 🔴 **El resultado viaja pegado a su marca y se descarta si no coincide.** Sin eso, volver de BDI
 * a Zattia con una bajada en vuelo publica el ★ de BDI bajo el rótulo de Zattia — el mismo defecto
 * que tuvo el store del ETL, donde una pantalla llegó a mostrar el nombre de una marca con los
 * números de la otra.
 */

import { useCallback, useEffect, useState } from 'react'
import { leerResumenRonda, type ResumenDeRonda } from '@/lib/disenos/votacion'
import type { Marca } from '@/lib/nav.datos'

const VACIO: ResumenDeRonda = { ronda: null, votantes: 0, general: null, puntajes: {} }

type Estado = { marca: Marca; resumen: ResumenDeRonda; cargando: boolean; error: string | null }

export function useResumenRonda(marca: Marca) {
  const [est, setEst] = useState<Estado>({ marca, resumen: VACIO, cargando: true, error: null })

  const traer = useCallback(async (): Promise<void> => {
    try {
      const r = await leerResumenRonda(marca)
      setEst({ marca, resumen: r, cargando: false, error: null })
    } catch (e) {
      // Que no haya ★ no puede tapar el tablero: se anota el error y la sección sigue andando con
      // "sin votos" en todas las tarjetas, que es la verdad de lo que se pudo leer.
      setEst({ marca, resumen: VACIO, cargando: false, error: e instanceof Error ? e.message : String(e) })
    }
  }, [marca])

  // El setState va DESPUÉS del await y no en el cuerpo del efecto: el lint del repo rechaza el
  // setState síncrono ahí (dispara renders en cascada). Mismo patrón que el resto de las secciones.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await leerResumenRonda(marca).then(
        (x) => ({ resumen: x, error: null as string | null }),
        (e: unknown) => ({ resumen: VACIO, error: e instanceof Error ? e.message : String(e) }),
      )
      if (vivo) setEst({ marca, resumen: r.resumen, cargando: false, error: r.error })
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  // Se descarta lo de la marca anterior al LEER, no al escribir: el `setEst` de una bajada en vuelo
  // llega igual, y acá no puede publicarse bajo el rótulo equivocado.
  const mismaMarca = est.marca === marca
  return {
    resumen: mismaMarca ? est.resumen : VACIO,
    cargando: mismaMarca ? est.cargando : true,
    error: mismaMarca ? est.error : null,
    recargar: traer,
  }
}
