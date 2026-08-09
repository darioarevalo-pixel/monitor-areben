'use client'

/**
 * Una pieza de la Biblioteca: la foto grande arriba, los números al pie.
 *
 * # En qué se diferencia de la tarjeta de `Avisos.tsx`
 *
 * Aquélla vive adentro de una campaña desplegada y su pregunta es *con qué estamos hablando*: los
 * números van chiquitos y al pie porque el contexto lo pone la campaña de arriba. Acá la grilla está
 * **ordenada por gasto o por ROAS y cruza cuentas**, así que la pregunta es *cuál funcionó*: el
 * número deja de ser contexto y pasa a ser la mitad de la tarjeta.
 *
 * Por eso no se reusa: son la misma foto contestando dos preguntas distintas. Lo que sí es una sola
 * implementación es de dónde sale la foto (`lib/meta-ads/creativos.core.js`).
 *
 * 🔴 **`estado: null` no se dibuja como pausado.** Significa que Meta no devolvió el aviso —el caso
 * típico es que lo borraron—, y su historia sigue viva en la foto diaria. Mostrarlo como pausado
 * mandaría a alguien a reactivar algo que ya no existe.
 */

import { entero, pctCien, plata, roas as roasTxt, rotuloEstado } from '@/lib/meta-ads/formato'
import { ROTULO_FORMATO } from '@/lib/meta-ads/creativos'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import type { AvisoBiblioteca } from '@/lib/meta-ads/biblioteca'
import { Badge, color, font, radius, space, weight } from '@/components/ui'

export function TarjetaAviso({ a, marcando, onFavorito }: {
  a: AvisoBiblioteca
  marcando: boolean
  onFavorito: () => void
}) {
  const p = a.pieza
  const foto = p?.imagen || p?.thumb || null
  // El link: primero el aviso publicado (es el creativo de verdad, con sus comentarios), y si no lo
  // hay, a dónde manda. Sin ninguno de los dos no es un link.
  const link = p?.permalink || p?.destino || null
  const rot = rotuloEstado(a.estado, 'm')
  const apagado = !!a.estado && a.estado !== 'ACTIVE'

  return (
    <div
      style={{
        border: `1px solid ${a.favorito ? color.brandBorder : color.line}`, borderRadius: radius.lg,
        overflow: 'hidden', background: color.surface, display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ position: 'relative' }}>
        <Marco foto={foto} apagado={apagado} pieza={p} link={link} />
        <BotonFavorito marcado={!!a.favorito} quien={a.favorito?.quien ?? null} ocupado={marcando} onClick={onFavorito} />
      </div>

      <div style={{ padding: space[2], display: 'flex', flexDirection: 'column', gap: space[1], minWidth: 0 }}>
        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', alignItems: 'center' }}>
          {a.linea && <Badge subtle>{ETIQUETA_LINEA[a.linea]}</Badge>}
          {p && <Badge subtle tone="brand">{ROTULO_FORMATO[p.formato]}</Badge>}
          {rot ? <Badge tone={rot.tone}>{rot.txt}</Badge> : (
            /* Sin estado no se inventa uno: se dice que Meta no lo devolvió. */
            <Badge subtle tone="warning" style={{ fontWeight: weight.normal }}>Ya no está en Meta</Badge>
          )}
        </div>

        {p?.titulo && (
          <div style={{ fontSize: font.base, fontWeight: weight.semibold, color: color.ink, lineHeight: 1.3 }}>
            {p.titulo}
          </div>
        )}
        {p?.texto && (
          <div
            title={p.texto}
            style={{
              fontSize: font.xs, color: color.mut, lineHeight: 1.45,
              display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden',
            }}
          >
            {p.texto}
          </div>
        )}
        {p && !p.titulo && !p.texto && (
          <div style={{ fontSize: font.xs, color: color.mut2, fontStyle: 'italic' }}>
            {p.formato === 'publicacion' ? 'Sale de una publicación: Meta no entrega su texto.' : 'Sin texto propio.'}
          </div>
        )}

        <Numeros a={a} />

        <div
          title={`${a.nombre ?? ''}\nDe ${a.primera} a ${a.ultima} · ${a.diasConGasto} día${a.diasConGasto === 1 ? '' : 's'} con gasto`}
          style={{ fontSize: font.xs, color: color.mut2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {a.nombre || <em>(sin nombre)</em>}
        </div>
      </div>
    </div>
  )
}

function Marco({ foto, apagado, pieza, link }: {
  foto: string | null
  apagado: boolean
  pieza: AvisoBiblioteca['pieza']
  link: string | null
}) {
  const marco = (
    <div
      style={{
        position: 'relative', height: 210, background: color.bg2, display: 'flex',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}
    >
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto}
          alt=""
          style={{
            maxWidth: '100%', maxHeight: '100%',
            // `contain`, no `cover`: recortar al cuadrado le corta la cabeza a una pieza vertical,
            // y el encuadre es justo lo que se está por juzgar.
            objectFit: 'contain',
            opacity: apagado ? 0.45 : 1,
          }}
        />
      ) : (
        <span style={{ fontSize: 22, color: color.mut2 }}>🖼️</span>
      )}
      {pieza?.esVideo && <Chapita lado="left" titulo="Es un video: acá se ve el póster">▶ video</Chapita>}
      {(pieza?.piezas.length ?? 0) > 1 && (
        <Chapita lado="right" titulo={`Carrusel de ${pieza?.piezas.length} tarjetas`}>⧉ {pieza?.piezas.length}</Chapita>
      )}
    </div>
  )
  if (!link) return marco
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" title="Ver el aviso publicado" style={{ display: 'block' }}>
      {marco}
    </a>
  )
}

