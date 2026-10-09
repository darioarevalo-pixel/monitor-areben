'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { baseDeLinea, type Linea } from '@/lib/lineas'
import { indexarFotosIngreso } from '@/lib/recepciones/fotos.core.js'

export type IndiceIngreso = ReturnType<typeof indexarFotosIngreso>

/**
 * Las fotos de Ingresos de la marca de la línea, para cubrir lo que Tienda Nube todavía no tiene.
 * La regla de quién gana vive en `lib/recepciones/fotos.core.js`.
 *
 * 🔑 **Si falla, devuelve `null` y la tabla sigue como antes** («sin foto»): es un respaldo, ⛔ no
 * puede trabar la pantalla.
 */
export function useFotosIngreso(linea: Linea): IndiceIngreso | null {
  const store = baseDeLinea(linea)
  const [idx, setIdx] = useState<{ store: string; idx: IndiceIngreso } | null>(null)
  useEffect(() => {
    let vivo = true
    apiFetch(`/api/datos?recurso=recepciones&store=${store}&fotos=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo && j?.ok) setIdx({ store, idx: indexarFotosIngreso(j.fotos) }) })
      .catch(() => {})
    return () => { vivo = false }
  }, [store])
  // Al cambiar de marca ⛔ se muestra el índice de la otra mientras llega el nuevo.
  return idx && idx.store === store ? idx.idx : null
}
