'use client'

import { useEffect, useState } from 'react'
import { leerCorteDeLinea } from '@/lib/erp/cliente'

type Linea = Parameters<typeof leerCorteDeLinea>[0]

/**
 * Con qué abre el interruptor «Reales / De prueba» (Bruno, 9-nov): la línea cortada abre en Reales, la que sigue
 * en Gestión Nube en De prueba. Sin poder leer el corte queda De prueba, como antes.
 * 🔑 `listo` frena la primera lectura: sin él, Stunned pedía lo de prueba y mostraba $ 0 un instante.
 */
export function usePruebaSegunCorte(linea: Linea) {
  const [estado, setEstado] = useState<{ linea: Linea; prueba: boolean } | null>(null)
  useEffect(() => {
    let vivo = true
    const fijar = (prueba: boolean) => { if (vivo) setEstado((e) => (e?.linea === linea ? e : { linea, prueba })) }
    leerCorteDeLinea(linea).then((r) => fijar(!r.en_erp)).catch(() => fijar(true))
    return () => { vivo = false }
  }, [linea])
  const listo = estado?.linea === linea
  return { prueba: listo ? estado.prueba : true, listo, setPrueba: (prueba: boolean) => setEstado({ linea, prueba }) }
}
