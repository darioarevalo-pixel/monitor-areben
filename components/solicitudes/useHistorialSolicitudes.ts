'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { baseDeLinea, type Linea } from '@/lib/lineas'
import { aplicarDiff, diffSolicitudes, leerCajon, type KindCajon } from '@/lib/solicitudes/cajon'
import { useToast } from '@/components/ui'
import { leerPrioridadRetiro } from '@/lib/sesionfotos/cfg'
import type { Origen, VentaGN } from '@/lib/sesionfotos/tipos'
import type { Credencial } from '@/lib/sesion'

/**
 * Motor de carga/persistencia del historial de solicitudes, compartido por Sesión de
 * fotos y Solicitudes internas (Fase A de la convergencia — antes eran dos hooks
 * gemelos byte por byte, `useSesionFotos`/`useSolicitudesInternas`). La disciplina es
 * la misma que documentaban esos dos:
 *
 * 1. **`cargado` hacia afuera**: sin él en true ningún guardado sale (evita que una
 *    escritura sobre una lista vacía —porque el GET falló— borre el historial).
 * 2. **Re-leer fresco antes de guardar**: cada guardado vuelve a leer la lista y
 *    re-aplica la misma mutación pura, así los cambios concurrentes de otras solicitudes
 *    sobreviven.
 *
 * Desde la Fase 2A el destino es la tabla `solicitudes` (`lib/solicitudes/cajon`) y no el
 * KV: la mutación sigue siendo sobre el array entero —el motor no cambió— pero al guardar
 * se escribe **solo lo que cambió** (`diffSolicitudes`), en vez de reescribir el historial
 * completo de la marca.
 *
 * Lo único que varía entre los dos usos va en `opts`: el `kind` (qué preset/cajón), el
 * estado post-venta (`cargada` vs `retirada`) y qué `crearVentas`/`idsParaCerrar` (distinto
 * `comments` de GN y gate de cierre).
 *
 * # 🔑 El eje es la LÍNEA para el cajón y la MARCA para Gestión Nube (22-ago-2026)
 *
 * El motor recibe una `Linea`, no una `Marca`, porque Stunned tiene **historial propio**: sus
 * solicitudes son filas nuevas de la misma tabla, separadas por la columna `store` que ya es parte
 * de la clave (`store,id`). Eso es lo que la hace una lista aparte y no un filtro.
 *
 * ⛔ **Todo lo que sale de la app va con `baseDeLinea(linea)`, nunca con la línea**: la venta de
 * Gestión Nube, la consulta de si se anuló y la prioridad de retiro de Reposición. Stunned no tiene
 * GN propio —comparte el de Zattia, medido: mismo depósito, mismo local, mismo stock— así que su
 * venta técnica es **byte-idéntica** a la de Zattia y se la reconoce por la descripción y el id de
 * la solicitud. 🔴 Mandarle `store:'stunned'` a `api/crear-venta.js` NO falla y es peor que fallar:
 * su `SF_CFG.stunned` existe sólo para `tn_import` y tiene **`client_id: null`**, así que la venta
 * saldría sin cliente.
 */

/**
 * **Los dos destinos de una solicitud, que NO son el mismo store.**
 *
 * `cajon` es dónde vive la fila (la línea: Stunned tiene historial propio) y `gn` es a quién se le
 * pide la venta (la marca base: Stunned no tiene Gestión Nube propio). Está acá, con nombre, en vez
 * de repartido en los cuatro llamados, porque la vez que se confundan es la vez que
 * `api/crear-venta.js` reciba `store:'stunned'` — que **no falla**: su `SF_CFG.stunned` existe sólo
 * para `tn_import` y tiene `client_id: null`, así que la venta técnica saldría sin cliente en GN.
 */
export function destinosDe(linea: Linea): { cajon: Linea; gn: Marca } {
  return { cajon: linea, gn: baseDeLinea(linea) }
}

/** Forma mínima que el motor necesita de cada solicitud. */
type SolBase = { id: string; estado: string; ventas?: Partial<Record<Origen, VentaGN>> }

export type ResultadoCrearGen =
  | { tipo: 'ya-tenia'; ventas: Partial<Record<Origen, VentaGN>>; estadoSol: string }
  | { tipo: 'hecho'; ventas: Partial<Record<Origen, VentaGN>>; errores: string[] }
  | { tipo: 'no-leido' }

export type HistorialSolicitudes<T> = {
  cargando: boolean
  error: string | null
  data: T[] | null
  prioridad: Origen
  cargado: boolean
  recargar: () => void
  persistir: (mutar: (l: T[]) => T[]) => Promise<boolean>
  crearVentasDe: (s: T, cred: Credencial) => Promise<ResultadoCrearGen>
  cerrarAnuladas: () => Promise<number>
}

