'use client'

/**
 * Carga y persistencia de "Atención al cliente". Mismo arreglo que `useCupones`: la lectura vive
 * adentro de un efecto con bandera `vivo` (cambiar de marca a mitad de camino no puede pisar la
 * lista con la respuesta vieja), y las escrituras son optimistas con vuelta atrás.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { borrarItem, guardarItems, leerAtencion } from '@/lib/atencion/cliente'
import type { ItemAtencion, ModeloTienda } from '@/lib/atencion/tipos'

export function useAtencion(marca: Marca) {
  const [items, setItems] = useState<ItemAtencion[] | null>(null)
  const [modelos, setModelos] = useState<ModeloTienda[]>([])
  const [desdeSemilla, setDesdeSemilla] = useState(false)
  const [puedeEditar, setPuedeEditar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let vivo = true
    void (async () => {
      setError(null)
      try {
        const d = await leerAtencion(marca)
        if (!vivo) return
        setItems(d.items)
        setModelos(d.modelos)
        setDesdeSemilla(!!d.desdeSemilla)
        setPuedeEditar(d.puede.editar)
      } catch (e) {
        if (!vivo) return
        setError((e as Error).message)
        setItems([]) // la pantalla se muestra igual: los modelos de la semilla siguen sirviendo
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  /**
   * Guarda y devuelve el error si lo hubo, o null. Se pinta primero y se vuelve atrás si el
   * servidor rechaza: esto se usa en el medio de una conversación con alguien, y esperar el ida y
   * vuelta para ver el cambio se siente roto.
   */
  const persistir = useCallback(
    async (fn: (l: ItemAtencion[]) => ItemAtencion[], aGuardar: ItemAtencion[]): Promise<string | null> => {
      let previo: ItemAtencion[] = []
      setItems((l) => {
        previo = l ?? []
        return fn(previo)
      })
      try {
        await guardarItems(marca, aGuardar)
        return null
      } catch (e) {
        setItems(previo)
        return (e as Error).message
      }
    },
    [marca],
  )

  const borrar = useCallback(
    async (id: string): Promise<string | null> => {
      let previo: ItemAtencion[] = []
      setItems((l) => {
        previo = l ?? []
        return previo.filter((i) => i.id !== id)
      })
      try {
        await borrarItem(marca, id)
        return null
      } catch (e) {
        setItems(previo)
        return (e as Error).message
      }
    },
    [marca],
  )

  return { items, modelos, desdeSemilla, puedeEditar, error, recargar, persistir, borrar }
}
