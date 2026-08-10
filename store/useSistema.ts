/**
 * Las novedades del sistema, con UNA sola lectura para toda la app.
 *
 * Alimenta cuatro cosas con la misma request: el badge del sidebar, la sección Novedades, el cartel
 * de las importantes y —más adelante— el botón "Cómo se usa" del encabezado.
 *
 * # Por qué no va en `useAvisos`
 *
 * 1. `Aviso` está definido como *"se derivan, no se registran"* (`lib/notificaciones/tipos.ts`), y
 *    una novedad es exactamente lo contrario: tiene fila, estado y un registro de lectura en el
 *    servidor. Meterla ahí rompe la premisa del módulo.
 * 2. El "visto" de los avisos es **localStorage, por navegador**; el de las novedades es
 *    **servidor, por usuario**. En un mismo contador el número bajaría por dos reglas distintas.
 * 3. El contador de avisos cuelga de Inicio porque ahí llevan todos los avisos. El de novedades
 *    tiene que colgar de Novedades, que es adonde lleva el clic.
 *
 * **Sin `setInterval`.** Las novedades no son urgentes y cambian una vez por semana: refrescarlas
 * cada tres minutos sería ruido. Se piden una vez al montar el shell.
 */

import { create } from 'zustand'
import { leerSistema, marcarLeida } from '@/lib/novedades/cliente'
import { sinLeer, type Lectura, type Novedad } from '@/lib/novedades/tipos'
import type { ManualIndice } from '@/lib/manuales/tipos'

type SistemaState = {
  novedades: Novedad[]
  leidas: Lectura[]
  /** Índice sin cuerpo. Lo lee `SeccionHeader` para saber si dibujar "Cómo se usa", sin fetch. */
  manuales: ManualIndice[]
  puede: { publicar: boolean; editarManuales: boolean }
  cargado: boolean
  cargando: boolean
  cargar: () => Promise<void>
  /** Marca leída en el servidor y actualiza el badge sin volver a pedir todo. */
  marcar: (n: Novedad) => Promise<void>
  limpiar: () => void
}

export const useSistema = create<SistemaState>((set, get) => ({
  novedades: [],
  leidas: [],
  manuales: [],
  puede: { publicar: false, editarManuales: false },
  cargado: false,
  cargando: false,

  async cargar() {
    if (get().cargando) return
    set({ cargando: true })
    try {
      const d = await leerSistema()
      set({ novedades: d.novedades, leidas: d.leidas, manuales: d.manuales, puede: d.puede, cargado: true, cargando: false })
    } catch {
      // Un fallo deja el badge apagado y la sección con su propio error. Que no se puedan leer las
      // novedades no puede romper el shell entero.
      set({ cargando: false })
    }
  },

  async marcar(n) {
    const ya = get().leidas.some((l) => l.novedad_id === n.id && l.version === n.version)
    if (ya) return
    // Optimista: el badge baja al toque. Si el POST falla, la lectura no quedó guardada y en la
    // próxima carga la novedad vuelve a contar — que es el lado correcto para equivocarse.
    set({ leidas: [...get().leidas, { novedad_id: n.id, version: n.version }] })
    await marcarLeida(n.id, n.version).catch(() => {})
  },

  limpiar() {
    set({ novedades: [], leidas: [], manuales: [], puede: { publicar: false, editarManuales: false }, cargado: false, cargando: false })
  },
}))

/** Cuántas publicadas sin leer tiene esta persona. Es el número del badge. */
export function contarSinLeer(s: Pick<SistemaState, 'novedades' | 'leidas'>): number {
  return sinLeer(s.novedades, s.leidas).length
}
