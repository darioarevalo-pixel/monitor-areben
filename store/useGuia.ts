/**
 * El tour de la pantalla que está abierta: qué pasos hay y en cuál estamos.
 *
 * # Por qué un store y no un registro estático de guías
 *
 * `components/secciones/registro.ts` carga cada sección con `next/dynamic`, o sea **un chunk por
 * sección**. Un mapa `{ envios: PASOS_DE_ENVIOS, … }` en el shell metería los pasos de las 42
 * pantallas en el bundle que baja todo el mundo, para que los use quien abre una. Con el store, la
 * sección **registra los suyos al montar** y viajan en su propio chunk.
 *
 * De paso resuelve lo otro: quien dibuja el botón ("Cómo se usa", en el encabezado) y quien conoce
 * los pasos (la sección) son dos componentes sin parentesco. El store es lo que los une sin
 * inventar un contexto que envuelva media app.
 *
 * `irAPestania` viene de la misma mano: los pasos saben en qué pestaña vive cada control, pero la
 * pestaña la maneja la sección. Registrarla junto con los pasos evita que el overlay tenga que
 * saber algo de Envíos.
 */

import { create } from 'zustand'
import { pasosDelCambio, type PasoGuia } from '@/lib/guia/core'

type GuiaState = {
  /** Todos los pasos de la sección: los que registró al montar. */
  pasos: readonly PasoGuia[]
  /**
   * Los que se están recorriendo AHORA. Son `pasos` enteros con «Tour virtual» y sólo los de un
   * cambio con el «Ver cambios» de una novedad. Van aparte para que acotar un recorrido no le
   * achique el tour al botón del encabezado.
   */
  recorrido: readonly PasoGuia[]
  /** El cambio que se está recorriendo, o `null` en el tour entero. El globo lo dice. */
  cambio: string | null
  /** La sección la registra si sus pasos viven en pestañas distintas. */
  irAPestania: ((pestania: string) => void) | null
  /** `null` = el tour no está corriendo. Un número = el índice del paso visible. */
  paso: number | null
  /** La llama la sección al montar. Reemplaza lo que hubiera (sólo hay una sección a la vez). */
  registrar: (pasos: readonly PasoGuia[], irAPestania?: (pestania: string) => void) => void
  /** Al desmontar. Deja el botón apagado en la sección siguiente, que es lo correcto. */
  olvidar: () => void
  arrancar: () => void
  /** El tour sólo con los pasos de un cambio (`AAAA-MM-DD`). Ver `pasosDelCambio`. */
  arrancarCambio: (cambio: string) => void
  ir: (paso: number | null) => void
}

export const useGuia = create<GuiaState>((set) => ({
  pasos: [],
  recorrido: [],
  cambio: null,
  irAPestania: null,
  paso: null,
  registrar: (pasos, irAPestania) => set({ pasos, recorrido: [], cambio: null, irAPestania: irAPestania ?? null, paso: null }),
  // ⚠️ `paso: null` también acá: si alguien cambia de sección con el tour abierto, el overlay tiene
  // que apagarse. Si no, quedaría buscando anclas de una pantalla que ya no está montada.
  olvidar: () => set({ pasos: [], recorrido: [], cambio: null, irAPestania: null, paso: null }),
  arrancar: () => set((s) => ({ recorrido: s.pasos, cambio: null, paso: 0 })),
  arrancarCambio: (cambio) =>
    set((s) => {
      const recorrido = pasosDelCambio(s.pasos, cambio)
      // Si el cambio no tenía pasos, `pasosDelCambio` devolvió el tour entero: el globo no puede
      // decir «Lo nuevo» sobre pasos que no lo son.
      return { recorrido, cambio: recorrido === s.pasos ? null : cambio, paso: 0 }
    }),
  ir: (paso) => set({ paso }),
}))
