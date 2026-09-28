'use client'

/**
 * La comunidad mayorista, adentro del panel de WhatsApp.
 *
 * Dos fuentes, en este orden de confianza:
 *
 *   1. **La que manda la extensión** (`tipo: 'comunidad'`): la lee de WhatsApp Web en ese momento.
 *   2. **La guardada en el KV**: la última que mandó alguna extensión. Sirve mientras WhatsApp no
 *      terminó de cargar la comunidad, que pasa seguido (ver `extension/pagina.js`).
 *
 * 🔑 **Guardarla es trabajo del panel, no de la extensión.** El panel corre en el origen del
 * monitor y ya tiene la sesión; la extensión no tiene credenciales y así se queda. Se guarda sólo
 * si cambió quién está o si la guardada tiene más de un día (`fotoDistinta`): el panel vive abierto
 * horas y la extensión la reenvía cada minuto.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { fotoDistinta, indexarComunidad, type FotoComunidad, type IndiceComunidad } from '@/lib/crm/comunidad'
import { guardarComunidad, leerComunidad } from '@/lib/kv/cliente'

/** Lo que WhatsApp todavía no dejó leer. Se muestra en el panel porque tiene arreglo a mano. */
export type AvisoComunidad = 'no-encontrada' | 'sin-cargar' | null

export type Comunidad = {
  indice: IndiceComunidad
  actualizado: string
  /** `true` si es la que acaba de leer la extensión; `false` si es la guardada. */
  enVivo: boolean
}

export function useComunidad(): { comunidad: Comunidad | null; aviso: AvisoComunidad } {
  const [foto, setFoto] = useState<(FotoComunidad & { enVivo: boolean }) | null>(null)
  const [aviso, setAviso] = useState<AvisoComunidad>(null)
  const guardada = useRef<FotoComunidad | null>(null)
  const leida = useRef(false)
  const guardando = useRef(false)

  useEffect(() => {
    let activo = true
    // La pendiente de guardar si llega de la extensión antes de terminar de leer la guardada.
    let pendiente: FotoComunidad | null = null

    const guardarSiHaceFalta = async (f: FotoComunidad) => {
      if (!leida.current) {
        pendiente = f
        return
      }
      if (guardando.current || !fotoDistinta(guardada.current, f.tels)) return
      guardando.current = true
      const r = await guardarComunidad('bdi', { tels: f.tels, grupo: f.grupo, participantes: f.participantes })
      guardando.current = false
      // Un rechazo del servidor (la foto bajó de golpe) no se le muestra a nadie en el chat: se
      // sigue mostrando la que llegó, y la guardada queda como estaba. Queda en la consola.
      if (r.ok) guardada.current = { ...f, actualizado: new Date().toISOString() }
      else console.warn('[BDI] comunidad no guardada:', r.motivo)
    }

    ;(async () => {
      const r = await leerComunidad<FotoComunidad>('bdi')
      if (!activo) return
      leida.current = true
      if (r.ok && r.dato && Array.isArray(r.dato.tels)) {
        guardada.current = r.dato
        setFoto((f) => f || { ...r.dato!, enVivo: false })
      }
      if (pendiente) guardarSiHaceFalta(pendiente)
    })()

    const alMensaje = (e: MessageEvent) => {
      if (e.source !== window.parent) return
      const d = e.data
      if (!d || d.fuente !== 'bdi-crm-panel' || d.tipo !== 'comunidad') return
      if (d.estado === 'no-encontrada' || d.estado === 'sin-cargar') {
        setAviso(d.estado)
        return
      }
      const tels = Array.isArray(d.tels) ? d.tels.map((t: unknown) => String(t).replace(/\D/g, '')).filter(Boolean) : []
      if (!tels.length) return
      setAviso(null)
      const f: FotoComunidad = {
        tels,
        grupo: String(d.grupo || ''),
        participantes: Number(d.participantes) || tels.length,
        actualizado: new Date().toISOString(),
      }
      setFoto({ ...f, enVivo: true })
      guardarSiHaceFalta(f)
    }
    window.addEventListener('message', alMensaje)
    try {
      window.parent.postMessage({ fuente: 'bdi-crm-panel', tipo: 'que-comunidad' }, '*')
    } catch {}
    return () => {
      activo = false
      window.removeEventListener('message', alMensaje)
    }
  }, [])

  const comunidad = useMemo<Comunidad | null>(
    () => (foto ? { indice: indexarComunidad(foto.tels), actualizado: foto.actualizado, enVivo: foto.enVivo } : null),
    [foto],
  )
  return { comunidad, aviso }
}
