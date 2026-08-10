'use client'

/**
 * El catálogo de la tienda para el buscador de Atención al cliente.
 *
 * **Se baja recién cuando alguien escribe**, y lo dispara el tipeo, no un efecto: la pantalla se
 * abre muchas veces por día para copiar un link fijo ("costos de envío") y nunca se llega al
 * buscador de productos; bajar los ~660 de Zattia siempre sería un peaje que casi nunca se usa.
 * Como el foco arranca en el buscador, la bajada se solapa con lo que la persona está tipeando.
 *
 * No hay caché propio: alcanza con los dos que ya existen —el `Map` por pestaña de `lib/tn-audit.ts`
 * y el KV con TTL de una hora del otro lado—. Y **no se persiste nada en IndexedDB**: un precio de
 * ayer cotizado por WhatsApp es peor que esperar dos segundos.
 *
 * Tampoco hay semilla, a diferencia de los modelos por marca: una lista de modelos vieja sigue
 * llevando a links que funcionan, pero un precio viejo es un precio que la tienda no cobra.
 */

import { useCallback, useRef, useState } from 'react'
import { traerAudit } from '@/lib/tn-audit'
import type { Marca } from '@/lib/nav'
import type { ProductoTienda } from '@/lib/atencion/tipos'

/**
 * Lo bajado lleva su marca adentro a propósito. Así, al cambiar de marca, lo de la anterior deja de
 * verse por comparación en el render, sin un efecto que limpie el estado — que es lo que pedía
 * `react-hooks/set-state-in-effect` — y sin que una respuesta que llegó tarde pinte los productos
 * de BDI en la pantalla de Zattia.
 */
type Estado = { marca: Marca; filas: ProductoTienda[]; cargando: boolean; error: string | null }

export type ProductosTienda = {
  productos: ProductoTienda[]
  cargando: boolean
  error: string | null
  /** La dispara el buscador al primer tipeo, y el botón de reintentar. Idempotente. */
  pedir: () => void
}

export function useProductosTienda(marca: Marca): ProductosTienda {
  const [estado, setEstado] = useState<Estado | null>(null)
  const pedido = useRef<Marca | null>(null)

  const pedir = useCallback(() => {
    if (pedido.current === marca) return
    pedido.current = marca
    setEstado({ marca, filas: [], cargando: true, error: null })
    traerAudit<ProductoTienda>(marca)
      .then((filas) => setEstado({ marca, filas, cargando: false, error: null }))
      .catch(() => {
        pedido.current = null // que el botón de reintentar sirva de verdad
        setEstado({ marca, filas: [], cargando: false, error: 'No se pudo leer el catálogo de la tienda.' })
      })
  }, [marca])

  const mio = estado && estado.marca === marca ? estado : null
  return { productos: mio?.filas ?? [], cargando: !!mio?.cargando, error: mio?.error ?? null, pedir }
}
