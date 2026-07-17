'use client'

import { computeFrom } from '@/lib/fundas/simulacion'
import type { SimBloque } from '@/lib/fundas/tipos'

type Props = {
  pedidos: SimBloque[]
  editando: string | null
  onEditar: (id: string) => void
  onDuplicar: (id: string) => void
  onEliminar: (id: string) => void
  onNombre: (id: string, val: string) => void
}

/**
 * Pedidos guardados para el proveedor. Port de fmBloquesRender (index.html:4985).
 * Arranca oculta hasta que hay pedidos (691, display:none). "Imagen de todo" y
 * "PDF de todo" quedan inertes hasta el Paso 4.
 */
export function PedidosCard({ pedidos, editando, onEditar, onDuplicar, onEliminar, onNombre }: Props) {
  if (!pedidos.length) return null

  return (
    <div className="card" style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Pedidos del proveedor <span style={{ color: '#378ADD' }}>({pedidos.length})</span>
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn-sm" disabled title="Llega en el próximo paso del port" style={{ background: '#25D366', color: '#fff', opacity: 0.5, cursor: 'not-allowed' }}>📷 Imagen de todo</button>
          <button className="btn-sm" disabled title="Llega en el próximo paso del port" style={{ background: '#DC2626', color: '#fff', opacity: 0.5, cursor: 'not-allowed' }}>📄 PDF de todo</button>
        </div>
      </div>

      <div>
        {pedidos.map((b) => {
          const varOn = !!b.varOn && (b.vars || []).length > 0
          const filas = computeFrom(b.total, b.rows, b.vars, varOn)
          const totalU = filas.reduce((s, r) => s + r.qty, 0)
          const nModelos = filas.length
          const variantes = varOn ? b.vars.map((v) => v.name || 'var').join(' / ') : 'sin variantes'
          const esEdit = b.id === editando
          return (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: `1px solid ${esEdit ? '#378ADD' : '#EEF0F2'}`, borderRadius: 8, marginBottom: 6, background: esEdit ? '#F0F7FF' : '#fff', flexWrap: 'wrap' }}>
              <input
                value={b.nombre}
                onChange={(e) => onNombre(b.id, e.target.value)}
                style={{ fontWeight: 600, fontSize: 13, border: '1px solid transparent', background: 'transparent', width: 170, padding: '3px 5px', borderRadius: 6 }}
              />
              <span style={{ fontSize: 12, color: '#6B7280', flex: 1, minWidth: 140 }}>{totalU} u · {nModelos} modelo{nModelos === 1 ? '' : 's'} · {variantes}</span>
              {esEdit && <span style={{ fontSize: 11, color: '#378ADD', fontWeight: 600 }}>● editando</span>}
              <button className="btn-sm" onClick={() => onEditar(b.id)}>Editar</button>
              <button className="btn-sm" onClick={() => onDuplicar(b.id)} title="Duplicar">⧉</button>
              <button className="btn-sm" onClick={() => onEliminar(b.id)} title="Eliminar" style={{ color: '#DC2626' }}>🗑</button>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Armá un pedido arriba y tocá <b>💾 Guardar pedido</b>. Repetí con cada funda/diseño.</div>
    </div>
  )
}
