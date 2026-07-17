'use client'

import { useEffect, useState } from 'react'
import {
  agregarNota,
  borrarNota,
  escribiHoy,
  hableHoy,
  hoyISO,
  setCadencia,
  setDescartado,
  setMayorista,
  setPagina,
  setProximoManual,
} from '@/lib/crm/seguimiento'
import { esDescartado, resumenCompras } from '@/lib/crm/core'
import { leadInstaHref } from '@/lib/crm/leads'
import { traerDetalles } from '@/lib/crm/datos'
import type { ClienteCRM, MapaSeguimiento, ResumenCompras } from '@/lib/crm/tipos'

const CADENCIA_LABEL: Record<string, string> = {
  '': 'Sin seguimiento',
  semanal: 'Semana (7 días)',
  quincenal: 'Quincena (15 días)',
  mensual: 'Mes (30 días)',
}

const fmtMonto = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
function fmtFecha(d: string | null): string {
  if (!d) return '—'
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

type Props = {
  cliente: ClienteCRM
  crmSeg: MapaSeguimiento
  /** Aplica una transformación de seguimiento y la persiste (POST del mapa entero). */
  mutar: (fn: (s: MapaSeguimiento) => MapaSeguimiento) => void
  onCerrar: () => void
}

/**
 * Ficha del cliente: seguimiento editable (cadencia, contacto, notas, mayorista,
 * descartado, página) + stats + resumen de compras + historial. Port de
 * abrirClienteModal + segBloqueModalHTML (index.html:13344-13927).
 *
 * Cada edición pasa por `mutar`, que corre una transformación PURA de
 * `lib/crm/seguimiento.ts` y persiste el mapa entero con el flag `cargado`. Los
 * inputs de texto persisten en el BLUR (no por tecla): cada guardado POSTea los
 * 305 clientes.
 */
export function ClienteModal({ cliente: c, crmSeg, mutar, onCerrar }: Props) {
  const seg = crmSeg[String(c.id)] || {}
  const [pagina, setPaginaLocal] = useState(seg.pagina || '')
  const [notaTexto, setNotaTexto] = useState('')
  const [notaFecha, setNotaFecha] = useState(hoyISO())
  const [resumen, setResumen] = useState<ResumenCompras | null>(null)
  const [errResumen, setErrResumen] = useState(false)

  // El input de página es local y se persiste al perder foco (no por tecla). El
  // padre keyea el modal por id de cliente, así el estado local se re-inicializa
  // al cambiar de ficha (no hace falta un effect de sync).

  // Resumen de compras: async, una vez por cliente. El reset y el setState van
  // dentro del callback async (no sincrónico en el effect) para no disparar
  // cascada de renders.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      setResumen(null)
      setErrResumen(false)
      try {
        const det = await traerDetalles((c.ventas || []).map((v) => v.id).filter((v) => v != null))
        if (vivo) setResumen(resumenCompras(c.ventas || [], det))
      } catch {
        if (vivo) setErrResumen(true)
      }
    })()
    return () => { vivo = false }
  }, [c.id, c.ventas])

  const manualActivo = !!seg.proximo_manual
  const pagHref = leadInstaHref(pagina)
  const ventasOrden = [...c.ventas].sort((a, b) => (b.date_sale || '').localeCompare(a.date_sale || ''))

  // Línea de estado del próximo contacto (segBloqueModalHTML).
  let proxLinea: React.ReactNode
  if (c.seg_estado === 'none') {
    proxLinea = <span style={{ color: '#9CA3AF' }}>Elegí cada cuánto recontactarlo para programarlo.</span>
  } else if (c.seg_estado === 'pendiente') {
    proxLinea = <span style={{ color: '#DC2626', fontWeight: 600 }}>🔴 A contactar (todavía sin primer contacto registrado)</span>
  } else {
    const d = c.dias_proximo as number
    const rel = d === 0 ? 'hoy' : d < 0 ? `hace ${-d} días` : `en ${d} días`
    const cfg = { vencido: ['🔴', '#DC2626'], semana: ['🟡', '#B45309'], aldia: ['🟢', '#15803D'] }[c.seg_estado]!
    proxLinea = (
      <>
        <span style={{ color: cfg[1], fontWeight: 600 }}>{cfg[0]} {fmtFecha(c.proximo_contacto)} ({rel})</span>
        <span style={{ color: '#9CA3AF' }}>{manualActivo ? ' · fijado a mano' : ' · automático'}</span>
      </>
    )
  }

  const notas = c.notas || []
  const meta = [
    c.email ? `📧 ${c.email}` : '',
    c.phone ? `📱 ${c.phone}` : '',
    c.city ? `📍 ${[c.city, c.province].filter(Boolean).join(', ')}` : '',
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, padding: 20, overflowY: 'auto' }} onClick={onCerrar}>
      <div className="card" style={{ maxWidth: 720, width: '100%', margin: '20px 0' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{c.name}</h3>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>{meta}</div>
          </div>
          <button className="btn-sm" onClick={onCerrar}>✕ Cerrar</button>
        </div>

        {/* Seguimiento */}
        <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>📞 Seguimiento</div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#7C3AED' }}>
            <input type="checkbox" checked={!!seg.es_mayorista} onChange={(e) => mutar((s) => setMayorista(s, c.id, e.target.checked))} style={{ width: 16, height: 16, accentColor: '#7C3AED' }} />
            ⭐ Cliente mayorista <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 11 }}>(aparece en el CRM Mayorista aunque compre por otro canal)</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6B7280' }}>
            <input type="checkbox" checked={esDescartado(c.id, crmSeg)} onChange={(e) => mutar((s) => setDescartado(s, c.id, e.target.checked))} style={{ width: 16, height: 16 }} />
            🚫 Ya no se dedica <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 11 }}>(lo saca del CRM, KPIs y recontacto; reversible)</span>
          </label>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>Página / Instagram</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', maxWidth: 420 }}>
              <input
                type="text"
                value={pagina}
                placeholder="@usuario o link de su tienda/IG"
                onChange={(e) => setPaginaLocal(e.target.value)}
                onBlur={() => { if ((pagina || '').trim() !== (seg.pagina || '')) mutar((s) => setPagina(s, c.id, pagina)) }}
                style={{ flex: 1, padding: 8, fontSize: 13, boxSizing: 'border-box' }}
              />
              {pagHref && <a href={pagHref} target="_blank" rel="noopener" className="btn-sm" style={{ whiteSpace: 'nowrap', background: '#2563EB', color: '#fff' }}>Abrir ↗</a>}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>Recontactar cada</label>
              <select value={c.cadencia || ''} onChange={(e) => mutar((s) => setCadencia(s, c.id, e.target.value))} style={{ padding: '6px 8px' }}>
                {['', 'semanal', 'quincenal', 'mensual'].map((v) => <option key={v} value={v}>{CADENCIA_LABEL[v]}</option>)}
              </select>
            </div>
            <button className="btn-sm" onClick={() => mutar((s) => hableHoy(s, c.id))} style={{ background: '#16A34A', color: '#fff' }}>✅ Hablé hoy</button>
            <div>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>Último contacto</label>
              <div style={{ fontSize: 13, padding: '6px 0' }}>{c.ultimo_contacto ? fmtFecha(c.ultimo_contacto) : '—'}</div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>Próximo contacto</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="date" value={c.proximo_contacto || ''} onChange={(e) => mutar((s) => setProximoManual(s, c.id, e.target.value))} style={{ padding: '5px 8px' }} />
                {manualActivo && <button className="btn-sm" onClick={() => mutar((s) => setProximoManual(s, c.id, ''))} title="Volver a calcularlo por cadencia">↺ Automático</button>}
              </div>
              <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3 }}>Tocá la fecha para fijar otra a mano.</div>
            </div>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #E5E7EB' }}>
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 5 }}>✍️ Le escribí hoy — recordarme de nuevo en:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[[1, 'Mañana'], [2, 'En 2 días'], [3, 'En 3 días'], [7, 'En 1 semana']].map(([d, t]) => (
                <button key={d} className="btn-sm" onClick={() => mutar((s) => escribiHoy(s, c.id, d as number))} style={{ background: '#EEF2FF', color: '#3730A3', border: '1px solid #C7D2FE' }}>{t}</button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 13 }}>{proxLinea}</div>

          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 4 }}>Nota de seguimiento</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="date" value={notaFecha} onChange={(e) => setNotaFecha(e.target.value)} title="Fecha de la nota" style={{ padding: 8, fontSize: 13 }} />
              <textarea rows={2} value={notaTexto} onChange={(e) => setNotaTexto(e.target.value)} placeholder="Qué hablaron, qué quedó pendiente..." style={{ flex: 1, padding: 8, fontSize: 13, resize: 'vertical', border: '1px solid #D1D5DB', borderRadius: 6, fontFamily: 'inherit' }} />
              <button
                className="btn-sm"
                onClick={() => {
                  const texto = notaTexto.trim()
                  if (!texto) return
                  mutar((s) => agregarNota(s, c.id, texto, notaFecha.trim() || hoyISO()))
                  setNotaTexto('')
                }}
                style={{ alignSelf: 'flex-start' }}
              >
                Agregar
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              {notas.length ? (
                notas.map((n, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
                    <div style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', minWidth: 64 }}>{fmtFecha(n.fecha)}</div>
                    <div style={{ fontSize: 13, flex: 1 }}>{n.texto}</div>
                    <button className="btn-sm" title="Borrar nota" onClick={() => mutar((s) => borrarNota(s, c.id, i))} style={{ padding: '0 6px', color: '#DC2626' }}>✕</button>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: '#9CA3AF', padding: '6px 0' }}>Sin notas todavía.</div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
          <div className="stat"><div className="stat-label">Pedidos</div><div className="stat-value" style={{ fontSize: 22 }}>{c.total_sales}</div></div>
          <div className="stat"><div className="stat-label">Total comprado</div><div className="stat-value" style={{ fontSize: 18 }}>{fmtMonto(c.total_amount)}</div></div>
          <div className="stat"><div className="stat-label">Ticket prom.</div><div className="stat-value" style={{ fontSize: 18 }}>{fmtMonto(c.avg_ticket)}</div></div>
          <div className="stat"><div className="stat-label">Último pedido</div><div className="stat-value" style={{ fontSize: 16 }}>{c.dias_ultimo === null ? '—' : 'hace ' + c.dias_ultimo + 'd'}</div><div style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtFecha(c.last_sale)}</div></div>
        </div>

        {/* Resumen de compras */}
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>🛒 Resumen de compras</div>
        <div style={{ marginBottom: 16 }}>
          {errResumen ? (
            <div style={{ fontSize: 12, color: '#DC2626' }}>No se pudo cargar el detalle de compras.</div>
          ) : !resumen ? (
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Cargando resumen de compras…</div>
          ) : !resumen.top.length ? (
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Sin detalle de productos disponible para este cliente.</div>
          ) : (
            <>
              {resumen.ultima && (
                <>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>Última compra · {fmtFecha(resumen.ultima.fecha)}</div>
                  <table style={{ fontSize: 12, width: '100%', marginBottom: 14 }}>
                    <thead><tr><th>Producto</th><th>Talle</th><th style={{ textAlign: 'right' }}>Cant</th><th style={{ textAlign: 'right' }}>P. unit.</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                    <tbody>
                      {resumen.ultima.items.map((d, i) => (
                        <tr key={i}><td>{d.product_name || '—'}</td><td style={{ color: '#6B7280' }}>{d.size || ''}</td><td style={{ textAlign: 'right' }}>{d.quantity ?? ''}</td><td style={{ textAlign: 'right' }}>{fmtMonto(Number(d.unit_price) || 0)}</td><td style={{ textAlign: 'right' }}>{fmtMonto(Number(d.total) || (Number(d.unit_price) || 0) * (d.quantity || 0))}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>Lo que más te compró (top {resumen.top.length})</div>
              <table style={{ fontSize: 12, width: '100%' }}>
                <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Unid.</th><th style={{ textAlign: 'right' }}>Veces</th><th style={{ textAlign: 'right' }}>Últ. precio</th></tr></thead>
                <tbody>
                  {resumen.top.map((a, i) => (
                    <tr key={i}><td>{a.name}</td><td style={{ textAlign: 'right' }}>{a.unidades}</td><td style={{ textAlign: 'right' }}>{a.veces}</td><td style={{ textAlign: 'right' }}>{fmtMonto(a.ultPrecio)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Historial */}
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Historial de pedidos ({ventasOrden.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: 12 }}>
            <thead><tr><th>Fecha</th><th>N°</th><th style={{ textAlign: 'right' }}>Total</th><th>Estado</th></tr></thead>
            <tbody>
              {ventasOrden.map((v) => (
                <tr key={v.id}><td>{fmtFecha(v.date_sale)}</td><td>#{v.id}</td><td style={{ textAlign: 'right' }}>{fmtMonto(Number(v.total_price) || 0)}</td><td style={{ fontSize: 11, color: '#6B7280' }}>{v.sale_state || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
