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
import { useAgenda } from '@/store/useAgenda'
import { POLL_AVISOS_MS, useAvisos } from '@/store/useAvisos'
import { useSistema } from '@/store/useSistema'

/**
 * `activo` existe por el panel de WhatsApp (`/panel/<telefono>`), que **no dibuja el sidebar**: no
 * tiene contador de avisos, ni badge de novedades, ni promo del día. Y no es un fetch de más una
 * vez: el panel vive adentro de un iframe que **se recarga en cada cambio de chat**, así que la app
 * arranca de nuevo decenas de veces por día y cada arranque pedía tres cosas que nadie iba a mirar,
 * más un intervalo cada 3 minutos por encima.
 *
 * El hook se llama igual y siempre (regla de hooks); lo que se apaga es lo que hace.
 */
export function useAvisosPoll(activo: boolean = true): void {
  const { perfil, marca } = useSesion()
  const cargar = useAvisos((s) => s.cargar)
  const cargarSistema = useSistema((s) => s.cargar)
  const cargarAgenda = useAgenda((s) => s.cargar)

  useEffect(() => {
    if (!perfil || !activo) return
    void cargar(perfil, marca)
    const t = setInterval(() => void cargar(perfil, marca), POLL_AVISOS_MS)
    return () => clearInterval(t)
  }, [perfil, marca, cargar, activo])

  // Las novedades van acá y no en un hook propio porque es el mismo trabajo —encender el badge del
  // sidebar estés donde estés— y así hay un solo lugar donde mirar qué pide el shell al arrancar.
  //
  // **Sin intervalo, a diferencia de los avisos**: una novedad cambia una vez por semana y no es
  // urgente. Refrescarla cada tres minutos sería ruido, y con el cartel de las importantes sería
  // peor: aparecería de golpe en medio de un conteo.
  useEffect(() => {
    if (!perfil || !activo) return
    void cargarSistema()
  }, [perfil, cargarSistema, activo])

  // La agenda, por lo mismo y con un motivo propio: la promo de hoy se dibuja en el mostrador
  // (`components/cupones`) además de en su sección, y eso no puede costar un fetch por lugar donde
  // se muestra. Sin intervalo: una promo se carga con días de anticipación y no cambia mientras
  // alguien está cobrando.
  useEffect(() => {
    if (!perfil || !activo) return
    void cargarAgenda()
  }, [perfil, cargarAgenda, activo])
}
