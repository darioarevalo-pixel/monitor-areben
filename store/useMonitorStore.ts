/**
 * El estado de datos del shell: una carga por marca, compartida por todas las
 * secciones migradas.
 *
 * **Por qué un store cliente y no RSC.** areben-dashboard resuelve esto del lado
 * del servidor (pre-agrega en Postgres y sirve tablas planas), y acá no se puede
 * copiar: el monitor computa el ETL en el browser contra un caché de localStorage
 * que **comparte con el iframe legacy**. Mientras el iframe exista, los datos
 * tienen que vivir del lado del cliente o los dos mundos divergen. Cuando no
 * quede iframe, esto se puede repensar entero.
 *
 * Port de cargarTodo (index.html:2032), sin el DOM: el legacy pintaba el estado
 * en #status y #progress-bar desde adentro de la función; acá queda en el store y
 * lo lee quien quiera.
 */

import { create } from 'zustand'
import { computarDatos } from '@/lib/etl/computar'
import { guardarCache, leerCache, mapaColorManual } from '@/lib/cache'
import { traerDatos } from '@/lib/datos'
import type { Marca } from '@/lib/nav.generated'
import type { DatosETL } from '@/lib/etl/tipos'

export type EstadoCarga = 'vacio' | 'cargando' | 'listo' | 'error'

/** De dónde salieron los datos que se están mostrando. */
export type Origen =
  | { tipo: 'cache'; edadMin: number; refrescando: boolean }
  | { tipo: 'red' }

type MonitorState = {
  marca: Marca | null
  datos: DatosETL | null
  estado: EstadoCarga
  error: string | null
  origen: Origen | null
  /** Última tabla que terminó de bajar. Alimenta el cartel de progreso. */
  progreso: string | null

  cargar: (marca: Marca, rol: 'admin' | 'marketing', forzar?: boolean) => Promise<void>
  limpiar: () => void
}

/**
 * TODAY del legacy (index.html:1914) es `new Date()` al cargar la página, y de ahí
 * salen todos los cortes de 7/15/30/60/90 días. Acá se toma en cada cómputo, que
 * es lo mismo salvo en una pestaña abierta cruzando la medianoche — donde esto es
 * más correcto, no menos.
 */
const ahora = () => new Date()

export const useMonitorStore = create<MonitorState>((set, get) => ({
  marca: null,
  datos: null,
  estado: 'vacio',
  error: null,
  origen: null,
  progreso: null,

  async cargar(marca, rol, forzar = false) {
    // Ya están los datos de esta marca y nadie pidió refrescar: no hacer nada.
    if (!forzar && get().marca === marca && get().estado === 'listo') return

    set({ marca, error: null, progreso: null })

    const computar = (payload: ReturnType<typeof leerCache> extends null ? never : NonNullable<ReturnType<typeof leerCache>>['data'], today: Date) =>
      computarDatos(payload, { today, colorManualMap: mapaColorManual(payload.colorManual) })

    // ── Camino 1: caché fresco (< 6 h) ────────────────────────────────────────
    if (!forzar) {
      const fresco = leerCache(marca, false)
      if (fresco) {
        const edadMin = Math.round((Date.now() - fresco.timestamp) / 60000)
        set({ datos: computar(fresco.data, ahora()), estado: 'listo', origen: { tipo: 'cache', edadMin, refrescando: false } })
        return
      }

      // ── Camino 2: caché vencido → mostrarlo igual y refrescar atrás ─────────
      const vencido = leerCache(marca, true)
      if (vencido) {
        const edadMin = Math.round((Date.now() - vencido.timestamp) / 60000)
        set({ datos: computar(vencido.data, ahora()), estado: 'listo', origen: { tipo: 'cache', edadMin, refrescando: true } })
        try {
          await refrescar(marca, rol, set)
        } catch {
          // El refresco de fondo que falla no rompe nada: se sigue viendo lo viejo.
          set((s) => ({ origen: s.origen?.tipo === 'cache' ? { ...s.origen, refrescando: false } : s.origen }))
        }
        return
      }
    }

    // ── Camino 3: sin caché (o refresco forzado) ──────────────────────────────
    set({ estado: 'cargando' })
    try {
      await refrescar(marca, rol, set)
    } catch (e) {
      set({ estado: 'error', error: e instanceof Error ? e.message : String(e), progreso: null })
    }
  },

  limpiar() {
    set({ marca: null, datos: null, estado: 'vacio', error: null, origen: null, progreso: null })
  },
}))

/** Baja todo de la red, guarda el caché y publica los datos. Lanza si el fetch falla. */
async function refrescar(
  marca: Marca,
  rol: 'admin' | 'marketing',
  set: (partial: Partial<MonitorState>) => void,
): Promise<void> {
  const today = ahora()
  const payload = await traerDatos({ marca, rol, today, onProgress: (label) => set({ progreso: label }) })

  // El timestamp se guarda ANTES de computar, igual que el legacy (index.html:2100):
  // marca cuándo se bajaron los datos, no cuánto tardó el cómputo.
  guardarCache(marca, payload, Date.now())

  set({
    datos: computarDatos(payload, { today, colorManualMap: mapaColorManual(payload.colorManual) }),
    estado: 'listo',
    origen: { tipo: 'red' },
    error: null,
    progreso: null,
  })
}
