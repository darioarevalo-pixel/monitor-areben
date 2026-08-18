'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { leerMetas, type MetaGuardada } from '@/lib/norte/persistencia'

/**
 * Los objetivos de la marca, por la llave `?metas=1` de `api/_norte.js`.
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

const cache: Partial<Record<Marca, MetaGuardada[]>> = {}
const errores: Partial<Record<Marca, string>> = {}
const enVuelo: Partial<Record<Marca, Promise<void>>> = {}

async function cargar(marca: Marca): Promise<void> {
  if (cache[marca]) return
  if (!enVuelo[marca]) {
    enVuelo[marca] = (async () => {
      try {
        cache[marca] = await leerMetas(marca)
        delete errores[marca]
      } catch (e) {
        errores[marca] = e instanceof Error ? e.message : String(e)
      } finally {
        enVuelo[marca] = undefined
      }
    })()
  }
  await enVuelo[marca]
}

export type EstadoMetas = {
  /** `null` mientras baja. Una marca sin objetivos cargados devuelve `[]`, que no es lo mismo. */
  metas: MetaGuardada[] | null
  error: string | null
  recargar: () => Promise<void>
}

export function useMetas(marca: Marca): EstadoMetas {
  const metas = cache[marca] ?? null
  const error = errores[marca] ?? null
  const [, forzar] = useState(0)

  useEffect(() => {
    if (cache[marca]) return
    let vivo = true
    cargar(marca).then(() => {
      if (vivo) forzar((n) => n + 1)
    })
    return () => {
      vivo = false
    }
  }, [marca])

  const recargar = useCallback(async () => {
    delete cache[marca]
    await cargar(marca)
    forzar((n) => n + 1)
  }, [marca])

  return { metas, error, recargar }
}
