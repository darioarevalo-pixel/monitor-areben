'use client'

/**
 * El estado de Faltantes. Molde de `useBuzon`: una lista, un contador de recargas, y la carga
 * adentro de una IIFE con bandera `vivo` —el patrón del repo— porque llamar a `setState` derecho en
 * el cuerpo de un efecto encadena renders y el lint lo rechaza.
 *
 * 🔴 **Cuelga de la marca, y al cambiarla la lista se VACÍA antes de pedir la nueva.** La tabla vive
 * en la base de cada marca (ver `api/_pedidos-clientes.js`), así que sin eso quedan dibujados los
 * faltantes de BDI bajo el rótulo de Zattia mientras viaja el pedido — y como acá lo que se muestra
 * son números agregados, no se lee como "está cargando": se lee como el ranking de la otra marca.
 * Es el mismo defecto que costó el arreglo del store del ETL el 18-ago-2026.
 */

import { useCallback, useEffect, useState } from 'react'
import { leerPedidos } from '@/lib/pedidos-clientes/cliente'
import type { PedidoCliente } from '@/lib/pedidos-clientes/tipos'

export function usePedidosClientes(marca: string | null) {
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([])
  /** Si esta persona puede decidir (conseguido / descartado) o sólo anotar. Lo contesta el servidor. */
  const [decidir, setDecidir] = useState(false)
  /**
   * El "ahora" contra el que se mide la ventana y la antigüedad. Se sella **cuando la lista llega**
   * y no en cada render: `Date.now()` adentro del render es impuro (el lint lo rechaza) y además
   * haría que el borde de la ventana se mueva entre dos filas del mismo dibujo.
   */
  const [ahora, setAhora] = useState(() => Date.now())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(async () => {
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!marca) return
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      setPedidos([])
      setDecidir(false)
      try {
        const r = await leerPedidos(marca)
        if (!vivo) return
        setPedidos(r.pedidos)
        setDecidir(r.decidir)
        setAhora(Date.now())
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudieron leer los faltantes.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  return { pedidos, decidir, ahora, cargando, error, recargar }
}
