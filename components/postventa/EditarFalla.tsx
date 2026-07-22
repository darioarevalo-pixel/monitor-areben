'use client'

/**
 * Edición de campos de una falla (solo Administración). Reusa `action:'editar'` de api/fallas.js.
 * NO edita el link de GN ni la venta ya hecha; solo los datos informativos y de valuación.
 */

import { useState } from 'react'
import { editarFalla } from '@/lib/postventa/fallas/cliente'
import type { FallaRow, FallaUbicacion } from '@/lib/postventa/fallas/tipos'
import type { Marca } from '@/lib/nav.generated'

const inp: React.CSSProperties = { fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid #D1D5DB', outline: 'none', width: '100%' }
const lbl: React.CSSProperties = { fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }

export function EditarFalla({ marca, falla, onClose, onSaved }: { marca: Marca; falla: FallaRow; onClose: () => void; onSaved: () => void }) {
  const [producto, setProducto] = useState(falla.producto || '')
  const [motivo, setMotivo] = useState(falla.motivo || '')
  const [cantidad, setCantidad] = useState(String(falla.cantidad || 1))
  const [costo, setCosto] = useState(falla.valuacion_costo != null ? String(falla.valuacion_costo) : '')
  const [pvp, setPvp] = useState(falla.valuacion_pvp_feria != null ? String(falla.valuacion_pvp_feria) : '')
  const [ubicacion, setUbicacion] = useState<FallaUbicacion>(falla.ubicacion || 'local')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await editarFalla(marca, falla.id, {
        producto: producto.trim(),
        motivo: motivo.trim() || null,
        cantidad: Math.max(1, parseInt(cantidad, 10) || 1),
        valuacion_costo: costo === '' ? null : Number(costo),
        valuacion_pvp_feria: pvp === '' ? null : Number(pvp),
        ubicacion,
      })
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, minWidth: 340, maxWidth: 420, width: '90%' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Editar falla</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div><span style={lbl}>Producto</span><input style={inp} value={producto} onChange={(e) => setProducto(e.target.value)} /></div>
          <div><span style={lbl}>Motivo</span><input style={inp} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><span style={lbl}>Cantidad</span><input style={inp} type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></div>
            <div style={{ flex: 1 }}>
              <span style={lbl}>Ubicación</span>
              <select style={inp} value={ubicacion} onChange={(e) => setUbicacion(e.target.value as FallaUbicacion)}>
                <option value="local">Local</option>
                <option value="deposito">Depósito</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><span style={lbl}>Costo unit.</span><input style={inp} type="number" min={0} value={costo} onChange={(e) => setCosto(e.target.value)} /></div>
            <div style={{ flex: 1 }}><span style={lbl}>PVP feria unit.</span><input style={inp} type="number" min={0} value={pvp} onChange={(e) => setPvp(e.target.value)} /></div>
          </div>
        </div>
        {error && <div style={{ fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={() => void guardar()} disabled={guardando} style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1px solid #D97706', color: '#B45309', background: '#FFFBEB', cursor: 'pointer' }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
