'use client'

/**
 * Una promo de PRODUCTO vigente, como la lee quien atiende (Bruno, 23-nov-2026): al lado de las
 * bancarias, en la misma banda. Sólo para leer: ⛔ se carga acá. Las de la web salen de Resorty
 * (lo que la tienda anuncia y el carrito cobra) y las del local, de la Caja.
 */

import { useState } from 'react'
import { Badge, color, font, radius, space, weight } from '@/components/ui'
import type { PromoProducto } from '@/lib/agenda/tipos'

const dm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

export function TarjetaPromoProducto({ promo }: { promo: PromoProducto }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div style={{ border: `1px solid ${color.line}`, borderRadius: radius.xl, padding: space[3], background: color.bg2 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.lg, fontWeight: weight.bold, color: color.ink }}>{promo.titulo}</span>
        <Badge tone="neutral">{promo.canal === 'web' ? `Tienda online · ${promo.tienda}` : 'Local'}</Badge>
        {promo.hasta && <span style={{ fontSize: font.sm, color: color.mut }}>hasta el {dm(promo.hasta)}</span>}
      </div>

      {/* Bruno, 23-nov: en la tarjeta va SÓLO el título; la regla y lo que queda afuera, adentro. */}
      <button
            onClick={() => setAbierto((v) => !v)}
            style={{
              // `height: auto`: la regla `.shell-content button` le fija a todo botón un renglón.
              height: 'auto',
              background: 'transparent',
              border: 'none',
              padding: 0,
              marginTop: space[2],
              cursor: 'pointer',
              color: color.brand,
              fontSize: font.base,
              fontWeight: weight.semibold,
            }}
          >
            {abierto ? '▾' : '▸'} Condiciones
          </button>
          {abierto && (
            <div style={{ marginTop: space[2], color: color.ink2, fontSize: font.base, display: 'grid', gap: space[1.5] }}>
              <div style={{ fontWeight: weight.semibold, color: color.ink }}>{promo.detalle}</div>
              {promo.nota && <div>{promo.nota}</div>}
              {promo.excluye.length > 0 && <div>No aplica a: {promo.excluye.join(', ')}.</div>}
            </div>
          )}
    </div>
  )
}