export type OpcionesHistorial<T> = {
  kind: KindCajon
  /** Nombre para los mensajes de error ("Sesión de fotos" / "Solicitudes internas"). */
  etiqueta: string
  /** Estado que toma la solicitud al crear la venta GN ('cargada' en fotos, 'retirada' en internas). */
  estadoTrasVenta: string
  /** ⚠️ `store` es la MARCA base de la línea: lo que entiende Gestión Nube. */
  crearVentas: (s: T, ctx: { store: Marca; cred: Credencial }) => Promise<{ ventas: Partial<Record<Origen, VentaGN>>; errores: string[] }>
  idsParaCerrar: (data: T[], marca: Marca) => Promise<string[]>
}

export function useHistorialSolicitudes<T extends SolBase>(linea: Linea, opts: OpcionesHistorial<T>): HistorialSolicitudes<T> {
  const toast = useToast()
  const { kind, etiqueta, estadoTrasVenta, crearVentas, idsParaCerrar } = opts
  const noLeido = `No se pudo leer el historial de ${etiqueta}, así que no se guarda nada: guardar ahora eliminaría lo que hay. Recargá y probá de nuevo.`

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<T[] | null>(null)
  const [prioridad, setPrioridad] = useState<Origen>('deposito')
  const [cargado, setCargado] = useState(false)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((t) => t + 1), [])
  // La línea manda para el cajón; la marca base, para todo lo que sale de la app.
  const lineaRef = useRef(linea)
  useEffect(() => {
    lineaRef.current = linea
  }, [linea])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      setError(null)
      setData(null)
      setCargado(false)
      const d = destinosDe(linea)
      const [lista, prio] = await Promise.all([leerCajon<T>(kind, d.cajon), leerPrioridadRetiro(d.gn)])
      if (!vivo) return
      setPrioridad(prio)
      if (lista.ok) {
        setData(lista.dato)
        setCargado(true)
      } else {
        setData(null)
        setCargado(false)
        setError(lista.motivo)
      }
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [linea, tick, kind])

  const persistir = useCallback(
    async (mutar: (l: T[]) => T[]): Promise<boolean> => {
      if (!cargado) {
        toast.error(noLeido)
        return false
      }
      const lineaAlGuardar = lineaRef.current
      setData((prev) => (prev ? mutar(prev) : prev)) // optimista
      const fresca = await leerCajon<T>(kind, destinosDe(lineaAlGuardar).cajon)
      if (!fresca.ok) {
        toast.error('No se pudo re-leer el historial para guardar sin pisar cambios de otros: ' + fresca.motivo)
        return false
      }
      const merged = mutar(fresca.dato)
      // Solo lo que cambió respecto de lo que acabamos de leer: las demás solicitudes ni
      // se tocan, así dos personas trabajando a la vez no se pisan.
      const r = await aplicarDiff(kind, destinosDe(lineaAlGuardar).cajon, diffSolicitudes(fresca.dato, merged))
      if (!r.ok) {
        toast.error('No se pudo guardar: ' + r.motivo)
        return false
      }
      if (lineaRef.current === lineaAlGuardar) setData(merged)
      return true
    },
    [cargado, kind, noLeido, toast],
  )

  const crearVentasDe = useCallback(
    async (s: T, cred: Credencial): Promise<ResultadoCrearGen> => {
      if (!cargado) return { tipo: 'no-leido' }
      const lineaAhora = lineaRef.current
      const fresca = await leerCajon<T>(kind, destinosDe(lineaAhora).cajon)
      if (!fresca.ok) return { tipo: 'no-leido' }
      const fresh = fresca.dato.find((x) => x.id === s.id) ?? null
      if (fresh?.ventas && Object.keys(fresh.ventas).length) {
        return { tipo: 'ya-tenia', ventas: fresh.ventas, estadoSol: fresh.estado }
      }
      const { ventas, errores } = await crearVentas(s, { store: destinosDe(lineaAhora).gn, cred })
      if (Object.keys(ventas).length) {
        await persistir((l) => l.map((x) => (x.id === s.id ? ({ ...x, ventas: { ...(x.ventas || {}), ...ventas }, estado: estadoTrasVenta } as T) : x)))
      }
      return { tipo: 'hecho', ventas, errores }
    },
    [cargado, kind, crearVentas, estadoTrasVenta, persistir],
  )

  const cerrarAnuladas = useCallback(async (): Promise<number> => {
    if (!data) return 0
    const cerrar = await idsParaCerrar(data, destinosDe(lineaRef.current).gn)
    if (!cerrar.length) return 0
    await persistir((l) => l.map((x) => (cerrar.includes(x.id) ? ({ ...x, estado: 'cerrada' } as T) : x)))
    return cerrar.length
  }, [data, idsParaCerrar, persistir])

  return { cargando, error, data, prioridad, cargado, recargar, persistir, crearVentasDe, cerrarAnuladas }
}
