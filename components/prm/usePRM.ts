'use client'

/**
 * El estado del PRM: el padrón con su resumen, y los nombres para los dos desplegables de enganche.
 *
 * 🔴 **`cargando` es del PADRÓN SOLO, y las opciones van por su cuenta.** Los dos pedidos estaban
 * en un `Promise.all` con una sola bandera, así que la lista —que ⛔ no usa las opciones: son de
 * los dos desplegables de la ficha— esperaba al más lento de los dos. Medido el 3-sep-2026 en
 * prod: padrón **679 ms**, opciones **925 ms** ⇒ la tabla aparecía 246 ms tarde por un dato que
 * esa pantalla no dibuja.
 *
 * 🔑 **Por eso `opciones` arranca en `null` y ⛔ no en una lista vacía.** Vacío afirma: con
 * `gnDisponible: false` la ficha dice «no se pudo leer el catálogo de Zattia» de algo que todavía
 * está viajando. `null` es «todavía no llegó», y la ficha espera.
 */
import { useCallback, useEffect, useState } from 'react'
import { leerOpciones, leerPadron, type LocalConResumen, type Opciones } from '@/lib/prm/cliente'

/** Lo que queda cuando el pedido de opciones FALLÓ. ⛔ No es el valor inicial: ese es `null`. */
const SIN_OPCIONES: Opciones = { deIngresos: [], deGn: [], gnDisponible: false }

export function usePRM(marca: string | null) {
  const [locales, setLocales] = useState<LocalConResumen[]>([])
  const [opciones, setOpciones] = useState<Opciones | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!marca) return
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      try {
        const p = await leerPadron(marca)
        if (!vivo) return
        setLocales(p)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo leer el PRM.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  /**
   * ⛔ Su falla ⛔ no pone el cartel de error de la sección: la lista anda entera sin esto, y un rojo
   * arriba de una pantalla que funciona manda a arreglar lo que no está roto. Lo que sí pasa es que
   * `opciones` queda en `SIN_OPCIONES`, que es lo que la ficha ya sabe explicar («no se pudo leer
   * el catálogo… la lista está vacía por eso, ⛔ no porque no haya»). 🔴 ⛔ Dejarlo en `null` sería
   * peor que el cartel: la ficha se quedaría girando para siempre.
   */
  useEffect(() => {
    if (!marca) return
    let vivo = true
    void (async () => {
      try {
        const o = await leerOpciones(marca)
        if (vivo) setOpciones(o)
      } catch {
        if (vivo) setOpciones(SIN_OPCIONES)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  return { locales, opciones, cargando, error, recargar }
}
