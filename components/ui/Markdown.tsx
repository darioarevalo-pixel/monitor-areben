'use client'

/**
 * Markdown — pinta lo que devolvió `parsearMd`.
 *
 * No recibe HTML ni lo produce: recibe el texto crudo, lo parsea a datos (`lib/markdown/core.ts`) y
 * arma JSX. React escapa el texto solo, así que **no hay ningún `dangerouslySetInnerHTML`** y no
 * hay forma de que algo escrito en una novedad se ejecute.
 *
 * Los estilos salen de los tokens y no de una hoja aparte: es un bloque de lectura, no una pantalla.
 */

import { useId, useMemo, useState } from 'react'
import { indiceDe, parsearMd, type Bloque, type Trozo } from '@/lib/markdown/core'
import { Plegable } from '@/components/ui/Plegable'
import { color, font, radius, space, weight } from '@/components/ui/tokens'

export type MarkdownProps = {
  texto: string
  /** Para achicarlo cuando va adentro de un cartel y no de una página. */
  compacto?: boolean
  /**
   * Dibuja la tabla de contenidos arriba, y desde ahí se salta a cada título.
   *
   * 🔑 **Va acá y no en la sección Manuales** porque el mismo manual se lee en TRES lugares —la
   * página, el modal de «Manual de uso» del encabezado de cada pantalla y el «Cómo se hace» de un
   * pendiente— y los tres tienen el mismo problema: hay que bajar y bajar para encontrar algo.
   * `'abierto'` en la página, `'cerrado'` en los modales, donde el índice desplegado se comería la
   * pantalla antes de que se lea una línea.
   */
  indice?: 'abierto' | 'cerrado'
}

export function Markdown({ texto, compacto = false, indice }: MarkdownProps) {
  const bloques = useMemo(() => parsearMd(texto), [texto])
  const gap = compacto ? space[2] : space[3]
  /**
   * El prefijo de los `id`.
   *
   * 🔴 **Sin esto el salto va al lugar equivocado**: en la pantalla de Manuales conviven el manual
   * abierto y la vista previa del editor, los dos con los mismos títulos ⇒ dos `id` iguales, y
   * `getElementById` devuelve el primero que encuentra, que puede ser el del otro documento.
   */
  const uid = useId()
  const titulos = useMemo(() => (indice ? indiceDe(bloques) : []), [indice, bloques])

  return (
    <div style={{ display: 'grid', gap, fontSize: compacto ? font.sm : font.base, color: color.ink2, lineHeight: 1.55 }}>
      {/* Con un solo título no hay nada que recorrer: un índice de un renglón ocupa lugar y no
          ahorra ningún scroll. */}
      {indice && titulos.length > 1 && <Indice titulos={titulos} uid={uid} abiertoAlPrincipio={indice === 'abierto'} />}
      {bloques.map((b, i) => (
        <BloqueMd key={i} b={b} compacto={compacto} uid={uid} />
      ))}
    </div>
  )
}

/**
 * La tabla de contenidos.
 *
 * Se usa el `Plegable` del kit y no un `<details>` pelado por lo que ese componente resuelve: la
 * línea de ayuda **se lee esté abierto o cerrado**, así que adentro de un modal —donde nace
 * plegado— igual se sabe cuántos títulos hay antes de decidir si vale la pena abrirlo.
 */
