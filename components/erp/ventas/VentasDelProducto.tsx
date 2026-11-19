'use client'

/**
 * ERP › Ventas › Por producto › la VENTANA de un producto (Darío 19-nov): desde una lista de ventas, el clic responde
 * «qué variante se vende y si queda stock», ⛔ la ficha del catálogo (precios, costos, historial: eso es «Ver ficha del producto»).
 * Las ventas salen de los renglones que la pantalla ya tiene; el disponible, de la lista de Productos (la misma de Stock).
 */

import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, color, font, weight } from '@/components/ui'
import { leerListaDeProductos, type MarcaErp, type RenglonProducto, type VarianteProducto } from '@/lib/erp/cliente'
import { margenPct, porVariante } from '@/lib/erp/ventas-producto.core.js'
import { plata, vendidoPorDia } from '@/lib/erp/ventas-lista.core.js'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { Barras, Chicos, Monto } from './ResumenVentas'

/** Poco stock: de 1 a 3 en naranja; 0 o menos en rojo. */
const POCO = 3

export function VentasDelProducto({ marca, nombre, producto, renglones, margen, costos, desde, hasta, hoy, onCerrar, onVerFicha }: {
  marca: MarcaErp; nombre: string; producto: string
  /** Los renglones de ESTE producto, con los filtros de la pantalla. */
  renglones: RenglonProducto[]
  margen: number | null; costos: boolean
  desde: string; hasta: string; hoy: string
  onCerrar: () => void; onVerFicha: () => void
}) {
  const [variantes, setVariantes] = useState<VarianteProducto[] | null | 'error'>(null)
  useEffect(() => {
    let vivo = true
    leerListaDeProductos(marca, { reusar: true })
      .then((d) => { if (vivo) setVariantes(d.filas.find((f) => f.producto === producto)?.variantes ?? []) })
      .catch(() => { if (vivo) setVariantes('error') })
    return () => { vivo = false }
  }, [marca, producto])

  const filas = useMemo(() => porVariante(renglones), [renglones])
  const vendido = filas.reduce((a, v) => a + v.vendido, 0)
  const unidades = filas.reduce((a, v) => a + v.unidades, 0)
  const ventas = new Set(renglones.map((r) => r.ventaId)).size
  const pct = costos ? margenPct(margen, vendido) : null
  const dias = useMemo(() => vendidoPorDia(renglones.map((r) => ({ kind: 'venta', anulada: false, total: r.total, pedidoEn: r.cuando })), desde, hasta, (iso: string) => diaArgentino(Date.parse(iso))), [renglones, desde, hasta])
  const max = Math.max(1, ...filas.map((v) => v.unidades))

  // El disponible de cada variante vendida: por SKU; sin SKU, por el nombre del talle.
  const disponibleDe = (sku: string | null, talle: string): number | null => {
    if (!Array.isArray(variantes)) return null
    const v = variantes.find((x) => (sku && x.sku === sku) || x.talleNombre === talle)
    return v ? v.disponible : null
  }
  const celda: React.CSSProperties = { padding: '10px 0 10px 16px', borderBottom: `1px solid ${color.bg2}`, fontVariantNumeric: 'tabular-nums' }
  const enc: React.CSSProperties = { padding: '0 0 8px 16px', fontSize: font.xs, fontWeight: weight.semibold, color: color.mut, borderBottom: `1px solid ${color.line}` }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={nombre} ancho="ancho" pie={<Button variant="outline" onClick={onVerFicha}>Ver ficha del producto</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 32px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 220px' }}>
            <Monto valor={vendido} size={34} />
            <Chicos datos={[
              { valor: unidades.toLocaleString('es-AR'), despues: unidades === 1 ? 'unidad' : 'unidades' },
              { valor: ventas.toLocaleString('es-AR'), despues: ventas === 1 ? 'venta' : 'ventas' },
              ...(pct != null ? [{ antes: 'Margen', valor: `${pct}%` }] : []),
            ]} />
          </div>
          {dias.length > 1 && <div style={{ flex: '1.3 1 260px', minWidth: 0 }}><Barras dias={dias} hoy={hoy} alto={56} /></div>}
        </div>

        <div role="table" aria-label="Por variante" style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(96px, 156px) 120px 100px' }}>
          <div role="row" style={{ display: 'contents' }}>
            <span role="columnheader" style={{ ...enc, paddingLeft: 0 }}>Variante</span>
            <span role="columnheader" style={enc}>Unidades</span>
            <span role="columnheader" style={{ ...enc, textAlign: 'right' }}>Vendido</span>
            <span role="columnheader" style={{ ...enc, textAlign: 'right' }}>Disponible</span>
          </div>
          {filas.map((v) => {
            const d = disponibleDe(v.sku, v.talle)
            return (
              <div key={v.clave} role="row" style={{ display: 'contents' }}>
                <span role="cell" style={{ ...celda, paddingLeft: 0, color: color.ink }} title={v.sku ?? undefined}>{v.talle}</span>
                <span role="cell" style={{ ...celda, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b style={{ fontWeight: weight.semibold, minWidth: 28, textAlign: 'right' }}>{v.unidades}</b>
                  <span aria-hidden style={{ flex: 1, height: 4, borderRadius: 2, background: color.bg2 }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.max(0, (v.unidades / max) * 100)}%`, borderRadius: 2, background: 'var(--mo-brand-solid)', opacity: 0.55 }} />
                  </span>
                </span>
                <span role="cell" style={{ ...celda, textAlign: 'right', color: color.ink2 }}>{plata(v.vendido)}</span>
                <span role="cell" style={{ ...celda, textAlign: 'right', fontWeight: weight.semibold, color: d == null ? color.mut2 : d <= 0 ? 'var(--mo-danger-ink)' : d <= POCO ? 'var(--mo-warning-ink)' : color.ink }}>
                  {variantes === null ? '·' : d == null ? '—' : d}
                </span>
              </div>
            )
          })}
        </div>
        {variantes === 'error' && <div style={{ fontSize: font.sm, color: color.mut }}>No se pudo leer el stock.</div>}
      </div>
    </Modal>
  )
}
