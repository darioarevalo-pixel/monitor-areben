'use client'

import { useState } from 'react'
import { Lightbox, color, font, radius, space } from '@/components/ui'
import type { Prenda } from '@/lib/mapa-local/tipos'

/** Lo que vendió una prenda, en corto: «nueva», «9 v. en 30 d», o nada si ⛔ no se sabe. */
export function textoVentas(p: Prenda): string | null {
  if (p.tramo === 'nueva') return 'nueva'
  if (p.ventas30 == null) return null
  return p.ventas30 === 1 ? '1 venta en 30 d' : `${p.ventas30} ventas en 30 d`
}

/**
 * Una grilla de fotos chicas con nombre y color: lo que va en una barra, o lo que no entra.
 * `conVentas` suma lo que vendió cada una (la vista «Qué se cuelga»); en los percheros va sólo en el
 * cartelito, para no cargar el plano.
 */
export function Prendas({ prendas, vacio, conVentas = false }: { prendas: Prenda[]; vacio: string; conVentas?: boolean }) {
  const [grande, setGrande] = useState<string | null>(null)
  if (!prendas.length) return <div style={{ fontSize: font.sm, color: color.mut }}>{vacio}</div>
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: space[2] }}>
        {prendas.map((p) => (
          <div key={p.clave} style={{ fontSize: font.xs, color: color.ink2, minWidth: 0 }} title={`${p.nombre}${p.color ? ` · ${p.color}` : ''} · ${p.unidades} u en el Local${textoVentas(p) ? ` · ${textoVentas(p)}` : ''}`}>
            <button
              type="button"
              onClick={() => p.img && setGrande(p.img)}
              style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '3 / 4', padding: 0, border: `1px solid ${p.linea === 'sale' ? color.warningBorder : color.line}`, borderRadius: radius.sm, background: color.bg2, overflow: 'hidden', cursor: p.img ? 'zoom-in' : 'default' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.img ? <img src={p.img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <span style={{ color: color.mut2 }}>sin foto</span>}
            </button>
            <div style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
            <div style={{ color: color.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.color || '—'} · {p.unidades} u{p.linea === 'sale' ? ' · sale' : ''}
            </div>
            {conVentas && textoVentas(p) && <div style={{ color: p.tramo === 'nueva' ? color.brand : color.mut }}>{textoVentas(p)}</div>}
          </div>
        ))}
      </div>
      <Lightbox src={grande} onCerrar={() => setGrande(null)} />
    </>
  )
}
