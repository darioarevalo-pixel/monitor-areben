'use client'

import { useCallback, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useMonitorStore } from '@/store/useMonitorStore'
import { userRole } from '@/lib/permisos'
import { color, useToast } from '@/components/ui'

/**
 * Releer el espejo de Supabase salteando el caché de IndexedDB (TTL 6 h, `lib/cache.ts`).
 * NO toca Gestión Nube — para eso está `BotonActualizarInventario`, que dispara el workflow
 * de GitHub Actions y tarda ~2 min.
 *
 * Existe porque las dos cosas vivían en un solo botón: el caso más común es "ya sincronicé,
 * mostrámelo", y ahí esperar el sync entero es tiempo tirado. Es la mitad barata de
 * `BotonActualizarInventario.tsx:27-29` (el `cargar(..., true)` sin el `dispararSyncStock`).
 *
 * El hook va aparte del botón porque cada sección usa su propio molde visual: Etiquetas monta
 * el `<BotonRecargar/>` (clase `btn-sm`, igual que su vecino) y Reposición lo cablea a un
 * `<Button>` del kit.
 */
export function useRecargarDatos(): { recargar: () => Promise<void>; cargando: boolean } {
  const toast = useToast()
  const { marca, perfil } = useSesion()
  const cargar = useMonitorStore((s) => s.cargar)
  const [cargando, setCargando] = useState(false)

  const recargar = useCallback(async () => {
    if (cargando) return
    setCargando(true)
    try {
      await cargar(marca, userRole(perfil), true)
      toast.ok('Datos recargados (' + marca.toUpperCase() + ')')
    } catch (e) {
      toast.error('No se pudo recargar: ' + (e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [cargando, cargar, marca, perfil, toast])

  return { recargar, cargando }
}

export function BotonRecargar() {
  const { recargar, cargando } = useRecargarDatos()
  return (
    <button
      className="btn-sm"
      onClick={() => void recargar()}
      disabled={cargando}
      title="Vuelve a leer los datos ya sincronizados, sin ir a Gestión Nube (~20 s)"
      style={{ background: '#fff', border: `1px solid ${color.line2}`, whiteSpace: 'nowrap' }}
    >
      {cargando ? '↻ Recargando…' : '↻ Recargar'}
    </button>
  )
}
