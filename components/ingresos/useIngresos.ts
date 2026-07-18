'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { guardarAdminPass } from '@/lib/sesion'
import { guardarIngresos, leerIngresos } from '@/lib/kv/cliente'
import { conItemsDerivados, normalizar } from '@/lib/ingresos/core'
import type { Ingreso } from '@/lib/ingresos/tipos'

/** Id nuevo para ingresos/bloques/modelos/diseños/galería. Port de ingNuevoId. */
export function nuevoId(): string {
  return 'g' + Date.now() + '_' + Math.floor(Math.random() * 100000)
}

export type EstadoGuardado = '' | 'guardando' | 'ok' | 'error'

export type EstadoIngresos = {
  data: Ingreso[] | null
  cargando: boolean
  error: string | null
  /** ¿Se pudo leer el KV? Sin esto en true, ningún guardado sale (borraría todo). */
  cargado: boolean
  estadoGuardado: EstadoGuardado
  recargar: () => void
  /**
   * Aplica una mutación pura (lista → lista) optimista y agenda el guardado (debounce
   * 600 ms, como el legacy). Solo admins; sin `cargado`, no hace nada.
   */
  guardar: (mutar: (l: Ingreso[]) => Ingreso[]) => void
}

/**
 * Carga y persistencia de Ingresos proyectados. Port de ingInit/ingGuardar
 * (index.html:3931/3946): lee el KV (forma `{ingresos}`, la clave default del
 * endpoint), normaliza el formato viejo, y guarda con debounce.
 *
 * Sobre el legacy agrega la disciplina del seam: el flag `cargado` viaja hacia
 * afuera y bloquea todo guardado sin lectura previa (el modo de falla que casi borra
 * el KV). El guardado es del ARRAY ENTERO (LWW, como el legacy) — la edición es
 * admin-only y de baja frecuencia; el merge por-ingreso queda como mejora futura.
 * Un 403 (contraseña equivocada) olvida la pass cacheada, como `_olvidarAdminPass`.
 */
export function useIngresos(marca: Marca, esAdmin: boolean, cred: { user: string; obtenerPass: () => string }): EstadoIngresos {
  const [data, setData] = useState<Ingreso[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cargado, setCargado] = useState(false)
  const [estadoGuardado, setEstadoGuardado] = useState<EstadoGuardado>('')
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((t) => t + 1), [])

  // Refs para el guardado con debounce (no re-crean `guardar` en cada render).
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendienteRef = useRef<Ingreso[] | null>(null)
  const marcaRef = useRef(marca)
  const cargadoRef = useRef(false)
  const credRef = useRef(cred)
  useEffect(() => {
    marcaRef.current = marca
  }, [marca])
  useEffect(() => {
    cargadoRef.current = cargado
  }, [cargado])
  useEffect(() => {
    credRef.current = cred
  }, [cred])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      setError(null)
      setData(null)
      setCargado(false)
      const r = await leerIngresos<Ingreso>(marca)
      if (!vivo) return
      if (r.ok) {
        setData(r.dato.map((g) => normalizar(g, nuevoId)))
        setCargado(true)
      } else {
        setData(null)
        setCargado(false)
        setError(r.motivo)
      }
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  // Flush del timer pendiente al desmontar (no perder el último cambio).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const guardar = useCallback(
    (mutar: (l: Ingreso[]) => Ingreso[]) => {
      if (!esAdmin) return
      setData((prev) => {
        const next = mutar(prev ?? [])
        pendienteRef.current = next
        return next
      })
      if (!cargadoRef.current) return // sin lectura previa: no se persiste (borraría todo)
      setEstadoGuardado('guardando')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        const lista = (pendienteRef.current ?? []).map(conItemsDerivados)
        const marcaAhora = marcaRef.current
        const r = await guardarIngresos({
          store: marcaAhora,
          ingresos: lista,
          adminUser: credRef.current.user,
          adminPass: credRef.current.obtenerPass(),
          cargado: cargadoRef.current,
        })
        if (r.ok) {
          setEstadoGuardado('ok')
        } else {
          if (r.prohibido) guardarAdminPass('') // pass equivocada: se re-pide en el próximo guardado
          setEstadoGuardado('error')
        }
      }, 600)
    },
    [esAdmin],
  )

  return { data, cargando, error, cargado, estadoGuardado, recargar, guardar }
}
