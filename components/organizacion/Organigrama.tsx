'use client'

/**
 * El organigrama, dibujado del árbol de `organizacion_nodos`.
 *
 * 🔑 **Se dibuja de los datos y no es una imagen.** Las cuatro láminas que entregó Bruno el
 * 22-ago-2026 son la fuente, pero una foto no se puede cruzar con nada: acá cada nodo con `persona`
 * es la MISMA clave (`name` del padrón) con la que se guardan las responsabilidades y el destino de
 * la Agenda, así que apretar un nombre lleva a su ficha, **cada uno muestra cuántas
 * responsabilidades tiene** y un nombre mal escrito se ve enseguida porque su conteo sale en cero.
 *
 * # Por qué es vertical y con codos, y ⛔ no el organigrama horizontal de manual
 *
 * El de cajas lado a lado con líneas arriba se rompe apenas hay cinco hermanos, y en un teléfono
 * —donde está la mitad del equipo— pide arrastrar para leer un nombre. Éste es el mismo árbol, con
 * **codos de verdad** (`├─` `└─` hechos con bordes, no con caracteres) y cada nodo en su caja:
 * conserva la jerarquía, entra en cualquier ancho y no necesita librería.
 *
 * ⚠️ **El codo del ÚLTIMO hermano tapa el resto de la línea vertical** (el `background` del
 * `::before` no existe en estilos inline, así que lo hace un div opaco). Sin eso, la línea baja
 * hasta el borde del contenedor y parece que falta alguien colgando.
 */

import { color, font, radius, space, weight } from '@/components/ui'
import type { NodoConHijos } from '@/lib/organizacion/tipos'

export function Organigrama({ nodos, cuantasDe, onPersona }: {
  nodos: NodoConHijos[]
  /** Cuántas responsabilidades activas tiene esa persona. */
  cuantasDe: (persona: string) => number
  onPersona?: (persona: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {nodos.map((n, i) => (
        <Rama key={n.id} nodo={n} nivel={0} ultimo={i === nodos.length - 1} cuantasDe={cuantasDe} onPersona={onPersona} />
      ))}
    </div>
  )
}

function Rama({ nodo, nivel, ultimo, cuantasDe, onPersona }: {
  nodo: NodoConHijos
  nivel: number
  ultimo: boolean
  cuantasDe: (persona: string) => number
  onPersona?: (persona: string) => void
}) {
  const raiz = nivel === 0
  return (
    <div style={{ position: 'relative', paddingLeft: raiz ? 0 : 26 }}>
      {!raiz && (
        <>
          {/* La vertical del padre. */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, background: color.line }} />
          {/* El codo hasta la caja. */}
          <div style={{ position: 'absolute', left: 0, top: 17, width: 18, height: 1, background: color.line }} />
          {/* El último hermano corta la vertical justo abajo de su codo. */}
          {ultimo && <div style={{ position: 'absolute', left: 0, top: 18, bottom: 0, width: 3, background: color.bg }} />}
        </>
      )}

      <Caja nodo={nodo} cuantasDe={cuantasDe} onPersona={onPersona} />

      {nodo.hijos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginTop: space[2] }}>
          {nodo.hijos.map((h, i) => (
            <Rama key={h.id} nodo={h} nivel={nivel + 1} ultimo={i === nodo.hijos.length - 1} cuantasDe={cuantasDe} onPersona={onPersona} />
          ))}
        </div>
      )}
    </div>
  )
}

function Caja({ nodo, cuantasDe, onPersona }: {
  nodo: NodoConHijos
  cuantasDe: (persona: string) => number
  onPersona?: (persona: string) => void
}) {
  const esSector = nodo.tipo === 'sector'
  const cuantas = nodo.persona ? cuantasDe(nodo.persona) : 0
  const clickable = !!nodo.persona && !!onPersona

  const caja: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap',
    padding: esSector ? `${space[1]}px ${space[3]}px` : `${space[2]}px ${space[3]}px`,
    borderRadius: radius.md,
    border: `1px solid ${esSector ? 'transparent' : color.line}`,
    background: esSector ? color.bg2 : color.surface,
    maxWidth: '100%',
  }

  const nombre = (
    <span style={{ fontSize: esSector ? font.sm : font.md, fontWeight: weight.semibold, color: esSector ? color.mut : color.ink, letterSpacing: esSector ? 0.4 : undefined, textTransform: esSector ? 'uppercase' : undefined }}>
      {nodo.label}
    </span>
  )

  return (
    <div style={caja}>
      {clickable ? (
        // `height: 'auto'` porque `.shell-content button` fija altura y esto puede envolver.
        <button
          type="button"
          onClick={() => onPersona?.(nodo.persona as string)}
          title="Abrir su ficha"
          style={{ height: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: color.brand, fontSize: font.md, fontWeight: weight.semibold }}
        >
          {nodo.label}
        </button>
      ) : nombre}

      {nodo.nota && <span style={{ fontSize: font.xs, color: color.mut2 }}>{nodo.nota}</span>}

      {/* 🔑 El conteo va SÓLO en los nodos que son una cuenta del padrón, y el CERO se dibuja: un
          cero acá es «esta persona está en el organigrama y no tiene ni una responsabilidad
          escrita», que es exactamente lo que hay que ver. En el que no tiene cuenta no va nada,
          porque ahí el cero no afirmaría eso — afirmaría que no lo podemos saber. */}
      {nodo.persona && (
        <span
          title={cuantas === 0 ? 'No tiene ninguna responsabilidad escrita' : `${cuantas} responsabilidades`}
          style={{
            fontSize: font.xs, fontWeight: weight.semibold, padding: '1px 7px', borderRadius: 999,
            color: cuantas === 0 ? color.warningInk : color.mut,
            background: cuantas === 0 ? color.warningBg : color.bg2,
            border: `1px solid ${cuantas === 0 ? color.warningBorder : color.line}`,
          }}
        >
          {cuantas}
        </span>
      )}
    </div>
  )
}
