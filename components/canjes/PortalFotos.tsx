'use client'

/**
 * Las fotos del producto, en grande. Es lo último que mira antes de elegir.
 *
 * **Por qué uno propio y no `components/productos/Lightbox`**, que ya existe:
 *
 *  1. Aquél se estila con clases de `app/globals.css`, la hoja del panel. Este portal se estila
 *     inline **a propósito** (ver el encabezado de `PortalVitrina`): lo abre alguien de afuera, sin
 *     sesión, y un cambio en la hoja del panel no puede mover esta pantalla.
 *  2. Aquél navega con flechas y miniaturas y **no tiene swipe**. Acá el gesto *es* la interacción:
 *     esto se toca con el pulgar. Agregárselo sería tocar una pantalla en producción que lo usa con
 *     otro propósito.
 *  3. Aquél dibuja un `<img>` crudo, sin `thumbTN`. Bajar la original de 1,3 MB por cada miniatura
 *     con los datos del celular es exactamente lo que `lib/tncat/thumb.ts` existe para evitar.
 *
 * ⚠️ **No registra su propio listener de teclado**, y no es una omisión: la hoja de compra escucha
 * Escape en `window`, y dos listeners sobre el mismo target corren los dos — `stopPropagation` no
 * salva. Un Escape cerraría el visor **y** la hoja, y ella perdería lo que estaba eligiendo. El
 * dueño de las dos capas es `PortalVitrina`, que cierra primero el visor.
 */

import { useState } from 'react'
import { FotoTn } from '@/components/tncat/FotoTn'
import { direccionDelSwipe, moverIndice, type Punto } from '@/lib/canjes/gestos'

const boton: React.CSSProperties = {
  border: 'none', background: 'rgba(255,255,255,.14)', color: '#fff', cursor: 'pointer',
  width: 44, height: 44, borderRadius: 999, fontSize: 22, lineHeight: 1, fontFamily: 'inherit',
  display: 'grid', placeItems: 'center', padding: 0,
}

export function PortalFotos({
  fotos, nombre, inicial = 0, onCerrar,
}: {
  fotos: string[]
  nombre: string
  /** Con cuál abre. Es la de la variante que tenga marcada, si marcó alguna. */
  inicial?: number
  onCerrar: () => void
}) {
  const [i, setI] = useState(() => moverIndice(0, inicial, fotos.length))
  const [desde, setDesde] = useState<Punto | null>(null)

  if (!fotos.length) return null
  const varias = fotos.length > 1
  const mover = (paso: number) => setI((n) => moverIndice(n, paso, fotos.length))

  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,.94)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* La barra: cuántas son y cómo se sale. El × con 44 px de lado, que es el piso para el dedo. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', padding: 10, color: '#fff', gap: 12 }}
      >
        <span style={{ fontSize: 14, opacity: 0.85 }}>
          {varias ? `${i + 1} de ${fotos.length}` : nombre}
        </span>
        <button onClick={onCerrar} aria-label="Cerrar" style={{ ...boton, marginLeft: 'auto' }}>×</button>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => setDesde({ x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          if (!desde) return
          const fin = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
          mover(direccionDelSwipe(desde, fin))
          setDesde(null)
        }}
        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px', minHeight: 0 }}
      >
        {/* Las flechas sólo con más de una foto: un control que no puede hacer nada es peor que
            ninguno, y en el teléfono lo que se usa es el dedo. */}
        {varias && (
          <button onClick={() => mover(-1)} aria-label="Anterior" disabled={i === 0} style={{ ...boton, opacity: i === 0 ? 0.25 : 1 }}>‹</button>
        )}
        <div style={{ flex: 1, height: '100%', display: 'grid', placeItems: 'center', minWidth: 0 }}>
          {/* `original`: acá sí se pide la grande. Es el único lugar del portal donde se justifica. */}
          <FotoTn
            src={fotos[i]}
            alt={nombre}
            ancho={1200}
            original
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
        {varias && (
          <button onClick={() => mover(1)} aria-label="Siguiente" disabled={i === fotos.length - 1} style={{ ...boton, opacity: i === fotos.length - 1 ? 0.25 : 1 }}>›</button>
        )}
      </div>

      {varias && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', gap: 8, padding: 12, overflowX: 'auto', justifyContent: 'center' }}
        >
          {/* Las miniaturas van por el optimizador: son ocho, y ocho originales de 1,3 MB con datos
              móviles es la diferencia entre que abra y que no. */}
          {fotos.map((f, k) => (
            <button
              key={f}
              onClick={() => setI(k)}
              aria-label={`Foto ${k + 1}`}
              style={{
                width: 54, height: 54, flexShrink: 0, borderRadius: 8, overflow: 'hidden', padding: 0,
                cursor: 'pointer', background: '#1c1c1e',
                border: `2px solid ${k === i ? '#fff' : 'transparent'}`,
                opacity: k === i ? 1 : 0.55,
              }}
            >
              <FotoTn src={f} alt="" ancho={60} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
