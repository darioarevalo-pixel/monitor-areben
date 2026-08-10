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
import { useSistema } from '@/store/useSistema'

export function useAvisosPoll(): void {
  const { perfil, marca } = useSesion()
  const cargar = useAvisos((s) => s.cargar)
  const cargarSistema = useSistema((s) => s.cargar)

  useEffect(() => {
    if (!perfil) return
    void cargar(perfil, marca)
    const t = setInterval(() => void cargar(perfil, marca), POLL_AVISOS_MS)
    return () => clearInterval(t)
  }, [perfil, marca, cargar])

  // Las novedades van acá y no en un hook propio porque es el mismo trabajo —encender el badge del
  // sidebar estés donde estés— y así hay un solo lugar donde mirar qué pide el shell al arrancar.
  //
  // **Sin intervalo, a diferencia de los avisos**: una novedad cambia una vez por semana y no es
  // urgente. Refrescarla cada tres minutos sería ruido, y con el cartel de las importantes sería
  // peor: aparecería de golpe en medio de un conteo.
  useEffect(() => {
    if (!perfil) return
    void cargarSistema()
  }, [perfil, cargarSistema])
}
