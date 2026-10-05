'use client'

/**
 * «Así sale el ticket (80 mm)»: la vista previa de la pestaña Caja (rediseño, fase 2, Bruno 5-oct).
 *
 * 🔑 **Se dibuja con `armarTicket`, la MISMA función que imprime**: las mismas `ops` (texto, regla y
 * logo, en mm) que jsPDF pinta en la térmica, acá pintadas en un `<svg>` de 80 mm. Una vista previa
 * con su propio HTML diría una cosa y el papel otra el día que alguien toque el ticket.
 *
 * Los datos son de MUESTRA (dos prendas, efectivo con vuelto); el logo y la política son los de la
 * configuración, así que guardar uno u otro se ve al instante.
 */

import { useEffect, useMemo, useState } from 'react'
import { armarTicket, type DatosTicket, type LogoTicket, type OpImagen } from '@/lib/caja/ticket'
import { abrirRollo, M, W, type Medidor, type OpBase } from '@/lib/rollo80'
import { color, font, shadow, space } from '@/components/ui'

/** Un punto tipográfico en mm: jsPDF mide la letra en puntos y el papel en mm. */
const PT = 25.4 / 72

/** El ticket de muestra: dos prendas (una con descuento a mano), 10% de efectivo y paga con $40.000. */
export function ticketDeMuestra(logo: LogoTicket | null, politica: string | null): DatosTicket {
  return {
    numero: 0,
    id: 'muestra',
    renglones: [
      { nombre: 'PRENDA DE MUESTRA', talle: 'M', cantidad: 1, precio: 20000, importe: 20000 },
      { nombre: 'OTRA PRENDA', talle: '38', cantidad: 2, precio: 12000, importe: 22000 },
    ],
    subtotal: 42000,
    pagos: [{ cuenta: 0, porcentaje: 10, descuento: 4200, redondeo: 0, monto: 37800 }],
    total: 37800,
    nombreCuenta: () => 'Efectivo',
    pagaCon: 40000,
    politica,
    logo,
    cliente: null,
  }
}

export function VistaTicket({ logo, politica, medidor }: { logo: LogoTicket | null; politica: string | null; /** Para los tests; si no, el de jsPDF. */ medidor?: Medidor }) {
  const [medir, setMedir] = useState<Medidor | null>(() => medidor ?? null)
  const [error, setError] = useState<string | null>(null)
  // La fecha del ticket: la de cuando se abrió la pestaña (es una muestra).
  const [ahora] = useState(() => Date.now())
  useEffect(() => {
    if (medidor) return
    let vivo = true
    abrirRollo()
      .then((r) => vivo && setMedir(() => r.medir))
      .catch((e) => vivo && setError((e as Error).message))
    return () => {
      vivo = false
    }
  }, [medidor])

  const pagina = useMemo(() => (medir ? armarTicket(ticketDeMuestra(logo, politica), () => true, ahora, medir) : null), [medir, logo, politica, ahora])

  if (error) return <span style={{ color: color.dangerInk, fontSize: font.sm }}>No se pudo armar la vista previa: {error}</span>
  if (!pagina) return <span style={{ color: color.mut, fontSize: font.sm }}>Armando la vista previa…</span>
  return (
    <figure style={{ margin: 0, display: 'grid', gap: space[1.5], justifyItems: 'center' }}>
      <svg
        viewBox={`0 0 ${W} ${pagina.alto}`}
        role="img"
        aria-label="Ticket de muestra"
        // El papel es blanco y la letra negra en la térmica: acá también, en cualquier tema.
        style={{ width: '100%', maxWidth: 302, background: 'white', border: `1px solid ${color.line}`, boxShadow: shadow.md }}
      >
        {pagina.ops.map((op, i) => dibujar(op, i))}
      </svg>
      <figcaption style={{ fontSize: font.xs, color: color.mut }}>Ticket de muestra: el logo y la política son los guardados.</figcaption>
    </figure>
  )
}

function dibujar(op: OpBase | OpImagen, i: number) {
  if (op.k === 'regla') return <line key={i} x1={M} x2={W - M} y1={op.y} y2={op.y} stroke="rgb(150,150,150)" strokeWidth={0.2} />
  if (op.k === 'img') return <image key={i} href={op.src} x={op.x} y={op.y} width={op.w} height={op.h} />
  const x = op.align === 'der' ? W - M : op.align === 'centro' ? W / 2 : M
  const gris = op.gris != null ? `rgb(${op.gris},${op.gris},${op.gris})` : 'black'
  return (
    <text
      key={i}
      x={x}
      y={op.y}
      dominantBaseline="hanging"
      textAnchor={op.align === 'der' ? 'end' : op.align === 'centro' ? 'middle' : 'start'}
      fontFamily="Helvetica, Arial, sans-serif"
      fontWeight={op.bold ? 700 : 400}
      fontSize={op.tam * PT}
      fill={gris}
    >
      {op.txt}
    </text>
  )
}
