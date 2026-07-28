'use client'

/**
 * El estado de la sección Canjes: una sola lectura y todo lo derivado.
 *
 * El módulo cabe entero en memoria (decenas de canjes por mes, un padrón de cientos de personas),
 * así que se baja todo de una y los cruces se hacen acá. Nada de una request por ficha: la pregunta
 * que hay que contestar rápido — "¿a quién no llamamos hace rato?" — necesita ver todo junto.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { leerCanjes, type CanjeVencido, type CanjeVisible, type DatosCanjes } from '@/lib/canjes/cliente'
import { estadoDeContacto, ordenarPorContacto, type Seguimiento } from '@/lib/canjes/seguimiento'
import { nombrePersona, type CanjeConfig, type CanjePersona, type CanjeStore } from '@/lib/canjes/tipos'

/** Una persona con lo que la lista necesita ya calculado. */
export type PersonaEnLista = CanjePersona & {
  _seg: Seguimiento
  _nombre: string
  /** Sus canjes, de todas las marcas (los de otras, ciegos). */
  _canjes: CanjeVisible[]
  /** Cuántos cerró. Es lo primero que se mira antes de proponerle algo. */
  _cerrados: number
}

export type EstadoCanjes = {
  personas: PersonaEnLista[]
  canjes: CanjeVisible[]
  /** Resumido por el servidor: qué canjes tienen entregables obligatorios vencidos. */
  vencidos: CanjeVencido[]
  config: CanjeConfig | null
  marcasVisibles: CanjeStore[]
  cargando: boolean
  error: string | null
  recargar: () => Promise<void>
  /** Aplica un cambio local sin re-pedir todo: la ficha se siente instantánea. */
  parchearPersona: (p: CanjePersona) => void
}

const VACIO: DatosCanjes = { personas: [], canjes: [], vencidos: [], config: null, marcasVisibles: [] }

export function useCanjes(store: CanjeStore): EstadoCanjes {
  const [datos, setDatos] = useState<DatosCanjes>(VACIO)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** El botón "Actualizar". La carga inicial va por el efecto, que además cancela la anterior. */
  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setDatos(await leerCanjes(store))
    } catch (e) {
      setError(String((e as Error)?.message || e))
      setDatos(VACIO)
    } finally {
      setCargando(false)
    }
  }, [store])

  // La carga inicial, y la de cada cambio de marca. El flag `vivo` no es ceremonia: cambiar de
  // marca dos veces rápido dispara dos lecturas, y sin esto la primera en volver (que es la vieja)
  // pisa a la nueva y la pantalla queda mostrando la marca equivocada. Es el molde de Reclamos.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      // El setState va DENTRO del IIFE, no en el cuerpo del effect: el linter del repo rechaza el
      // setState síncrono en un effect (dispara renders en cascada). Mismo patrón que Reclamos.
      setCargando(true)
      try {
        const d = await leerCanjes(store)
        if (vivo) {
          setDatos(d)
          setError(null)
        }
      } catch (e) {
        if (vivo) {
          setError(String((e as Error)?.message || e))
          setDatos(VACIO)
        }
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [store])

  const parchearPersona = useCallback((p: CanjePersona) => {
    setDatos((d) => ({ ...d, personas: d.personas.map((x) => (x.id === p.id ? p : x)) }))
  }, [])

  const personas = useMemo<PersonaEnLista[]>(() => {
    // Un solo barrido para agrupar los canjes por persona: con el padrón entero en memoria, hacer
    // un `filter` por persona sería cuadrático y se nota a los cientos de fichas.
    const porPersona = new Map<number, CanjeVisible[]>()
    for (const c of datos.canjes) {
      const lista = porPersona.get(c.persona_id)
      if (lista) lista.push(c)
      else porPersona.set(c.persona_id, [c])
    }

    // `new Date()` una sola vez: si se llamara por persona, dos fichas de la misma lista se
    // medirían contra relojes distintos.
    const hoy = new Date()

    const lista = datos.personas.map((p) => {
      const suyos = porPersona.get(p.id) || []
      return {
        ...p,
        _canjes: suyos,
        _seg: estadoDeContacto(p, suyos, hoy),
        _nombre: nombrePersona(p),
        _cerrados: suyos.filter((c) => c.estado === 'cerrado').length,
      }
    })
    return ordenarPorContacto(lista)
  }, [datos.personas, datos.canjes])

  return {
    personas,
    canjes: datos.canjes,
    vencidos: datos.vencidos,
    config: datos.config,
    marcasVisibles: datos.marcasVisibles,
    cargando,
    error,
    recargar,
    parchearPersona,
  }
}
