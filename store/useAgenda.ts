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
import { desmarcarHecho, leerAgenda, marcarHecho } from '@/lib/agenda/cliente'
import type { FechaIso, Hecho, ItemAgenda, Promo } from '@/lib/agenda/tipos'

type AgendaState = {
  promos: Promo[]
  items: ItemAgenda[]
  /** Sólo los últimos 30 días: es la ventana que mira Cumplimiento. */
  hechos: Hecho[]
  puede: { cargar: boolean }
  cargado: boolean
  cargando: boolean
  cargar: () => Promise<void>
  /** Tilda un pendiente en un día. `usuario` es `perfil.name`, que en un puesto compartido es el puesto. */
  marcar: (itemId: string, fecha: FechaIso, usuario: string) => Promise<void>
  desmarcar: (itemId: string, fecha: FechaIso) => Promise<void>
  limpiar: () => void
}

const vacio = {
  promos: [] as Promo[],
  items: [] as ItemAgenda[],
  hechos: [] as Hecho[],
  puede: { cargar: false },
  cargado: false,
  cargando: false,
}

export const useAgenda = create<AgendaState>((set, get) => ({
  ...vacio,

  async cargar() {
    if (get().cargando) return
    set({ cargando: true })
    try {
      const d = await leerAgenda()
      set({ promos: d.promos, items: d.items, hechos: d.hechos, puede: d.puede, cargado: true, cargando: false })
    } catch {
      // Un fallo deja la banda del mostrador sin dibujar y la sección con su propio error. Que no se
      // pueda leer la agenda no puede romper el shell entero — ni la pantalla de cobro.
      set({ cargando: false })
    }
  },

  /**
   * El tilde es optimista: el renglón se apaga al toque y el POST va atrás.
   *
   * Tildar es el gesto más repetido de la pantalla y se hace de parado, muchas veces con el teléfono
   * en la mano; esperar la ida y vuelta se siente como que no anduvo y termina en dos toques. Si el
   * POST falla, se revierte y el error sube para que la pantalla lo diga: **el que revierte es el
   * lado correcto para equivocarse**, porque deja el pendiente a la vista en vez de darlo por hecho.
   */
  async marcar(itemId, fecha, usuario) {
    if (get().hechos.some((h) => h.itemId === itemId && h.fecha === fecha)) return
    const optimista: Hecho = { itemId, fecha, usuario, nota: null, hechoAt: new Date().toISOString() }
    set({ hechos: [...get().hechos, optimista] })
    try {
      await marcarHecho(itemId, fecha)
    } catch (e) {
      set({ hechos: get().hechos.filter((h) => !(h.itemId === itemId && h.fecha === fecha)) })
      throw e
    }
  },

  async desmarcar(itemId, fecha) {
    const previo = get().hechos
    set({ hechos: previo.filter((h) => !(h.itemId === itemId && h.fecha === fecha)) })
    try {
      await desmarcarHecho(itemId, fecha)
    } catch (e) {
      set({ hechos: previo })
      throw e
    }
  },

  limpiar() {
    set({ ...vacio })
  },
}))
