'use client'

/**
 * Los avisos de una campaña, desplegados debajo de su fila en `/meta-ads/etapas`.
 *
 * # Por qué esto vive en la pantalla de etapas
 *
 * Etapas es la pantalla **del que tiene que craneаr los creativos**. El diagnóstico dice qué falta
 * ("la columna del medio está en cero"), pero para imaginar la pieza que llena ese hueco hace falta
 * ver con qué se está hablando hoy en las otras dos: la foto, el gancho, el botón. Una tabla de
 * campañas con nombres y plata no alcanza — un nombre de campaña no se parece en nada al aviso.
 *
 * # Tres decisiones
 *
 *  1. **Se pide a demanda, campaña por campaña.** Son tres llamadas a Graph por campaña y el censo
 *     lista más de 170: traerlas todas de entrada volvería la pantalla inusable para ganar un dato
 *     que casi siempre no se mira.
 *  2. **Lo que se ve es el creativo, no una fila de métricas.** El gasto va, pero chiquito y al pie:
 *     acá el protagonista es la pieza. Para los números está el Resumen.
 *  3. **La imagen se muestra entera (`contain`), no recortada.** Recortar al cuadrado deja afuera
 *     justo lo que se está por juzgar; una pieza vertical se ve vertical.
 *
 * ⚠️ Esto **no** es el iframe de preview de Meta. Ese endpoint devuelve el aviso adentro de un
 * `<iframe>` cuya URL lleva el access token, y el nuestro es de un system user que lee todas las
 * cuentas del portfolio: publicarlo en el HTML lo deja a la vista de cualquiera que abra las
 * herramientas del navegador. Ver el comentario largo en `api/meta-ads.js`.
 */

import { useCallback, useRef, useState } from 'react'
import { traerCreativos } from '@/lib/meta-ads/cliente'
import type { AvisoCreativo, RespuestaCreativos } from '@/lib/meta-ads/tipos'
import { Notice, color, font, radius, space, weight } from '@/components/ui'

type Cargable<T> = { fase: 'cargando' } | { fase: 'error'; motivo: string } | { fase: 'ok'; data: T }

export type Avisos = {
  /** Qué campañas están desplegadas. */
  abiertas: ReadonlySet<string>
  alternar: (campaignId: string) => void
  /** Lo traído para una campaña en la ventana vigente, o null si nunca se pidió. */
  dato: (campaignId: string) => Cargable<RespuestaCreativos> | null
}

const nf = new Intl.NumberFormat('es-AR')
const money = (v: number) => `$ ${nf.format(Math.round(v || 0))}`

/**
 * El estado de los desplegables y su caché.
 *
 * La caché lleva `dias` en la clave en vez de vaciarse cuando cambia la ventana. Vaciarla habría
 * que hacerlo en un efecto, y `react-hooks/set-state-in-effect` lo prohíbe en este repo con razón:
 * un efecto que corrige el estado después de renderizar deja un cuadro intermedio con el dato
 * viejo, que acá serían los números de 30 días abajo del título de 90. Con la ventana adentro de la
 * clave, lo de la otra ventana simplemente no se encuentra y se vuelve a pedir.
 */
export function useAvisos(dias: number): Avisos {
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(VACIO)
  const [cache, setCache] = useState<Record<string, Cargable<RespuestaCreativos>>>({})
  // Qué se pidió ya. Va en un ref y no en el estado porque no dibuja nada: es sólo para no mandar
  // dos veces el mismo fetch si alguien pliega y despliega rápido.
  const pedidas = useRef<Set<string>>(new Set())

  const alternar = useCallback((campaignId: string) => {
    const clave = `${dias}|${campaignId}`
    setAbiertas((s) => {
      const n = new Set(s)
      if (n.has(campaignId)) n.delete(campaignId)
      else n.add(campaignId)
      return n
    })
    if (pedidas.current.has(clave)) return
    pedidas.current.add(clave)
    setCache((m) => ({ ...m, [clave]: { fase: 'cargando' } }))
    traerCreativos(campaignId, dias).then((res) => {
      setCache((m) => ({
        ...m,
        [clave]: res.ok ? { fase: 'ok', data: res.dato } : { fase: 'error', motivo: res.motivo },
      }))
    })
  }, [dias])

  const dato = useCallback(
    (campaignId: string) => cache[`${dias}|${campaignId}`] ?? null,
    [cache, dias],
  )

  return { abiertas, alternar, dato }
}

const VACIO: ReadonlySet<string> = new Set()

/** El nombre de la campaña, convertido en el disparador del despliegue. */
export function BotonAvisos({ nombre, abierta, onToggle }: {
  nombre: string
  abierta: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      title={abierta ? 'Ocultar los avisos' : 'Ver los avisos de esta campaña'}
      style={{
        height: 'auto', // `.shell-content button` fija la altura de un control; este envuelve texto.
        background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
        color: 'inherit', font: 'inherit', fontWeight: weight.semibold, display: 'flex',
        alignItems: 'baseline', gap: space[1],
      }}
    >
      <span style={{ color: color.mut2, fontSize: font.xs }}>{abierta ? '▾' : '▸'}</span>
      <span>{nombre}</span>
    </button>
  )
}

