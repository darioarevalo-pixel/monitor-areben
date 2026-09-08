'use client'

/**
 * El seam de la pantalla «Archivos»: lo único que habla con `/api/blob-upload` para mirar y limpiar
 * el store.
 *
 * # 🔑 Por qué el cruce de Ingresos lo hace ACÁ y no el servidor
 *
 * Las URLs de la galería de Ingresos proyectados **no viven en la base**: viven en el KV de
 * bdi-catalogo (`lib/kv/cliente.ts`), que se lee con la sesión de quien mira. El servidor del
 * monitor no la tiene, así que si el cruce se hiciera todo allá, la carpeta `ingresos/` saldría
 * entera «sin dueño» — y son videos de proveedoras que la sección todavía muestra.
 *
 * Por eso esta función lee las dos marcas, junta los `pathname` de la galería y se los manda al
 * servidor como `refsCliente`.
 *
 * 🔴 **Y si el KV falla, ⛔ NO se manda una lista vacía: se manda `null`.** Una lista vacía dice
 * «ninguno está en uso» y es exactamente la mentira que borra la galería; `null` dice «no pude
 * mirar», y el servidor marca la carpeta como no verificable. Es la misma disciplina del `cargado`
 * del KV: sin lectura previa no se pisa nada.
 */

import { apiFetch } from '@/lib/api-fetch'
import { leerIngresos } from '@/lib/kv/cliente'
import { claveDeUrl, type ArchivoConEstado } from '@/lib/blob/inventario'
import type { Ingreso } from '@/lib/ingresos/tipos'

const RUTA = '/api/blob-upload'

export type Inventario = {
  archivos: ArchivoConEstado[]
  /** Carpetas sobre las que ⛔ no se puede afirmar que algo sobra. */
  sinVerificar: string[]
  /** El store tiene más archivos de los que se trajeron. Se dice; ⛔ no se calla. */
  truncado: boolean
}

/**
 * Los `pathname` que nombra la galería de Ingresos, o `null` si no se pudo leer alguna de las dos
 * marcas. Ver arriba por qué `null` y no `[]`.
 */
async function refsDeIngresos(): Promise<string[] | null> {
  const claves: string[] = []
  for (const store of ['bdi', 'zattia'] as const) {
    const r = await leerIngresos<Ingreso>(store)
    if (!r.ok) return null
    for (const ing of r.dato || []) {
      for (const item of ing.gallery || []) {
        const clave = claveDeUrl(item.url)
        if (clave) claves.push(clave)
      }
    }
  }
  return claves
}

async function postear<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const r = await apiFetch(RUTA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d?.error) throw new Error(d?.error || 'No se pudo hablar con los archivos.')
  return d as T
}

/** Todo lo que hay en el store, con el estado de cada archivo ya decidido por el servidor. */
export async function leerInventario(): Promise<Inventario> {
  const refsCliente = await refsDeIngresos()
  const d = await postear<Inventario>({ accion: 'inventario', refsCliente })
  return { archivos: d.archivos || [], sinVerificar: d.sinVerificar || [], truncado: !!d.truncado }
}

export type Eliminacion = { eliminados: number; bytes: number; salteados: number }

/**
 * Elimina los archivos que quedaron sin dueño.
 *
 * ⚠️ **El servidor vuelve a decidir.** Lo que va es una lista de URLs, y allá se corre otra vez la
 * misma regla sobre el store real: lo que entre tanto haya pasado a estar en uso ⛔ no se borra y
 * vuelve contado en `salteados`. Esta función ⛔ no puede forzar un borrado, y es a propósito.
 */
export async function eliminarHuerfanos(urls: string[]): Promise<Eliminacion> {
  const refsCliente = await refsDeIngresos()
  return await postear<Eliminacion>({ accion: 'eliminar-huerfanos', urls, refsCliente })
}