function Indice({
  titulos,
  uid,
  abiertoAlPrincipio,
}: {
  titulos: { nivel: 2 | 3; texto: string; ancla: string }[]
  uid: string
  abiertoAlPrincipio: boolean
}) {
  const [abierto, setAbierto] = useState(abiertoAlPrincipio)

  const ir = (ancla: string) => {
    // Por `id` y no por un ref: el título vive adentro del árbol de bloques, que se rearma entero
    // cada vez que cambia el texto, y guardar refs de algo que se remonta es guardar nodos muertos.
    // `scrollIntoView` sube por el ancestro que scrollea, así que sirve igual en la página que
    // adentro del modal.
    //
    // 🔴 **Sin `behavior: 'smooth'`, y eso está MEDIDO** (23-ago-2026, caminando el modal de «Manual
    // de uso» en prod): adentro de `.mo-modal-body` el scroll suave **no mueve nada** —el
    // `scrollTop` se queda en 0— mientras que el salto directo lleva el mismo contenedor a 4.497.
    // En la página el suave andaba, así que el defecto sólo se ve en dos de los tres lugares donde
    // se lee un manual, y ningún test lo toca. Y de paso es lo que conviene: en un documento de
    // 6.000 px, esperar la animación para llegar a un título es peor que aparecer ahí.
    document.getElementById(`${uid}-${ancla}`)?.scrollIntoView({ block: 'start' })
  }

  return (
    <Plegable
      abierto={abierto}
      onToggle={() => setAbierto((x) => !x)}
      titulo="En este manual"
      ayuda={`${titulos.length} títulos. Tocá uno para ir directo.`}
    >
      <div style={{ display: 'grid', gap: space[1] }}>
        {titulos.map((t) => (
          <button
            key={t.ancla}
            type="button"
            onClick={() => ir(t.ancla)}
            style={{
              // `height: auto` por la regla legacy `.shell-content button`, que le fija a todo botón
              // la altura de un control: un título largo se desborda.
              height: 'auto',
              background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              textAlign: 'left', color: color.brand, fontSize: font.sm,
              // El subtítulo se sangra: el índice tiene que dejar ver la FORMA del manual, no sólo
              // sus renglones.
              paddingLeft: t.nivel === 3 ? space[4] : 0,
              fontWeight: t.nivel === 2 ? weight.semibold : weight.normal,
            }}
          >
            {t.texto}
          </button>
        ))}
      </div>
    </Plegable>
  )
}

function BloqueMd({ b, compacto, uid }: { b: Bloque; compacto: boolean; uid: string }) {
  if (b.t === 'titulo') {
    const Tag = b.nivel === 2 ? 'h2' : 'h3'
    return (
      <Tag
        id={`${uid}-${b.ancla}`}
        style={{
          margin: 0,
          // Para que el título no quede pegado al borde de arriba cuando se llega saltando.
          scrollMarginTop: space[3],
          fontSize: b.nivel === 2 ? (compacto ? font.base : font.lg) : font.base,
          fontWeight: weight.semibold,
          color: color.ink,
        }}
      >
        <Trozos ts={b.hijos} />
      </Tag>
    )
  }

  if (b.t === 'codigo') {
    return (
      <pre
        style={{
          margin: 0, padding: space[3], background: color.bg2, border: `1px solid ${color.line}`,
          borderRadius: radius.md, fontSize: font.xs, overflowX: 'auto', whiteSpace: 'pre',
        }}
      >
        {b.texto}
      </pre>
    )
  }

  if (b.t === 'lista') {
    const Tag = b.ordenada ? 'ol' : 'ul'
    return (
      <Tag style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: space[1] }}>
        {b.items.map((it, i) => (
          <li key={i}>
            <Trozos ts={it} />
          </li>
        ))}
      </Tag>
    )
  }

  return (
    <p style={{ margin: 0 }}>
      <Trozos ts={b.hijos} />
    </p>
  )
}

function Trozos({ ts }: { ts: Trozo[] }) {
  return (
    <>
      {ts.map((t, i) => {
        if (t.t === 'negrita') return <strong key={i} style={{ fontWeight: weight.semibold, color: color.ink }}>{t.v}</strong>
        if (t.t === 'italica') return <em key={i}>{t.v}</em>
        if (t.t === 'codigo') {
          return (
            <code
              key={i}
              style={{ background: color.bg2, border: `1px solid ${color.line}`, borderRadius: 6, padding: '1px 5px', fontSize: '0.92em' }}
            >
              {t.v}
            </code>
          )
        }
        if (t.t === 'link') {
          return (
            <a
              key={i}
              href={t.href}
              // Los internos abren en la misma pestaña: son otra sección del monitor, no otro lugar.
              target={t.externo ? '_blank' : undefined}
              rel={t.externo ? 'noreferrer' : undefined}
              style={{ color: color.brand, fontWeight: weight.semibold }}
            >
              {t.v}
            </a>
          )
        }
        return <span key={i}>{t.v}</span>
      })}
    </>
  )
}
