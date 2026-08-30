'use client'

/**
 * LA CARA de una pieza: la miniatura cuadrada con la chapita de video.
 *
 * Vivía adentro de `AvisosDeCelda` con el lado clavado en 96. Sale a archivo propio el 30-ago-2026
 * porque **la fila de la tabla también la necesita**, chica — y una segunda implementación de esto
 * habría sido dos lugares donde decidir `contain` vs `cover`, que es justo la decisión que no puede
 * estar escrita dos veces.
 *
 * # 🔴 El video
 *
 * Se muestra el **póster** y nunca un reproductor. El iframe de previsualización de Meta lleva el
 * access token del system user adentro del `src` (`api/meta-ads.js`), y ésa es una decisión que ⛔ no
 * se revierte por comodidad.
 */

import { color, font, radius } from '@/components/ui'
import type { PiezaAviso } from '@/lib/meta-ads/biblioteca'

export function Cara({ p, lado = 96, cargando }: {
  p: PiezaAviso | null
  lado?: number
  /** Las caras vienen de Graph y tardan. Mientras, el marco dice que está viniendo. */
  cargando?: boolean
}) {
  // ⛔ `contain` y no `cover`: recortar al cuadrado le corta la cabeza a una pieza vertical, que son
  // casi todas. Es la misma decisión que ya está tomada en `Avisos.tsx`.
  const marco: React.CSSProperties = {
    width: lado, height: lado, flexShrink: 0, borderRadius: radius.md,
    background: color.bg2, border: `1px solid ${color.line}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative',
  }
  const src = p && (p.imagen || p.thumb)
  if (!src) {
    // 🔑 Tres estados y ⛔ no dos: «viniendo», «llegó sin foto» y «no hay aviso». Un guion para los
    // tres haría creer que la pieza no tiene imagen justo mientras se está pidiendo.
    const vacio = cargando ? '…' : p ? 'sin foto' : '—'
    return <div style={{ ...marco, color: color.mut2, fontSize: lado >= 64 ? font.xs : 10 }}>{vacio}</div>
  }
  return (
    <div style={marco}>
      {/* eslint-disable-next-line @next/next/no-img-element -- la URL es del CDN de Meta, firmada y
          efímera: `next/image` la optimizaría contra un host que no está en la lista y caduca. */}
      <img src={src} alt={p?.nombre || 'pieza'} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      {p?.esVideo && (
        <span
          style={{
            position: 'absolute', bottom: 2, right: 2, fontSize: lado >= 64 ? 10 : 8, lineHeight: 1,
            padding: '2px 4px', borderRadius: radius.sm, background: 'rgba(0,0,0,.62)', color: '#fff',
          }}
        >
          {lado >= 64 ? '▶ video' : '▶'}
        </span>
      )}
    </div>
  )
}
