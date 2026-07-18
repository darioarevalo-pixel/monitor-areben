'use client'

import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useMonitorStore } from '@/store/useMonitorStore'
import { userRole } from '@/lib/permisos'
import { dispararSyncStock } from '@/lib/sync-gn'

/**
 * "🔄 Actualizar inventario": dispara el sync rápido de stock en GN, espera a que
 * termine y recarga el store. Port de dispararSyncInv (index.html:10585). Es la única
 * pieza de `productos` que toca GN, pero sólo DISPARA el sync (no escribe stock ni
 * ventas). El disparo+polling compartido vive en `lib/sync-gn.ts` (lo reusa caducados).
 */
export function BotonActualizarInventario() {
  const { marca, perfil } = useSesion()
  const cargar = useMonitorStore((s) => s.cargar)
  const [syncing, setSyncing] = useState(false)
  const [label, setLabel] = useState('🔄 Actualizar inventario')

  async function actualizar() {
    if (syncing) return
    setSyncing(true)
    try {
      const done = await dispararSyncStock(marca, setLabel)
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
