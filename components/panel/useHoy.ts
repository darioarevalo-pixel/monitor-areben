'use client'

/**
 * La fecha de hoy del panel, que **cambia sola cuando cambia el día**.
 *
 * 🔴 Antes era `useState(() => new Date())`: se fijaba al abrir el panel y no se movía más. El
 * panel vive adentro de WhatsApp Web, que queda abierto de un día para el otro (Darío,
 * 20-oct-2026): a la mañana decía «Para hoy 0» con 17 agendados para ese día, y «Hechos hoy 64»
 * eran los de AYER. Y lo que se anotaba quedaba con la fecha de ayer.
 *
 * Se mira cada minuto y al volver a la pestaña (con la compu dormida los intervalos no corren).
 * Devuelve el MISMO `Date` mientras sea el mismo día, así los efectos que dependen de `today` no
 * se disparan cada minuto.
 */
import { useEffect, useState } from 'react'
import { hoyISO } from '@/lib/crm/seguimiento'

const CADA_MS = 60 * 1000

/** La fecha a usar ahora: la misma `t` si sigue siendo el mismo día, `ahora` si ya cambió. */
export function alDia(t: Date, ahora: Date): Date {
  return hoyISO(t) === hoyISO(ahora) ? t : ahora
}

export function useHoy(): Date {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    const mirar = () => setToday((t) => alDia(t, new Date()))
    const id = setInterval(mirar, CADA_MS)
    document.addEventListener('visibilitychange', mirar)
    window.addEventListener('focus', mirar)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', mirar)
      window.removeEventListener('focus', mirar)
    }
  }, [])

  return today
}
