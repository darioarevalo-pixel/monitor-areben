'use client'

/**
 * El umbral de una línea: leerlo, editarlo en la pantalla y guardarlo.
 *
 * # Las tres decisiones
 *
 * 1. 🔑 **Lo editado y lo guardado son dos cosas distintas, y las dos están a la vista.** Guardar
 *    es un botón, no un efecto: este número es lo que todas las demás pantallas leen como «rinde»,
 *    y un autoguardado convertiría cada arrastre de deslizador —hay uno que va de 10% a 100%— en
 *    una decisión de negocio publicada. Mientras no se apriete, `sucio` es `true` y la pantalla lo
 *    dice.
 * 2. 🔑 **Cambiar de línea remonta todo.** Cada línea es su propia economía; arrastrar lo editado
 *    de BDI a la pestaña de Zattia sería mostrarle a Zattia números de otro producto.
 * 3. ⚠️ **Una línea sin fila propia arranca con los DEFAULTS, que son los de BDI, y `guardado` es
 *    `false`.** El cartel de la pantalla cuelga de ahí. Un default que se hace pasar por un dato
 *    medido es peor que no tener nada.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULTS, guardarRentabilidad, leerRentabilidad,
  type Guardado, type Supuestos,
} from '@/lib/meta-ads/rentabilidad'
import type { LineaPauta } from '@/lib/meta-ads/tipos'

export type EstadoRentabilidad = {
  /** Lo que se está viendo y calculando: lo guardado más lo que se tocó desde entonces. */
  supuestos: Supuestos
  cambiar: <K extends keyof Supuestos>(k: K, v: Supuestos[K]) => void
  /** Hay cambios sin guardar. */
  sucio: boolean
  /** Volver a lo último guardado (o a los defaults, si la línea no tiene nada). */
  descartar: () => void
  guardar: () => Promise<void>
  guardando: boolean
  /** Cómo vino lo guardado: si existe, quién lo dejó así y cuándo. */
  origen: Pick<Guardado, 'guardado' | 'por' | 'cuando'>
  /** Sólo un admin edita. Con `false` la pantalla se dibuja de lectura. */
  puedeEditar: boolean
  cargando: boolean
  /** Lo que falló, si falló: leer o guardar. La pantalla lo muestra, no lo esconde. */
  error: string | null
}

const SIN_GUARDAR = { guardado: false, por: null, cuando: null }

export function useRentabilidad(linea: LineaPauta): EstadoRentabilidad {
  const [supuestos, setSupuestos] = useState<Supuestos>(DEFAULTS)
  const [base, setBase] = useState<Supuestos>(DEFAULTS)
  const [origen, setOrigen] = useState<EstadoRentabilidad['origen']>(SIN_GUARDAR)
  const [puedeEditar, setPuedeEditar] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // La línea que se está mirando AHORA. Una respuesta que llega tarde, después de cambiar de
  // pestaña, no pisa lo de la línea nueva — el mismo recaudo que toma `useCfgComisiones`.
  //
  // Se sincroniza en un efecto y no durante el render porque el lint del repo prohíbe escribir un
  // ref mientras se pinta. Va declarado ANTES del que carga: los efectos corren en el orden en que
  // están escritos, así que cuando el de abajo mira el ref, ya dice la línea nueva.
  const lineaRef = useRef(linea)
  useEffect(() => {
    lineaRef.current = linea
  }, [linea])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      setError(null)
      try {
        const r = await leerRentabilidad(linea)
        if (!vivo || lineaRef.current !== linea) return
        setSupuestos(r.supuestos)
        setBase(r.supuestos)
        setOrigen({ guardado: r.guardado, por: r.por, cuando: r.cuando })
        setPuedeEditar(r.puede.editar)
      } catch (e) {
        if (!vivo || lineaRef.current !== linea) return
        // Se cae a los defaults y se avisa. Dejar la pantalla en blanco esconde que el umbral
        // existe; mostrarlo callado haría pasar el default por el dato de la línea.
        setSupuestos(DEFAULTS)
        setBase(DEFAULTS)
        setOrigen(SIN_GUARDAR)
        setPuedeEditar(false)
        setError(e instanceof Error ? e.message : 'No se pudo leer el umbral.')
      } finally {
        if (vivo && lineaRef.current === linea) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [linea])

  const cambiar = useCallback(<K extends keyof Supuestos>(k: K, v: Supuestos[K]) => {
    setSupuestos((prev) => ({ ...prev, [k]: v }))
  }, [])

  const descartar = useCallback(() => setSupuestos(base), [base])

  const guardar = useCallback(async () => {
    setGuardando(true)
    setError(null)
    try {
      const r = await guardarRentabilidad(linea, supuestos)
      if (lineaRef.current !== linea) return
      // Lo que vuelve del servidor es lo que QUEDÓ guardado, ya normalizado: si algo se recortó
      // contra su borde, se ve acá y no la próxima vez que alguien abra la pantalla.
      setSupuestos(r.supuestos)
      setBase(r.supuestos)
      setOrigen({ guardado: r.guardado, por: r.por, cuando: r.cuando })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }, [linea, supuestos])

  const sucio = (Object.keys(base) as Array<keyof Supuestos>).some((k) => base[k] !== supuestos[k])

  return { supuestos, cambiar, sucio, descartar, guardar, guardando, origen, puedeEditar, cargando, error }
}
