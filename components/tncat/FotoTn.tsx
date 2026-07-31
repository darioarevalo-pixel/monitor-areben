'use client'

/**
 * Una foto de TiendaNube, liviana y con respaldo.
 *
 * Pide la versión achicada (ver `lib/tncat/thumb.ts`: 1,3 MB → ~10 KB) y, si el optimizador no
 * contesta, vuelve sola a la original. El respaldo importa más de lo que parece: esta pantalla
 * existe para mirar fotos, y una foto que no carga se ve igual que un color sin foto — o sea que
 * un problema de red se leería como un problema del catálogo.
 */

import { useState } from 'react'
import { thumbTN } from '@/lib/tncat/thumb'

export function FotoTn({
  src,
  alt = '',
  /** Ancho al que se va a dibujar. Se pide al doble, para que no se vea borrosa en pantalla retina. */
  ancho,
  /** `true` para pedir la original sin achicar: es lo que se hace al ampliar. */
  original = false,
  style,
  onClick,
  title,
}: {
  src: string
  alt?: string
  ancho: number
  original?: boolean
  style?: React.CSSProperties
  onClick?: () => void
  title?: string
}) {
  const liviana = original ? src : thumbTN(src, ancho * 2)
  /**
   * Cuál fue la URL liviana que no cargó, no "si falló". Guardado así, cambiar de producto o
   * ampliar la foto vuelve solo a pedir la optimizada: la URL nueva ya no coincide con la que
   * falló. Con un booleano habría que acordarse de apagarlo en cada cambio.
   */
  const [fallo, setFallo] = useState('')
  const url = fallo === liviana ? src : liviana

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      title={title}
      loading="lazy"
      onClick={onClick}
      onError={() => setFallo(liviana)}
      style={style}
    />
  )
}
