'use client'

/**
 * El estado de la sección Canjes: una sola lectura y todo lo derivado.
 *
 * El módulo cabe entero en memoria (decenas de canjes por mes, un padrón de cientos de personas),
 * así que se baja todo de una y los cruces se hacen acá. Nada de una request por ficha: la pregunta
 * que hay que contestar rápido — "¿a quién no llamamos hace rato?" — necesita ver todo junto.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConfirmar, useToast } from '@/components/ui'
import {
  borrarPersona, leerCanjes, type CanjeVencido, type CanjeVisible, type DatosCanjes, type VitrinaEnLista,
} from '@/lib/canjes/cliente'
import { calcularPuntaje, contextoDePuntaje, type ContextoPuntaje, type Puntaje } from '@/lib/canjes/puntaje'
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
  /**
   * El puntaje, que la mayor parte del tiempo va a ser `hay: false` — hace falta un mínimo de
   * canjes cerrados. Ver el encabezado de `lib/canjes/puntaje.ts`.
   */
  _puntaje: Puntaje
}

export type EstadoCanjes = {
  personas: PersonaEnLista[]
  /**
   * Contra qué se compara el rendimiento en el puntaje. Sale del padrón entero y por eso viaja: la
   * ficha de una persona no puede armarlo sola sin dar un número distinto al de la lista.
   */
  ctxPuntaje: ContextoPuntaje
  canjes: CanjeVisible[]
  /** Resumido por el servidor: qué canjes tienen entregables obligatorios vencidos. */
  vencidos: CanjeVencido[]
  config: CanjeConfig | null
  /** Las de todas las marcas visibles: el modal de propuesta deja elegir la marca. */
  configs: CanjeConfig[]
  /** Sin sus productos: acá alcanza el nombre para colgarle una vitrina a un canje. */
  vitrinas: VitrinaEnLista[]
  marcasVisibles: CanjeStore[]
  cargando: boolean
  error: string | null
  recargar: () => Promise<void>
  /** Aplica un cambio local sin re-pedir todo: la ficha se siente instantánea. */
  parchearPersona: (p: CanjePersona) => void
}

const VACIO: DatosCanjes = { personas: [], canjes: [], vencidos: [], config: null, configs: [], vitrinas: [], marcasVisibles: [] }

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

  const { personas, ctxPuntaje } = useMemo<{ personas: PersonaEnLista[]; ctxPuntaje: ContextoPuntaje }>(() => {
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

    // El contexto del puntaje se arma UNA vez para todo el padrón: la mediana de CPM tiene que ser
    // la misma para todas, o dos personas idénticas darían puntajes distintos.
    const ctx = contextoDePuntaje(datos.personas.map((p) => ({ canjes: porPersona.get(p.id) || [] })))

    const lista = datos.personas.map((p) => {
      const suyos = porPersona.get(p.id) || []
      return {
        ...p,
        _canjes: suyos,
        _seg: estadoDeContacto(p, suyos, hoy),
        _nombre: nombrePersona(p),
        _cerrados: suyos.filter((c) => c.estado === 'cerrado').length,
        _puntaje: calcularPuntaje(p, suyos, ctx),
      }
    })
    return { personas: ordenarPorContacto(lista), ctxPuntaje: ctx }
  }, [datos.personas, datos.canjes])

  return {
    personas,
    ctxPuntaje,
    canjes: datos.canjes,
    vencidos: datos.vencidos,
    config: datos.config,
    configs: datos.configs,
    vitrinas: datos.vitrinas,
    marcasVisibles: datos.marcasVisibles,
    cargando,
    error,
    recargar,
    parchearPersona,
  }
}

/**
 * Sacar a alguien del padrón, desde donde sea.
 *
 * Vive acá y no en la ficha porque se borra desde dos lugares —la fila de la lista y la ficha
 * abierta— y es el mismo acto: lo que se lee antes de aceptar no puede depender de por dónde se
 * entró. Lo que **no** decide este hook es si se puede borrar: eso lo sabe el servidor, que ve los
 * canjes de todas las marcas y contesta 409 explicando que se vete en vez de borrar. Ese texto se
 * muestra tal cual.
 */
export function useBorrarPersona(store: CanjeStore) {
  const toast = useToast()
  const { confirmar } = useConfirmar()

  return useCallback(
    async (persona: { id: number; nombre: string }, alBorrar: () => void | Promise<void>) => {
      const ok = await confirmar({
        titulo: `Borrar a ${persona.nombre} del padrón`,
        mensaje: 'Se va la ficha entera con sus notas y sus archivos. No se puede deshacer.',
        ok: 'Borrar',
        tono: 'danger',
      })
      if (!ok) return false
      try {
        await borrarPersona(store, persona.id)
        await alBorrar()
        return true
      } catch (e) {
        toast.error(String((e as Error)?.message || e))
        return false
      }
    },
    [store, confirmar, toast],
  )
}
