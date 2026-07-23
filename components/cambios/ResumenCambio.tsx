'use client'

/** Resumen de un cambio en un modal: cliente, estado, lo que devuelve / se lleva, y totales separados. */
import { Button, Card, StatusPill, MoneyText, color, font, weight, space, radius } from '@/components/ui'
import { ESTADO_LABEL, ESTADO_TONE, VIA_LABEL, calcularTotalCambio, numeroReclamo, type CambioItem, type CambioRow } from '@/lib/cambios/tipos'

export function ResumenCambio({ cambio, onClose }: { cambio: CambioRow; onClose: () => void }) {
  const dev = cambio.items_devueltos || []
  const nue = cambio.items_nuevos || []
  const t = calcularTotalCambio({ devueltos: dev, nuevos: nue, forma: cambio.forma_pago || null, envioCosto: cambio.envio_costo, envioPaga: cambio.envio_paga, descuentoManual: cambio.descuento_manual })
  const sub = (i: CambioItem) => (Number(i.precio) || 0) * (Number(i.cantidad) || 1)
  const totalProductos = t.diferencia - t.descuento

  const listaItems = (its: CambioItem[]) => (
    its.length ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {its.map((i, k) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: font.sm }}>
            <span style={{ color: color.ink2 }}>{i.cantidad}× {i.producto}{i.variante ? <span style={{ color: color.mut2 }}> ({i.variante})</span> : null}</span>
            <MoneyText value={sub(i)} style={{ color: color.mut }} />
          </div>
        ))}
      </div>
    ) : <div style={{ fontSize: font.sm, color: color.mut2 }}>—</div>
  )

  const totalRow = (label: React.ReactNode, val: React.ReactNode, opts?: { strong?: boolean; sep?: boolean; tone?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '4px 0', borderTop: opts?.sep ? `1px solid ${color.line}` : undefined, fontSize: opts?.strong ? font.lg : font.sm }}>
      <span style={{ color: opts?.strong ? color.ink : color.mut, fontWeight: opts?.strong ? weight.bold : weight.medium }}>{label}</span>
      <span style={{ fontWeight: opts?.strong ? weight.bold : weight.semibold }}>{val}</span>
    </div>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <Card onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, maxHeight: '88vh', overflowY: 'auto', borderRadius: radius['2xl'] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: space[3] }}>
          <div style={{ fontSize: font.xl, fontWeight: weight.bold, fontFamily: 'ui-monospace, monospace', color: color.ink }}>{numeroReclamo(cambio.id)}</div>
          <StatusPill tone={ESTADO_TONE[cambio.estado]} label={ESTADO_LABEL[cambio.estado]} />
          <button onClick={onClose} aria-label="Cerrar" style={{ marginLeft: 'auto', background: 'transparent', border: 'none', fontSize: 20, color: color.mut, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[4] }}>
          {cambio.cliente || 's/cliente'}{cambio.orden_tn ? ` · orden #${cambio.orden_tn}` : ''}{cambio.solicitud_envio ? ` · 📮 ${cambio.solicitud_envio}` : ''}
        </div>

        <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Devuelve</div>
        {listaItems(dev)}
        <div style={{ height: space[3] }} />
        <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Se lleva</div>
        {listaItems(nue)}

        <div style={{ marginTop: space[4] }}>
          {totalRow('Subtotal productos', <MoneyText value={t.diferencia} />)}
          {t.descuento > 0 && totalRow(<span style={{ color: color.success }}>Descuento</span>, <MoneyText value={-t.descuento} tone="success" />)}
          {totalRow('Total productos', <MoneyText value={totalProductos} strong />, { sep: true })}
          {totalRow(`Envío${cambio.via ? ` (${VIA_LABEL[cambio.via]})` : ''}`, <MoneyText value={t.envioACobrar} />)}
          {totalRow('Total a pagar', <MoneyText value={t.total} strong />, { strong: true, sep: true })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: space[4] }}>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </Card>
    </div>
  )
}
