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
import { indiceDe, parsearMd, type Bloque, type ItemLista, type Trozo } from '@/lib/markdown/core'
import { Plegable } from '@/components/ui/Plegable'
import { Notice } from '@/components/ui/Notice'
import { TableWrap, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { color, font, radius, space, weight, type Tone } from '@/components/ui/tokens'

/**
 * Los tres recuadros, y con qué se pintan.
 *
 * 🔑 **Un manual se lee por su jerarquía** —esto es la regla, esto es lo que muerde, esto no se hace
 * nunca— y en markdown corrido todo pesa igual: por eso se lee plano aunque esté bien escrito. Tres
 * tonos alcanzan; un cuarto obligaría a elegir entre dos parecidos cada vez que se escribe uno.
 *
 * Los rótulos van en castellano porque los escribe y los lee el equipo, no un programador.
 */
const RECUADRO: Record<string, { tone: Tone; icono: string; titulo: string }> = {
  regla: { tone: 'brand', icono: '📌', titulo: 'La regla' },
  ojo: { tone: 'warning', icono: '⚠️', titulo: 'Ojo' },
  nunca: { tone: 'danger', icono: '⛔', titulo: 'Nunca' },
}

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
  titulos: { nivel: 2 | 3 | 4; texto: string; ancla: string }[]
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
              // Cada nivel se sangra un escalón: el índice tiene que dejar ver la FORMA del
              // manual, no sólo sus renglones.
              paddingLeft: (t.nivel - 2) * space[4],
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
    const Tag = b.nivel === 2 ? 'h2' : b.nivel === 3 ? 'h3' : 'h4'
    return (
      <Tag
        id={`${uid}-${b.ancla}`}
        style={{
          margin: 0,
          // Para que el título no quede pegado al borde de arriba cuando se llega saltando.
          scrollMarginTop: space[3],
          fontSize: b.nivel === 2 ? (compacto ? font.base : font.lg) : font.base,
          fontWeight: weight.semibold,
          // El `####` es un rótulo adentro de una sección, no un escalón más de tamaño: a partir
          // del tercer tamaño de letra la jerarquía deja de leerse y empieza a adivinarse.
          color: b.nivel === 4 ? color.mut : color.ink,
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

  if (b.t === 'lista') return <Lista ordenada={b.ordenada} items={b.items} />

  if (b.t === 'tabla') {
    return (
      // `TableWrap` trae su propio scroll horizontal, así que una tabla ancha **no rompe el modal**
      // de «Cómo se usa», que es donde el manual se lee en menos ancho.
      <TableWrap>
        <THead>
          <Tr>
            {b.encabezado.map((c, i) => (
              <Th key={i} align={ALINEACION[b.alineacion[i]]}>
                <Trozos ts={c} />
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {b.filas.map((f, i) => (
            <Tr key={i}>
              {f.map((c, j) => (
                <Td key={j} align={ALINEACION[b.alineacion[j]]} wrap>
                  <Trozos ts={c} />
                </Td>
              ))}
            </Tr>
          ))}
        </TBody>
      </TableWrap>
    )
  }

  if (b.t === 'recuadro') {
    const r = RECUADRO[b.tono]
    return (
      <Notice tone={r.tone} icon={r.icono}>
        <div style={{ display: 'grid', gap: space[2] }}>
          {b.parrafos.map((pp, i) => (
            <p key={i} style={{ margin: 0 }}>
              <Trozos ts={pp} />
            </p>
          ))}
        </div>
      </Notice>
    )
  }

  return (
    <p style={{ margin: 0 }}>
      <Trozos ts={b.hijos} />
    </p>
  )
}

/** El markdown dice de qué lado va el contenido; la `Table` del kit lo dice con otras palabras. */
const ALINEACION = { izq: 'left', centro: 'center', der: 'right' } as const

/**
 * Una lista, con su nivel de anidado.
 *
 * La sub-lista se dibuja **adentro del `<li>` del padre** y no como una lista hermana: si colgara
 * afuera, un renglón sangrado dejaría de pertenecer a nada apenas alguien reordene los ítems.
 */
function Lista({ ordenada, items }: { ordenada: boolean; items: ItemLista[] }) {
  const Tag = ordenada ? 'ol' : 'ul'
  return (
    <Tag style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: space[1] }}>
      {items.map((it, i) => (
        <li key={i}>
          <Trozos ts={it.hijos} />
          {it.sub && (
            <SubTag ordenada={it.sub.ordenada}>
              {it.sub.items.map((sub, j) => (
                <li key={j}>
                  <Trozos ts={sub} />
                </li>
              ))}
            </SubTag>
          )}
        </li>
      ))}
    </Tag>
  )
}

function SubTag({ ordenada, children }: { ordenada: boolean; children: React.ReactNode }) {
  const Tag = ordenada ? 'ol' : 'ul'
  return <Tag style={{ margin: `${space[1]}px 0 0`, paddingLeft: 20, display: 'grid', gap: space[1] }}>{children}</Tag>
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
