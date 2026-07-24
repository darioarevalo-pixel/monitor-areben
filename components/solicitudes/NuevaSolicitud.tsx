'use client'

import { useState } from 'react'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { AYUDA_DESTINO, DESTINO_DEFAULT, MOTIVO_DEFAULT, MOTIVOS } from './preset'
import type { TipoSol } from '@/lib/sesionfotos/tipos'

/**
 * El alta de una solicitud empieza acá: **motivo** (para qué sale) y **destino** (si
 * vuelve o no). Son los dos ejes del modelo nuevo, y se preguntan juntos y primero porque
 * el motivo decide en qué cajón se guarda —o sea, a qué pantalla hay que ir— y el destino
 * decide el comportamiento (si necesita aprobación y si el sistema espera la devolución).
 *
 * Los dos destinos están siempre a la vista, con su explicación, en vez de esconder el
 * consumo detrás de un flujo aparte: la diferencia no es administrativa, es si esa unidad
 * vuelve a estar en venta.
 */
export function NuevaSolicitud({ onCancelar, onOk }: { onCancelar: () => void; onOk: (a: { motivo: string; tipo: TipoSol }) => void }) {
  const [motivo, setMotivo] = useState<string>(MOTIVO_DEFAULT)
  const [tipo, setTipo] = useState<TipoSol>(DESTINO_DEFAULT)

  return (
    <div
      onClick={onCancelar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 18, maxWidth: 480, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,.3)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Nueva solicitud</div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 14 }}>Después elegís los productos.</div>

        <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 14 }}>
          ¿Para qué la pedís?
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
          >
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>

        <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>¿El producto vuelve a la venta?</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          {(['retornable', 'consumo'] as TipoSol[]).map((t) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <button
                onClick={() => setTipo(t)}
                style={{
                  border: `1px solid ${tipo === t ? '#378ADD' : '#D1D5DB'}`,
                  background: tipo === t ? '#378ADD' : '#fff',
                  color: tipo === t ? '#fff' : '#374151',
                  borderRadius: 8, padding: '7px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t === 'retornable' ? '🔁 Sí, vuelve' : '🔥 No, se consume'}
              </button>
              <InfoPopover titulo={t === 'retornable' ? 'Retornable' : 'Consumo'}>{AYUDA_DESTINO[t]}</InfoPopover>
            </span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: tipo === 'consumo' ? '#B45309' : '#6B7280', minHeight: 34 }}>
          {tipo === 'consumo' ? '⚠ Baja definitiva de stock: la va a tener que aprobar un gerente.' : 'Al devolverla hay que anular la venta en Gestión Nube para reponer el stock.'}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn-sm" onClick={onCancelar} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
            Cancelar
          </button>
          <button className="btn-sm" onClick={() => onOk({ motivo, tipo })} style={{ background: '#378ADD', color: '#fff', border: 'none' }}>
            Elegir productos →
          </button>
        </div>
      </div>
    </div>
  )
}
