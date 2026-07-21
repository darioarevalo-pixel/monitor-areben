'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import { guardarLista, leerLista, type KindLista } from '@/lib/kv/cliente'
import { leerPrioridadRetiro } from '@/lib/sesionfotos/cfg'
import type { Origen, VentaGN } from '@/lib/sesionfotos/tipos'

/**
 * Motor de carga/persistencia del historial de solicitudes, compartido por Sesión de
 * fotos y Solicitudes internas (Fase A de la convergencia — antes eran dos hooks
 * gemelos byte por byte, `useSesionFotos`/`useSolicitudesInternas`). La disciplina es
 * la misma que documentaban esos dos:
 *
 * 1. **`cargado` hacia afuera**: sin él en true ningún guardado sale (evita que un POST
 *    de la lista entera borre el historial cuando el GET falló y la lista quedó en []).
 * 2. **Merge por-solicitud, no LWW**: cada guardado RE-LEE la lista fresca del KV y
 *    re-aplica la misma mutación pura, así los cambios concurrentes de otras solicitudes
 *    (o del iframe legacy, que comparte la clave) sobreviven.
 *
 * Lo único que varía entre los dos usos va en `opts`: el `kind` del KV, el estado
 * post-venta (`cargada` vs `retirada`) y qué `crearVentas`/`idsParaCerrar` (distinto
 * `comments` de GN y gate de cierre).
 */

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
  crearVentasDe: (s: T, cred: { user: string; pass: string }) => Promise<ResultadoCrearGen>
  cerrarAnuladas: () => Promise<number>
}

export type OpcionesHistorial<T> = {
  kind: KindLista
  /** Nombre para los mensajes de error ("Sesión de fotos" / "Solicitudes internas"). */
  etiqueta: string
  /** Estado que toma la solicitud al crear la venta GN ('cargada' en fotos, 'retirada' en internas). */
  estadoTrasVenta: string
  crearVentas: (s: T, ctx: { store: Marca; user: string; pass: string }) => Promise<{ ventas: Partial<Record<Origen, VentaGN>>; errores: string[] }>
  idsParaCerrar: (data: T[], marca: Marca) => Promise<string[]>
}

export function useHistorialSolicitudes<T extends SolBase>(marca: Marca, opts: OpcionesHistorial<T>): HistorialSolicitudes<T> {
  const { kind, etiqueta, estadoTrasVenta, crearVentas, idsParaCerrar } = opts
  const noLeido = `No se pudo leer el historial de ${etiqueta}, así que no se guarda nada: guardar ahora borraría lo que hay. Recargá y probá de nuevo.`

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<T[] | null>(null)
  const [prioridad, setPrioridad] = useState<Origen>('deposito')
  const [cargado, setCargado] = useState(false)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((t) => t + 1), [])
  const marcaRef = useRef(marca)
  useEffect(() => {
    marcaRef.current = marca
  }, [marca])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      setError(null)
      setData(null)
      setCargado(false)
      const [lista, prio] = await Promise.all([leerLista<T>(kind, marca), leerPrioridadRetiro(marca)])
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
  }, [marca, tick, kind])

  const persistir = useCallback(
    async (mutar: (l: T[]) => T[]): Promise<boolean> => {
      if (!cargado) {
        alert(noLeido)
        return false
      }
      const marcaAlGuardar = marcaRef.current
      setData((prev) => (prev ? mutar(prev) : prev)) // optimista
      const fresca = await leerLista<T>(kind, marcaAlGuardar)
      if (!fresca.ok) {
        alert('No se pudo re-leer el historial para guardar sin pisar cambios de otros: ' + fresca.motivo)
        return false
      }
      const merged = mutar(fresca.dato)
      const r = await guardarLista({ kind, store: marcaAlGuardar, lista: merged, cargado: true })
      if (!r.ok) {
        alert('No se pudo guardar: ' + r.motivo)
        return false
      }
      if (marcaRef.current === marcaAlGuardar) setData(merged)
      return true
    },
    [cargado, kind, noLeido],
  )

  const crearVentasDe = useCallback(
    async (s: T, cred: { user: string; pass: string }): Promise<ResultadoCrearGen> => {
      if (!cargado) return { tipo: 'no-leido' }
      const marcaAhora = marcaRef.current
      const fresca = await leerLista<T>(kind, marcaAhora)
      if (!fresca.ok) return { tipo: 'no-leido' }
      const fresh = fresca.dato.find((x) => x.id === s.id) ?? null
      if (fresh?.ventas && Object.keys(fresh.ventas).length) {
        return { tipo: 'ya-tenia', ventas: fresh.ventas, estadoSol: fresh.estado }
      }
      const { ventas, errores } = await crearVentas(s, { store: marcaAhora, user: cred.user, pass: cred.pass })
      if (Object.keys(ventas).length) {
        await persistir((l) => l.map((x) => (x.id === s.id ? ({ ...x, ventas: { ...(x.ventas || {}), ...ventas }, estado: estadoTrasVenta } as T) : x)))
      }
      return { tipo: 'hecho', ventas, errores }
    },
    [cargado, kind, crearVentas, estadoTrasVenta, persistir],
  )

  const cerrarAnuladas = useCallback(async (): Promise<number> => {
    if (!data) return 0
    const cerrar = await idsParaCerrar(data, marcaRef.current)
    if (!cerrar.length) return 0
    await persistir((l) => l.map((x) => (cerrar.includes(x.id) ? ({ ...x, estado: 'cerrada' } as T) : x)))
    return cerrar.length
  }, [data, idsParaCerrar, persistir])

  return { cargando, error, data, prioridad, cargado, recargar, persistir, crearVentasDe, cerrarAnuladas }
}
