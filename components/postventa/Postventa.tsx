'use client'

/**
 * Post-venta (Administración) — un section con pestañas que comparten encuadre:
 *  - **Fallas** (v1, implementada): depósito valorizado de prendas con falla. NO vuelven al stock
 *    oficial (GN/TN) ni lo tocan; siguen su flujo (en depósito → vendida en feria | descartada).
 *    Muestra "cuánto tenemos en fallas" en plata (a costo y a PVP de feria).
 *  - **Cambios / Devoluciones / Canjes**: stubs, llegan en las próximas tandas de Fase 4.
 *
 * Marca-scoped por `useSesion().marca` (bdi | zattia). Stunned se suma cuando sea marca de primera clase.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { cambiarEstadoFalla, crearFalla, leerFallas } from '@/lib/postventa/fallas/cliente'
import { ESTADO_LABEL, type FallaEstado, type FallaRow } from '@/lib/postventa/fallas/tipos'

type Tab = 'fallas' | 'cambios' | 'devoluciones' | 'canjes'
const TABS: { key: Tab; label: string; listo: boolean }[] = [
  { key: 'fallas', label: 'Fallas', listo: true },
  { key: 'cambios', label: 'Cambios', listo: false },
  { key: 'devoluciones', label: 'Devoluciones', listo: false },
  { key: 'canjes', label: 'Canjes', listo: false },
]

const ESTADO_COLOR: Record<FallaEstado, { color: string; bg: string }> = {
  en_deposito: { color: '#B45309', bg: '#FFFBEB' },
  vendida_feria: { color: '#15803D', bg: '#F0FDF4' },
  descartada: { color: '#6B7280', bg: '#F3F4F6' },
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

const btn: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer' }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '6px 8px', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: 12, padding: '6px 8px', borderBottom: '1px solid #F3F4F6', whiteSpace: 'nowrap' }
const inp: React.CSSProperties = { fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid #D1D5DB', outline: 'none' }
const tabBtn = (activo: boolean, listo: boolean): React.CSSProperties => ({
  fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8,
  border: '1px solid ' + (activo ? '#D97706' : '#E5E7EB'),
  background: activo ? '#FFFBEB' : '#fff',
  color: activo ? '#B45309' : listo ? '#6B7280' : '#9CA3AF',
  cursor: 'pointer',
})

const FORM0 = { producto: '', sku: '', cantidad: '1', motivo: '', valuacion_costo: '', valuacion_pvp_feria: '' }

export function Postventa() {
  const { marca, perfil } = useSesion()
  const usuario = perfil?.name || ''
  const [tab, setTab] = useState<Tab>('fallas')

  const [fallas, setFallas] = useState<FallaRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({ ...FORM0 })
  const [filtro, setFiltro] = useState<'todas' | FallaEstado>('todas')

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setFallas(await leerFallas(marca))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [marca])

  // Carga inicial (y al cambiar de marca): el setState va SIEMPRE después del await (nunca en el
  // cuerpo sincrónico del effect), como en Integraciones — así no dispara react-hooks/set-state-in-effect.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const data = await leerFallas(marca)
        if (vivo) setFallas(data)
      } catch (e) {
        if (vivo) setError((e as Error).message)
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const agregar = useCallback(async () => {
    if (!form.producto.trim()) {
      setError('Poné al menos el producto.')
      return
    }
    setGuardando(true)
    setError(null)
    setMsg(null)
    try {
      await crearFalla(
        marca,
        {
          producto: form.producto.trim(),
          sku: form.sku.trim() || null,
          cantidad: Math.max(1, parseInt(form.cantidad, 10) || 1),
          motivo: form.motivo.trim() || null,
          valuacion_costo: form.valuacion_costo === '' ? null : Number(form.valuacion_costo),
          valuacion_pvp_feria: form.valuacion_pvp_feria === '' ? null : Number(form.valuacion_pvp_feria),
        },
        usuario,
      )
      setForm({ ...FORM0 })
      setMsg('Falla cargada.')
      await recargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }, [form, marca, usuario, recargar])

  const cambiarEstado = useCallback(async (f: FallaRow, estado: FallaEstado) => {
    setError(null)
    try {
      await cambiarEstadoFalla(marca, f.id, estado, usuario)
      setFallas((fs) => fs.map((x) => (x.id === f.id ? { ...x, estado } : x)))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [marca, usuario])

  const visibles = useMemo(
    () => (filtro === 'todas' ? fallas : fallas.filter((f) => f.estado === filtro)),
    [fallas, filtro],
  )

  // Totales del depósito: solo lo que sigue EN DEPÓSITO (lo vendido/descartado ya no es tenencia).
  const totales = useMemo(() => {
    const enDep = fallas.filter((f) => f.estado === 'en_deposito')
    let unidades = 0, costo = 0, pvp = 0
    for (const f of enDep) {
      const c = f.cantidad || 1
      unidades += c
      costo += (Number(f.valuacion_costo) || 0) * c
      pvp += (Number(f.valuacion_pvp_feria) || 0) * c
    }
    return { unidades, costo, pvp, items: enDep.length }
  }, [fallas])

  const setF = (k: keyof typeof FORM0) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }))

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            style={tabBtn(tab === t.key, t.listo)}
            onClick={() => setTab(t.key)}
            title={t.listo ? undefined : 'Próximamente'}
          >
            {t.label}{t.listo ? '' : ' ·'}
          </button>
        ))}
      </div>

      {tab !== 'fallas' ? (
        <div style={{ fontSize: 13, color: '#6B7280', padding: '28px 20px', border: '1px dashed #E5E7EB', borderRadius: 12, textAlign: 'center' }}>
          <b style={{ color: '#374151' }}>{TABS.find((t) => t.key === tab)?.label}</b> llega en una próxima tanda de Post-venta.
          <div style={{ fontSize: 12, marginTop: 6 }}>Por ahora está implementado el depósito de <b>Fallas</b>.</div>
        </div>
      ) : (
        <>
          {/* Totales del depósito de fallas (valorizado) */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              { t: 'En depósito', v: `${totales.unidades} u · ${totales.items} ítems` },
              { t: 'Valuado a costo', v: money(totales.costo) },
              { t: 'Valuado a PVP feria', v: money(totales.pvp) },
            ].map((c) => (
              <div key={c.t} style={{ flex: '1 1 200px', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>{c.t}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginTop: 2 }}>{c.v}</div>
              </div>
            ))}
          </div>

          {/* Alta de falla */}
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Cargar falla</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '2 1 220px' }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>Producto *</span>
                <input style={inp} value={form.producto} onChange={setF('producto')} placeholder="Remera boxy negra" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 140px' }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>SKU (opcional)</span>
                <input style={inp} value={form.sku} onChange={setF('sku')} placeholder="STU-REM-0001-M" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '0 1 80px' }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>Cantidad</span>
                <input style={inp} type="number" min={1} value={form.cantidad} onChange={setF('cantidad')} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '0 1 120px' }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>Costo unit.</span>
                <input style={inp} type="number" min={0} value={form.valuacion_costo} onChange={setF('valuacion_costo')} placeholder="$" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '0 1 120px' }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>PVP feria unit.</span>
                <input style={inp} type="number" min={0} value={form.valuacion_pvp_feria} onChange={setF('valuacion_pvp_feria')} placeholder="$" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '2 1 200px' }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>Motivo</span>
                <input style={inp} value={form.motivo} onChange={setF('motivo')} placeholder="Mancha, costura, etc." />
              </label>
              <button style={{ ...btn, borderColor: '#D97706', color: '#B45309' }} onClick={() => void agregar()} disabled={guardando}>
                {guardando ? 'Guardando…' : '+ Agregar'}
              </button>
            </div>
          </div>

          {msg && <div style={{ fontSize: 12, color: '#065F46', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>{msg}</div>}
          {error && <div style={{ fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>{error}</div>}

          {/* Filtro por estado */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            {(['todas', 'en_deposito', 'vendida_feria', 'descartada'] as const).map((f) => (
              <button key={f} style={tabBtn(filtro === f, true)} onClick={() => setFiltro(f)}>
                {f === 'todas' ? 'Todas' : ESTADO_LABEL[f]}
              </button>
            ))}
            <button style={btn} onClick={() => void recargar()} disabled={cargando}>↻ Recargar</button>
          </div>

          {cargando ? (
            <div style={{ fontSize: 13, color: '#6B7280', padding: 20 }}>Cargando fallas…</div>
          ) : visibles.length === 0 ? (
            <div style={{ fontSize: 13, color: '#6B7280', padding: 20 }}>
              {fallas.length === 0 ? 'No hay fallas cargadas. Usá el formulario de arriba.' : 'No hay fallas con ese estado.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Producto</th>
                    <th style={th}>SKU</th>
                    <th style={{ ...th, textAlign: 'right' }}>Cant.</th>
                    <th style={th}>Motivo</th>
                    <th style={{ ...th, textAlign: 'right' }}>Costo</th>
                    <th style={{ ...th, textAlign: 'right' }}>PVP feria</th>
                    <th style={th}>Estado</th>
                    <th style={th}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => {
                    const ec = ESTADO_COLOR[f.estado]
                    return (
                      <tr key={f.id}>
                        <td style={{ ...td, fontWeight: 600, color: '#111827', whiteSpace: 'normal' }}>{f.producto}</td>
                        <td style={{ ...td, fontFamily: 'monospace', color: '#6B7280' }}>{f.sku || '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{f.cantidad}</td>
                        <td style={{ ...td, whiteSpace: 'normal', color: '#6B7280' }}>{f.motivo || '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{money(f.valuacion_costo)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{money(f.valuacion_pvp_feria)}</td>
                        <td style={td}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: ec.color, background: ec.bg, borderRadius: 6, padding: '2px 8px' }}>
                            {ESTADO_LABEL[f.estado]}
                          </span>
                        </td>
                        <td style={td}>
                          <span style={{ display: 'inline-flex', gap: 6 }}>
                            {f.estado !== 'vendida_feria' && (
                              <button style={{ ...btn, padding: '3px 8px', fontSize: 11, borderColor: '#15803D', color: '#15803D' }} onClick={() => void cambiarEstado(f, 'vendida_feria')}>Vendida</button>
                            )}
                            {f.estado !== 'descartada' && (
                              <button style={{ ...btn, padding: '3px 8px', fontSize: 11, color: '#6B7280' }} onClick={() => void cambiarEstado(f, 'descartada')}>Descartar</button>
                            )}
                            {f.estado !== 'en_deposito' && (
                              <button style={{ ...btn, padding: '3px 8px', fontSize: 11, borderColor: '#D97706', color: '#B45309' }} onClick={() => void cambiarEstado(f, 'en_deposito')}>Reactivar</button>
                            )}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
