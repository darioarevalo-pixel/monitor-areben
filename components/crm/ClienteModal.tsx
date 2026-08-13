'use client'

import { Fragment, useEffect, useState } from 'react'
import {
  agregarNota,
  borrarNota,
  escribiHoy,
  hoyISO,
  setDescartado,
  setDifusion,
  setMayorista,
  setPagina,
  setProximoManual,
} from '@/lib/crm/seguimiento'
import { detallesPorVenta, esDescartado, resumenCompras } from '@/lib/crm/core'
import { leadInstaHref } from '@/lib/crm/leads'
import { traerDetalles } from '@/lib/crm/datos'
import type { ClienteCRM, FilaDetalle, MapaSeguimiento, ResumenCompras } from '@/lib/crm/tipos'
import { Button, Card, KpiCard, color, toneSolidHover } from '@/components/ui'

/** Los cinco textos que Bruno escribe todo el tiempo. Se insertan en el cuadro, no se guardan. */
const NOTAS_RAPIDAS = [
  '🔥 En cierre / cotizando',
  '📦 Pidió catálogo',
  '⏳ Me dijo que me avisa',
  '🔄 Preguntar por reposición',
  '❄️ Sin respuesta',
]

/** Punto de estado del seguimiento (era 🔴/🟡/🟢: un emoji trae su propio color y no se tematiza). */
function Punto({ col }: { col: string }) {
  return <span aria-hidden style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: col, verticalAlign: 'middle' }} />
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
  const [resumen, setResumen] = useState<ResumenCompras | null>(null)
  const [errResumen, setErrResumen] = useState(false)
  /** Los renglones de cada pedido, para abrir cualquiera del historial. */
  const [porPedido, setPorPedido] = useState<Map<number, FilaDetalle[]>>(new Map())
  /** Qué pedido está desplegado. Uno por vez: la ficha no se estira. */
  const [pedidoAbierto, setPedidoAbierto] = useState<number | null>(null)

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
      setPorPedido(new Map())
      setPedidoAbierto(null)
      try {
        const det = await traerDetalles((c.ventas || []).map((v) => v.id).filter((v) => v != null))
        if (!vivo) return
        setResumen(resumenCompras(c.ventas || [], det))
        // Mismo lote de detalles, agrupado por pedido: no cuesta una consulta más.
        setPorPedido(detallesPorVenta(det))
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
    proxLinea = <span style={{ color: color.mut2 }}>Sin recontacto programado — tocá un botón de acá arriba.</span>
  } else if (c.seg_estado === 'pendiente') {
    proxLinea = <span style={{ color: color.danger, fontWeight: 600 }}><Punto col={color.danger} /> A contactar (todavía sin primer contacto registrado)</span>
  } else {
    const d = c.dias_proximo as number
    const rel = d === 0 ? 'hoy' : d < 0 ? `hace ${-d} días` : `en ${d} días`
    const col = { vencido: color.danger, semana: color.warningInk, aldia: color.success }[c.seg_estado]!
    proxLinea = (
      <>
        <span style={{ color: col, fontWeight: 600 }}><Punto col={col} /> {fmtFecha(c.proximo_contacto)} ({rel})</span>
        <span style={{ color: color.mut2 }}>{manualActivo ? ' · fijado a mano' : ' · automático'}</span>
      </>
    )
  }

  const notas = c.notas || []
  const meta = [
    c.email || '',
    c.phone || '',
    c.city ? [c.city, c.province].filter(Boolean).join(', ') : '',
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, padding: 20, overflowY: 'auto' }} onClick={onCerrar}>
      <Card style={{ maxWidth: 720, width: '100%', margin: '20px 0' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{c.name}</h3>
            <div style={{ fontSize: 12, color: color.mut, marginTop: 3 }}>{meta}</div>
          </div>
          <Button size="sm" variant="outline" onClick={onCerrar}>Cerrar</Button>
        </div>

        {/* Seguimiento */}
        <div style={{ background: color.bg, border: `1px solid ${color.line}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: color.mut, marginBottom: 10, fontWeight: 600, letterSpacing: 0 }}>Seguimiento</div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--mo-mayorista-fg)' }}>
            <input type="checkbox" checked={!!seg.es_mayorista} onChange={(e) => mutar((s) => setMayorista(s, c.id, e.target.checked))} style={{ width: 16, height: 16, accentColor: 'var(--mo-mayorista-fg)' }} />
            ⭐ Cliente mayorista
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: color.success }}>
            <input type="checkbox" checked={!!seg.en_difusion} onChange={(e) => mutar((s) => setDifusion(s, c.id, e.target.checked))} style={{ width: 16, height: 16, accentColor: color.success }} />
            En el canal de difusión
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: color.mut }}>
            <input type="checkbox" checked={esDescartado(c.id, crmSeg)} onChange={(e) => mutar((s) => setDescartado(s, c.id, e.target.checked))} style={{ width: 16, height: 16 }} />
            Ya no se dedica
          </label>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: color.mut, display: 'block', marginBottom: 3 }}>Página / Instagram</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', maxWidth: 420 }}>
              <input
                type="text"
                value={pagina}
                placeholder="@usuario o link de su tienda/IG"
                onChange={(e) => setPaginaLocal(e.target.value)}
                onBlur={() => { if ((pagina || '').trim() !== (seg.pagina || '')) mutar((s) => setPagina(s, c.id, pagina)) }}
                style={{ flex: 1, padding: 8, fontSize: 13, boxSizing: 'border-box' }}
              />
              {pagHref && <a href={pagHref} target="_blank" rel="noopener" className="mo-btn mo-btn--sm" style={{ whiteSpace: 'nowrap', '--_bg': color.brandSolid, '--_fg': '#fff', '--_bd': color.brandSolid, '--_bg-hover': toneSolidHover.brand } as React.CSSProperties}>Abrir ↗</a>}
            </div>
          </div>

          {/* Una sola fila para todo el "próximo contacto".
              Cada botón usa `escribiHoy`, que marca el contacto de hoy Y fija la próxima
              fecha de un saque: es lo que antes hacían el botón "Hablé hoy" y los botones
              de días por separado. La fecha del final reprograma SIN marcar contacto de
              hoy, que es lo correcto cuando solo se corre la fecha. */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${color.line}` }}>
            <div style={{ fontSize: 11, color: color.mut, marginBottom: 5 }}>Le escribí hoy — recordarme en:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {([[1, 'Mañana'], [2, 'En 2 días'], [7, 'En 1 semana'], [30, 'En 30 días']] as [number, string][]).map(([d, t]) => (
                <Button key={d} size="sm" variant="soft" tone="brand" onClick={() => mutar((s) => escribiHoy(s, c.id, d))}>{t}</Button>
              ))}
              <input
                type="date"
                value={c.proximo_contacto || ''}
                onChange={(e) => mutar((s) => setProximoManual(s, c.id, e.target.value))}
                title="Elegir otra fecha en el calendario"
                style={{ padding: '4px 8px', fontSize: 12, marginLeft: 4 }}
              />
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 13 }}>{proxLinea}</div>

          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 11, color: color.mut, display: 'block', marginBottom: 4 }}>Nota de seguimiento</label>
            {/* Las notas rápidas ESCRIBEN en el cuadro, no guardan: casi siempre hay algo
                que agregarle a mano al texto base antes de dejarlo asentado. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
              {NOTAS_RAPIDAS.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant="outline"
                  onClick={() => setNotaTexto((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))}
                >
                  {t}
                </Button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea rows={2} value={notaTexto} onChange={(e) => setNotaTexto(e.target.value)} placeholder="Qué hablaron, qué quedó pendiente..." style={{ flex: 1, padding: 8, fontSize: 13, resize: 'vertical', border: `1px solid ${color.line2}`, borderRadius: 6, fontFamily: 'inherit' }} />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const texto = notaTexto.trim()
                  if (!texto) return
                  // La fecha es siempre la de hoy. `hoyISO()` usa el día REAL, no el TODAY
                  // congelado al abrir la pantalla: una nota cargada pasada la medianoche
                  // con la ficha abierta queda con la fecha correcta.
                  mutar((s) => agregarNota(s, c.id, texto, hoyISO()))
                  setNotaTexto('')
                }}
                style={{ alignSelf: 'flex-start' }}
              >
                Agregar
              </Button>
            </div>
            <div style={{ marginTop: 8 }}>
              {notas.length ? (
                notas.map((n, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: `1px solid ${color.bg2}` }}>
                    <div style={{ fontSize: 11, color: color.mut2, whiteSpace: 'nowrap', minWidth: 64 }}>{fmtFecha(n.fecha)}</div>
                    <div style={{ fontSize: 13, flex: 1 }}>{n.texto}</div>
                    <Button size="sm" variant="ghost" tone="danger" title="Borrar nota" onClick={() => mutar((s) => borrarNota(s, c.id, i))}>✕</Button>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: color.mut2, padding: '6px 0' }}>Sin notas todavía.</div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
          <KpiCard label="Pedidos" value={c.total_sales} />
          <KpiCard label="Total comprado" value={fmtMonto(c.total_amount)} />
          <KpiCard label="Ticket prom." value={fmtMonto(c.avg_ticket)} />
          <KpiCard label="Último pedido" value={c.dias_ultimo === null ? '—' : 'hace ' + c.dias_ultimo + 'd'} sub={fmtFecha(c.last_sale)} />
        </div>

        {/* Resumen de compras */}
        <div style={{ fontSize: 12, color: color.mut, marginBottom: 8, fontWeight: 600, letterSpacing: 0 }}>Resumen de compras</div>
        <div style={{ marginBottom: 16 }}>
          {errResumen ? (
            <div style={{ fontSize: 12, color: color.danger }}>No se pudo cargar el detalle de compras.</div>
          ) : !resumen ? (
            <div style={{ fontSize: 12, color: color.mut2 }}>Cargando resumen de compras…</div>
          ) : !resumen.top.length ? (
            <div style={{ fontSize: 12, color: color.mut2 }}>Sin detalle de productos disponible para este cliente.</div>
          ) : (
            <>
              {/* La tabla de "Última compra" se fue: era el primer pedido del historial, que
                  ahora se abre igual que todos los demás. */}
              <div style={{ fontSize: 11, color: color.mut2, marginBottom: 4 }}>Lo que más te compró (top {resumen.top.length})</div>
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
        <div style={{ fontSize: 12, color: color.mut, marginBottom: 8, fontWeight: 600, letterSpacing: 0 }}>Historial de pedidos ({ventasOrden.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: 12, width: '100%' }}>
            <thead><tr><th>Fecha</th><th>N°</th><th style={{ textAlign: 'right' }}>Total</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {ventasOrden.map((v) => {
                const items = porPedido.get(Number(v.id)) || []
                const abierto = pedidoAbierto === v.id
                return (
                  <Fragment key={v.id}>
                    <tr>
                      <td>{fmtFecha(v.date_sale)}</td>
                      <td>#{v.id}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMonto(Number(v.total_price) || 0)}</td>
                      <td style={{ fontSize: 11, color: color.mut }}>{v.sale_state || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {items.length ? (
                          <Button size="sm" variant="ghost" onClick={() => setPedidoAbierto(abierto ? null : v.id)}>
                            {abierto ? 'Ocultar ▲' : 'Ver pedido ▼'}
                          </Button>
                        ) : (
                          <span style={{ fontSize: 11, color: color.mut2 }}>{resumen || errResumen ? 'sin detalle' : '…'}</span>
                        )}
                      </td>
                    </tr>
                    {abierto && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <table style={{ fontSize: 12, width: '100%', background: color.bg, marginBottom: 6 }}>
                            <thead><tr><th>Producto</th><th>Talle</th><th style={{ textAlign: 'right' }}>Cant</th><th style={{ textAlign: 'right' }}>P. unit.</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                            <tbody>
                              {items.map((d, i) => (
                                <tr key={i}>
                                  <td>{d.product_name || '—'}</td>
                                  <td style={{ color: color.mut }}>{d.size || ''}</td>
                                  <td style={{ textAlign: 'right' }}>{d.quantity ?? ''}</td>
                                  <td style={{ textAlign: 'right' }}>{fmtMonto(Number(d.unit_price) || 0)}</td>
                                  <td style={{ textAlign: 'right' }}>{fmtMonto(Number(d.total) || (Number(d.unit_price) || 0) * (d.quantity || 0))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
