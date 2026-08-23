'use client'

/**
 * El estado de la serie diaria. Molde de `usePedidosClientes`: la carga adentro de una IIFE con
 * bandera `vivo`, que es el patrón del repo.
 *
 * 🔴 **Cuelga de la marca, y al cambiarla la serie se VACÍA antes de pedir la nueva.** Lo que se
 * dibuja acá son barras y totales: mientras viaja el pedido, la serie vieja **no se lee como «está
 * cargando»**, se lee como la venta de la marca que dice el rótulo. Es exactamente el defecto que
 * costó el arreglo del store del ETL el 18-ago-2026.
 */

import { useEffect, useState } from 'react'
import { leerSerieDiaria, type RespuestaSerie } from '@/lib/ventas-diarias/cliente'

export function useVentasDiarias(marca: string | null, dias: number) {
  const [serie, setSerie] = useState<RespuestaSerie | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!marca) return
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      setSerie(null)
      try {
        const r = await leerSerieDiaria(marca, dias)
        if (vivo) setSerie(r)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer la venta diaria.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, dias])

  return { serie, cargando, error }
}
