'use client'

/**
 * El estado «Falla» del POS (Bruno, 25-nov): la MISMA venta, en otro estado. Se escanea normal, el total da $0 y en vez de cobrar se
 * toca «Registrar falla»: ⛔ cobro, ⛔ comprobante, ⛔ mail, ⛔ descuento. Cada renglón es una falla del local (`registrarFallaPOS`,
 * `lib/caja/falla-pos.ts`: el mismo camino que «+Cargar falla» de Post-venta).
 * «la de falla tiene que usarse la estructura actual de la venta, pero se usa escaner y se cobra pasa con $0. y va sin comprobante sin nada»
 */

import { Button, Card, Notice, color, font, space, weight } from '@/components/ui'
import { plata } from '@/lib/caja/ticket'
import type { Renglon } from './partes'

export function BandaFalla({ onSalir, trabajando }: { onSalir: () => void; trabajando: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: `${space[2]}px ${space[4]}px`, padding: `${space[2]}px ${space[4]}px`, background: color.dangerBg, borderBottom: `1px solid ${color.dangerBorder}`, color: color.danger }}>
      <b style={{ fontSize: font.md, fontWeight: weight.bold }}>Falla</b>
      <span style={{ flex: '1 1 260px', fontSize: font.base }}>Escaneá los productos con falla. El total queda en $0 y no sale comprobante.</span>
      <Button variant="outline" tone="danger" onClick={onSalir} disabled={trabajando} style={{ height: 40 }}>
        Salir de falla
      </Button>
    </div>
  )
}

/** Un renglón de la falla: nombre, talle, cantidad, $0 y ✕. Con `pendiente` ya está cargada en Post-venta y falta descontarla. */
function FilaFalla({ r, onCantidad, onSacar, trabajando }: { r: Renglon; onCantidad: (n: number) => void; onSacar: () => void; trabajando: boolean }) {
  const cargada = r.fallaId != null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto 72px 36px', gap: space[2], alignItems: 'center', padding: `${space[3]}px 0`, borderBottom: `1px solid ${color.line}`, fontSize: font.base }}>
      <span style={{ minWidth: 0 }}>
        <b>{r.variante.product_name}</b>
        <br />
        <span style={{ color: color.mut, fontSize: font.sm }}>{r.variante.size_name}</span>
        {cargada && (
          <>
            <br />
            <span style={{ color: color.danger, fontSize: font.sm }}>Cargada en Post-venta, falta descontar el stock</span>
          </>
        )}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1] }}>
        <Button size="sm" variant="ghost" aria-label="Una menos" disabled={trabajando || cargada} onClick={() => onCantidad(r.cantidad - 1)} style={{ height: 32, minWidth: 32 }}>−</Button>
        <span style={{ minWidth: 20, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{r.cantidad}</span>
        <Button size="sm" variant="ghost" aria-label="Una más" disabled={trabajando || cargada} onClick={() => onCantidad(r.cantidad + 1)} style={{ height: 32, minWidth: 32 }}>+</Button>
      </span>
      <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{plata(0)}</span>
      <Button size="sm" variant="ghost" aria-label="Sacar" disabled={trabajando || cargada} onClick={onSacar} style={{ height: 32, minWidth: 32 }}>✕</Button>
    </div>
  )
}

export function RenglonesFalla({ renglones, onCantidad, onSacar, trabajando }: { renglones: Renglon[]; onCantidad: (i: number, n: number) => void; onSacar: (i: number) => void; trabajando: boolean }) {
  if (renglones.length === 0) return <div style={{ padding: `${space[6]}px 0`, textAlign: 'center', color: color.mut, fontSize: font.base }}>Escanear o buscar los productos con falla.</div>
  return (
    <>
      {renglones.map((r, i) => (
        <FilaFalla key={`${r.variante.product_id}:${r.variante.size_id}`} r={r} trabajando={trabajando} onCantidad={(n) => (n <= 0 ? onSacar(i) : onCantidad(i, n))} onSacar={() => onSacar(i)} />
      ))}
    </>
  )
}

/** El pie de la falla: TOTAL $0 y «Registrar falla» en lugar de «Continuar al cobro». */
export function PieFalla({ hay, onRegistrar, trabajando, bloqueado, error }: { hay: boolean; onRegistrar: () => void; trabajando: boolean; bloqueado: boolean; error: string | null }) {
  return (
    <div style={{ flexShrink: 0, display: 'grid', gap: space[2], padding: `${space[3]}px ${space[4]}px ${space[4]}px`, borderTop: `1px solid ${color.line}`, background: color.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space[1] }}>
        <span style={{ fontWeight: weight.heavy, fontSize: font.md, letterSpacing: '.05em', color: color.ink }}>TOTAL</span>
        <span style={{ fontSize: 36, fontWeight: weight.heavy, letterSpacing: '-.02em', lineHeight: 1, color: color.brand, fontVariantNumeric: 'tabular-nums' }}>{plata(0)}</span>
      </div>
      <span style={{ color: color.mut, fontSize: font.sm }}>Sin mail, sin descuento y sin forma de pago: no se cobra.</span>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button size="lg" tone="danger" variant="solid" fullWidth disabled={!hay || trabajando || bloqueado} onClick={onRegistrar} style={{ height: 52 }}>
        {trabajando ? 'Registrando…' : 'Registrar falla'}
      </Button>
    </div>
  )
}

export function PedidoFalla(p: { renglones: Renglon[]; onCantidad: (i: number, n: number) => void; onSacar: (i: number) => void; onVaciar: () => void; onRegistrar: () => void; trabajando: boolean; bloqueado: boolean; error: string | null }) {
  const prendas = p.renglones.reduce((s, r) => s + r.cantidad, 0)
  return (
    <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3], padding: `${space[3]}px ${space[4]}px`, borderBottom: `1px solid ${color.line}` }}>
        <h2 style={{ margin: 0, fontSize: font.lg, fontWeight: weight.bold, color: color.ink }}>{`Pedido · ${prendas === 1 ? '1 producto' : `${prendas} productos`}`}</h2>
        <Button size="sm" variant="ghost" onClick={p.onVaciar} disabled={p.renglones.length === 0 || p.trabajando || p.renglones.some((r) => r.fallaId != null)}>
          Vaciar pedido
        </Button>
      </div>
      <div className="pos-renglones" style={{ padding: `0 ${space[4]}px` }}>
        <RenglonesFalla renglones={p.renglones} onCantidad={p.onCantidad} onSacar={p.onSacar} trabajando={p.trabajando} />
      </div>
      <PieFalla hay={p.renglones.length > 0} onRegistrar={p.onRegistrar} trabajando={p.trabajando} bloqueado={p.bloqueado} error={p.error} />
    </Card>
  )
}
