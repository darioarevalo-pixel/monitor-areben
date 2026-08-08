'use client'

/**
 * Las fechas que se vienen, del calendario editorial.
 *
 * Son lo que convierte el diagnóstico en un pedido: «no hay pauta de la segunda etapa» es un dato,
 * «no hay pauta de la segunda etapa **y el Día de la Madre es en 34 días**» es una tarea. De la
 * lista salen las dos cosas: la que aprieta, para el veredicto del Embudo, y el desplegable de «para
 * qué fecha» al anotar una idea. Se pide aparte y en silencio — si el calendario falla, las dos
 * pantallas tienen que seguir andando, porque el diagnóstico se sostiene solo.
 */

import { useEffect, useState } from 'react'
import { hoyIso, proximas, type EntradaCalendario } from '@/lib/calendario'
import { leerCalendario } from '@/lib/calendario/persistencia'

export function useFechas(marca: string): EntradaCalendario[] {
  const [d, setD] = useState<{ key: string; fechas: EntradaCalendario[] } | null>(null)
  useEffect(() => {
    let vivo = true
    const hoy = hoyIso()
    leerCalendario(marca as Parameters<typeof leerCalendario>[0])
      .then((cal) => {
        if (!vivo) return
        // `decisiones` no es opcional acá: `laQueAprieta()` sólo devuelve fechas que el equipo
        // eligió jugar, así que sin ellas el veredicto se queda mudo para siempre.
        setD({ key: marca, fechas: proximas(hoy, 90, { fijadas: cal.fijadas, hitos: cal.hitos, decisiones: cal.decisiones }) })
      })
      .catch(() => { if (vivo) setD({ key: marca, fechas: SIN_FECHAS }) })
    return () => { vivo = false }
  }, [marca])
  return d && d.key === marca ? d.fechas : SIN_FECHAS
}

const SIN_FECHAS: EntradaCalendario[] = []
