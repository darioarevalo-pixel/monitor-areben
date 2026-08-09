'use client'

/**
 * El estado de la Biblioteca: los avisos del rango, los filtros y el marcado de favoritos.
 *
 * 🔑 **El pedido depende SÓLO del rango.** La cuenta, la línea y los filtros cortan en el browser
 * sobre la lista completa, que son ~60 avisos: hacer un viaje por cada click de filtro sería pagar
 * latencia para algo que se resuelve en un `filter`. El rango sí va al servidor porque cambia qué
 * días se leen de la foto.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMeta } from '@/components/meta-ads/ContextoMeta'
import {
  filtrar, FILTROS_VACIOS, ordenar, totalesDe,
  type AvisoBiblioteca, type ClaveOrden, type FiltrosBiblioteca, type RespuestaBiblioteca,
} from '@/lib/meta-ads/biblioteca'
import { marcarFavorito, traerBiblioteca } from '@/lib/meta-ads/cliente'

export type Cargable<T> = { fase: 'cargando' } | { fase: 'error'; motivo: string } | { fase: 'ok'; data: T }

export function useBiblioteca() {
  const { rango, cuenta, linea } = useMeta()

  /**
   * ⚠️ El resultado viaja **con su `key`** y «está cargando» se DERIVA de que la key no coincida,
   * en vez de un `setCargando(true)` arriba del efecto: `react-hooks/set-state-in-effect` lo prohíbe
   * en este repo con razón — un efecto que corrige el estado después de renderizar deja un cuadro
   * intermedio con el dato viejo. Mismo patrón que `ContextoMeta` y `useReglas`.
   */
  const [pedido, setPedido] = useState(0)
  const key = `${rango}#${pedido}`
  const [r, setR] = useState<{ key: string; e: Cargable<RespuestaBiblioteca> } | null>(null)

  useEffect(() => {
    let vivo = true
    void traerBiblioteca(rango).then((res) => {
      if (!vivo) return
      setR({ key, e: res.ok ? { fase: 'ok', data: res.dato } : { fase: 'error', motivo: res.motivo } })
    })
    return () => { vivo = false }
  }, [key, rango])

  const estado: Cargable<RespuestaBiblioteca> = useMemo(
    () => (!r || r.key !== key ? { fase: 'cargando' } : r.e),
    [r, key],
  )

  const [filtros, setFiltros] = useState<FiltrosBiblioteca>(FILTROS_VACIOS)
  const [orden, setOrden] = useState<ClaveOrden>('gasto')

  const todos = useMemo(() => (estado.fase === 'ok' ? estado.data.avisos : []), [estado])

  // El eje de la sección corta ANTES que los filtros propios de la pantalla: es el mismo criterio
  // que Campañas, donde el selector de cuenta filtra de verdad. Quien viene acá ya sabe qué está
  // mirando arriba, y ver avisos de otra cuenta en la grilla se lee como que el selector no anda.
  const delEje = useMemo(() => todos.filter(
    (a) => (cuenta === 'todas' || a.cuentaId === cuenta) && (linea === 'todas' || a.linea === linea),
  ), [todos, cuenta, linea])

  const visibles = useMemo(() => ordenar(filtrar(delEje, filtros), orden), [delEje, filtros, orden])
  const totales = useMemo(() => totalesDe(visibles), [visibles])

  /**
   * Marcar y desmarcar, con el cambio pintado **después** de que el servidor lo confirme.
   *
   * A propósito, y en contra de la costumbre de la respuesta optimista: un favorito es del EQUIPO,
   * así que pintarlo antes de tiempo mostraría la firma de quien lo marcó como si ya estuviera
   * guardado, y un 403 de una línea que no se ve la dejaría marcada en pantalla y no en la base.
   */
  const [marcando, setMarcando] = useState<string | null>(null)
  const [errorFav, setErrorFav] = useState<string | null>(null)
  const alternarFavorito = useCallback(async (a: AvisoBiblioteca) => {
    setMarcando(a.id)
    setErrorFav(null)
    const res = await marcarFavorito(a.id, !a.favorito)
    setMarcando(null)
    if (!res.ok) { setErrorFav(res.motivo); return }
    setR((s) => (s && s.e.fase === 'ok'
      ? {
        ...s,
        e: {
          fase: 'ok',
          data: {
            ...s.e.data,
            avisos: s.e.data.avisos.map((x) => (x.id === a.id ? { ...x, favorito: res.dato.favorito } : x)),
          },
        },
      }
      : s))
  }, [])

  return {
    estado,
    /** Todo lo que trajo el servidor, sin cortar. Es el denominador de «mostrando N de M». */
    todos,
    /** Lo que queda con el eje puesto, antes de los filtros de la pantalla. */
    delEje,
    visibles,
    totales,
    filtros,
    setFiltros,
    orden,
    setOrden,
    marcando,
    errorFav,
    alternarFavorito,
    recargar: useCallback(() => setPedido((n) => n + 1), []),
  }
}
