'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import { guardarLista, leerLista } from '@/lib/kv/cliente'
import { leerPrioridadRetiro } from '@/lib/sesionfotos/cfg'
import { crearVentas, idsParaCerrar } from '@/lib/sesionfotos/ventas'
import type { EstadoSolicitud, Origen, Solicitud, VentaGN } from '@/lib/sesionfotos/tipos'

/**
 * Carga y persistencia del historial de Sesión de fotos. Port de sfInit/sfGuardar
 * (index.html:9820/9824), pero con dos diferencias deliberadas sobre el legacy:
 *
 * 1. **`cargado` viaja hacia afuera** (como useCRM): sin él en true, ningún
 *    guardado sale. Es lo que evita que un POST de la lista entera borre el
 *    historial cuando el GET falló y la lista quedó en `[]`.
 *
 * 2. **Merge por-solicitud, no LWW.** El legacy (y useCRM) postean el estado
 *    entero en memoria: si el iframe editó OTRA solicitud mientras tanto, se
 *    pisa. Acá cada guardado RE-LEE la lista fresca del KV y re-aplica la misma
 *    mutación pura sobre ella, así los cambios concurrentes de otras solicitudes
 *    sobreviven. Justificado por compartir la clave con el iframe legacy durante
 *    toda la migración. La mutación tiene que tocar UNA solicitud y depender solo
 *    de su entrada (ver lib/sesionfotos/core.ts).
 */

const NO_LEIDO_SF =
  'No se pudo leer el historial de Sesión de fotos, así que no se guarda nada: guardar ahora borraría lo que hay. Recargá y probá de nuevo.'

export type EstadoSF = {
  cargando: boolean
  /** Error de carga (no de guardado; esos se avisan por alert). */
  error: string | null
  data: Solicitud[] | null
  prioridad: Origen
  /** ¿Se pudo leer el KV? Sin esto en true, ningún guardado puede salir. */
  cargado: boolean
  recargar: () => void
  /**
   * Aplica una mutación pura (lista → lista) de forma optimista y la persiste con
   * merge por-solicitud. Devuelve false si no se guardó (KV no leído / error).
   */
  persistir: (mutar: (l: Solicitud[]) => Solicitud[]) => Promise<boolean>
  /**
   * Crea las ventas en GN de una solicitud (la superficie IRREVERSIBLE). Contramedida
   * anti-duplicado: re-lee fresco y aborta si ya tiene ventas server-fresh. Persiste
   * s.ventas + estado='cargada'.
   */
  crearVentasDe: (s: Solicitud, cred: { user: string; pass: string }) => Promise<ResultadoCrear>
  /** Cierra las solicitudes cuyas ventas fueron anuladas en GN (read-only + estado='cerrada'). */
  cerrarAnuladas: () => Promise<number>
}

export type ResultadoCrear =
  | { tipo: 'ya-tenia'; ventas: Partial<Record<Origen, VentaGN>>; estadoSol: EstadoSolicitud }
  | { tipo: 'hecho'; ventas: Partial<Record<Origen, VentaGN>>; errores: string[] }
  | { tipo: 'no-leido' }

export function useSesionFotos(marca: Marca): EstadoSF {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Solicitud[] | null>(null)
  const [prioridad, setPrioridad] = useState<Origen>('deposito')
  const [cargado, setCargado] = useState(false)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((t) => t + 1), [])
  // La marca "actual" para el chequeo post-await de persistir. En un ref (no en las
  // deps de persistir) y actualizada en effect: no se puede escribir en render.
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
      const [lista, prio] = await Promise.all([
        leerLista<Solicitud>('sesionfotos', marca),
        leerPrioridadRetiro(marca),
      ])
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
  }, [marca, tick])

  const persistir = useCallback(
    async (mutar: (l: Solicitud[]) => Solicitud[]): Promise<boolean> => {
      if (!cargado) {
        alert(NO_LEIDO_SF)
        return false
      }
      const marcaAlGuardar = marcaRef.current
      setData((prev) => (prev ? mutar(prev) : prev)) // optimista
      // Merge por-solicitud: re-leer fresco y re-aplicar la mutación sobre esa base.
      const fresca = await leerLista<Solicitud>('sesionfotos', marcaAlGuardar)
      if (!fresca.ok) {
        alert('No se pudo re-leer el historial para guardar sin pisar cambios de otros: ' + fresca.motivo)
        return false
      }
      const merged = mutar(fresca.dato)
      const r = await guardarLista({ kind: 'sesionfotos', store: marcaAlGuardar, lista: merged, cargado: true })
      if (!r.ok) {
        alert('No se pudo guardar: ' + r.motivo)
        return false
      }
      // Solo sincronizar la vista si no cambió la marca mientras tanto.
      if (marcaRef.current === marcaAlGuardar) setData(merged)
      return true
    },
    [cargado],
  )

  const crearVentasDe = useCallback(
    async (s: Solicitud, cred: { user: string; pass: string }): Promise<ResultadoCrear> => {
      if (!cargado) return { tipo: 'no-leido' }
      const marcaAhora = marcaRef.current
      // Anti-duplicado: re-leer fresco y abortar si ya tiene ventas server-fresh.
      const fresca = await leerLista<Solicitud>('sesionfotos', marcaAhora)
      if (!fresca.ok) return { tipo: 'no-leido' }
      const fresh = fresca.dato.find((x) => x.id === s.id) ?? null
      if (fresh?.ventas && Object.keys(fresh.ventas).length) {
        return { tipo: 'ya-tenia', ventas: fresh.ventas, estadoSol: fresh.estado }
      }
      const { ventas, errores } = await crearVentas(s, { store: marcaAhora, user: cred.user, pass: cred.pass })
      if (Object.keys(ventas).length) {
        await persistir((l) => l.map((x) => (x.id === s.id ? { ...x, ventas: { ...(x.ventas || {}), ...ventas }, estado: 'cargada' } : x)))
      }
      return { tipo: 'hecho', ventas, errores }
    },
    [cargado, persistir],
  )

  const cerrarAnuladas = useCallback(async (): Promise<number> => {
    if (!data) return 0
    const cerrar = await idsParaCerrar(data, marcaRef.current)
    if (!cerrar.length) return 0
    await persistir((l) => l.map((x) => (cerrar.includes(x.id) ? { ...x, estado: 'cerrada' as EstadoSolicitud } : x)))
    return cerrar.length
  }, [data, persistir])

  return { cargando, error, data, prioridad, cargado, recargar, persistir, crearVentasDe, cerrarAnuladas }
}
