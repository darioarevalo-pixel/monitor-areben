'use client'

/**
 * Los planes por pasos, del lado de la pantalla: leerlos, avanzarlos y cancelarlos.
 *
 * # La decisión que ordena este hook: el bucle lo maneja la PANTALLA, no el servidor
 *
 * Un avance ejecuta los pasos que le entren en el request y contesta `seguir`. Si el bucle viviera
 * del lado del servidor, un plan de 12 pasos moriría por límite de función en la mitad y nadie
 * sabría en cuál. Acá, cada vuelta deja su estado escrito en la base, así que **se puede cerrar la
 * pestaña y seguir mañana** — que es el síntoma que el motor existe para curar.
 *
 * 🔑 **Y por eso `pausa` no es un detalle.** `seguir: true` sólo dice que quedan pasos; con `pausa`
 * el servidor además dice «el freno lo arregla el tiempo» (Meta terminando de armar una copia, una
 * llamada que se cortó). Sin esa distinción, el bucle vuelve enseguida a recibir el mismo «todavía
 * no» y lo único que consigue es gastar cupo de Meta contra un rate limit.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { avanzarPlan, cancelarPlan, traerPlanes } from '@/lib/meta-ads/cliente'
import type { Plan } from '@/lib/meta-ads/planes'

/** Cuántas vueltas seguidas da el bucle antes de soltar. Es un tope, no un objetivo. */
const VUELTAS_MAX = 12

/**
 * **El bucle del avance, una sola implementación.** La usan el Panel y el modal que acaba de armar
 * un plan.
 *
 * Está suelta y no adentro del hook porque son **dos pantallas con el mismo bucle**, y ese bucle
 * tiene una decisión adentro —cuándo parar— que no puede estar escrita dos veces: la versión que se
 * olvide de mirar `pausa` va a martillar a Meta hasta el rate limit sin que se note en la otra.
 */
export async function avanzarHasta(
  id: number,
  alPlan: (p: Plan) => void,
  sigueVivo: () => boolean = () => true,
): Promise<string | null> {
  for (let vuelta = 0; vuelta < VUELTAS_MAX; vuelta++) {
    const r = await avanzarPlan(id)
    if (!sigueVivo()) return null
    if (!r.ok) return r.motivo
    alPlan(r.dato.plan)
    // ⛔ Se corta con `pausa` aunque queden pasos: volver enseguida sólo gasta llamadas para recibir
    // el mismo «todavía no».
    if (!r.dato.seguir || r.dato.pausa) return r.dato.motivo || null
  }
  return 'Quedan pasos: apretá Seguir para continuar.'
}

export type EstadoPlanes =
  | { fase: 'cargando' }
  | { fase: 'error'; motivo: string }
  | { fase: 'ok' }

export type Planes = {
  estado: EstadoPlanes
  planes: Plan[]
  /** El plan que se está avanzando ahora mismo, para deshabilitar su botón. */
  avanzando: number | null
  /**
   * Lo último que dijo el servidor al frenar un avance, **con el plan al que corresponde**. Va
   * atado al id y no suelto: con varios planes en la lista, un motivo global se dibujaría abajo de
   * todos y diría de uno lo que le pasó a otro.
   */
  motivo: { id: number; texto: string } | null
  recargar: () => void
  /** Avanza hasta que no queden pasos o hasta que el servidor pida esperar. */
  seguir: (id: number) => Promise<void>
  cancelar: (id: number) => Promise<{ ok: boolean; motivo?: string; hechosAntes?: number }>
}

export function usePlanes(): Planes {
  const [estado, setEstado] = useState<EstadoPlanes>({ fase: 'cargando' })
  const [planes, setPlanes] = useState<Plan[]>([])
  const [avanzando, setAvanzando] = useState<number | null>(null)
  const [motivo, setMotivo] = useState<{ id: number; texto: string } | null>(null)
  // Para no escribir estado sobre un componente ya desmontado cuando el bucle vuelve.
  const vivo = useRef(true)
  useEffect(() => () => { vivo.current = false }, [])

  // 🔑 **Pedir de nuevo es un cambio de DEPENDENCIA del efecto, no una llamada suelta.** Es el mismo
  // patrón de `useCampanias`: la lectura vive adentro del efecto y `recargar()` sólo corre el
  // contador. Llamar a la función desde afuera del efecto pone `setState` sincrónico en el cuerpo del
  // efecto, que es lo que React desaconseja y lo que el lint del repo corta.
  const [pedido, setPedido] = useState(0)
  const recargar = useCallback(() => { setPedido((n) => n + 1) }, [])

  useEffect(() => {
    let sigue = true
    void traerPlanes().then((r) => {
      if (!sigue) return
      if (!r.ok) { setEstado({ fase: 'error', motivo: r.motivo }); return }
      setPlanes(r.dato.planes || [])
      setEstado({ fase: 'ok' })
    })
    return () => { sigue = false }
  }, [pedido])

  /** Reemplaza un plan en la lista sin volver a pedir todo: el avance ya devuelve cómo quedó. */
  const pisar = useCallback((p: Plan) => {
    setPlanes((prev) => {
      const i = prev.findIndex((x) => x.id === p.id)
      if (i < 0) return [p, ...prev]
      const out = [...prev]
      out[i] = p
      return out
    })
  }, [])

  const seguir = useCallback(async (id: number) => {
    setAvanzando(id)
    setMotivo(null)
    try {
      const texto = await avanzarHasta(id, pisar, () => vivo.current)
      if (vivo.current) setMotivo(texto ? { id, texto } : null)
    } finally {
      if (vivo.current) setAvanzando(null)
    }
  }, [pisar])

  const cancelar = useCallback(async (id: number) => {
    const r = await cancelarPlan(id)
    if (!r.ok) return { ok: false, motivo: r.motivo }
    if (vivo.current) {
      // Un plan cancelado deja de estar vivo, así que se va de la lista del Panel. Sigue existiendo
      // en el Registro: cancelar no lo borra, deja de avanzarlo.
      setPlanes((prev) => prev.filter((p) => p.id !== id))
    }
    return { ok: true, hechosAntes: r.dato.hechosAntes }
  }, [])

  return { estado, planes, avanzando, motivo, recargar, seguir, cancelar }
}
