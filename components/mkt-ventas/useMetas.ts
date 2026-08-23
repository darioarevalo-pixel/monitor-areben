'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Linea } from '@/lib/lineas'
import { leerMetas, type MetaGuardada } from '@/lib/norte/persistencia'

/**
 * Los objetivos de la **línea**, por la llave `?metas=1` de `api/_norte.js`.
 *
 * 🔴 **La clave es la LÍNEA y no la marca** (23-ago-2026). Con la marca, la pestaña Stunned de
 * Ventas dibujaba la rampa de **Zattia** con el rótulo de Stunned: la tarjeta salía idéntica en las
 * dos pestañas mientras la venta de abajo sí estaba cortada. Un objetivo contra el que se mide otra
 * cosa es peor que no tener objetivo.
 *
 * Es su propio hook y no una rama del store del ETL porque no es dato del ETL: son tres filas que
 * cambian cuando alguien de Dirección las edita, y bajarlas cuesta un request de nada. Un fallo acá
 * **no tumba la sección**: el contador diario sigue sirviendo sin objetivo cargado, así que el
 * error viaja al lado del dato y la pantalla decide qué decir.
 *
 * 🔑 **Mismo patrón que `useMarketing` y `useTnImages`, y no es cosmético**: el caché y el error
 * viven a nivel de módulo y se **leen en el render**; el effect sólo dispara el fetch y fuerza un
 * re-render al terminar. Un `setState` síncrono en el cuerpo del effect lo rechaza el lint
 * (`react-hooks/set-state-in-effect`) y deja el CI en rojo.
 */

const cache: Partial<Record<Linea, MetaGuardada[]>> = {}
const errores: Partial<Record<Linea, string>> = {}
const enVuelo: Partial<Record<Linea, Promise<void>>> = {}

async function cargar(linea: Linea): Promise<void> {
  if (cache[linea]) return
  if (!enVuelo[linea]) {
    enVuelo[linea] = (async () => {
      try {
        cache[linea] = await leerMetas(linea)
        delete errores[linea]
      } catch (e) {
        errores[linea] = e instanceof Error ? e.message : String(e)
      } finally {
        enVuelo[linea] = undefined
      }
    })()
  }
  await enVuelo[linea]
}

export type EstadoMetas = {
  /** `null` mientras baja. Una línea sin objetivos cargados devuelve `[]`, que no es lo mismo. */
  metas: MetaGuardada[] | null
  error: string | null
  recargar: () => Promise<void>
}

export function useMetas(linea: Linea): EstadoMetas {
  const metas = cache[linea] ?? null
  const error = errores[linea] ?? null
  const [, forzar] = useState(0)

  useEffect(() => {
    if (cache[linea]) return
    let vivo = true
    cargar(linea).then(() => {
      if (vivo) forzar((n) => n + 1)
    })
    return () => {
      vivo = false
    }
  }, [linea])

  const recargar = useCallback(async () => {
    delete cache[linea]
    await cargar(linea)
    forzar((n) => n + 1)
  }, [linea])

  return { metas, error, recargar }
}