export function PanelAvisos({ estado }: { estado: Cargable<RespuestaCreativos> | null }) {
  if (!estado || estado.fase === 'cargando') {
    return <div style={{ color: color.mut2, fontSize: font.sm, padding: space[3] }}>Trayendo los avisos…</div>
  }
  if (estado.fase === 'error') {
    return (
      <Notice tone="warning" style={{ margin: space[2] }}>
        No se pudieron traer los avisos: {estado.motivo}
      </Notice>
    )
  }

  const { ads, sinCreativo } = estado.data
  if (ads.length === 0) {
    return (
      <div style={{ color: color.mut2, fontSize: font.sm, padding: space[3], fontStyle: 'italic' }}>
        Esta campaña no tiene avisos. Suele pasar con las que quedaron armadas y nunca se llenaron.
      </div>
    )
  }

  return (
    <div style={{ padding: space[3], display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {/* Si la llamada rica falló, los avisos quedan con la miniatura y sin copy. Decirlo evita la
          conclusión equivocada —"estos avisos no tienen texto"— sobre un dato que no se pudo leer. */}
      {sinCreativo && (
        <Notice tone="warning">
          Se ven los avisos pero no su texto ni la imagen grande: {sinCreativo}
        </Notice>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: space[3] }}>
        {ads.map((a) => <Tarjeta key={a.id} a={a} />)}
      </div>
    </div>
  )
}

function Tarjeta({ a }: { a: AvisoCreativo }) {
  const foto = a.imagen || a.thumb
  // El link de la tarjeta: primero el aviso publicado (es el creativo de verdad, con sus comentarios
  // y todo), y si no lo hay, a dónde manda el aviso. Sin ninguno de los dos no es un link.
  const link = a.permalink || a.destino || null
  const pausado = !!a.estado && a.estado !== 'ACTIVE'

  const marco = (
    <div
      style={{
        position: 'relative', height: 190, background: color.bg2, display: 'flex',
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
            // y lo que se está por juzgar es justamente el encuadre.
            objectFit: 'contain',
            // Un creativo pausado se ve apagado: en una grilla de doce, leer un cartelito por
            // tarjeta para saber cuáles están al aire no se hace.
            opacity: pausado ? 0.45 : 1,
          }}
        />
      ) : (
        <span style={{ fontSize: 22, color: color.mut2 }}>🖼️</span>
      )}
      {a.esVideo && (
        <span
          title="Es un video: acá se ve el póster"
          style={{
            position: 'absolute', left: space[2], top: space[2], background: 'rgba(0,0,0,.55)',
            color: '#fff', borderRadius: radius.pill, fontSize: font.xs, padding: '1px 8px',
          }}
        >
          ▶ video
        </span>
      )}
      {a.piezas.length > 1 && (
        <span
          title={`Carrusel de ${a.piezas.length} tarjetas`}
          style={{
            position: 'absolute', right: space[2], top: space[2], background: 'rgba(0,0,0,.55)',
            color: '#fff', borderRadius: radius.pill, fontSize: font.xs, padding: '1px 8px',
          }}
        >
          ⧉ {a.piezas.length}
        </span>
      )}
    </div>
  )

  return (
    <div
      style={{
        border: `1px solid ${color.line}`, borderRadius: radius.lg, overflow: 'hidden',
        background: color.surface, display: 'flex', flexDirection: 'column',
      }}
    >
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" title="Ver el aviso publicado" style={{ display: 'block' }}>
          {marco}
        </a>
      ) : marco}

      <div style={{ padding: space[2], display: 'flex', flexDirection: 'column', gap: space[1], minWidth: 0 }}>
        {a.titulo && (
          <div style={{ fontSize: font.base, fontWeight: weight.semibold, color: color.ink, lineHeight: 1.3 }}>
            {a.titulo}
          </div>
        )}
        {a.texto && (
          <div
            title={a.texto}
            style={{
              fontSize: font.xs, color: color.mut, lineHeight: 1.45,
              display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 4, overflow: 'hidden',
            }}
          >
            {a.texto}
          </div>
        )}
        {!a.titulo && !a.texto && (
          <div style={{ fontSize: font.xs, color: color.mut2, fontStyle: 'italic' }}>Sin texto propio.</div>
        )}

        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', alignItems: 'center', marginTop: space[0.5] }}>
          {a.cta && (
            <span style={{
              fontSize: font.xs, color: color.ink2, background: color.bg2, border: `1px solid ${color.line}`,
              borderRadius: radius.pill, padding: '1px 8px',
            }}>
              {a.cta}
            </span>
          )}
          {pausado && (
            <span style={{ fontSize: font.xs, color: color.mut2 }}>
              {a.estado === 'PAUSED' || a.estado === 'ADSET_PAUSED' || a.estado === 'CAMPAIGN_PAUSED' ? 'pausado' : String(a.estado).toLowerCase().replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {/* El pie: chiquito a propósito. La pieza es lo que se vino a ver; el número es contexto. */}
        <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.5, marginTop: space[0.5] }}>
          {money(a.spend)}
          {a.purchases > 0 && ` · ${nf.format(a.purchases)} compra${a.purchases === 1 ? '' : 's'}`}
          {a.hookRate > 0 && ` · hook ${Math.round(a.hookRate)}%`}
        </div>
        <div style={{ fontSize: font.xs, color: color.mut2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.nombre}>
          {a.nombre}
        </div>
      </div>
    </div>
  )
}
