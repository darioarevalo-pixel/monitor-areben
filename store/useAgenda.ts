/**
 * La agenda operativa, con UNA sola lectura para toda la app.
 *
 * Alimenta con la misma request la sección Agenda y la banda de "la promo de hoy" del mostrador
 * (`components/cupones`). Ése es el punto de que viva en un store del shell y no adentro de la
 * pantalla: **la promo tiene que estar donde ya está la persona**, no en una sección que hay que
 * acordarse de abrir, y eso no puede costar un fetch por lugar donde se muestra.
 *
 * Mismo molde que `useSistema`, incluido lo de **sin `setInterval`**: una promo bancaria se carga
 * con días de anticipación y no cambia mientras alguien atiende. Se pide una vez al montar el shell.
 *
 * ⚠️ Con eso, el día lo fija el navegador al cargar. Si alguien deja la pestaña abierta cruzando la
 * medianoche, sigue viendo la promo de ayer hasta que recargue. El local abre y cierra todos los
 * días, así que en la práctica no pasa; si llegara a pasar, lo barato es recargar al volver el foco,
 * no poner un intervalo.
 */

import { create } from 'zustand'
import { leerAgenda } from '@/lib/agenda/cliente'
import type { Promo } from '@/lib/agenda/tipos'

type AgendaState = {
  promos: Promo[]
  puede: { cargar: boolean }
  cargado: boolean
  cargando: boolean
  cargar: () => Promise<void>
  limpiar: () => void
}

export const useAgenda = create<AgendaState>((set, get) => ({
  promos: [],
  puede: { cargar: false },
  cargado: false,
  cargando: false,

  async cargar() {
    if (get().cargando) return
    set({ cargando: true })
    try {
      const d = await leerAgenda()
      set({ promos: d.promos, puede: d.puede, cargado: true, cargando: false })
    } catch {
      // Un fallo deja la banda del mostrador sin dibujar y la sección con su propio error. Que no se
      // pueda leer la agenda no puede romper el shell entero — ni la pantalla de cobro.
      set({ cargando: false })
    }
  },

  limpiar() {
    set({ promos: [], puede: { cargar: false }, cargado: false, cargando: false })
  },
}))
