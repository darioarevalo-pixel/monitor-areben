'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Visor de fotos a pantalla completa. Port de lightboxRender/lightboxNav
 * (index.html:12930-12970): flechas + contador + tira de miniaturas, cierre por
 * click en el fondo o Escape, navegación con las flechas del teclado. Se monta sólo
 * cuando hay algo que mostrar (el padre pasa `imagenes` no vacío).
 */
export function Lightbox({ imagenes, nombre, onClose }: { imagenes: string[]; nombre: string; onClose: () => void }) {
  const [i, setI] = useState(0)
  const total = imagenes.length

  const nav = useCallback(
    (delta: number) => setI((prev) => (prev + delta + total) % total),
    [total],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') nav(-1)
      else if (e.key === 'ArrowRight') nav(1)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [nav, onClose])

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className="lightbox-overlay show" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Cerrar">×</button>
      {total > 1 && <div className="lightbox-counter">{i + 1} / {total}</div>}
      {total > 1 && (
        <button className="lightbox-nav prev" onClick={(e) => { stop(e); nav(-1) }} aria-label="Anterior">‹</button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lightbox-img" src={imagenes[i]} alt={nombre} onClick={stop} />
      {total > 1 && (
        <button className="lightbox-nav next" onClick={(e) => { stop(e); nav(1) }} aria-label="Siguiente">›</button>
      )}
      {nombre && <div className="lightbox-info">{nombre}</div>}
      {total > 1 && (
        <div className="lightbox-thumbs" onClick={stop}>
          {imagenes.map((src, idx) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={idx}
              className={`lightbox-thumb${idx === i ? ' active' : ''}`}
              src={src}
              loading="lazy"
              alt=""
              onClick={() => setI(idx)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
