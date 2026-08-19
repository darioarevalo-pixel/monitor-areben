'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { guardarAdminPass, type ObtenerCred } from '@/lib/sesion'
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
   * 600 ms, como el legacy). Sin permiso de escritura o sin `cargado`, no hace nada.
   *
   * `luego` avisa **si el KV se lo quedó** (`false` también cuando no se intentó). Existe por un
   * caso que no se puede deshacer: sacar un ítem de la galería borra el archivo del Blob, y hacerlo
   * cuando el guardado falló destruye el archivo de un ítem que al recargar vuelve a aparecer, con
   * la URL muerta. Todo lo demás es texto y una recarga lo repone; un archivo borrado, no.
   */
  guardar: (mutar: (l: Ingreso[]) => Ingreso[], luego?: (guardado: boolean) => void) => void
}

/**
 * Carga y persistencia de Ingresos proyectados. Port de ingInit/ingGuardar
 * (index.html:3931/3946): lee el KV (forma `{ingresos}`, la clave default del
 * endpoint), normaliza el formato viejo, y guarda con debounce.
 *
 * Sobre el legacy agrega la disciplina del seam: el flag `cargado` viaja hacia
 * afuera y bloquea todo guardado sin lectura previa (el modo de falla que casi borra
 * el KV). El guardado es del ARRAY ENTERO (LWW, como el legacy) — la edición es de
 * baja frecuencia; el merge por-ingreso queda como mejora futura.
 * Un 403 (contraseña equivocada) olvida la pass cacheada, como `_olvidarAdminPass`.
 *
 * `puedeEscribir` es un booleano y no `esAdmin` a propósito: quién puede escribir lo decide el
 * llamador con los permisos granulares (`ingresos.editar` / `ingresos.nombre`), y el hook solo
 * obedece. Cuando el candado vivía acá adentro, "poner el nombre de un diseño" pedía el mismo
 * poder que borrar una importación entera, y no había forma de aflojarlo sin abrirlo todo.
 */
export function useIngresos(marca: Marca, puedeEscribir: boolean, obtenerCred: ObtenerCred): EstadoIngresos {
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
  /** Los avisos de "¿quedó guardado?" del lote que junte el debounce. Se corren todos juntos. */
  const avisosRef = useRef<((guardado: boolean) => void)[]>([])
  const marcaRef = useRef(marca)
  const cargadoRef = useRef(false)
  const credRef = useRef(obtenerCred)
  useEffect(() => {
    marcaRef.current = marca
  }, [marca])
  useEffect(() => {
    cargadoRef.current = cargado
  }, [cargado])
  useEffect(() => {
    credRef.current = obtenerCred
  }, [obtenerCred])

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
    (mutar: (l: Ingreso[]) => Ingreso[], luego?: (guardado: boolean) => void) => {
      if (!puedeEscribir) {
        luego?.(false)
        return
      }
      setData((prev) => {
        const next = mutar(prev ?? [])
        pendienteRef.current = next
        return next
      })
      if (!cargadoRef.current) {
        luego?.(false)
        return // sin lectura previa: no se persiste (borraría todo)
      }
      if (luego) avisosRef.current.push(luego)
      setEstadoGuardado('guardando')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        const lista = (pendienteRef.current ?? []).map(conItemsDerivados)
        const marcaAhora = marcaRef.current
        const r = await guardarIngresos({
          store: marcaAhora,
          ingresos: lista,
          cred: await credRef.current(),
          cargado: cargadoRef.current,
        })
        if (r.ok) {
          setEstadoGuardado('ok')
        } else {
          if (r.prohibido) guardarAdminPass('') // pass equivocada: se re-pide en el próximo guardado
          setEstadoGuardado('error')
        }
        // El lote entero comparte suerte: se guarda el array completo, así que o entró todo o nada.
        const avisos = avisosRef.current
        avisosRef.current = []
        avisos.forEach((f) => f(r.ok))
      }, 600)
    },
    [puedeEscribir],
  )

  return { data, cargando, error, cargado, estadoGuardado, recargar, guardar }
}
