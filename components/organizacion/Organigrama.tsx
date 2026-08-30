'use client'

/**
 * El organigrama, dibujado del árbol de `organizacion_nodos`.
 *
 * 🔑 **Se dibuja de los datos y no es una imagen.** Las cuatro láminas que entregó Bruno el
 * 22-ago-2026 son la fuente, pero una foto no se puede cruzar con nada: acá cada nodo con `persona`
 * es la MISMA clave (`name` del padrón) con la que se guardan las responsabilidades y el destino de
 * la Agenda, así que apretar un nombre lleva a su ficha y un nombre mal escrito se ve enseguida
 * porque su ficha sale vacía.
 *
 * ⚠️ **Sin librería y sin canvas**: son sangrías. Un organigrama de treinta nodos que hay que
 * arrastrar para leer se mira una vez; una lista con sangría se lee en el teléfono, que es donde
 * está la mitad del equipo.
 */

import { color, font, space, weight } from '@/components/ui'
import type { NodoConHijos } from '@/lib/organizacion/tipos'

const PUNTO: Record<string, string> = { sector: '▪︎', persona: '●', puesto: '◇' }

export function Organigrama({ nodos, onPersona }: { nodos: NodoConHijos[]; onPersona?: (persona: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
      {nodos.map((n) => <Rama key={n.id} nodo={n} nivel={0} onPersona={onPersona} />)}
    </div>
  )
}

function Rama({ nodo, nivel, onPersona }: { nodo: NodoConHijos; nivel: number; onPersona?: (persona: string) => void }) {
  const esSector = nodo.tipo === 'sector'
  const clickable = !!nodo.persona && !!onPersona
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
      <div
        style={{
          display: 'flex', alignItems: 'baseline', gap: space[2],
          paddingLeft: nivel * 18,
          borderLeft: nivel > 0 ? `1px solid ${color.line}` : undefined,
        }}
      >
        <span aria-hidden style={{ color: color.mut2, fontSize: font.xs }}>{PUNTO[nodo.tipo] || '●'}</span>
        {clickable ? (
          // `height: 'auto'` porque `.shell-content button` fija altura y este texto puede envolver.
          <button
            type="button"
            onClick={() => onPersona?.(nodo.persona as string)}
            style={{
              height: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: font.base, fontWeight: esSector ? weight.semibold : weight.medium,
              color: color.brand, textAlign: 'left',
            }}
          >
            {nodo.label}
          </button>
        ) : (
          <span style={{ fontSize: font.base, fontWeight: esSector ? weight.semibold : weight.normal, color: esSector ? color.ink : color.ink2 }}>
            {nodo.label}
          </span>
        )}
        {nodo.nota && <span style={{ fontSize: font.xs, color: color.mut2 }}>{nodo.nota}</span>}
      </div>
      {nodo.hijos.map((h) => <Rama key={h.id} nodo={h} nivel={nivel + 1} onPersona={onPersona} />)}
    </div>
  )
}
