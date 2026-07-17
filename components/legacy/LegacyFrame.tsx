'use client'

import { useEffect, useRef } from 'react'
import type { Marca } from '@/lib/nav.generated'

/**
 * Sirve una sección todavía no migrada, desde el index.html viejo.
 *
 * Por qué un iframe y no montar el JS legacy en el bundle: el legacy depende de
 * que ~907 funciones sean globales en window y de 434 onclick inline, y su CSS es
 * global sin scoping (pisaría al del shell). El iframe da aislamiento de scope y
 * de estilos gratis, que es justo lo que necesita para no ser tocado.
 *
 * Es same-origin, así que comparte localStorage con el shell: el legacy hace
 * intentarAutoLogin() solo y no hay doble login.
 *
 * Muere cuando la última sección se migre; con él se va este archivo.
 */
export function LegacyFrame({ tab, marca }: { tab: string; marca: Marca }) {
  const ref = useRef<HTMLIFrameElement>(null)

  // El legacy lee la marca de la sesión (localStorage) en su arranque. Cuando el
  // shell la cambia, se fuerza un remount vía `key` en el src, así el iframe
  // recarga y la relee. Es más simple que postMessage y no toca el legacy.
  const src = `/legacy/index.html?embed=1&tab=${encodeURIComponent(tab)}&marca=${marca}`

  useEffect(() => {
    const el = ref.current
    if (el && el.getAttribute('src') !== src) el.setAttribute('src', src)
  }, [src])

  return (
    <iframe
      ref={ref}
      key={`${tab}-${marca}`}
      src={src}
      title={`Sección ${tab}`}
      // El legacy scrollea adentro y el shell no scrollea. Sin ResizeObserver ni
      // medición de contenido: el alto lo pone el layout.
      style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
    />
  )
}
