'use client'

/**
 * Pantallas JUNTAS (🎨 30-oct, mapa del menú aprobado por Bruno; `~/Documents/erp-monitor/erp-stunned.md` §7, tanda 3):
 * Ingresos y ajustes, las Diferencias y Cuentas y formas de pago son UNA pantalla con un filtro arriba («qué lista»), cada
 * opción con su número. 🔑 Juntar ⛔ es reescribir: cada lista sigue siendo la suya (su núcleo, su servidor, sus vistas);
 * el filtro sólo elige cuál se ve. Para que cada opción tenga su número, las otras quedan montadas y escondidas: cada una
 * avisa el número de la vista con la que abre (el mismo que daba su pantalla de antes).
 * La opción elegida va en la dirección (`/erp/stock/ajustes/ingresos`), así las direcciones viejas y ⌘K siguen cayendo bien.
 */

import { useCallback, useState, type ReactNode } from 'react'
import { color, weight } from '@/components/ui'

export type AlContar = (n: number | null) => void

export function ListasJuntas({ etiqueta, partes, valor, onCambio, render }: {
  /** Qué elige el filtro («Tipo», «Contra qué»): lo lee el lector de pantalla. */
  etiqueta: string
  partes: Array<{ key: string; label: string }>
  valor: string
  onCambio: (k: string) => void
  render: (k: string, alContar: AlContar) => ReactNode
}) {
  const [conteo, setConteo] = useState<Record<string, number | null>>({})
  // Una función por opción y ESTABLE: las listas la llaman desde un efecto.
  const [avisos] = useState(() => new Map<string, AlContar>())
  const avisoDe = useCallback((k: string) => {
    if (!avisos.has(k)) avisos.set(k, (n) => setConteo((c) => (c[k] === n ? c : { ...c, [k]: n })))
    return avisos.get(k)!
  }, [avisos])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div role="radiogroup" aria-label={etiqueta} className="erp-juntas" style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 10, background: color.bg2, alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}>
        {partes.map((p) => {
          const on = p.key === valor
          const n = conteo[p.key]
          return (
            <button
              key={p.key} type="button" role="radio" aria-checked={on} onClick={() => onCambio(p.key)}
              style={{ height: 34, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 14px', border: 0, borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: 14, fontWeight: weight.semibold, background: on ? color.surface : 'transparent', color: on ? color.ink : color.mut, boxShadow: on ? '0 1px 2px rgba(16,24,40,.1)' : undefined }}
            >
              {p.label}
              <span aria-label={n == null ? 'leyendo' : undefined} style={{ fontSize: 12, fontWeight: weight.bold, color: on ? color.ink2 : color.mut }}>{n == null ? '…' : n.toLocaleString('es-AR')}</span>
            </button>
          )
        })}
      </div>
      {partes.map((p) => (
        // Las otras quedan montadas (para su número) y escondidas.
        <div key={p.key} hidden={p.key !== valor}>{render(p.key, avisoDe(p.key))}</div>
      ))}
    </div>
  )
}
