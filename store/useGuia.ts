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
import type { PasoGuia } from '@/lib/guia/core'

type GuiaState = {
  pasos: readonly PasoGuia[]
  /** La sección la registra si sus pasos viven en pestañas distintas. */
  irAPestania: ((pestania: string) => void) | null
  /** `null` = el tour no está corriendo. Un número = el índice del paso visible. */
  paso: number | null
  /** La llama la sección al montar. Reemplaza lo que hubiera (sólo hay una sección a la vez). */
  registrar: (pasos: readonly PasoGuia[], irAPestania?: (pestania: string) => void) => void
  /** Al desmontar. Deja el botón apagado en la sección siguiente, que es lo correcto. */
  olvidar: () => void
  arrancar: () => void
  ir: (paso: number | null) => void
}

export const useGuia = create<GuiaState>((set) => ({
  pasos: [],
  irAPestania: null,
  paso: null,
  registrar: (pasos, irAPestania) => set({ pasos, irAPestania: irAPestania ?? null, paso: null }),
  // ⚠️ `paso: null` también acá: si alguien cambia de sección con el tour abierto, el overlay tiene
  // que apagarse. Si no, quedaría buscando anclas de una pantalla que ya no está montada.
  olvidar: () => set({ pasos: [], irAPestania: null, paso: null }),
  arrancar: () => set({ paso: 0 }),
  ir: (paso) => set({ paso }),
}))
