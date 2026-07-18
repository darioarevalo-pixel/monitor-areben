'use client'

import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useMonitorStore } from '@/store/useMonitorStore'
import { userRole } from '@/lib/permisos'

/**
 * "🔄 Actualizar inventario": dispara el sync rápido de stock en el servidor de GN y
 * espera a que termine (polling ~cada 8s, hasta 7 min), después recarga los datos.
 * Port de dispararSyncInv (index.html:10585). Es la única pieza de `productos` que
 * toca GN, pero sólo DISPARA el sync de la plataforma (no escribe stock ni ventas).
 *
 * Se mantiene el patrón del legacy (texto del botón como estado + alert final); es
 * el mismo que el equipo ya usa. `_invSyncing` global del legacy → estado local.
 */
const SYNC_API = 'https://bdi-catalogo.vercel.app/api/sync'

export function BotonActualizarInventario() {
  const { marca, perfil } = useSesion()
  const cargar = useMonitorStore((s) => s.cargar)
  const [syncing, setSyncing] = useState(false)
  const [label, setLabel] = useState('🔄 Actualizar inventario')

  async function actualizar() {
    if (syncing) return
    setSyncing(true)
    try {
      // Run de referencia para detectar cuándo arranca uno nuevo.
      let baseId: string | null = null
      try {
        const r0 = await fetch(`${SYNC_API}?store=${marca}&nc=${Math.random()}`)
        const d0 = await r0.json()
        baseId = d0.run ? d0.run.id : null
      } catch {
        /* seguimos sin baseId */
      }

      setLabel('⏳ Pidiendo a GN…')
      const r = await fetch(SYNC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: marca }),
      })
      const d = await r.json()
      if (!d.ok) {
        alert('No se pudo iniciar la actualización de inventario.\n' + (d.error || '') + (d.detalle ? '\n' + d.detalle : ''))
        return
      }

      const t0 = Date.now()
      const MAX = 7 * 60 * 1000
      let done = false
      while (Date.now() - t0 < MAX) {
        await new Promise((res) => setTimeout(res, 8000))
        const secs = Math.round((Date.now() - t0) / 1000)
        setLabel(`⏳ Actualizando inventario… ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`)
        try {
          const rr = await fetch(`${SYNC_API}?store=${marca}&nc=${secs}`)
          const dd = await rr.json()
          if (dd.run && dd.run.id !== baseId && dd.run.status === 'completed') {
            done = true
            break
          }
        } catch {
          /* reintenta */
        }
      }

      setLabel('↻ Recargando…')
      await cargar(marca, userRole(perfil), true)
      if (done) alert('✅ Inventario actualizado (' + marca.toUpperCase() + ').')
      else
        alert(
          'La actualización está tardando más de lo normal. Te muestro lo último disponible; si falta algo, volvé a tocar "Actualizar inventario" en un minuto.',
        )
    } catch (e) {
      alert('Error al actualizar inventario: ' + (e as Error).message)
    } finally {
      setSyncing(false)
      setLabel('🔄 Actualizar inventario')
    }
  }

  return (
    <button
      className="btn-sm"
      onClick={actualizar}
      disabled={syncing}
      title="Trae el stock más nuevo desde Gestión Nube (~2 min)"
      style={{ background: '#fff', border: '1px solid #D1D5DB', whiteSpace: 'nowrap' }}
    >
      {label}
    </button>
  )
}
