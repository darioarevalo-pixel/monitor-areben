'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import { guardarLista, leerLista } from '@/lib/kv/cliente'
import { leerPrioridadRetiro } from '@/lib/sesionfotos/cfg'
import { crearVentas, idsParaCerrar } from '@/lib/solicitudes-internas/ventas'
import type { EstadoSI, Origen, SolicitudInterna, VentaGN } from '@/lib/solicitudes-internas/tipos'

/**
 * Carga y persistencia del historial de Solicitudes internas. Gemelo de
 * useSesionFotos: misma disciplina (`cargado` hacia afuera + merge por-solicitud
 * re-leyendo el KV fresco), porque comparten la clave `list` del KV con el iframe
 * legacy durante toda la migración. Port de siInit/siGuardar/siCrearVentas/
 * siChequearAnulaciones (index.html:10826-11013).
 *
 * La única diferencia con useSesionFotos: el kind del KV
 * (`solicitudesinternas`), el `comments`/estado de la venta (`retirada`) y el
 * auto-cierre sin gate de devolución viven en lib/solicitudes-internas/ventas.
 */

const NO_LEIDO_SI =
  'No se pudo leer el historial de Solicitudes internas, así que no se guarda nada: guardar ahora borraría lo que hay. Recargá y probá de nuevo.'

export type ResultadoCrear =
  | { tipo: 'ya-tenia'; ventas: Partial<Record<Origen, VentaGN>>; estadoSol: EstadoSI }
  | { tipo: 'hecho'; ventas: Partial<Record<Origen, VentaGN>>; errores: string[] }
  | { tipo: 'no-leido' }

export type EstadoSIHook = {
  cargando: boolean
  error: string | null
  data: SolicitudInterna[] | null
  prioridad: Origen
  cargado: boolean
  recargar: () => void
  persistir: (mutar: (l: SolicitudInterna[]) => SolicitudInterna[]) => Promise<boolean>
  crearVentasDe: (s: SolicitudInterna, cred: { user: string; pass: string }) => Promise<ResultadoCrear>
  cerrarAnuladas: () => Promise<number>
}

export function useSolicitudesInternas(marca: Marca): EstadoSIHook {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SolicitudInterna[] | null>(null)
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
      const [lista, prio] = await Promise.all([
        leerLista<SolicitudInterna>('solicitudesinternas', marca),
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
    async (mutar: (l: SolicitudInterna[]) => SolicitudInterna[]): Promise<boolean> => {
      if (!cargado) {
        alert(NO_LEIDO_SI)
        return false
      }
      const marcaAlGuardar = marcaRef.current
      setData((prev) => (prev ? mutar(prev) : prev)) // optimista
      // Merge por-solicitud: re-leer fresco y re-aplicar la mutación sobre esa base.
      const fresca = await leerLista<SolicitudInterna>('solicitudesinternas', marcaAlGuardar)
      if (!fresca.ok) {
        alert('No se pudo re-leer el historial para guardar sin pisar cambios de otros: ' + fresca.motivo)
        return false
      }
      const merged = mutar(fresca.dato)
      const r = await guardarLista({ kind: 'solicitudesinternas', store: marcaAlGuardar, lista: merged, cargado: true })
      if (!r.ok) {
        alert('No se pudo guardar: ' + r.motivo)
        return false
      }
      if (marcaRef.current === marcaAlGuardar) setData(merged)
      return true
    },
    [cargado],
  )

  const crearVentasDe = useCallback(
    async (s: SolicitudInterna, cred: { user: string; pass: string }): Promise<ResultadoCrear> => {
      if (!cargado) return { tipo: 'no-leido' }
      const marcaAhora = marcaRef.current
      // Anti-duplicado: re-leer fresco y abortar si ya tiene ventas server-fresh.
      const fresca = await leerLista<SolicitudInterna>('solicitudesinternas', marcaAhora)
      if (!fresca.ok) return { tipo: 'no-leido' }
      const fresh = fresca.dato.find((x) => x.id === s.id) ?? null
      if (fresh?.ventas && Object.keys(fresh.ventas).length) {
        return { tipo: 'ya-tenia', ventas: fresh.ventas, estadoSol: fresh.estado }
      }
      const { ventas, errores } = await crearVentas(s, { store: marcaAhora, user: cred.user, pass: cred.pass })
      if (Object.keys(ventas).length) {
        await persistir((l) => l.map((x) => (x.id === s.id ? { ...x, ventas: { ...(x.ventas || {}), ...ventas }, estado: 'retirada' } : x)))
      }
      return { tipo: 'hecho', ventas, errores }
    },
    [cargado, persistir],
  )

  const cerrarAnuladas = useCallback(async (): Promise<number> => {
    if (!data) return 0
    const cerrar = await idsParaCerrar(data, marcaRef.current)
    if (!cerrar.length) return 0
    await persistir((l) => l.map((x) => (cerrar.includes(x.id) ? { ...x, estado: 'cerrada' as EstadoSI } : x)))
    return cerrar.length
  }, [data, persistir])

  return { cargando, error, data, prioridad, cargado, recargar, persistir, crearVentasDe, cerrarAnuladas }
}
