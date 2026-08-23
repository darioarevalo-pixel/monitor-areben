/**
 * El estado de datos del shell: una carga por marca, compartida por todas las
 * secciones migradas.
 *
 * **Por qué un store cliente y no RSC.** areben-dashboard resuelve esto del lado
 * del servidor (pre-agrega en Postgres y sirve tablas planas), y acá no se puede
 * copiar todavía: el monitor baja las tablas crudas y computa el ETL en el browser,
 * contra un caché local. Nació así porque el caché se compartía con el iframe legacy
 * —que ya no existe—, y hoy se sostiene por el volumen: son ~100.000 filas de
 * detalle de venta por marca. Moverlo al server es posible pero es otro proyecto.
 *
 * Port de cargarTodo (index.html:2032), sin el DOM: el legacy pintaba el estado
 * en #status y #progress-bar desde adentro de la función; acá queda en el store y
 * lo lee quien quiera.
 */

import { create } from 'zustand'
import { computarDatos } from '@/lib/etl/computar'
import { guardarCache, leerCache, mapaColorManual, type PayloadCache } from '@/lib/cache'
import type { Linea } from '@/lib/lineas'
import { desdeVentas, traerDatos } from '@/lib/datos'
import type { Marca } from '@/lib/nav.datos'
import type { DatosETL } from '@/lib/etl/tipos'

export type EstadoCarga = 'vacio' | 'cargando' | 'listo' | 'error'

/** De dónde salieron los datos que se están mostrando. */
export type Origen =
  | { tipo: 'cache'; edadMin: number; refrescando: boolean }
  /** `sinCache`: se bajó bien pero no se pudo guardar, así que la próxima vuelve a bajar todo. */
  | { tipo: 'red'; sinCache?: string }

type MonitorState = {
  marca: Marca | null
  datos: DatosETL | null
  /**
   * El payload **crudo** que produjo `datos`, tal como salió del caché o de la red.
   *
   * Se conserva desde el 22-ago-2026 para poder **partirlo por línea** sin bajar nada: las pantallas
   * de plata de Zattia pueden pedir Zattia sola o Stunned sola, y eso es `filtrarPorLinea` +
   * `computarDatos` sobre esto mismo (ver `components/fundas/useDatosMonitor.ts`).
   *
   * 🔑 **No hay una segunda clave de caché ni una segunda bajada**: el caché sigue siendo uno por
   * marca (`lib/cache.ts`), y la línea es un corte que se calcula encima.
   */
  payload: PayloadCache | null
  estado: EstadoCarga
  error: string | null
  origen: Origen | null
  /** Última tabla que terminó de bajar. Alimenta el cartel de progreso. */
  progreso: string | null

  /**
   * `historiaCompleta` decide **cuánta venta se baja** y sale de `veVentasHistoricas(perfil, marca)`,
   * o sea del permiso. Se pasa como booleano y no como fecha porque el corte se calcula acá una
   * sola vez, con el mismo `today` que va a `traerDatos`, y el string resultante es el que sella el
   * caché: si el llamador lo calculara por su cuenta, serían dos cortes que se despegan cruzando la
   * medianoche y el sello dejaría de coincidir consigo mismo.
   */
  cargar: (marca: Marca, historiaCompleta: boolean, forzar?: boolean) => Promise<void>
  limpiar: () => void

  /**
   * Qué línea miran las pantallas que saben de líneas. Vive acá y no adentro de cada pantalla para
   * que elegir «Stunned» en Resumen siga valiendo al pasar a Márgenes: es la misma pregunta.
   *
   * ⚠️ **Es estado de PANTALLA, no de datos**: no dispara ninguna carga, y las pantallas que no
   * preguntan por la línea no se enteran de que existe. Arranca en `'zattia'` por decisión de Bruno
   * (22-ago-2026): **nunca una cifra mezclada sin rótulo**.
   */
  linea: Linea
  setLinea: (linea: Linea) => void
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
  payload: null,
  estado: 'vacio',
  error: null,
  origen: null,
  progreso: null,
  linea: 'zattia',

  setLinea(linea) {
    set({ linea })
  },

  async cargar(marca, historiaCompleta, forzar = false) {
    // Ya están los datos de esta marca y nadie pidió refrescar: no hacer nada.
    if (!forzar && get().marca === marca && get().estado === 'listo') return

    const desde = desdeVentas(historiaCompleta, ahora())
    const cambiaDeMarca = get().marca !== marca

    /**
     * 🔴 **Al cambiar de marca, `estado` baja a `'cargando'` EN EL MISMO `set` que la marca.**
     *
     * Antes acá iba `set({ marca })` a secas y `estado` se quedaba en `'listo'` de la marca
     * anterior. Durante el `await leerCache` de abajo, el guard de `useDatosMonitor`
     * —`estado === 'listo' && marcaCargada === marca`, que existe exactamente para esto— daba
     * **true con los datos viejos**: la pantalla mostraba los números de una marca bajo el nombre
     * de la otra. Se vio en producción el 18-ago-2026, con «BDI Accesorios» en el selector y el
     * contador y el sync de Zattia abajo. Sin un error y con la pantalla pareciendo sana.
     *
     * `datos` y `origen` se limpian junto con eso aunque el guard ya alcance: dejar el payload de
     * la otra marca en el store es un arma cargada para el próximo que lea `datos` sin preguntar.
     */
    set(
      cambiaDeMarca
        ? { marca, datos: null, payload: null, estado: 'cargando', error: null, origen: null, progreso: null }
        : { marca, error: null, progreso: null },
    )

    /**
     * 🔴 **La otra puerta del mismo defecto: la carrera.** Volver a la marca anterior mientras la
     * primera bajada sigue en vuelo hacía que ésa publicara **tarde y encima** — los datos de
     * Zattia quedaban bajo el rótulo de BDI, y ahí se quedaban. Por eso **todo lo que publica pasa
     * por acá**: si el store ya está en otra marca, lo que llega tarde se descarta.
     *
     * ⚠️ Lo que NO se descarta es el **guardado del caché**: la bajada es válida y ya se pagó, así
     * que cambiar de marca a mitad no la tira.
     */
    const publicar = (parcial: Partial<MonitorState>) => {
      if (get().marca === marca) set(parcial)
    }

    const computar = (payload: PayloadCache, today: Date) =>
      computarDatos(payload, { today, colorManualMap: mapaColorManual(payload.colorManual) })

    // ── Camino 1: caché fresco (< 6 h) ────────────────────────────────────────
    if (!forzar) {
      const fresco = await leerCache(marca, false, desde)
      if (fresco) {
        const edadMin = Math.round((Date.now() - fresco.timestamp) / 60000)
        publicar({ datos: computar(fresco.data, ahora()), payload: fresco.data, estado: 'listo', origen: { tipo: 'cache', edadMin, refrescando: false } })
        return
      }

      // ── Camino 2: caché vencido → mostrarlo igual y refrescar atrás ─────────
      const vencido = await leerCache(marca, true, desde)
      if (vencido) {
        const edadMin = Math.round((Date.now() - vencido.timestamp) / 60000)
        publicar({ datos: computar(vencido.data, ahora()), payload: vencido.data, estado: 'listo', origen: { tipo: 'cache', edadMin, refrescando: true } })
        try {
          await refrescar(marca, desde, publicar)
        } catch {
          // El refresco de fondo que falla no rompe nada: se sigue viendo lo viejo.
          const o = get().origen
          publicar({ origen: o?.tipo === 'cache' ? { ...o, refrescando: false } : o })
        }
        return
      }
    }

    // ── Camino 3: sin caché (o refresco forzado) ──────────────────────────────
    publicar({ estado: 'cargando' })
    try {
      await refrescar(marca, desde, publicar)
    } catch (e) {
      publicar({ estado: 'error', error: e instanceof Error ? e.message : String(e), progreso: null })
    }
  },

  limpiar() {
    set({ marca: null, datos: null, payload: null, estado: 'vacio', error: null, origen: null, progreso: null })
  },
}))

