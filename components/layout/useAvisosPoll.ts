'use client'

/**
 * El único refresco de avisos de la app. Se monta una vez en el shell —no en una sección— para
 * que el contador del sidebar se encienda estés donde estés, incluso sin pasar por Inicio.
 *
 * Reemplaza a los dos `setInterval` de 3 minutos que corrían por separado en Inicio y en
 * Solicitudes pidiendo lo mismo.
 */

import { useEffect } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { POLL_AVISOS_MS, useAvisos } from '@/store/useAvisos'

export function useAvisosPoll(): void {
  const { perfil, marca } = useSesion()
  const cargar = useAvisos((s) => s.cargar)

  useEffect(() => {
    if (!perfil) return
    void cargar(perfil, marca)
    const t = setInterval(() => void cargar(perfil, marca), POLL_AVISOS_MS)
    return () => clearInterval(t)
  }, [perfil, marca, cargar])
}