function Chapita({ lado, titulo, children }: { lado: 'left' | 'right'; titulo: string; children: React.ReactNode }) {
  return (
    <span
      title={titulo}
      style={{
        position: 'absolute', [lado]: space[2], bottom: space[2], background: 'rgba(0,0,0,.55)',
        color: '#fff', borderRadius: radius.pill, fontSize: font.xs, padding: '1px 8px',
      }}
    >
      {children}
    </span>
  )
}

/**
 * La estrella. Va arriba de la foto y no en el pie porque es lo que se busca con el ojo al recorrer
 * una grilla, y porque el pie ya está lleno de números.
 */
function BotonFavorito({ marcado, quien, ocupado, onClick }: {
  marcado: boolean
  quien: string | null
  ocupado: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={ocupado}
      title={marcado ? `Marcada por ${quien ?? 'alguien'}. Tocá para desmarcarla.` : 'Marcar esta pieza'}
      aria-label={marcado ? 'Desmarcar' : 'Marcar'}
      style={{
        // `.shell-content button` fija la altura de un control; esto es un ícono suelto.
        height: 28, width: 28, padding: 0, lineHeight: 1,
        position: 'absolute', right: space[2], top: space[2],
        borderRadius: radius.pill, cursor: ocupado ? 'wait' : 'pointer',
        border: `1px solid ${marcado ? color.brandSolid : color.line}`,
        background: marcado ? color.brandSolid : 'rgba(255,255,255,.9)',
        color: marcado ? '#fff' : color.mut, fontSize: font.base,
        opacity: ocupado ? 0.5 : 1,
      }}
    >
      {marcado ? '★' : '☆'}
    </button>
  )
}

/**
 * Los cinco números, en dos renglones.
 *
 * 🔑 **`diasConGasto` va al lado del ROAS y no escondido en un tooltip.** Un 8× sobre dos días de
 * entrega y un 8× sobre cuarenta no son el mismo hallazgo, y sin el segundo número el primero se
 * lee como si lo fueran.
 */
function Numeros({ a }: { a: AvisoBiblioteca }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${space[0.5]}px ${space[2]}px`, marginTop: space[0.5] }}>
      <Dato k="Gasto" v={plata(a.spend)} fuerte />
      <Dato k="ROAS" v={roasTxt(a.roas)} fuerte />
      <Dato k="Compras" v={entero(a.compras)} />
      {/* Sin compras no hay costo por compra: va el guion, no un `$ 0` que se lee como gratis. */}
      <Dato k="CPA" v={a.cpa == null ? '—' : plata(a.cpa)} />
      <Dato k="CTR" v={pctCien(a.ctr)} />
      <Dato k="Días" v={String(a.diasConGasto)} titulo={`Días con gasto, de ${a.dias} con foto`} />
    </div>
  )
}

function Dato({ k, v, fuerte, titulo }: { k: string; v: string; fuerte?: boolean; titulo?: string }) {
  return (
    <span title={titulo} style={{ fontSize: font.xs, color: color.mut2, whiteSpace: 'nowrap' }}>
      {k}{' '}
      <strong style={{ color: fuerte ? color.ink : color.ink2, fontWeight: weight.semibold }}>{v}</strong>
    </span>
  )
}