/** Baja todo de la red, guarda el caché y publica los datos. Lanza si el fetch falla. */
async function refrescar(
  marca: Marca,
  desde: string,
  /** El `set` guardado por marca de `cargar()`. ⛔ No recibe el `set` pelado: ver el porqué allá. */
  publicar: (partial: Partial<MonitorState>) => void,
): Promise<void> {
  const today = ahora()
  let tiempos: { tablas: number; detalles: number; total: number } | null = null
  const payload = await traerDatos({
    marca,
    desde,
    onProgress: (label) => publicar({ progreso: label }),
    onTiempos: (t) => {
      tiempos = t
    },
  })

  // El timestamp se guarda ANTES de computar, igual que el legacy (index.html:2100):
  // marca cuándo se bajaron los datos, no cuánto tardó el cómputo.
  //
  // Se espera el guardado en vez de dispararlo y seguir: contra los ~20 s de red que
  // acabamos de pagar, el clone es ruido, y a cambio el resultado entra en el MISMO `set`
  // que publica `origen`. Además, asignarlo a una variable y usarla es lo que impide
  // olvidarse el `await` — el ESLint del repo no tiene reglas type-aware, así que un
  // `guardarCache()` suelto no sería error de compilación.
  const guardado = await guardarCache(marca, payload, Date.now(), desde)

  const t0 = performance.now()
  const datos = computarDatos(payload, { today, colorManualMap: mapaColorManual(payload.colorManual) })
  loguearTiempos(marca, tiempos, performance.now() - t0, guardado.ok)

  publicar({
    datos,
    payload,
    estado: 'listo',
    origen: guardado.ok ? { tipo: 'red' } : { tipo: 'red', sinCache: guardado.motivo },
    error: null,
    progreso: null,
  })
}

/**
 * Una línea por carga fría, en consola. El repo no tenía NI UNA medición de tiempo, así que
 * "tarda 20 segundos" era folklore: nadie sabía cuánto es la bajada y cuánto el cómputo del
 * ETL sobre ~100.000 filas en el hilo principal. Sin este número no se puede decidir qué
 * optimizar — y la respuesta cambia el arreglo por completo.
 */
function loguearTiempos(
  marca: Marca,
  red: { tablas: number; detalles: number; total: number } | null,
  computo: number,
  cacheOk: boolean,
): void {
  const s = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',') + 's'
  const partes = [`[monitor] ${marca} — carga fría`]
  // `tablas` y `detalles` se solapan (van en paralelo), así que no suman: el de afuera es `total`.
  // Si `detalles` es el más largo de los dos, es el que manda el tiempo de la carga.
  if (red) partes.push(`red ${s(red.total)} (tablas ${s(red.tablas)} · detalles ${s(red.detalles)}, en paralelo)`)
  partes.push(`cómputo ${s(computo)}`)
  partes.push(cacheOk ? 'caché guardado' : 'CACHÉ NO GUARDADO')
  console.info(partes.join(' · '))
}
