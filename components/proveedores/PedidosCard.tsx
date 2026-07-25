'use client'

import { useMemo, useState } from 'react'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { pedidoATexto, pedidosPorProveedor, type DatosProveedores } from '@/lib/proveedores'
import { color, useToast } from '@/components/ui'

/**
 * Qué hay que pedirle a cada proveedor: lo que se vendió en el período y hoy está en cero.
 *
 * Es el paso que le faltaba a esta pantalla. Contaba muy bien qué pasó —unidades, márgenes,
 * ranking— pero de ahí a la acción había un salto que alguien tenía que hacer a mano:
 * cruzar los más vendidos contra el stock y separar por proveedor, que es como se manda el
 * pedido. Eso es lo que arma esta lista.
 *
 * El corte por unidades saca la cola larga: un producto que vendió una unidad en tres meses
 * y se agotó no es una reposición urgente, y si entra ensucia la lista hasta volverla
 * inútil.
 */
export function PedidosCard({ data, meses, periodoLabel }: { data: DatosProveedores; meses: string[]; periodoLabel: string }) {
  const toast = useToast()
  const [minimo, setMinimo] = useState(3)
  const [copiado, setCopiado] = useState<string | null>(null)

  const pedidos = useMemo(() => pedidosPorProveedor(data, meses, minimo), [data, meses, minimo])

  const copiar = async (prov: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(prov)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      toast.error('No se pudo copiar. Seleccioná el texto a mano.')
    }
  }

  return (
    <div className="card" style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>🛒 Para pedir, por proveedor</div>
        <InfoPopover titulo="Para pedir, por proveedor">
          Productos que <b>se vendieron en el período elegido</b> y hoy están <b>sin stock</b>, agrupados por
          proveedor porque el pedido se manda a uno, no al catálogo entero. El costo estimado es reponer lo
          vendido (unidades × costo unitario): sirve de referencia para decidir cuánto pedir, no es un
          presupuesto.
        </InfoPopover>
        <label style={{ fontSize: 12.5, color: color.ink2, display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          Mínimo vendidas
          <input
            type="number"
            min={1}
            value={minimo}
            onChange={(e) => setMinimo(Math.max(1, parseInt(e.target.value, 10) || 1))}
            style={{ width: 64, padding: '5px 8px', border: `1px solid ${color.line2}`, borderRadius: 7 }}
          />
        </label>
      </div>
      <div style={{ fontSize: 12, color: color.mut2, marginBottom: 10 }}>Según las ventas de {periodoLabel}.</div>

      {pedidos.length === 0 ? (
        <div style={{ color: color.successInk, fontSize: 14, padding: '10px 2px' }}>
          ✅ No hay productos vendidos en el período que estén sin stock.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pedidos.map((p) => (
            <details key={p.prov} style={{ border: `1px solid ${color.line}`, borderRadius: 9, padding: '9px 12px' }}>
              <summary style={{ cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{p.prov}</span>
                <span style={{ fontSize: 12.5, color: color.mut }}>
                  {p.items.length === 1 ? '1 producto' : `${p.items.length} productos`} · {p.unidades === 1 ? '1 unidad vendida' : `${p.unidades} unidades vendidas`} ·
                  ~${Math.round(p.costoEstimado).toLocaleString('es-AR')}
                </span>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    void copiar(p.prov, pedidoATexto(p, periodoLabel))
                  }}
                  className="btn-sm"
                  style={{ marginLeft: 'auto', background: '#fff', border: `1px solid ${color.line2}` }}
                >
                  {copiado === p.prov ? '✓ Copiado' : '📋 Copiar pedido'}
                </button>
              </summary>
              <table style={{ width: '100%', marginTop: 8, fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: color.mut2, fontSize: 11, textAlign: 'left' }}>
                    <th>Producto</th>
                    <th style={{ width: 90, textAlign: 'right' }}>Vendidas</th>
                    <th style={{ width: 90, textAlign: 'right' }}>Rentab.</th>
                  </tr>
                </thead>
                <tbody>
                  {p.items.map((i) => (
                    <tr key={i.id} style={{ borderTop: `1px solid ${color.bg2}` }}>
                      <td style={{ padding: '4px 0' }}>{i.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{i.vendidas}</td>
                      <td style={{ textAlign: 'right', color: color.mut }}>{i.margin !== null ? i.margin.toFixed(0) + '%' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
