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

import { useMemo } from 'react'
import { parsearMd, type Bloque, type Trozo } from '@/lib/markdown/core'
import { color, font, radius, space, weight } from '@/components/ui/tokens'

export type MarkdownProps = {
  texto: string
  /** Para achicarlo cuando va adentro de un cartel y no de una página. */
  compacto?: boolean
}

export function Markdown({ texto, compacto = false }: MarkdownProps) {
  const bloques = useMemo(() => parsearMd(texto), [texto])
  const gap = compacto ? space[2] : space[3]

  return (
    <div style={{ display: 'grid', gap, fontSize: compacto ? font.sm : font.base, color: color.ink2, lineHeight: 1.55 }}>
      {bloques.map((b, i) => (
        <BloqueMd key={i} b={b} compacto={compacto} />
      ))}
    </div>
  )
}

function BloqueMd({ b, compacto }: { b: Bloque; compacto: boolean }) {
  if (b.t === 'titulo') {
    const Tag = b.nivel === 2 ? 'h2' : 'h3'
    return (
      <Tag
        style={{
          margin: 0,
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
