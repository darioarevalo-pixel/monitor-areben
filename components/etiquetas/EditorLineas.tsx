'use client'

import { color } from '@/components/ui'
import type { LineaEtiqueta } from '@/lib/etiquetas/tipos'

/**
 * LOS RENGLONES DE UNA ETIQUETA — texto, cuerpo y negrita.
 *
 * 🔑 **Vive acá y ⛔ no adentro de la pantalla que lo usa** porque lo usan DOS: la etiqueta **libre**
 * de Etiquetas y el diseño de la etiqueta de una **campaña**, que se edita en Liquidación (idea de
 * Bruno: *«que la edición de la etiqueta esté en la campaña con las condiciones del evento»*).
 * Copiarlo era quedarse con dos editores que se iban a separar al primer arreglo.
 *
 * ⚠️ **Los dos editores VIEJOS —formas de pago y etiqueta libre— ⛔ no se plegaron acá**, y no es
 * olvido: los dos tienen una regla propia, «al borrar el último renglón queda uno vacío en vez de
 * ninguno», porque ahí la lista **es** la etiqueta y quedarse sin renglones la deja sin nada que
 * dibujar. Acá la lista es un agregado opcional al precio ⇒ vaciarla es una respuesta válida.
 * Plegarlos sin esa regla les cambiaba el comportamiento.
 *
 * ⚠️ **`tam` son cuatro nombres, ⛔ no puntos.** El PDF los traduce a cuerpos distintos según la
 * etiqueta sea de 5 × 2,5 cm o de 10 × 15: un número acá mentiría en una de las dos.
 */

export const TAMANIOS: [LineaEtiqueta['tam'], string][] = [
  ['titulo', 'Título'],
  ['subtitulo', 'Subtítulo'],
  ['normal', 'Normal'],
  ['chico', 'Chico'],
]

export function EditorLineas({
  lineas,
  setLineas,
  placeholder = 'Texto de la línea',
  max,
  maxLargo,
}: {
  lineas: LineaEtiqueta[]
  setLineas: (l: LineaEtiqueta[]) => void
  placeholder?: string
  /** Tope de renglones. Sin él, ilimitado (la etiqueta libre de 10 × 15 aguanta). */
  max?: number
  /** Tope de caracteres por renglón, el mismo que recorta el servidor. */
  maxLargo?: number
}) {
  const set = (i: number, campo: keyof LineaEtiqueta, val: string | boolean) =>
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: val } : l)))
  const sacar = (i: number) => setLineas(lineas.filter((_, j) => j !== i))
  const agregar = () => setLineas([...lineas, { texto: '', tam: 'chico', bold: false }])
  const lleno = max != null && lineas.length >= max

  return (
    <div>
      {lineas.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input
            value={l.texto}
            placeholder={`${placeholder} ${i + 1}`}
            maxLength={maxLargo}
            onChange={(e) => set(i, 'texto', e.target.value)}
            className="mo-input"
            style={{ flex: 1, minWidth: 140 }}
          />
          <select value={l.tam} onChange={(e) => set(i, 'tam', e.target.value)} className="mo-select" style={{ width: 110 }}>
            {TAMANIOS.map(([val, t]) => (
              <option key={val} value={val}>{t}</option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: color.mut, display: 'flex', alignItems: 'center', gap: 3 }}>
            <input type="checkbox" style={{ accentColor: 'var(--mo-brand-solid)' }} checked={l.bold} onChange={(e) => set(i, 'bold', e.target.checked)} /> Negrita
          </label>
          <button
            onClick={() => sacar(i)}
            title="Eliminar la línea"
            style={{ background: 'none', border: 'none', color: color.mut2, cursor: 'pointer', fontSize: 16, lineHeight: 1, height: 'auto' }}
          >
            ×
          </button>
        </div>
      ))}
      {/* ⚠️ `height: 'auto'` a mano: `.shell-content button` fija altura y un botón crudo se desborda. */}
      <button
        onClick={agregar}
        disabled={lleno}
        style={{
          height: 'auto', padding: '5px 10px', fontSize: 12, borderRadius: 6, cursor: lleno ? 'default' : 'pointer',
          border: `1px solid ${color.line2}`, background: 'transparent', color: lleno ? color.mut2 : color.mut,
        }}
      >
        + Agregar línea{lleno ? ` (máximo ${max})` : ''}
      </button>
    </div>
  )
}
