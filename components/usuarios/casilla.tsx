'use client'

/**
 * La casilla de un permiso, y la leyenda que la explica.
 *
 * Viven juntas a propósito. El reclamo que originó esta tanda fue *"no entiendo por qué hay
 * tildes negras y tildes azules"*, y la respuesta era que un permiso puede llegar de tres
 * formas distintas —lo tildaste vos, lo trae la función, se lo quitaron— y eso se estaba
 * diciendo con un `accentColor` de 17px y ninguna leyenda. Peor: el color del tilde "a mano"
 * no era una decisión, era el acento del sistema operativo de quien mirara.
 *
 * Ahora el estado se pinta en la **celda entera** (fondo), el tilde propio usa el índigo de
 * la marca, y `LEYENDA` dibuja las cuatro casillas reales con el mismo código que la tabla.
 * Si alguien cambia un estilo, la leyenda cambia con él: no puede quedar mintiendo.
 */

import type { Marca } from '@/lib/nav'
import { FUNCIONES, funcionQueDa } from '@/lib/permisos'
import { origenPermiso, tienePermiso, type OrigenPermiso } from '@/lib/usuarios/core'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'
import { color, font, radius, space } from '@/components/ui'

/**
 * El tamaño de la casilla. Con la fila baja, el tilde queda chico para el dedo, así que el
 * área táctil se la da el propio control: 17px de caja más el margen alrededor.
 */
const CAJA: React.CSSProperties = { width: 17, height: 17, margin: '6px 4px', cursor: 'pointer' }

/** El fondo de la celda dice de dónde viene el permiso. Es lo que antes decía el tilde solo. */
export function fondoDeOrigen(origen: OrigenPermiso): string | undefined {
  // El gris ya significa «no lo tildó nadie, le llega solo». `todos` es exactamente eso, así que
  // comparte el color en vez de estrenar uno: un color nuevo es una convención nueva que aprender.
  if (origen === 'funcion' || origen === 'todos') return color.bg2
  if (origen === 'excluido') return color.dangerBg
  return undefined
}

export function estiloDeOrigen(origen: OrigenPermiso): React.CSSProperties {
  if (origen === 'funcion' || origen === 'todos') return { ...CAJA, accentColor: color.mut2 }
  if (origen === 'excluido') return { ...CAJA, outline: `1.5px solid ${color.dangerBorder}`, borderRadius: 3 }
  // Índigo de la marca, no el acento del sistema: que un color signifique algo no puede
  // depender de la configuración del Mac de quien mira.
  return { ...CAJA, accentColor: color.brandSolid }
}

/** El texto del `title`: por qué está así esta casilla. */
function tituloDeOrigen(u: UsuarioConfig, brand: Marca, clave: string, origen: OrigenPermiso): string | undefined {
  if (origen === 'funcion') {
    const f = funcionQueDa(u, clave)
    return `Lo trae la función ${FUNCIONES.find((x) => x.key === f)?.label ?? f}. Destildalo para hacerle una excepción.`
  }
  if (origen === 'todos') {
    return 'La ve todo el equipo: no hace falta tildarla. Destildala para hacerle una excepción a esta persona.'
  }
  if (origen === 'excluido') return `Su función se lo daría, pero se lo quitaron para ${brand === 'bdi' ? 'BDI' : 'Zattia'}.`
  if (origen === 'explicito') return 'Se lo tildaste vos para esta marca.'
  return undefined
}

/**
 * Una celda `<td>` con la casilla de `clave` en `brand`. La usan la matriz de secciones y la
 * lista de "Además puede…", para que las dos se lean igual.
 */
export function Casilla({
  u,
  brand,
  clave,
  brands,
  onPerm,
}: {
  u: UsuarioConfig
  brand: Marca
  clave: string
  /** En qué marcas existe esto. Fuera de ellas la celda es un guion, no una casilla apagada. */
  brands: readonly Marca[]
  onPerm: (brand: Marca, clave: string, val: boolean) => void
}) {
  if (!brands.includes(brand)) {
    return (
      <td style={{ textAlign: 'center', height: 'auto', color: color.line2 }} title="No existe en esta marca">
        —
      </td>
    )
  }
  const origen = origenPermiso(u, brand, clave)
  return (
    <td style={{ textAlign: 'center', height: 'auto', background: fondoDeOrigen(origen) }}>
      <input
        type="checkbox"
        checked={tienePermiso(u, brand, clave)}
        title={tituloDeOrigen(u, brand, clave, origen)}
        onChange={(e) => onPerm(brand, clave, e.target.checked)}
        style={estiloDeOrigen(origen)}
      />
    </td>
  )
}

/** Una casilla de muestra para la leyenda: se ve, no se toca. */
function Muestra({ origen, marcada }: { origen: OrigenPermiso; marcada: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: fondoDeOrigen(origen),
        borderRadius: radius.sm,
        padding: '0 2px',
      }}
    >
      <input type="checkbox" checked={marcada} readOnly tabIndex={-1} style={{ ...estiloDeOrigen(origen), cursor: 'default' }} />
    </span>
  )
}

/**
 * Las cinco formas que puede tener una casilla, dibujadas. Va arriba de la tabla, fija: es la
 * respuesta a "¿por qué hay tildes negras y azules?" y no puede estar escondida en un popover,
 * que es donde estaba.
 */
export function Leyenda() {
  const items: { origen: OrigenPermiso; marcada: boolean; texto: string }[] = [
    { origen: 'explicito', marcada: true, texto: 'Se lo tildaste vos' },
    { origen: 'funcion', marcada: true, texto: 'Lo trae su función' },
    { origen: 'todos', marcada: true, texto: 'La ve todo el equipo' },
    { origen: 'excluido', marcada: false, texto: 'Se lo quitaste (excepción)' },
    { origen: 'no', marcada: false, texto: 'No lo tiene' },
  ]
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: space[4],
        padding: `${space[2]}px ${space[3]}px`,
        marginBottom: space[2],
        background: color.bg,
        border: `1px solid ${color.line}`,
        borderRadius: radius.md,
        fontSize: font.xs,
        color: color.mut,
      }}
    >
      {items.map((it) => (
        <span key={it.texto} style={{ display: 'inline-flex', alignItems: 'center', gap: space[1] }}>
          <Muestra origen={it.origen} marcada={it.marcada} />
          {it.texto}
        </span>
      ))}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1] }}>
        <span style={{ color: color.line2, width: 17, textAlign: 'center' }}>—</span>
        No existe en esa marca
      </span>
    </div>
  )
}
