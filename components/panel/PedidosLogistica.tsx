'use client'

import { useEffect, useState } from 'react'
import { color, font, radius, space } from '@/components/ui/tokens'
import { avisosDe, entregaDe, pedidosDelCliente, type PedidoLogistica, type Resultado } from '@/lib/crm/logistica'

/**
 * Los pedidos del cliente que están en curso en Logística, en la ficha del chat (Darío, 22-oct-2026:
 * no olvidarse de elegir la forma de entrega, cargar el EM y pasar el seguimiento). Sólo mirar.
 *
 * Sin pedidos en curso no se dibuja nada: es lo normal y no hace falta anunciarlo. Un error sí se
 * ve, en un renglón, para que «no aparece» no se lea como «no tiene pedidos».
 */
export function PedidosLogistica({ clienteId, tel }: { clienteId: number | null; tel: string | null }) {
  // Lo que llegó va con a quién era: al cambiar de chat no se ve un instante el pedido del anterior.
  const clave = `${clienteId ?? ''}|${tel ?? ''}`
  const [llegado, setLlegado] = useState<{ clave: string; r: Resultado<PedidoLogistica[]> } | null>(null)
  useEffect(() => {
    let vivo = true
    if (!clienteId && !tel) return
    pedidosDelCliente(clienteId, tel).then((r) => vivo && setLlegado({ clave: `${clienteId ?? ''}|${tel ?? ''}`, r }))
    return () => {
      vivo = false
    }
  }, [clienteId, tel])

  const r = llegado?.clave === clave ? llegado.r : null
  if (!r || r.t === 'sin-permiso') return null
  if (r.t === 'error')
    return (
      <Caja>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>Logística: {r.motivo}</div>
      </Caja>
    )
  if (!r.datos.length) return null
  return (
    <Caja>
      <div style={{ fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, color: color.mut2, textTransform: 'uppercase', marginBottom: 6 }}>
        En Logística
      </div>
      {r.datos.map((p, i) => (
        <Pedido key={p.id} p={p} primero={i === 0} />
      ))}
    </Caja>
  )
}

function Caja({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        background: color.surface,
        border: `1px solid ${color.line}`,
        borderRadius: radius.lg,
        padding: `${space[2]}px ${space[3]}px ${space[3]}px`,
        margin: `0 ${space[2]}px ${space[2]}px`,
      }}
    >
      {children}
    </section>
  )
}

function Pedido({ p, primero }: { p: PedidoLogistica; primero: boolean }) {
  const avisos = avisosDe(p)
  const entrega = entregaDe(p)
  return (
    <div style={{ paddingTop: primero ? 0 : space[2], marginTop: primero ? 0 : space[2], borderTop: primero ? 0 : `1px solid ${color.line2}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: font.sm, fontWeight: 700, color: color.ink }}>Pedido {p.gn_number || p.id}</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, border: `1px solid ${color.line}`, background: color.bg2, color: color.mut, whiteSpace: 'nowrap' }}>
          {p.status.label}
        </span>
        <span style={{ flex: 1 }} />
        <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: font.xs, color: color.brand, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Abrir ↗
        </a>
      </div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {entrega ? `${entrega} · ` : ''}
        {p.units.scanned} de {p.units.total} escaneadas
      </div>
      {p.tracking_number && <Seguimiento numero={p.tracking_number} link={p.tracking_url} />}
      {avisos.map((a) => (
        <div key={a} style={{ marginTop: 4, fontSize: font.xs, color: color.warningInk, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: radius.sm, padding: '3px 8px' }}>
          {a}
        </div>
      ))}
    </div>
  )
}

/** El número de seguimiento, con un botón para copiarlo y pegárselo al cliente. */
function Seguimiento({ numero, link }: { numero: string; link: string | null }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link ? `${numero}\n${link}` : numero)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      /* sin permiso de portapapeles: el número queda a la vista igual */
    }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: font.xs }}>
      <span style={{ color: color.mut2 }}>Seguimiento</span>
      <span style={{ fontWeight: 700, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{numero}</span>
      <button
        type="button"
        onClick={copiar}
        style={{ height: 22, padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: `1px solid ${color.line}`, background: color.bg2, color: copiado ? color.successInk : color.ink, cursor: 'pointer' }}
      >
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}
