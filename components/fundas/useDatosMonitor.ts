'use client'

import { useEffect } from 'react'
import { useMonitorStore } from '@/store/useMonitorStore'
import { useSesion } from '@/components/SesionProvider'
import { userRole } from '@/lib/permisos'
import type { DatosETL } from '@/lib/etl/tipos'
import type { EstadoCarga } from '@/store/useMonitorStore'

/**
 * El hook que conecta una sección al store del ETL. Dispara la carga de la marca
 * de la sesión al montar y expone el estado.
 *
 * **Genérico a propósito.** Fundas es el primer consumidor del store en prod, y
 * este hook es el que van a copiar las otras 21 secciones migradas. Por eso no
 * mezcla nada de Fundas: pide `cargar(marca, rol)` y devuelve `{datos, estado}`.
 *
 * NO es como `useCRM`: ese fetchea sus propios datos y no toca el store. El CRM
 * no era consumidor del ETL; Fundas sí, y el ciclo `cargar → 'listo'` es del
 * store, no de un hook por sección.
 *
 * `datos` se devuelve solo cuando el store ya publicó la marca pedida: mientras
 * cambia de marca podría tener los datos de la anterior, y una tabla con esos
 * números sería un A/B falso.
 */
export function useDatosMonitor(): { datos: DatosETL | null; estado: EstadoCarga; error: string | null } {
  const { perfil, marca } = useSesion()
  const cargar = useMonitorStore((s) => s.cargar)
  const datos = useMonitorStore((s) => s.datos)
  const estado = useMonitorStore((s) => s.estado)
  const error = useMonitorStore((s) => s.error)
  const marcaCargada = useMonitorStore((s) => s.marca)

  useEffect(() => {
    cargar(marca, userRole(perfil))
  }, [marca, perfil, cargar])

  const listoParaEstaMarca = estado === 'listo' && marcaCargada === marca
  return { datos: listoParaEstaMarca ? datos : null, estado, error }
}
