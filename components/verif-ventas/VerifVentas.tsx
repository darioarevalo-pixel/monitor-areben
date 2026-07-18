'use client'

import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { guardarResueltas, leerResueltas } from '@/lib/kv/cliente'
import { mesDe, particionar, rango } from '@/lib/verif-ventas/core'
import { verificarVentas } from '@/lib/verif-ventas/cliente'
import type { Discrepancia, ResueltaEntry, Resueltas, VvtaData } from '@/lib/verif-ventas/tipos'

const hoyISO = () => new Date().toISOString().slice(0, 10)
const money = (n?: number) => (n == null ? '—' : '$' + Math.round(+n).toLocaleString('es-AR'))

export function VerifVentas() {
  const { marca, perfil } = useSesion()
  const [mes, setMes] = useState(() => mesDe(new Date()))
  const [data, setData] = useState<VvtaData | null>(null)
  const [resueltas, setResueltas] = useState<Resueltas>({})
  const [cargado, setCargado] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [verResueltas, setVerResueltas] = useState(false)

  const verificar = async () => {
    setCargando(true)
    setData(null)
    const { from, to } = rango(mes)
    const [rv, rk] = await Promise.all([verificarVentas(marca, from, to), leerResueltas<ResueltaEntry>(marca)])
    setData(rv || { error: 'Sin respuesta' })
    if (rk.ok) {
      setResueltas(rk.dato)
      setCargado(true)
    } else {
      setResueltas({})
      setCargado(false)
    }
    setCargando(false)
  }

  const marcar = async (tnOrder: string, checked: boolean) => {
    const next: Resueltas = { ...resueltas }
    if (checked) next[tnOrder] = { resuelto: true, por: perfil?.name || '', fecha: hoyISO(), mes }
    else delete next[tnOrder]
    setResueltas(next)
    if (!cargado) {
      alert('No se pudo leer el checklist, así que no se guarda (guardar ahora lo borraría). Verificá de nuevo.')
      return
    }
    const r = await guardarResueltas({ store: marca, resueltas: next, cargado: true })
    if (!r.ok) alert('No se pudo guardar: ' + r.motivo)
  }

  const r = data?.resumen || {}
  const disc = data?.discrepancias || []
  const { pend, res } = particionar(disc, resueltas)
  const scope403 = data?.tn_debug?.status === 403

  const fila = (d: Discrepancia) => {
    const ok = !!resueltas[String(d.tn_order)]
    return (
      <tr key={String(d.tn_order)} style={{ opacity: ok ? 0.55 : 1 }}>
        <td style={td}><input type="checkbox" checked={ok} onChange={(e) => marcar(String(d.tn_order), e.target.checked)} title="Marcar como ya anulada en GN" style={{ width: 16, height: 16, cursor: 'pointer' }} /></td>
        <td style={{ ...td, fontWeight: 600 }}>#{String(d.tn_order)}</td>
        <td style={td}>{String(d.gn_number || d.gn_id || '—')}</td>
        <td style={td}>{d.date_sale || '—'}</td>
        <td style={td}>{d.client_name || '—'}</td>
        <td style={{ ...td, textAlign: 'right' }}>{money(d.total_price)}</td>
      </tr>
    )
  }
  const tabla = (arr: Discrepancia[]) => (
    <div style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left' }}><th style={th}>✔</th><th style={th}>Pedido TN</th><th style={th}>Venta GN</th><th style={th}>Fecha</th><th style={th}>Cliente</th><th style={{ ...th, textAlign: 'right' }}>Monto</th></tr></thead>
        <tbody>{arr.map(fila)}</tbody>
      </table>
    </div>
  )

  return (
    <div className="card">
      <div style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: '#374151' }}>Mes <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 7 }} /></label>
          <button className="btn-primary" onClick={verificar} disabled={cargando}>{cargando ? '⏳ Verificando…' : '🔍 Verificar'}</button>
        </div>

        {cargando ? (
          <div style={{ padding: 16, color: '#9CA3AF' }}>Consultando TiendaNube y Gestión Nube… (puede tardar unos segundos)</div>
        ) : !data ? (
          <div style={{ padding: 16, color: '#9CA3AF' }}>Elegí el mes y tocá <b>Verificar</b>.</div>
        ) : scope403 ? (
          <div style={{ background: '#FFFBEB', border: '1px solid #FBBF24', borderRadius: 9, padding: 12, color: '#92400E' }}>⚠ TiendaNube todavía no nos deja leer los pedidos: falta habilitar el permiso <b>read_orders</b> en la app de TiendaNube (y regenerar el token). Cuando esté, esto funciona solo.</div>
        ) : data.error ? (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 9, padding: 12, color: '#991B1B' }}>{data.error}</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 9, padding: '8px 14px', fontSize: 13 }}>Cancelados en TN: <b>{r.tn_cancelados ?? 0}</b></div>
              <div style={{ background: pend.length ? '#FEF2F2' : '#ECFDF5', border: `1px solid ${pend.length ? '#FCA5A5' : '#A7F3D0'}`, borderRadius: 9, padding: '8px 14px', fontSize: 13 }}>A revisar (activas en GN): <b style={{ color: pend.length ? '#991B1B' : '#065F46' }}>{pend.length}</b></div>
              {res.length > 0 && <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 9, padding: '8px 14px', fontSize: 13 }}>Resueltas: <b>{res.length}</b></div>}
            </div>
            {!disc.length ? (
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 9, padding: 14, color: '#065F46', textAlign: 'center' }}>✅ No hay ventas activas en GN que estén canceladas en TN para este mes.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>GN no permite anular por API → anulá la venta en <b>Gestión Nube</b> a mano y después tildala acá.</div>
                {pend.length ? tabla(pend) : <div style={{ color: '#065F46', fontSize: 13, padding: '8px 0' }}>✅ Todas las de este mes ya están resueltas.</div>}
                {res.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <button className="btn-sm" onClick={() => setVerResueltas((v) => !v)} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>{verResueltas ? 'Ocultar' : 'Ver'} resueltas ({res.length})</button>
                    {verResueltas && tabla(res)}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const td = { padding: '5px 8px', borderTop: '1px solid #F1F5F9' } as const
const th = { padding: '4px 8px' } as const
