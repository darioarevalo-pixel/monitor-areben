'use client'

/**
 * Lightbox — una foto a pantalla completa, para mirarla y cerrarla.
 *
 * Vive en el kit porque había **cuatro copias** del mismo `position: fixed` a mano —Diseños, el
 * portal de votación, Exhibición y las imágenes del producto— y ninguna cerraba con Escape. Mismo
 * motivo por el que existe `Modal`, y el mismo docblock lo dice: los modales ad-hoc de cada sección
 * son deuda, no estilo.
 *
 * No es un `Modal`: no hay nada que leer ni botones que enfocar. Cerrar es tocar en cualquier lado,
 * que es lo que la gente ya hace.
 */
import { useEffect } from 'react'

export function Lightbox({ src, alt = '', onCerrar }: { src: string | null; alt?: string; onCerrar: () => void }) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [src, onCerrar])

  if (!src) return null
  return (
    <div className="mo-lightbox" onClick={onCerrar} role="presentation">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} />
    </div>
  )
}
