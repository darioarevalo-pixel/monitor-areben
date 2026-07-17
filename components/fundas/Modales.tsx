'use client'

import { useEffect, useRef, useState } from 'react'

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16,
}
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: '22px 24px', width: '100%', maxWidth: 380,
  boxShadow: '0 12px 40px rgba(0,0,0,.18)',
}
const botones: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }

/** Confirmación con dos botones. Reemplaza `confirm()` del legacy. */
export function ConfirmModal({ mensaje, onSi, onNo }: { mensaje: string; onSi: () => void; onNo: () => void }) {
  return (
    <div style={overlay} onClick={onNo}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 14, color: '#374151', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{mensaje}</div>
        <div style={botones}>
          <button className="btn-sm" onClick={onNo}>Cancelar</button>
          <button className="btn-sm" onClick={onSi} style={{ background: '#378ADD', color: '#fff' }}>Aceptar</button>
        </div>
      </div>
    </div>
  )
}

/** Pide un texto con un input. Reemplaza `prompt()` del legacy. */
export function PromptModal({
  mensaje,
  valorInicial,
  onOk,
  onCancel,
}: {
  mensaje: string
  valorInicial: string
  onOk: (v: string) => void
  onCancel: () => void
}) {
  const [valor, setValor] = useState(valorInicial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.select() }, [])
  return (
    <div style={overlay} onClick={onCancel}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 14, color: '#374151', whiteSpace: 'pre-line', lineHeight: 1.5, marginBottom: 10 }}>{mensaje}</div>
        <input
          ref={ref}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onOk(valor); if (e.key === 'Escape') onCancel() }}
          style={{ width: '100%' }}
        />
        <div style={botones}>
          <button className="btn-sm" onClick={onCancel}>Cancelar</button>
          <button className="btn-sm" onClick={() => onOk(valor)} style={{ background: '#378ADD', color: '#fff' }}>Aceptar</button>
        </div>
      </div>
    </div>
  )
}
